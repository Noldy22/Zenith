from flask import Flask, request, jsonify
from flask_cors import CORS
import MetaTrader5 as mt5
import pandas as pd
from datetime import datetime
from analysis import find_levels, find_sd_zones, find_order_blocks, get_trade_suggestion, calculate_confidence

app = Flask(__name__)
CORS(app)

terminal_path = 'C:\\Program Files\\MetaTrader 5 EXNESS\\terminal64.exe'

print(f"Attempting to initialize with path: {terminal_path}")

if not mt5.initialize(path=terminal_path):
    print("initialize() failed, error code =", mt5.last_error())
    quit()

TIMEFRAME_MAP = {
    'M1': mt5.TIMEFRAME_M1,
    'M5': mt5.TIMEFRAME_M5,
    'M15': mt5.TIMEFRAME_M15,
    'M30': mt5.TIMEFRAME_M30,
    'H1': mt5.TIMEFRAME_H1,
    'H4': mt5.TIMEFRAME_H4,
    'D1': mt5.TIMEFRAME_D1,
    'W1': mt5.TIMEFRAME_W1,
    'MN1': mt5.TIMEFRAME_MN1,
}

def format_bar_data(bar, timeframe_str):
    dt_object = datetime.fromtimestamp(bar['time'])
    is_intraday = timeframe_str in ['M1', 'M5', 'M15', 'M30', 'H1', 'H4']
    
    if is_intraday:
        time_data = int(dt_object.timestamp())
    else:
        time_data = {"year": dt_object.year, "month": dt_object.month, "day": dt_object.day}
        
    return {"time": time_data, "open": bar['open'], "high": bar['high'], "low": bar['low'], "close": bar['close']}

@app.route('/api/get_all_symbols', methods=['POST'])
def get_all_symbols():
    try:
        credentials = request.get_json()
        login = int(credentials.get('login'))
        password = credentials.get('password')
        server = credentials.get('server')

        if not all([login, password, server]):
            return jsonify({"error": "Missing credentials"}), 400

        if not mt5.login(login=login, password=password, server=server):
            return jsonify({"error": "Authorization failed", "mt5_error": mt5.last_error()}), 403

        symbols = mt5.symbols_get()
        if symbols is None:
            return jsonify({"error": "Could not get symbols", "mt5_error": mt5.last_error()}), 500
        
        # We only want to show symbols that are visible in MarketWatch
        symbol_names = [s.name for s in symbols if s.visible]
        return jsonify(symbol_names)
    except Exception as e:
        return jsonify({"error": f"An unexpected server error occurred: {e}"}), 500


@app.route('/api/get_chart_data', methods=['POST'])
def get_chart_data():
    try:
        credentials = request.get_json()
        login = int(credentials.get('login'))
        password = credentials.get('password')
        server = credentials.get('server')
        symbol = credentials.get('symbol', 'EURUSDm')
        timeframe_str = credentials.get('timeframe', 'D1')
        mt5_timeframe = TIMEFRAME_MAP.get(timeframe_str, mt5.TIMEFRAME_D1)

        if not all([login, password, server]):
            return jsonify({"error": "Missing credentials"}), 400

        if not mt5.login(login=login, password=password, server=server):
            return jsonify({"error": "Authorization failed", "mt5_error": mt5.last_error()}), 403

        rates = mt5.copy_rates_from_pos(symbol, mt5_timeframe, 0, 200)

        if rates is None:
            return jsonify({"error": f"Could not get rates for {symbol}", "mt5_error": mt5.last_error()}), 500
        
        chart_data = [format_bar_data(bar, timeframe_str) for bar in rates]
        return jsonify(chart_data)
    except Exception as e:
        return jsonify({"error": "An unexpected server error occurred."}), 500

@app.route('/api/get_latest_bar', methods=['POST'])
def get_latest_bar():
    try:
        credentials = request.get_json()
        login = int(credentials.get('login'))
        password = credentials.get('password')
        server = credentials.get('server')
        symbol = credentials.get('symbol')
        timeframe_str = credentials.get('timeframe')
        mt5_timeframe = TIMEFRAME_MAP.get(timeframe_str)

        if not all([login, password, server, symbol, mt5_timeframe]):
            return jsonify({"error": "Missing required parameters"}), 400

        if not mt5.login(login=login, password=password, server=server):
            return jsonify({"error": "Authorization failed"}), 403

        rates = mt5.copy_rates_from_pos(symbol, mt5_timeframe, 0, 1)

        if rates is None or len(rates) == 0:
            return jsonify({"error": "Could not get latest bar"}), 500
        
        latest_bar = format_bar_data(rates[0], timeframe_str)
        return jsonify(latest_bar)
    except Exception as e:
        return jsonify({"error": "An unexpected server error occurred."}), 500

@app.route('/api/analyze', methods=['POST'])
def analyze_chart():
    try:
        chart_data = request.get_json()
        if not chart_data or len(chart_data) < 20: 
            return jsonify({"error": "Not enough data for analysis"}), 400

        df = pd.DataFrame(chart_data)
        
        support_levels, resistance_levels, pivots = find_levels(df)
        demand_zones, supply_zones = find_sd_zones(df)
        bullish_ob, bearish_ob = find_order_blocks(df, pivots)
        
        current_price = df.iloc[-1]['close']
        suggestion = get_trade_suggestion(current_price, demand_zones, supply_zones)

        analysis_result = {
            "support": support_levels,
            "resistance": resistance_levels,
            "demand_zones": demand_zones,
            "supply_zones": supply_zones,
            "bullish_ob": bullish_ob,
            "bearish_ob": bearish_ob,
            "suggestion": suggestion,
            "criteria": "Price Action (Pivots, S/D Zones, Order Blocks)",
            "precautions": [
                "This is an AI-generated suggestion, not financial advice.",
                "Always perform your own due diligence before trading."
            ]
        }
        
        analysis_result["confidence"] = calculate_confidence(analysis_result)
        
        return jsonify(analysis_result)

    except Exception as e:
        print(f"An error occurred during analysis: {e}")
        return jsonify({"error": "An unexpected error occurred during analysis."}), 500

@app.route('/api/execute_trade', methods=['POST'])
def execute_trade():
    try:
        data = request.get_json()
        
        login = int(data.get('login'))
        password = data.get('password')
        server = data.get('server')
        
        symbol = data.get('symbol')
        lot_size = float(data.get('lot_size'))
        trade_type = data.get('trade_type')
        stop_loss = float(data.get('stop_loss', 0.0))
        take_profit = float(data.get('take_profit', 0.0))

        if not all([login, password, server, symbol, lot_size, trade_type]):
            return jsonify({"error": "Missing required trade parameters"}), 400
        
        if not mt5.login(login=login, password=password, server=server):
            return jsonify({"error": "MT5 Authorization failed", "mt5_error": mt5.last_error()}), 403

        order_type_map = {'BUY': mt5.ORDER_TYPE_BUY, 'SELL': mt5.ORDER_TYPE_SELL}
        mt5_order_type = order_type_map.get(trade_type.upper())
        if mt5_order_type is None:
            return jsonify({"error": "Invalid trade type"}), 400

        price = mt5.symbol_info_tick(symbol).ask if trade_type.upper() == 'BUY' else mt5.symbol_info_tick(symbol).bid

        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": lot_size,
            "type": mt5_order_type,
            "price": price,
            "sl": stop_loss,
            "tp": take_profit,
            "magic": 234000,
            "comment": "Zenith AI Trade",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }

        result = mt5.order_send(request)

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return jsonify({
                "error": "Order failed", 
                "details": {
                    "retcode": result.retcode, 
                    "comment": result.comment
                }
            }), 500
        
        return jsonify({
            "success": True, 
            "message": "Trade executed successfully!",
            "details": {
                "order_id": result.order
            }
        }), 200

    except Exception as e:
        print(f"An error occurred executing trade: {e}")
        return jsonify({"error": "An unexpected server error occurred during trade execution."}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)