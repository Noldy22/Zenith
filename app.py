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

# --- AI Learning Imports ---
from analysis import find_levels, find_sd_zones, find_order_blocks, find_candlestick_patterns, get_trade_suggestion, calculate_confidence, generate_market_narrative
from learning import get_model_and_vectorizer, train_and_save_model, extract_features

app = Flask(__name__)
CORS(app)
# Add SocketIO to the app
socketio = SocketIO(app, cors_allowed_origins="*")


# --- Global State ---
# For Auto-Trading
AUTOTRADE_STATE = {
    'is_running': False,
    'thread': None,
    'params': {}
}

# For storing the last successful login credentials for the background monitor
LATEST_CREDENTIALS = {
    'login': None,
    'password': None,
    'server': None,
    'lock': threading.Lock()
}

# --- Database Setup ---
def init_db():
    conn = sqlite3.connect('trades.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, symbol TEXT,
            trade_type TEXT, open_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            outcome INTEGER DEFAULT -1, analysis_json TEXT
        )
    ''')
    conn.commit()
    conn.close()

# --- MT5 Connection Helper ---
def ensure_mt5_initialized():
    if not mt5.terminal_info():
        print("MT5 terminal not running, attempting to initialize...")
        terminal_path = 'C:\\Program Files\\MetaTrader 5 EXNESS\\terminal64.exe'
        if not mt5.initialize(path=terminal_path):
            print("initialize() failed, error code =", mt5.last_error())
            return False
    return True

TIMEFRAME_MAP = {
    'M1': mt5.TIMEFRAME_M1, 'M5': mt5.TIMEFRAME_M5, 'M15': mt5.TIMEFRAME_M15,
    'M30': mt5.TIMEFRAME_M30, 'H1': mt5.TIMEFRAME_H1, 'H4': mt5.TIMEFRAME_H4,
    'D1': mt5.TIMEFRAME_D1, 'W1': mt5.TIMEFRAME_W1, 'MN1': mt5.TIMEFRAME_MN1,
}

def format_bar_data(bar, timeframe_str):
    dt_object = datetime.fromtimestamp(bar['time'])
    is_intraday = timeframe_str in ['M1', 'M5', 'M15', 'M30', 'H1', 'H4']
    if is_intraday:
        time_data = int(dt_object.timestamp())
    else:
        time_data = {"year": dt_object.year, "month": dt_object.month, "day": dt_object.day}
    return {"time": time_data, "open": bar['open'], "high": bar['high'], "low": bar['low'], "close": bar['close']}

# --- Background Trade Monitor Functions ---
def update_trade_outcomes(credentials):
    """Checks for closed trades, updates their outcomes, and triggers retraining."""
    if not credentials or not credentials.get('login'):
        print("Monitor: No credentials available to check trades.")
        return

    if not ensure_mt5_initialized():
        print("Monitor: MT5 initialization failed.")
        return

    login = int(credentials.get('login'))
    password = credentials.get('password')
    server = credentials.get('server')

    if not mt5.login(login=login, password=password, server=server):
        print("Monitor: MT5 login failed.")
        return

    from_date = datetime.now() - timedelta(days=30)
    history_orders = mt5.history_deals_get(from_date, datetime.now())

    if history_orders is None:
        print("Monitor: No history deals found, error code =", mt5.last_error())
        mt5.shutdown()
        return

    conn = sqlite3.connect('trades.db')
    cursor = conn.cursor()
    trades_updated = False

    for order in history_orders:
        if order.magic == 234000 and order.entry == 1:  # Zenith trade, exit deal
            cursor.execute("SELECT id FROM trades WHERE order_id = ? AND outcome = -1", (order.order,))
            trade_to_update = cursor.fetchone()

            if trade_to_update:
                outcome = 1 if order.profit >= 0 else 0 # 1 for win/breakeven, 0 for loss
                cursor.execute("UPDATE trades SET outcome = ? WHERE id = ?", (outcome, trade_to_update[0]))
                print(f"Monitor: Updated outcome for order {order.order} to {outcome}")
                trades_updated = True

    conn.commit()
    conn.close()
    
    # --- AUTOMATIC TRAINING LOGIC ---
    if trades_updated:
        print("Monitor: Trade outcomes updated. Triggering automatic model retraining...")
        try:
            conn = sqlite3.connect('trades.db')
            df = pd.read_sql_query("SELECT * from trades WHERE outcome != -1", conn)
            conn.close()
            
            if not df.empty and len(df) >= 10:
                df['analysis_json'] = df['analysis_json'].apply(json.loads)
                result = train_and_save_model(df.to_dict('records'))
                print(f"Monitor: Automatic retraining complete. Result: {result}")
                # Emit a message to the frontend to let the user know the AI has been updated
                socketio.emit('training_complete', {'message': f"AI model automatically updated with new trade data. Accuracy: {result.get('accuracy', 'N/A')}"})
            else:
                print(f"Monitor: Not enough completed trades ({len(df)}/10) for automatic retraining.")

        except Exception as e:
            print(f"Monitor: An error occurred during automatic retraining: {e}")


    mt5.shutdown()
    print("Monitor: Trade check complete.")

def run_trade_monitor():
    """The main loop for the background thread."""
    while True:
        with LATEST_CREDENTIALS['lock']:
            creds = LATEST_CREDENTIALS.copy()

        if creds.get('login'):
            print(f"[{datetime.now()}] Running trade outcome monitor...")
            try:
                update_trade_outcomes(creds)
            except Exception as e:
                print(f"[{datetime.now()}] Error in trade monitor: {e}")
        else:
            print(f"[{datetime.now()}] Trade monitor is idle, waiting for login.")

        time.sleep(300) # Sleep for 5 minutes

# --- WebSocket Event Handlers ---
def track_symbol_ticks(symbol, timeframe_str, credentials):
    """Tracks ticks for a symbol and emits new bars."""
    if not ensure_mt5_initialized():
        emit('error', {'error': 'MetaTrader 5 terminal not found.'})
        return

    login, password, server = int(credentials.get('login')), credentials.get('password'), credentials.get('server')
    if not mt5.login(login=login, password=password, server=server):
        emit('error', {'error': 'Authorization failed'})
        return

    mt5_timeframe = TIMEFRAME_MAP.get(timeframe_str, mt5.TIMEFRAME_D1)
    last_bar_time = 0

    while True:
        rates = mt5.copy_rates_from_pos(symbol, mt5_timeframe, 0, 1)
        if rates is not None and len(rates) > 0:
            current_bar = rates[0]
            if current_bar['time'] > last_bar_time:
                last_bar_time = current_bar['time']
                formatted_bar = format_bar_data(current_bar, timeframe_str)
                socketio.emit('new_bar', formatted_bar)
        socketio.sleep(0.1) # Check for new ticks every 100ms


@socketio.on('subscribe_to_chart')
def handle_subscribe_to_chart(data):
    symbol = data.get('symbol', 'EURUSDm')
    timeframe_str = data.get('timeframe', 'D1')
    credentials = data.get('credentials')
    socketio.start_background_task(track_symbol_ticks, symbol, timeframe_str, credentials)


# --- Flask API Routes (Unchanged from original) ---
@app.route('/api/get_account_info', methods=['POST'])
def get_account_info():
    if not ensure_mt5_initialized():
        return jsonify({"error": "MetaTrader 5 terminal not found."}), 500
    try:
        credentials = request.get_json()
        login, password, server = int(credentials.get('login')), credentials.get('password'), credentials.get('server')
        if not all([login, password, server]):
            return jsonify({"error": "Missing credentials"}), 400
        if not mt5.login(login=login, password=password, server=server):
            return jsonify({"error": "Authorization failed"}), 403

        account_info = mt5.account_info()
        if account_info is None:
            return jsonify({"error": "Failed to retrieve account info"}), 500

        return jsonify({
            "balance": account_info.balance,
            "equity": account_info.equity,
            "profit": account_info.profit
        })
    except Exception as e:
        return jsonify({"error": f"An unexpected server error: {e}"}), 500

@app.route('/api/get_open_positions', methods=['POST'])
def get_open_positions():
    if not ensure_mt5_initialized():
        return jsonify({"error": "MetaTrader 5 terminal not found."}), 500
    try:
        credentials = request.get_json()
        login, password, server = int(credentials.get('login')), credentials.get('password'), credentials.get('server')
        if not all([login, password, server]):
            return jsonify({"error": "Missing credentials"}), 400
        if not mt5.login(login=login, password=password, server=server):
            return jsonify({"error": "Authorization failed"}), 403

        positions = mt5.positions_get()
        if positions is None:
            return jsonify([])

        positions_list = []
        for pos in positions:
            pos_dict = {
                "ticket": pos.ticket,
                "symbol": pos.symbol,
                "type": "BUY" if pos.type == 0 else "SELL",
                "volume": pos.volume,
                "price_open": pos.price_open,
                "sl": pos.sl,
                "tp": pos.tp,
                "profit": pos.profit,
                "time": pos.time,
            }
            positions_list.append(pos_dict)

        return jsonify(positions_list)
    except Exception as e:
        return jsonify({"error": f"An unexpected server error: {e}"}), 500

@app.route('/api/get_history_deals', methods=['POST'])
def get_history_deals():
    if not ensure_mt5_initialized():
        return jsonify({"error": "MetaTrader 5 terminal not found."}), 500
    try:
        credentials = request.get_json()
        login, password, server = int(credentials.get('login')), credentials.get('password'), credentials.get('server')
        if not all([login, password, server]):
            return jsonify({"error": "Missing credentials"}), 400
        if not mt5.login(login=login, password=password, server=server):
            return jsonify({"error": "Authorization failed"}), 403

        from_date = datetime.now() - timedelta(days=7)
        to_date = datetime.now()
        deals = mt5.history_deals_get(from_date, to_date)

        if deals is None:
            return jsonify([])

        deals_list = []
        for deal in deals:
            if deal.entry == 1:
                deal_dict = {
                    "ticket": deal.ticket,
                    "order": deal.order,
                    "symbol": deal.symbol,
                    "type": "BUY" if deal.type == 0 else "SELL",
                    "volume": deal.volume,
                    "price": deal.price,
                    "profit": deal.profit,
                    "time": deal.time,
                }
                deals_list.append(deal_dict)

        deals_list.sort(key=lambda x: x['time'], reverse=True)
        return jsonify(deals_list[:50])

    except Exception as e:
        return jsonify({"error": f"An unexpected server error: {e}"}), 500

@app.route('/api/get_all_symbols', methods=['POST'])
def get_all_symbols():
    if not ensure_mt5_initialized(): return jsonify({"error": "MetaTrader 5 terminal not found."}), 500
    try:
        credentials = request.get_json()
        login, password, server = int(credentials.get('login')), credentials.get('password'), credentials.get('server')
        if not all([login, password, server]): return jsonify({"error": "Missing credentials"}), 400
        if not mt5.login(login=login, password=password, server=server): return jsonify({"error": "Authorization failed"}), 403

        with LATEST_CREDENTIALS['lock']:
            LATEST_CREDENTIALS['login'] = login
            LATEST_CREDENTIALS['password'] = password
            LATEST_CREDENTIALS['server'] = server
            print("Updated global credentials for trade monitor.")

        symbols = [s.name for s in mt5.symbols_get() if s.visible]
        return jsonify(symbols)
    except Exception as e: return jsonify({"error": f"An unexpected server error: {e}"}), 500

@app.route('/api/get_chart_data', methods=['POST'])
def get_chart_data():
    if not ensure_mt5_initialized(): return jsonify({"error": "MetaTrader 5 terminal not found."}), 500
    try:
        credentials = request.get_json()
        login, password, server = int(credentials.get('login')), credentials.get('password'), credentials.get('server')
        symbol, timeframe_str = credentials.get('symbol', 'EURUSDm'), credentials.get('timeframe', 'D1')
        mt5_timeframe = TIMEFRAME_MAP.get(timeframe_str, mt5.TIMEFRAME_D1)
        if not all([login, password, server]): return jsonify({"error": "Missing credentials"}), 400
        if not mt5.login(login=login, password=password, server=server): return jsonify({"error": "Authorization failed"}), 403
        rates = mt5.copy_rates_from_pos(symbol, mt5_timeframe, 0, 200)
        if rates is None: return jsonify({"error": f"Could not get rates for {symbol}"}), 500
        chart_data = [format_bar_data(bar, timeframe_str) for bar in rates]
        return jsonify(chart_data)
    except Exception as e: return jsonify({"error": "An unexpected server error."}), 500

def _execute_trade_logic(credentials, symbol, lot_size, trade_type, sl, tp, analysis_data):
    login, password, server = int(credentials.get('login')), credentials.get('password'), credentials.get('server')
    if not mt5.login(login=login, password=password, server=server):
        raise ConnectionError("MT5 login failed during trade execution.")

    order_type_map = {'BUY': mt5.ORDER_TYPE_BUY, 'SELL': mt5.ORDER_TYPE_SELL}
    mt5_order_type = order_type_map.get(trade_type.upper())

    request = {
        "action": mt5.TRADE_ACTION_DEAL, "symbol": symbol, "volume": lot_size,
        "type": mt5_order_type, "sl": sl, "tp": tp, "magic": 234000,
        "comment": "Zenith AI Trade", "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_FOK,
    }
    result = mt5.order_send(request)

    if result.retcode != mt5.TRADE_RETCODE_DONE:
        raise ValueError(f"Order failed: {result.comment} (retcode: {result.retcode})")

    conn = sqlite3.connect('trades.db')
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO trades (order_id, symbol, trade_type, analysis_json) VALUES (?, ?, ?, ?)",
        (result.order, symbol, trade_type, json.dumps(analysis_data))
    )
    conn.commit()
    conn.close()
    return result.order

@app.route('/api/analyze', methods=['POST'])
def analyze_chart():
    try:
        request_data = request.get_json()
        chart_data, symbol = request_data.get('chartData'), request_data.get('symbol', 'the asset')
        if not chart_data or len(chart_data) < 20: return jsonify({"error": "Not enough data for analysis"}), 400

        df = pd.DataFrame(chart_data)
        support_levels, resistance_levels, pivots = find_levels(df)
        demand_zones, supply_zones = find_sd_zones(df)
        bullish_ob, bearish_ob = find_order_blocks(df, pivots)
        candlestick_patterns = find_candlestick_patterns(df)
        current_price = df.iloc[-1]['close']
        suggestion = get_trade_suggestion(current_price, demand_zones, supply_zones, candlestick_patterns)

        analysis_result = {
            "symbol": symbol, "support": support_levels, "resistance": resistance_levels,
            "demand_zones": demand_zones, "supply_zones": supply_zones,
            "bullish_ob": bullish_ob, "bearish_ob": bearish_ob,
            "candlestick_patterns": candlestick_patterns,
            "suggestion": suggestion,
            "precautions": ["This is an AI-generated suggestion, not financial advice.", "Always perform your own due diligence."]
        }

        analysis_result["confidence"] = calculate_confidence(analysis_result, suggestion)
        analysis_result["narrative"] = generate_market_narrative(current_price, analysis_result)

        model, vectorizer = get_model_and_vectorizer()
        if model and vectorizer:
            features = extract_features(analysis_result)
            vectorized_features = vectorizer.transform([features])
            analysis_result["predicted_success_rate"] = f"{model.predict_proba(vectorized_features)[0][1]:.0%}"
        else:
            analysis_result["predicted_success_rate"] = "N/A (Model not trained)"

        return jsonify(analysis_result)
    except Exception as e:
        print(f"Analysis Error: {e}")
        return jsonify({"error": "Error during analysis."}), 500

@app.route('/api/execute_trade', methods=['POST'])
def execute_trade():
    if not ensure_mt5_initialized(): return jsonify({"error": "MT5 terminal not found."}), 500
    try:
        data = request.get_json()
        credentials = {k: data.get(k) for k in ['login', 'password', 'server']}
        symbol, trade_type, analysis_data = data.get('symbol'), data.get('trade_type'), data.get('analysis')

        try:
            lot_size = float(data.get('lot_size'))
            sl_str, tp_str = data.get('stop_loss'), data.get('take_profit')
            sl, tp = (float(sl_str) if sl_str else 0.0), (float(tp_str) if tp_str else 0.0)
        except (ValueError, TypeError):
             return jsonify({"error": "Invalid numeric format for trade parameters."}), 400

        order_id = _execute_trade_logic(credentials, symbol, lot_size, trade_type, sl, tp, analysis_data)
        return jsonify({"success": True, "message": "Trade executed and logged!", "details": {"order_id": order_id}}), 200

    except Exception as e:
        print(f"Trade Execution Error: {e}")
        return jsonify({"error": f"An unexpected server error: {e}"}), 500

def trading_loop():
    global AUTOTRADE_STATE
    params = AUTOTRADE_STATE['params']
    print(f"[{datetime.now()}] Auto-trading thread started for {params['symbol']} on {params['timeframe']}.")

    while AUTOTRADE_STATE.get('is_running'):
        try:
            print(f"[{datetime.now()}] Auto-trader checking for signals on {params['symbol']}...")
            if not ensure_mt5_initialized():
                print("Auto-trade: MT5 not available. Retrying in 60s.")
                time.sleep(60)
                continue

            login, password, server = int(params['login']), params['password'], params['server']
            if not mt5.login(login=login, password=password, server=server):
                print("Auto-trade: MT5 login failed. Retrying in 60s.")
                time.sleep(60)
                continue

            mt5_timeframe = TIMEFRAME_MAP.get(params['timeframe'])
            rates = mt5.copy_rates_from_pos(params['symbol'], mt5_timeframe, 0, 200)
            if rates is None:
                print("Auto-trade: Could not fetch rates. Skipping this cycle.")
                time.sleep(60)
                continue

            chart_data = [format_bar_data(bar, params['timeframe']) for bar in rates]
            df = pd.DataFrame(chart_data)
            current_price = df.iloc[-1]['close']

            support, resistance, pivots = find_levels(df)
            demand, supply = find_sd_zones(df)
            bullish_ob, bearish_ob = find_order_blocks(df, pivots)
            candlestick_patterns = find_candlestick_patterns(df)
            suggestion = get_trade_suggestion(current_price, demand, supply, candlestick_patterns)

            analysis = {"symbol": params['symbol'], "support": support, "resistance": resistance, "demand_zones": demand, "supply_zones": supply, "bullish_ob": bullish_ob, "bearish_ob": bearish_ob, "candlestick_patterns": candlestick_patterns}
            confidence = calculate_confidence(analysis, suggestion)

            if suggestion['action'] != 'Neutral' and confidence >= float(params['confidence_threshold']):
                print(f"[{datetime.now()}] High confidence setup found! Confidence: {confidence}%. Action: {suggestion['action']}. Placing trade...")
                order_id = _execute_trade_logic(params, params['symbol'], float(params['lot_size']), suggestion['action'], suggestion['sl'], suggestion['tp'], analysis)
                print(f"[{datetime.now()}] Trade placed successfully. Order ID: {order_id}. Cooling down for 1 hour.")
                time.sleep(3600)
            else:
                print("No high confidence setup found. Waiting for next cycle.")

        except Exception as e:
            print(f"[{datetime.now()}] Error in trading loop: {e}. Continuing...")

        time.sleep(60)

    print(f"[{datetime.now()}] Auto-trading thread stopped for {AUTOTRADE_STATE['params'].get('symbol')}.")


@app.route('/api/start_autotrade', methods=['POST'])
def start_autotrade():
    global AUTOTRADE_STATE
    if AUTOTRADE_STATE['is_running']:
        return jsonify({"error": "Auto-trading is already running."}), 400

    params = request.get_json()
    AUTOTRADE_STATE['params'] = params
    AUTOTRADE_STATE['is_running'] = True
    AUTOTRADE_STATE['thread'] = threading.Thread(target=trading_loop, daemon=True)
    AUTOTRADE_STATE['thread'].start()

    return jsonify({"message": f"Auto-trading started for {params['symbol']}."})

@app.route('/api/stop_autotrade', methods=['POST'])
def stop_autotrade():
    global AUTOTRADE_STATE
    if not AUTOTRADE_STATE['is_running']:
        return jsonify({"error": "Auto-trading is not running."}), 400

    AUTOTRADE_STATE['is_running'] = False
    return jsonify({"message": "Auto-trading stopping. It will cease after the current check."})


# --- Main execution block ---
if __name__ == '__main__':
    init_db()
    # Start the background thread for monitoring trade outcomes
    monitor_thread = threading.Thread(target=run_trade_monitor, daemon=True)
    monitor_thread.start()
    # Run the Flask web server with SocketIO
    socketio.run(app, host='127.0.0.1', port=5000, debug=True)