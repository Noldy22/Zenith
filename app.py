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
socketio = SocketIO(app, cors_allowed_origins="*")

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
            "mt5_credentials": { "login": "", "password": "", "server": "", "terminal_path": "" }
        }
        self.lock = threading.Lock()

    def update_settings(self, new_settings):
        with self.lock:
            self.settings.update(new_settings)
            # Persist settings to a file
            with open('settings.json', 'w') as f:
                json.dump(self.settings, f)

    def load_settings(self):
        if os.path.exists('settings.json'):
            with open('settings.json', 'r') as f:
                with self.lock:
                    self.settings.update(json.load(f))

STATE = AppState()

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

def ensure_mt5_initialized(path):
    return mt5.initialize(path=path)

def format_bar_data(bar, tf_str):
    dt = datetime.fromtimestamp(bar['time'])
    time_data = int(dt.timestamp()) if tf_str in ['M1', 'M5', 'M15', 'H1', 'H4'] else {"year": dt.year, "month": dt.month, "day": dt.day}
    return {"time": time_data, "open": bar['open'], "high": bar['high'], "low": bar['low'], "close": bar['close']}

# --- Core Analysis & Trading Logic ---
def _run_full_analysis(symbol, credentials, style):
    timeframes = TRADING_STYLE_TIMEFRAMES.get(style, ["M15", "H1", "H4"])
    if not ensure_mt5_initialized(path=credentials['terminal_path']): return None
    if not mt5.login(login=credentials['login'], password=credentials['password'], server=credentials['server']): return None

    analyses = {}
    for tf in timeframes:
        rates = mt5.copy_rates_from_pos(symbol, TIMEFRAME_MAP[tf], 0, 200)
        if rates is None or len(rates) < 20: continue
        df = pd.DataFrame([format_bar_data(r, tf) for r in rates])
        
        analysis = {"symbol": symbol, "current_price": df.iloc[-1]['close']}
        _, _, pivots = find_levels(df)
        analysis["market_structure"] = determine_market_structure(pivots)
        analysis["demand_zones"], analysis["supply_zones"] = find_sd_zones(df)
        analysis["bullish_ob"], analysis["bearish_ob"] = find_order_blocks(df, pivots)
        analysis["bullish_fvg"], analysis["bearish_fvg"] = find_fvgs(df)
        analysis["buy_side_liquidity"], _ = find_liquidity_pools(pivots)
        analyses[tf] = analysis

    mt5.shutdown()
    return analyses

def _calculate_position_size(balance, risk_pct, sl_pips, symbol):
    # This is a simplified calculation. A real one needs live pip value from the broker.
    # We'll assume standard pairs where 1 pip = $0.0001
    amount_to_risk = balance * (risk_pct / 100)
    value_per_pip_per_lot = mt5.symbol_info(symbol).trade_tick_value if ensure_mt5_initialized(STATE.settings['mt5_credentials']['terminal_path']) and mt5.symbol_info(symbol) else 10.0

    risk_per_lot = sl_pips * value_per_pip_per_lot
    if risk_per_lot == 0: return 0.01 # Avoid division by zero

    position_size = round(amount_to_risk / risk_per_lot, 2)
    return max(position_size, 0.01) # Return at least a micro lot

def _execute_trade_logic(creds, trade_params):
    if not ensure_mt5_initialized(path=creds['terminal_path']): raise ConnectionError("MT5 init failed")
    if not mt5.login(login=creds['login'], password=creds['password'], server=creds['server']): raise ConnectionError("MT5 login failed")

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": trade_params['symbol'],
        "volume": trade_params['lot_size'],
        "type": mt5.ORDER_TYPE_BUY if trade_params['trade_type'].upper() == 'BUY' else mt5.ORDER_TYPE_SELL,
        "price": mt5.symbol_info_tick(trade_params['symbol']).ask if trade_params['trade_type'].upper() == 'BUY' else mt5.symbol_info_tick(trade_params['symbol']).bid,
        "sl": trade_params['sl'],
        "tp": trade_params['tp'],
        "magic": 234000,
        "comment": "Zenith AI Trade",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_FOK,
    }
    result = mt5.order_send(request)
    mt5.shutdown()

    if result.retcode != mt5.TRADE_RETCODE_DONE:
        raise ValueError(f"Order failed: {result.comment}")

    # Log to DB
    conn = sqlite3.connect('trades.db', check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO trades (order_id, symbol, trade_type, analysis_json) VALUES (?, ?, ?, ?)",
                   (result.order, trade_params['symbol'], trade_params['trade_type'], json.dumps(trade_params['analysis'])))
    conn.commit()
    conn.close()
    return result

# --- Auto-Trading Loop ---
def trading_loop():
    print("Auto-trading thread started.")
    while STATE.autotrade_running:
        with STATE.lock:
            settings = STATE.settings.copy()
        
        if not settings['auto_trading_enabled']:
            time.sleep(10)
            continue

        print(f"[{datetime.now()}] Auto-trader running scan...")
        for symbol in settings['pairs_to_trade']:
            try:
                analyses = _run_full_analysis(symbol, settings['mt5_credentials'], settings['trading_style'])
                if not analyses: continue

                # Multi-TF Confluence
                actions = [get_trade_suggestion(a)['action'] for a in analyses.values()]
                buys, sells = actions.count('Buy'), actions.count('Sell')

                final_action = "Neutral"
                confluence_count = 0
                if buys > sells:
                    final_action = "Buy"
                    confluence_count = buys
                elif sells > buys:
                    final_action = "Sell"
                    confluence_count = sells

                if final_action != "Neutral" and confluence_count >= settings['min_confluence']:
                    primary_tf = TRADING_STYLE_TIMEFRAMES[settings['trading_style']][0]
                    suggestion = get_trade_suggestion(analyses[primary_tf])
                    sl_pips = abs(suggestion['entry'] - suggestion['sl']) * 10000

                    pos_size = _calculate_position_size(settings['account_balance'], settings['risk_per_trade'], sl_pips, symbol)

                    trade_params = {
                        "symbol": symbol, "trade_type": final_action, "lot_size": pos_size,
                        "sl": suggestion['sl'], "tp": suggestion['tp'], "analysis": analyses
                    }

                    # Emit signal to frontend regardless of auto-trade setting
                    socketio.emit('trade_signal', {
                        "params": trade_params,
                        "message": f"{final_action} signal on {symbol} with {confluence_count}-TF confluence."
                    })

                    if settings['auto_trading_enabled']:
                        print(f"Executing {final_action} on {symbol}...")
                        _execute_trade_logic(settings['mt5_credentials'], trade_params)
                        socketio.emit('notification', {"message": f"Auto-trade executed: {final_action} {pos_size} lots of {symbol}."})
                        time.sleep(300) # Cooldown after trading a pair

            except Exception as e:
                print(f"Error in trading loop for {symbol}: {e}")

        time.sleep(60) # Wait a minute before the next full scan
    print("Auto-trading thread stopped.")

# --- API Routes ---
@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    if request.method == 'GET':
        return jsonify(STATE.settings)
    else:
        new_settings = request.get_json()
        STATE.update_settings(new_settings)
        return jsonify({"message": "Settings updated successfully."})

@app.route('/api/start_autotrade', methods=['POST'])
def start_autotrade():
    if not STATE.autotrade_running:
        STATE.autotrade_running = True
        STATE.autotrade_thread = threading.Thread(target=trading_loop, daemon=True)
        STATE.autotrade_thread.start()
        return jsonify({"message": "Auto-trading engine started."})
    return jsonify({"message": "Auto-trading already running."})

@app.route('/api/stop_autotrade', methods=['POST'])
def stop_autotrade():
    if STATE.autotrade_running:
        STATE.autotrade_running = False
        # No need to join, daemon thread will exit when app does
    return jsonify({"message": "Auto-trading engine stopped."})

@app.route('/api/execute_manual_trade', methods=['POST'])
def execute_manual_trade():
    try:
        trade_params = request.get_json()
        with STATE.lock:
            creds = STATE.settings['mt5_credentials']

        result = _execute_trade_logic(creds, trade_params)
        socketio.emit('notification', {"message": f"Manual trade confirmed: {trade_params['trade_type']} {trade_params['lot_size']} lots of {trade_params['symbol']}."})
        return jsonify({"success": True, "message": f"Order {result.order} placed."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Add back other utility routes like get_account_info, get_open_positions, etc.
# These should use the credentials from the AppState now.
@app.route('/api/get_account_info', methods=['POST'])
def get_account_info():
    creds = request.get_json()
    if not ensure_mt5_initialized(path=creds.get('terminal_path')): return jsonify({"error": "MT5 terminal not found."}), 500
    if not mt5.login(login=int(creds['login']), password=creds['password'], server=creds['server']): return jsonify({"error": "Authorization failed"}), 403
    info = mt5.account_info()
    mt5.shutdown()
    if info:
        return jsonify({"balance": info.balance, "equity": info.equity, "profit": info.profit})
    return jsonify({"error": "Could not fetch account info."}), 500

@app.route('/api/get_open_positions', methods=['POST'])
def get_open_positions():
    creds = request.get_json()
    if not ensure_mt5_initialized(path=creds.get('terminal_path')): return jsonify({"error": "MT5 terminal not found."}), 500
    if not mt5.login(login=int(creds['login']), password=creds['password'], server=creds['server']): return jsonify({"error": "Authorization failed"}), 403
    positions = mt5.positions_get()
    mt5.shutdown()
    if positions is None: return jsonify([])
    return jsonify([{"ticket": p.ticket, "symbol": p.symbol, "type": "BUY" if p.type == 0 else "SELL", "volume": p.volume, "price_open": p.price_open, "profit": p.profit} for p in positions])

@app.route('/api/get_all_symbols', methods=['POST'])
def get_all_symbols():
    creds = request.get_json()
    if not ensure_mt5_initialized(path=creds.get('terminal_path')): return jsonify({"error": "MT5 terminal not found."}), 500
    if not mt5.login(login=int(creds['login']), password=creds['password'], server=creds['server']): return jsonify({"error": "Authorization failed"}), 403
    symbols = [s.name for s in mt5.symbols_get() if s.visible]
    mt5.shutdown()
    return jsonify(symbols)

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
    print("[DEBUG] Script starting...")
    init_db()
    print("[DEBUG] Database initialized.")
    STATE.load_settings()
    print("[DEBUG] Settings loaded.")

    # Directly start the background thread without calling the view function
    if not STATE.autotrade_running:
        STATE.autotrade_running = True
        STATE.autotrade_thread = threading.Thread(target=trading_loop, daemon=True)
        STATE.autotrade_thread.start()
        print("[DEBUG] Auto-trading thread created and started.")

    print("[DEBUG] Starting Flask-SocketIO server...")
    socketio.run(app, host='127.0.0.1', port=5000, debug=False)
    print("[DEBUG] This message will not be printed because socketio.run() blocks.")