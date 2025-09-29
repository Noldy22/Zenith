from flask import Flask, request, jsonify
from flask_cors import CORS
import MetaTrader5 as mt5
import pandas as pd
import os

app = Flask(__name__)
CORS(app)

# --- THIS IS THE MODIFIED PART ---
# Specify the exact path to your Exness MT5 terminal from your shortcut's "Target" field
terminal_path = 'C:\\Program Files\\MetaTrader 5 EXNESS\\terminal64.exe'
# --------------------------------

print(f"Attempting to initialize with path: {terminal_path}")

# Initialize the library with the specific path
if not mt5.initialize(path=terminal_path):
    print("initialize() failed, error code =", mt5.last_error())
    quit()

@app.route('/api/get_chart_data', methods=['POST'])
def get_chart_data():
    try:
        credentials = request.get_json()
        login = int(credentials.get('login'))
        password = credentials.get('password')
        server = credentials.get('server')
        symbol = credentials.get('symbol', 'EURUSD')

        if not all([login, password, server]):
            print("Request failed: Missing credentials")
            return jsonify({"error": "Missing credentials"}), 400

        if not mt5.login(login=login, password=password, server=server):
            error_code = mt5.last_error()
            print(f"Authorization failed. Error: {error_code}")
            return jsonify({"error": "Authorization failed", "mt5_error": error_code}), 403

        rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_D1, 0, 200)

        if rates is None:
            error_code = mt5.last_error()
            print(f"Failed to get rates for {symbol}. Error: {error_code}")
            return jsonify({"error": f"Could not get rates for {symbol}", "mt5_error": error_code}), 500

        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        
        chart_data = []
        for index, row in df.iterrows():
            chart_data.append({
                "time": {
                    "year": row['time'].year,
                    "month": row['time'].month,
                    "day": row['time'].day,
                },
                "open": row['open'],
                "high": row['high'],
                "low": row['low'],
                "close": row['close'],
            })

        print(f"Successfully retrieved {len(chart_data)} bars for {symbol}")
        return jsonify(chart_data)

    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return jsonify({"error": "An unexpected server error occurred."}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)