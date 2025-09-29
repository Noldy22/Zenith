from flask import Flask, request, jsonify
from flask_cors import CORS
import MetaTrader5 as mt5
import pandas as pd
import os
from datetime import datetime

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
    """Helper function to format a single bar."""
    dt_object = datetime.fromtimestamp(bar['time'])
    is_intraday = timeframe_str in ['M1', 'M5', 'M15', 'M30', 'H1', 'H4']
    
    if is_intraday:
        time_data = int(dt_object.timestamp())
    else:
        time_data = {"year": dt_object.year, "month": dt_object.month, "day": dt_object.day}
        
    return {
        "time": time_data,
        "open": bar['open'],
        "high": bar['high'],
        "low": bar['low'],
        "close": bar['close'],
    }

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
            error_code = mt5.last_error()
            return jsonify({"error": "Authorization failed", "mt5_error": error_code}), 403

        rates = mt5.copy_rates_from_pos(symbol, mt5_timeframe, 0, 200)

        if rates is None:
            error_code = mt5.last_error()
            return jsonify({"error": f"Could not get rates for {symbol}", "mt5_error": error_code}), 500
        
        chart_data = [format_bar_data(bar, timeframe_str) for bar in rates]
        
        print(f"Successfully retrieved {len(chart_data)} bars for {symbol} on {timeframe_str}")
        return jsonify(chart_data)
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500

# --- THIS IS THE NEW ENDPOINT ---
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

        # Fetch only the most recent bar
        rates = mt5.copy_rates_from_pos(symbol, mt5_timeframe, 0, 1)

        if rates is None or len(rates) == 0:
            return jsonify({"error": "Could not get latest bar"}), 500
        
        # Format and return the single bar
        latest_bar = format_bar_data(rates[0], timeframe_str)
        return jsonify(latest_bar)

    except Exception as e:
        return jsonify({"error": "An unexpected server error occurred."}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)