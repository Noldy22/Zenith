from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import MetaTrader5 as mt5
import pandas as pd
from datetime import datetime, timedelta
import sqlite3
import json
import threading
import time
import os
from functools import wraps

# --- AI & Learning Imports ---
from analysis import (
    find_levels, find_sd_zones, find_order_blocks, find_liquidity_pools,
    find_fvgs, find_candlestick_patterns, get_trade_suggestion,
    calculate_confidence, generate_market_narrative, determine_market_structure
)
from learning import get_model_and_vectorizer, train_and_save_model, extract_features
from backtest import run_backtest

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# --- MT5 Connection Manager ---
class MT5Manager:
    def __init__(self):
        self.lock = threading.Lock()
        self.is_initialized = False

    def connect(self, credentials):
        with self.lock:
            if self.is_initialized:
                # If already initialized, just ensure login is current
                if mt5.terminal_info().login == credentials['login']:
                    return True
                # If login is different, shutdown and reconnect
                mt5.shutdown()

            if not mt5.initialize(path=credentials['terminal_path']):
                print(f"initialize() failed, error code = {mt5.last_error()}")
                self.is_initialized = False
                return False

            if not mt5.login(login=credentials['login'], password=credentials['password'], server=credentials['server']):
                print(f"login() failed, error code = {mt5.last_error()}")
                mt5.shutdown()
                self.is_initialized = False
                return False

            print("MT5 Connection Successful")
            self.is_initialized = True
            return True

mt5_manager = MT5Manager()

# --- Global State & Configuration ---
class AppState:
    def __init__(self):
        self.autotrade_running = False
        self.autotrade_thread = None
        self.settings = {
            "trading_style": "DAY_TRADING",
            "risk_per_trade": 2.0,
            "max_daily_loss": 5.0,
            "account_balance": 10000.0,
            "auto_trading_enabled": False,
            "notifications_enabled": True,
            "min_confluence": 2,
            "pairs_to_trade": [],
            "mt5_credentials": { "login": 0, "password": "", "server": "", "terminal_path": "" }
        }
        self.lock = threading.Lock()

    def update_settings(self, new_settings):
        with self.lock:
            # Ensure login is an integer
            if 'mt5_credentials' in new_settings and 'login' in new_settings['mt5_credentials']:
                try:
                    new_settings['mt5_credentials']['login'] = int(new_settings['mt5_credentials']['login'])
                except (ValueError, TypeError):
                     new_settings['mt5_credentials']['login'] = 0 # Default to 0 if invalid

            self.settings.update(new_settings)
            with open('settings.json', 'w') as f:
                json.dump(self.settings, f)

            # Attempt to reconnect with new credentials
            if 'mt5_credentials' in new_settings:
                mt5_manager.connect(self.settings['mt5_credentials'])


    def load_settings(self):
        if os.path.exists('settings.json'):
            with open('settings.json', 'r') as f:
                with self.lock:
                    self.settings.update(json.load(f))
        # Connect on startup if credentials exist
        if self.settings['mt5_credentials']['login']:
             mt5_manager.connect(self.settings['mt5_credentials'])


STATE = AppState()

# Decorator to ensure MT5 is connected
def mt5_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not mt5_manager.is_initialized:
            # Try to reconnect using saved settings
            if not mt5_manager.connect(STATE.settings['mt5_credentials']):
                return jsonify({"error": "MetaTrader 5 not connected. Please check credentials in settings."}), 503
        return f(*args, **kwargs)
    return decorated_function


# --- Timeframe & Style Mapping ---
TIMEFRAME_MAP = {
    'M1': mt5.TIMEFRAME_M1, 'M5': mt5.TIMEFRAME_M5, 'M15': mt5.TIMEFRAME_M15,
    'H1': mt5.TIMEFRAME_H1, 'H4': mt5.TIMEFRAME_H4, 'D1': mt5.TIMEFRAME_D1,
    'W1': mt5.TIMEFRAME_W1
}
TRADING_STYLE_TIMEFRAMES = {
    "SCALPING": ["M1", "M5", "M15"],
    "DAY_TRADING": ["M15", "H1", "H4"],
    "SWING_TRADING": ["H1", "H4", "D1"],
    "POSITION_TRADING": ["H4", "D1", "W1"]
}

# --- Database & MT5 Helpers ---
def init_db():
    conn = sqlite3.connect('trades.db', check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY, order_id INTEGER, symbol TEXT, trade_type TEXT,
        open_time TIMESTAMP, outcome INTEGER DEFAULT -1, analysis_json TEXT
    )''')
    conn.commit()
    conn.close()

def format_bar_data(bar, tf_str):
    dt = datetime.fromtimestamp(bar['time'])
    time_data = int(dt.timestamp()) if tf_str in ['M1', 'M5', 'M15', 'H1', 'H4'] else {"year": dt.year, "month": dt.month, "day": dt.day}
    return {"time": time_data, "open": bar['open'], "high": bar['high'], "low": bar['low'], "close": bar['close']}

# --- API Routes ---
@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    if request.method == 'GET':
        return jsonify(STATE.settings)
    else:
        new_settings = request.get_json()
        STATE.update_settings(new_settings)
        return jsonify({"message": "Settings updated successfully."})

@app.route('/api/get_account_info', methods=['POST'])
@mt5_required
def get_account_info():
    info = mt5.account_info()
    if info:
        return jsonify({"balance": info.balance, "equity": info.equity, "profit": info.profit})
    return jsonify({"error": "Could not fetch account info."}), 500

@app.route('/api/get_open_positions', methods=['POST'])
@mt5_required
def get_open_positions():
    positions = mt5.positions_get()
    if positions is None: return jsonify([])
    return jsonify([{"ticket": p.ticket, "symbol": p.symbol, "type": "BUY" if p.type == 0 else "SELL", "volume": p.volume, "price_open": p.price_open, "profit": p.profit} for p in positions])

@app.route('/api/get_all_symbols', methods=['POST'])
@mt5_required
def get_all_symbols():
    symbols = [s.name for s in mt5.symbols_get() if s.visible]
    return jsonify(symbols)

@app.route('/api/get_chart_data', methods=['POST'])
@mt5_required
def get_chart_data():
    try:
        creds = request.get_json()
        symbol = creds.get('symbol')
        timeframe_str = creds.get('timeframe')
        mt5_timeframe = TIMEFRAME_MAP.get(timeframe_str)
        rates = mt5.copy_rates_from_pos(symbol, mt5_timeframe, 0, 200)
        if rates is None:
            return jsonify({"error": f"Could not get rates for {symbol}"}), 500
        chart_data = [format_bar_data(bar, timeframe_str) for bar in rates]
        return jsonify(chart_data)
    except Exception as e:
        return jsonify({"error": f"An unexpected server error: {e}"}), 500

def _run_single_timeframe_analysis(df, symbol):
    """Runs the full analysis suite on a single dataframe."""
    analysis = {"symbol": symbol, "current_price": df.iloc[-1]['close']}
    analysis["support"], analysis["resistance"], pivots = find_levels(df)
    analysis["market_structure"] = determine_market_structure(pivots)
    analysis["demand_zones"], analysis["supply_zones"] = find_sd_zones(df)
    analysis["bullish_ob"], analysis["bearish_ob"] = find_order_blocks(df, pivots)
    analysis["bullish_fvg"], analysis["bearish_fvg"] = find_fvgs(df)
    analysis["buy_side_liquidity"], analysis["sell_side_liquidity"] = find_liquidity_pools(pivots)
    analysis["candlestick_patterns"] = find_candlestick_patterns(df)

    suggestion = get_trade_suggestion(analysis)
    analysis["suggestion"] = suggestion
    analysis["confidence"] = calculate_confidence(analysis, suggestion)
    analysis["narrative"] = generate_market_narrative(analysis)

    return analysis

@app.route('/api/analyze_multi_timeframe', methods=['POST'])
@mt5_required
def analyze_multi_timeframe():
    """New endpoint for multi-timeframe analysis based on trading style."""
    try:
        data = request.get_json()
        style = data.get('trading_style', 'DAY_TRADING').upper()
        symbol = data.get('symbol')

        timeframes = TRADING_STYLE_TIMEFRAMES.get(style, ["M15", "H1", "H4"])

        analyses = {}
        for tf in timeframes:
            rates = mt5.copy_rates_from_pos(symbol, TIMEFRAME_MAP[tf], 0, 200)
            if rates is None or len(rates) < 20: continue
            chart_data = [format_bar_data(bar, tf) for bar in rates]
            df = pd.DataFrame(chart_data)
            analyses[tf] = _run_single_timeframe_analysis(df, symbol)

        if not analyses:
            return jsonify({"error": "Could not fetch enough data for any timeframe."}), 400

        # --- Multi-Timeframe Confluence Logic ---
        suggestions = [a['suggestion']['action'] for a in analyses.values()]
        primary_suggestion = analyses[timeframes[0]]['suggestion'] # Use lowest TF for SL/TP

        buy_signals = suggestions.count('Buy')
        sell_signals = suggestions.count('Sell')

        final_confidence = "LOW"
        if buy_signals == len(timeframes) or sell_signals == len(timeframes):
            final_confidence = "HIGH"
        elif buy_signals >= 2 or sell_signals >= 2:
            final_confidence = "MEDIUM"

        final_action = "Neutral"
        if final_confidence != "LOW":
            final_action = "Buy" if buy_signals > sell_signals else "Sell"

        # Aggregate narratives
        full_narrative = {tf: a['narrative'] for tf, a in analyses.items()}

        return jsonify({
            "final_action": final_action,
            "final_confidence": final_confidence,
            "primary_suggestion": primary_suggestion, # Contains SL/TP from primary TF
            "narratives": full_narrative,
            "individual_analyses": analyses # For detailed view on frontend
        })

    except Exception as e:
        print(f"Multi-TF Analysis Error: {e}")
        return jsonify({"error": "Error during multi-timeframe analysis."}), 500

@app.route('/api/run_backtest', methods=['POST'])
def handle_backtest():
    data = request.get_json()
    historical_data = data.get('historical_data')
    settings = data.get('settings')

    if not historical_data or not settings:
        return jsonify({"error": "Missing historical data or settings."}), 400

    results = run_backtest(historical_data, settings)
    return jsonify(results)

if __name__ == '__main__':
    init_db()
    STATE.load_settings()
    # Auto-trading loop and other startup logic remains the same
    if not STATE.autotrade_running:
        STATE.autotrade_running = True
        STATE.autotrade_thread = threading.Thread(target=trading_loop, daemon=True)
        STATE.autotrade_thread.start()
    socketio.run(app, host='127.0.0.1', port=5000)