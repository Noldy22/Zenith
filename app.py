# app.py
# (Keep all existing imports and other code the same)
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
import socket # Import socket to get local IP
import traceback # Import traceback for detailed error logging
import google.generativeai as genai
from dotenv import load_dotenv

# --- AI & Learning Imports ---
from analysis import (
    find_levels, find_sd_zones, find_order_blocks, find_liquidity_pools,
    find_fvgs, find_candlestick_patterns, get_trade_suggestion,
    calculate_confidence, generate_market_narrative, determine_market_structure,
    calculate_volume_profile, calculate_rsi, find_rsi_divergence,
    calculate_emas, find_ema_crosses
)
# Make sure all necessary functions from learning are imported
from learning import get_model_and_vectorizer, train_and_save_model, extract_features, predict_success_rate
from backtest import run_backtest
from trade_monitor import manage_breakeven, manage_trailing_stop, monitor_and_close_trades


# --- Gemini Configuration ---
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    print("Gemini API Key loaded successfully.")
else:
    print("Warning: GEMINI_API_KEY not found in .env file. Gemini features will be disabled.")

# (Keep CORS setup, MT5Manager, AppState, mt5_required, Timeframe maps, init_db etc. as they are)
# --- Dynamic Origin Configuration for CORS ---
def get_local_ip():
    """Finds the local IP address of the machine."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't even have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1' # Default to localhost if unable to find IP
    finally:
        s.close()
    return IP

local_ip = get_local_ip()
# Define allowed origins for CORS, including localhost and the machine's network IP
allowed_origins = [
    "http://localhost:3000",
    f"http://{local_ip}:3000"
]

app = Flask(__name__)
# Apply CORS with the specific list of allowed origins
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})
# Configure Socket.IO with the same origins for robust WebSocket connections
socketio = SocketIO(app, cors_allowed_origins=allowed_origins, async_mode='gevent')

print("--- Zenith Backend Configuration ---")
print(f"Detected Local IP: {local_ip}")
print(f"Allowed CORS Origins: {allowed_origins}")
print("---------------------------------")

# --- MT5 Connection Manager ---
class MT5Manager:
    def __init__(self):
        self.lock = threading.Lock()
        self.is_initialized = False

    def connect(self, credentials):
        with self.lock:
            # Convert login to int here to ensure consistency
            try:
                login_int = int(credentials.get('login', 0))
            except (ValueError, TypeError):
                login_int = 0

            if self.is_initialized:
                account_info = mt5.account_info()
                if account_info and account_info.login == login_int:
                    # print("MT5 already initialized and logged in with correct account.")
                    return True
                print("Login changed or MT5 disconnected. Shutting down for reconnect.")
                mt5.shutdown()
                self.is_initialized = False # Force re-initialization if login changed

            terminal_path = credentials.get('terminal_path', '').strip('\'"')
            password = credentials.get('password', '')
            server = credentials.get('server', '')

            if not login_int or not password or not server:
                print("MT5 Connection Error: Missing credentials (login, password, or server).")
                self.is_initialized = False
                return False

            print(f"Attempting MT5 initialize with path: '{terminal_path if terminal_path else 'Default'}'")
            if not mt5.initialize(path=terminal_path if terminal_path else None): # Pass None if empty path
                print(f"initialize() failed, error code = {mt5.last_error()}")
                self.is_initialized = False
                return False
            print("MT5 initialized successfully.")

            print(f"Attempting MT5 login for account {login_int} on server '{server}'")
            if not mt5.login(login=login_int, password=password, server=server):
                print(f"login() failed, error code = {mt5.last_error()}")
                mt5.shutdown()
                self.is_initialized = False
                return False

            print("MT5 Connection Successful")
            self.is_initialized = True
            return True

    def shutdown_mt5(self):
        with self.lock:
            if self.is_initialized:
                print("Shutting down MT5 connection.")
                mt5.shutdown()
                self.is_initialized = False

mt5_manager = MT5Manager()

# --- Global State & Configuration ---
class AppState:
    def __init__(self):
        self.autotrade_running = False
        self.autotrade_thread = None
        self.monitoring_running = False
        self.monitoring_thread = None
        self.settings = {
            "trading_style": "DAY_TRADING",
            "risk_per_trade": 2.0,
            "max_daily_loss": 5.0,
            "account_balance": 10000.0,
            "auto_trading_enabled": False,
            "notifications_enabled": True,
            "min_confluence": 2,
            "pairs_to_trade": [],
            "mt5_credentials": { "login": 0, "password": "", "server": "", "terminal_path": "" },
            "breakeven_enabled": False,
            "breakeven_pips": 20,
            "trailing_stop_enabled": False,
            "trailing_stop_pips": 20,
            "proactive_close_enabled": False
        }
        self.lock = threading.Lock()
        # --- ADDED: Load ML model on startup ---
        self.ml_model, self.ml_vectorizer = get_model_and_vectorizer()
        if self.ml_model and self.ml_vectorizer:
            print("ML Model and Vectorizer loaded successfully at startup.")
        else:
            print("ML Model or Vectorizer not found or failed to load at startup.")


    def update_settings(self, new_settings):
        reconnect_needed = False
        with self.lock:
            current_creds = self.settings.get('mt5_credentials', {}).copy() # Get current before update

            # Ensure login is an integer
            if 'mt5_credentials' in new_settings and 'login' in new_settings['mt5_credentials']:
                try:
                    # Try converting, default to 0 on failure
                    login_val = new_settings['mt5_credentials']['login']
                    new_settings['mt5_credentials']['login'] = int(login_val) if login_val else 0
                except (ValueError, TypeError):
                     new_settings['mt5_credentials']['login'] = 0 # Default to 0 if invalid

            # Check if relevant credentials changed
            new_creds = new_settings.get('mt5_credentials')
            if new_creds and new_creds != current_creds:
                 reconnect_needed = True
                 print("MT5 credentials changed in settings.")


            self.settings.update(new_settings)
            # Make sure mt5_credentials exist before accessing login
            login_exists = 'mt5_credentials' in self.settings and 'login' in self.settings['mt5_credentials']

            print("Saving updated settings to settings.json")
            with open('settings.json', 'w') as f:
                json.dump(self.settings, f, indent=2) # Added indent for readability

        # Attempt to reconnect outside the lock if needed
        if reconnect_needed and login_exists and self.settings['mt5_credentials']['login']:
            print("Attempting to reconnect MT5 with new credentials...")
            mt5_manager.connect(self.settings['mt5_credentials'])


    def load_settings(self):
        if os.path.exists('settings.json'):
            try:
                with open('settings.json', 'r') as f:
                    loaded_settings = json.load(f)
                    with self.lock:
                        # Ensure login is int after loading
                        if 'mt5_credentials' in loaded_settings and 'login' in loaded_settings['mt5_credentials']:
                             try:
                                 login_val = loaded_settings['mt5_credentials']['login']
                                 loaded_settings['mt5_credentials']['login'] = int(login_val) if login_val else 0
                             except (ValueError, TypeError):
                                 loaded_settings['mt5_credentials']['login'] = 0
                        self.settings.update(loaded_settings)
                    print("Settings loaded from settings.json")
            except json.JSONDecodeError:
                print("Error reading settings.json file. Using defaults.")
            except Exception as e:
                 print(f"Unexpected error loading settings: {e}")
        else:
             print("settings.json not found. Using default settings.")

        # Connect on startup if credentials exist and login is not 0
        creds = self.settings.get('mt5_credentials') # Use get for safety
        if creds and creds.get('login'):
             print("Attempting initial MT5 connection from loaded settings...")
             mt5_manager.connect(creds)
        else:
            print("No valid MT5 login found in settings, skipping initial connection.")


STATE = AppState()

# Decorator to ensure MT5 is connected
def mt5_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not mt5_manager.is_initialized:
            print("MT5 connection required, but not initialized. Attempting reconnect...")
            # Try to reconnect using saved settings
            if not mt5_manager.connect(STATE.settings['mt5_credentials']):
                print("Reconnect failed.")
                return jsonify({"error": "MetaTrader 5 not connected. Please check credentials in settings and ensure terminal is running."}), 503
            print("Reconnect successful.")
        # print("MT5 connection check passed.")
        return f(*args, **kwargs)
    return decorated_function


# --- Timeframe & Style Mapping ---
TIMEFRAME_MAP = {
    'M1': mt5.TIMEFRAME_M1, 'M5': mt5.TIMEFRAME_M5, 'M15': mt5.TIMEFRAME_M15,
    'M30': mt5.TIMEFRAME_M30, # Added M30
    'H1': mt5.TIMEFRAME_H1, 'H4': mt5.TIMEFRAME_H4, 'D1': mt5.TIMEFRAME_D1,
    'W1': mt5.TIMEFRAME_W1,
    'MN1': mt5.TIMEFRAME_MN1 # Added MN1
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
    # Added open_price, sl, tp columns to store suggestion details
    cursor.execute('''CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        symbol TEXT,
        trade_type TEXT,
        open_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        outcome INTEGER DEFAULT -1,
        analysis_json TEXT,
        open_price REAL,
        sl REAL,
        tp REAL
    )''')
    conn.commit()
    conn.close()


# --- FIXED format_bar_data ---
def format_bar_data(bar, tf_str):
    """Converts MT5 bar tuple (or named tuple) to dictionary format expected by lightweight-charts."""
    # print(f"Raw bar data received: {bar} (Type: {type(bar)})") # Keep for debugging if needed

    try:
        # MT5 copy_rates_from_pos returns tuples: (time, open, high, low, close, tick_volume, spread, real_volume)
        # Access elements by index for plain tuples
        time_raw = bar[0]
        open_val = bar[1]
        high_val = bar[2]
        low_val = bar[3]
        close_val = bar[4]

        # --- Time Formatting ---
        dt = datetime.fromtimestamp(int(time_raw))
        if tf_str in ['D1', 'W1', 'MN1']:
            time_data = {"year": dt.year, "month": dt.month, "day": dt.day}
        else: # Intraday timeframes use Unix timestamp (seconds)
            time_data = int(time_raw)

        # --- OHLC Conversion (already likely numbers, but float() ensures) ---
        open_f = float(open_val)
        high_f = float(high_val)
        low_f = float(low_val)
        close_f = float(close_val)

        formatted = {"time": time_data, "open": open_f, "high": high_f, "low": low_f, "close": close_f}
        # print(f"Formatted bar: {formatted}") # Keep for debugging if needed
        return formatted

    except (IndexError, ValueError, TypeError) as e:
        # --- Catch potential errors accessing tuple indices or converting ---
        print(f"ERROR formatting bar data: {e}. Bar data was: {bar}")
        traceback.print_exc()
        return None # Indicate failure


# --- Core Analysis & Trading Logic ---
# Function to run analysis on multiple timeframes (used by auto-trader)
def _run_full_analysis(symbol, credentials, style):
    timeframes = TRADING_STYLE_TIMEFRAMES.get(style, ["M15", "H1", "H4"])

    analyses = {}
    for tf in timeframes:
        if tf not in TIMEFRAME_MAP:
            print(f"Warning: Timeframe '{tf}' not found in TIMEFRAME_MAP. Skipping.")
            continue
        rates = mt5.copy_rates_from_pos(symbol, TIMEFRAME_MAP[tf], 0, 200) # Fetch 200 bars for context
        if rates is None or len(rates) < 50: # Need enough bars for indicators
            print(f"Warning: Not enough data ({len(rates) if rates is not None else 0} bars) for {symbol} on {tf}. Skipping.")
            continue

        # Format data carefully, filtering out None values if formatting fails
        chart_data = [format_bar_data(r, tf) for r in rates]
        chart_data = [bar for bar in chart_data if bar is not None] # Filter out failed formats

        if len(chart_data) < 50: # Check again after potential filtering
             print(f"Warning: Not enough valid data ({len(chart_data)} bars) for {symbol} on {tf} after formatting. Skipping.")
             continue

        df = pd.DataFrame(chart_data)
        try:
            # Pass the dataframe and symbol to the single timeframe analysis function
             analyses[tf] = _run_single_timeframe_analysis(df, symbol)
        except Exception as e:
            print(f"Error running analysis for {symbol} on {tf}: {e}")
            traceback.print_exc() # Print full traceback
            analyses[tf] = {"error": str(e)} # Store error in result

    return analyses


# --- Get analysis from Gemini ---
def get_gemini_analysis(analysis_data):
    if not GEMINI_API_KEY:
        return {
            "action": "Neutral",
            "reason": "Gemini API key not configured.",
            "entry": None, "sl": None, "tp": None
        }

    try:
        model = genai.GenerativeModel('gemini-2.5-flash') # Using 1.0 Pro for potentially better reasoning
        prompt = f"""
        As a professional trading analyst AI, your task is to identify a single, high-probability trading setup from a multi-timeframe analysis narrative.

        **Aggregated Market Data:**
        ```json
        {json.dumps(analysis_data, indent=2)}
        ```

        **Instructions:**
        1.  **Synthesize the Narrative:** Create a coherent market narrative by synthesizing the data. Pay close attention to how higher timeframe (HTF) structure aligns with lower timeframe (LTF) entry signals. For example, a downtrend on H4 gives more weight to a bearish setup on M15.
        2.  **Identify Confluence:** Look for powerful confluence points. A setup is strongest when multiple factors align (e.g., price entering a demand zone, showing a bullish RSI divergence, and printing a bullish engulfing candle).
        3.  **Consider the Contrarian View:** Briefly state the strongest argument *against* your proposed trade. This ensures a balanced analysis. For example, "The contrarian view is that the overall H4 trend is bearish, and this could be a minor pullback before continuation."
        4.  **Formulate a Precise Trade Plan:** Based on your analysis, propose a single, actionable trade plan. If no high-probability setup exists, classify the action as "Neutral".
        5.  **Provide Output in JSON Format ONLY:** Your entire response must be a single, valid JSON object with no other text or formatting.

        **JSON Output Structure:**
        {{
          "action": "Buy",
          "reason": "A concise, expert-level justification for the trade (max 3 sentences), incorporating the multi-timeframe narrative.",
          "contrarian_view": "The strongest argument against this trade.",
          "entry": 1.23456,
          "sl": 1.23300,
          "tp": 1.23800
        }}

        **Key Points for Analysis:**
        - **Market Structure (HTF is king):** Is the primary trend bullish (HH/HL) or bearish (LL/LH)?
        - **EMAs:** Is the price above or below the key EMAs (21, 50, 200)? Has a recent Golden/Death Cross occurred?
        - **RSI:** Is the RSI overbought (>70), oversold (<30), or showing divergence? A bearish divergence in an uptrend is a powerful warning sign.
        - **Key Zones:** Is the price reacting to a fresh Supply/Demand zone, Order Block, or FVG?
        - **Liquidity:** Where are the obvious liquidity pools (equal highs/lows) that might be targeted?

        **Example Reason:** "The H4 chart is in a clear uptrend with price respecting the 50 EMA. On the M15, a bullish RSI divergence has formed as price pulls back into a key demand zone, suggesting a high-probability long entry to target the buy-side liquidity at 1.24000."
        """
        response = model.generate_content(prompt)
        # Clean up the response to ensure it's valid JSON
        cleaned_response = response.text.strip().replace('```json', '').replace('```', '')
        gemini_suggestion = json.loads(cleaned_response)
        return gemini_suggestion

    except Exception as e:
        print(f"Error getting analysis from Gemini: {e}")
        return {
            "action": "Neutral",
            "reason": f"Error communicating with Gemini AI: {e}",
            "entry": None, "sl": None, "tp": None
        }

# --- UPDATED: Function to run analysis on a single timeframe ---
def _run_single_timeframe_analysis(df, symbol):
    """Runs the full analysis suite on a single dataframe and gets Gemini's input."""
    analysis = {"symbol": symbol, "current_price": df.iloc[-1]['close']}
    try:
        # Perform all the existing technical analysis
        socketio.emit('analysis_progress', {'message': 'Finding support and resistance...'})
        analysis["support"], analysis["resistance"], pivots = find_levels(df)

        # --- NEW: Integrate advanced indicators ---
        socketio.emit('analysis_progress', {'message': 'Calculating EMAs and crosses...'})
        emas = calculate_emas(df)
        analysis["ema_crosses"] = find_ema_crosses(df, emas)
        # Add latest EMA values for context
        analysis["emas"] = {key: val.iloc[-1] for key, val in emas.items()}

        socketio.emit('analysis_progress', {'message': 'Calculating RSI and divergence...'})
        rsi = calculate_rsi(df)
        analysis["rsi_value"] = rsi.iloc[-1]
        analysis["rsi_divergence"] = find_rsi_divergence(df, rsi, pivots)

        socketio.emit('analysis_progress', {'message': 'Calculating Volume Profile...'})
        analysis["volume_profile"] = calculate_volume_profile(df)
        # --- END NEW ---

        socketio.emit('analysis_progress', {'message': 'Determining market structure...'})
        analysis["market_structure"] = determine_market_structure(pivots)
        socketio.emit('analysis_progress', {'message': 'Finding demand and supply zones...'})
        analysis["demand_zones"], analysis["supply_zones"] = find_sd_zones(df)
        socketio.emit('analysis_progress', {'message': 'Finding order blocks...'})
        analysis["bullish_ob"], analysis["bearish_ob"] = find_order_blocks(df, pivots)
        socketio.emit('analysis_progress', {'message': 'Finding fair value gaps...'})
        analysis["bullish_fvg"], analysis["bearish_fvg"] = find_fvgs(df)
        socketio.emit('analysis_progress', {'message': 'Finding liquidity pools...'})
        analysis["buy_side_liquidity"], analysis["sell_side_liquidity"] = find_liquidity_pools(pivots)
        socketio.emit('analysis_progress', {'message': 'Finding candlestick patterns...'})
        analysis["candlestick_patterns"] = find_candlestick_patterns(df)

        # Get the high-probability setup from Gemini
        socketio.emit('analysis_progress', {'message': 'Getting Gemini analysis...'})
        gemini_suggestion = get_gemini_analysis(analysis)
        analysis["suggestion"] = gemini_suggestion
        
        # The narrative and confidence are now based on the combined analysis
        analysis["confidence"] = calculate_confidence(analysis, analysis["suggestion"])
        analysis["narrative"] = generate_market_narrative(analysis)
        
        # The ML prediction can remain as a separate, complementary data point
        predicted_rate = predict_success_rate(analysis, STATE.ml_model, STATE.ml_vectorizer)
        analysis["predicted_success_rate"] = predicted_rate

    except Exception as e:
        print(f"Error during single timeframe analysis for {symbol}: {e}")
        traceback.print_exc()
        analysis["error"] = f"Analysis failed: {e}"
        analysis["suggestion"] = {"action": "Neutral", "reason": "Analysis error.", "entry": None, "sl": None, "tp": None}
        analysis["confidence"] = 0
        analysis["narrative"] = {"overview": f"Analysis failed for {symbol}", "structure_body": str(e), "levels_body": [], "prediction_body": ""}
        analysis["predicted_success_rate"] = "N/A (Analysis error)"

    return analysis


# --- Trade Execution Logic (Simplified Size Calc) ---
# (Keep _calculate_position_size and _execute_trade_logic as previously updated)
def _calculate_position_size(balance, risk_pct, sl_pips, symbol):
    """Simplified position size calculation. Requires symbol info for accuracy."""
    if sl_pips <= 0: return 0.01 # Prevent division by zero or invalid size

    amount_to_risk = balance * (risk_pct / 100.0)
    value_per_pip_per_lot = 10.0 # Default assumption (e.g., for EURUSD standard lot)
    min_lot = 0.01 # Default min lot

    if mt5_manager.is_initialized:
        symbol_info = mt5.symbol_info(symbol)
        if symbol_info:
            min_lot = symbol_info.volume_min # Get broker's minimum lot size
            point = symbol_info.point
            digits = symbol_info.digits
            tick_value = symbol_info.trade_tick_value # Value of one tick (point) movement for one standard lot

            # Determine pip size (usually 10 points, but different for JPY pairs or indices/metals)
            if digits in (3, 5): # Common for FX pairs like EURUSD (1.23456)
                pip_size = point * 10
            elif digits in (2, 4): # Common for JPY pairs like USDJPY (123.45) or some indices
                pip_size = point * 100
            else: # Metals like XAUUSD (1234.56) might have different conventions
                 pip_size = point * 10 # Default guess if unsure

            # Calculate value per pip for one standard lot (check tick_value definition with broker)
            # Assuming tick_value is for a standard lot (often it is, but verify)
            if point > 0:
                value_per_pip_per_lot = (tick_value / point) * pip_size
            else:
                 print(f"Warning: Symbol {symbol} has point size 0. Using default pip value.")


    if value_per_pip_per_lot <= 0:
        print(f"Warning: Invalid pip value ({value_per_pip_per_lot}) for {symbol}. Defaulting size to {min_lot}.")
        return min_lot

    risk_per_lot = sl_pips * value_per_pip_per_lot
    if risk_per_lot <= 0:
         print(f"Warning: Invalid risk per lot ({risk_per_lot}) calculated. Defaulting size to {min_lot}.")
         return min_lot

    position_size = round(amount_to_risk / risk_per_lot, 2)
    # Ensure size is at least min_lot and respects lot step if available
    position_size = max(position_size, min_lot)
    if mt5_manager.is_initialized and symbol_info and symbol_info.volume_step > 0:
         # Round to the nearest volume step
         position_size = round(position_size / symbol_info.volume_step) * symbol_info.volume_step
         # Ensure it's still at least min_lot after rounding
         position_size = max(position_size, min_lot)


    return round(position_size, 2) # Return rounded to 2 decimal places


def _execute_trade_logic(creds, trade_params):
    """Executes the trade on MT5 and logs it to the database."""
    if not mt5_manager.connect(creds):
        raise ConnectionError("MT5 connection failed for trade execution")

    symbol = trade_params['symbol']
    trade_type_action = trade_params['trade_type'].upper()
    volume = trade_params['lot_size']
    sl_price = trade_params['sl']
    tp_price = trade_params['tp']

    # --- Get current prices ---
    tick = mt5.symbol_info_tick(symbol)
    if not tick:
        raise ValueError(f"Could not get tick data for {symbol}")

    price = tick.ask if trade_type_action == 'BUY' else tick.bid
    # point = mt5.symbol_info(symbol).point # Not needed directly here

    # --- Build MT5 Request ---
    mt5_trade_type = mt5.ORDER_TYPE_BUY if trade_type_action == 'BUY' else mt5.ORDER_TYPE_SELL

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": float(volume),
        "type": mt5_trade_type,
        "price": float(price),
        "sl": float(sl_price),
        "tp": float(tp_price),
        "deviation": 10, # Allow 10 points deviation
        "magic": 234000, # Magic number for Zenith trades
        "comment": "Zenith AI Trade",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_FOK, # Changed to FOK to fix 'Unsupported filling mode' error
    }
    print(f"Sending trade request: {request}")

    # --- Send Order ---
    result = mt5.order_send(request)
    print(f"Order send result: {result}")


    if not result:
         last_error = mt5.last_error()
         print(f"Order send failed. Last error: {last_error}")
         raise ValueError(f"Order send failed, error code = {last_error}")
    if result.retcode != mt5.TRADE_RETCODE_DONE:
        # Log more details on failure
        print(f"Order failed. Retcode: {result.retcode}, Comment: {result.comment}, Request: {result.request}")
        raise ValueError(f"Order failed: {result.comment} (Retcode: {result.retcode})")

    # --- Log successful trade to DB ---
    conn = sqlite3.connect('trades.db', check_same_thread=False)
    cursor = conn.cursor()
    try:
        # Use placeholders for security
        cursor.execute("""
            INSERT INTO trades (order_id, symbol, trade_type, analysis_json, open_price, sl, tp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            result.order,
            symbol,
            trade_type_action,
            json.dumps(trade_params.get('analysis', {})), # Include analysis context if available
            result.price, # Log the actual execution price from result
            sl_price,
            tp_price
        ))
        conn.commit()
        print(f"Successfully logged trade {result.order} to DB.")
    except sqlite3.Error as e:
        print(f"Database Error logging trade {result.order}: {e}")
        conn.rollback() # Rollback on error
    finally:
        conn.close()

    return result


def _update_trade_outcomes(ignore_magic_number=False):
    """
    Checks for closed trades and updates their outcomes in the database.
    Returns a dictionary summarizing the operation.
    """
    print(f"Running trade outcome check... (Ignore Magic Number: {ignore_magic_number})")
    summary = {
        "deals_found_in_history": 0,
        "pending_trades_in_db": 0,
        "trades_updated": 0,
        "error": None,
        "magic_number_ignored": ignore_magic_number
    }
    try:
        from_date = datetime.now() - timedelta(days=90)
        history_deals = mt5.history_deals_get(from_date, datetime.now())

        if history_deals is None:
            error_msg = f"Could not get trade history from MT5. Error: {mt5.last_error()}"
            print(error_msg)
            summary["error"] = error_msg
            return summary

        summary["deals_found_in_history"] = len(history_deals)

        conn = sqlite3.connect('trades.db', check_same_thread=False)
        cursor = conn.cursor()

        cursor.execute("SELECT id, order_id FROM trades WHERE outcome = -1")
        pending_trades = {row[1]: row[0] for row in cursor.fetchall()}
        summary["pending_trades_in_db"] = len(pending_trades)

        if not pending_trades:
            conn.close()
            return summary

        updated_count = 0
        for deal in history_deals:
            # The condition to check if a deal corresponds to a pending trade
            is_matching_deal = (
                deal.order in pending_trades and
                deal.entry == 1 and
                (ignore_magic_number or deal.magic == 234000) # Conditionally check magic number
            )

            if is_matching_deal:
                outcome = 1 if deal.profit >= 0 else 0
                db_id = pending_trades[deal.order]
                cursor.execute("UPDATE trades SET outcome = ? WHERE id = ?", (outcome, db_id))
                updated_count += 1
                # Remove the trade from pending_trades to avoid updating it again with another deal
                del pending_trades[deal.order]
                print(f"Updated outcome for Order ID {deal.order} (DB ID: {db_id}) to {outcome} (Profit: {deal.profit})")


        if updated_count > 0:
            conn.commit()
            print(f"Committed {updated_count} trade outcome updates to the database.")

        summary["trades_updated"] = updated_count
        conn.close()

    except Exception as e:
        error_msg = f"An unexpected error occurred in _update_trade_outcomes: {e}"
        print(error_msg)
        traceback.print_exc()
        summary["error"] = error_msg

    return summary

# --- Auto-Trading Loop (Modified to use ML prediction potentially) ---
# (Keep the trading_loop function as previously updated)
def trading_loop():
    print("Auto-trading thread started.")
    while STATE.autotrade_running:
        with STATE.lock:
            settings = STATE.settings.copy() # Get a copy of current settings

        if not settings.get('auto_trading_enabled') or not mt5_manager.is_initialized:
            time.sleep(10) # Wait longer if disabled or not connected
            continue

        print(f"[{datetime.now()}] Auto-trader running scan...")
        symbols_to_trade = settings.get('pairs_to_trade', [])
        if not symbols_to_trade:
             print("Warning: No pairs selected for auto-trading in settings.")
             time.sleep(60)
             continue


        for symbol in symbols_to_trade:
            if not STATE.autotrade_running: break # Check if stopped during loop

            try:
                # Run multi-TF analysis (which now includes prediction per TF)
                analyses = _run_full_analysis(symbol, settings['mt5_credentials'], settings['trading_style'])
                if not analyses:
                    print(f"No analysis data generated for {symbol}.")
                    continue

                # --- Confluence Logic (unchanged, but uses analysis with prediction) ---
                suggestions_with_confidence = []
                for tf, analysis_result in analyses.items():
                    if "error" not in analysis_result and analysis_result.get('suggestion'):
                        suggestions_with_confidence.append({
                            'action': analysis_result['suggestion']['action'],
                            'confidence': analysis_result.get('confidence', 0), # TA confidence
                            'predicted_rate': analysis_result.get('predicted_success_rate', "N/A"),
                            'tf': tf
                        })

                if not suggestions_with_confidence:
                     print(f"No valid suggestions generated for {symbol} across timeframes.")
                     continue

                buys = sum(1 for s in suggestions_with_confidence if s['action'] == 'Buy')
                sells = sum(1 for s in suggestions_with_confidence if s['action'] == 'Sell')

                final_action = "Neutral"
                confluence_count = 0
                if buys > sells:
                    final_action = "Buy"
                    confluence_count = buys
                elif sells > buys:
                    final_action = "Sell"
                    confluence_count = sells

                min_confluence = settings.get('min_confluence', 2)

                if final_action != "Neutral" and confluence_count >= min_confluence:
                    # --- NEW: Check for existing positions before entering ---
                    open_positions = mt5.positions_get(symbol=symbol)
                    if open_positions is not None and len(open_positions) > 0:
                        has_buy = any(p.type == mt5.ORDER_TYPE_BUY for p in open_positions)
                        has_sell = any(p.type == mt5.ORDER_TYPE_SELL for p in open_positions)

                        if final_action == "Buy" and has_sell:
                            print(f"Skipping BUY on {symbol}: An open SELL position exists.")
                            continue # Skip this trade
                        if final_action == "Sell" and has_buy:
                            print(f"Skipping SELL on {symbol}: An open BUY position exists.")
                            continue # Skip this trade

                        # Optional: Add logic here to limit number of concurrent trades
                        # For example: if len(open_positions) >= 3: continue

                    # Use the primary timeframe's analysis for execution details
                    primary_tf = TRADING_STYLE_TIMEFRAMES.get(settings['trading_style'], ["M15"])[0]
                    if primary_tf not in analyses or "error" in analyses[primary_tf]:
                        print(f"Primary timeframe {primary_tf} analysis failed or missing for {symbol}. Skipping trade.")
                        continue

                    primary_analysis = analyses[primary_tf]
                    suggestion = primary_analysis['suggestion']
                    predicted_rate_str = primary_analysis.get('predicted_success_rate', "N/A")

                    # --- Optional: Add ML Prediction Threshold ---
                    # Example: Only trade if predicted rate is above 55%
                    # try:
                    #     rate_num = float(predicted_rate_str.strip('%'))
                    #     if rate_num < 55:
                    #         print(f"Skipping {final_action} on {symbol}: Predicted success rate ({predicted_rate_str}) below threshold (55%).")
                    #         continue
                    # except (ValueError, TypeError):
                    #      # If prediction is N/A or invalid, proceed based on TA confidence only
                    #      pass


                    # Calculate SL pips and position size
                    if suggestion['entry'] is None or suggestion['sl'] is None:
                         print(f"Skipping {final_action} on {symbol}: Missing entry or SL price in suggestion.")
                         continue

                    # Determine pip multiplier (JPY pairs vs others)
                    symbol_info = mt5.symbol_info(symbol)
                    pip_multiplier = 10000
                    if symbol_info:
                         if symbol_info.digits in (2, 3): # Typically JPY pairs
                             pip_multiplier = 100
                         elif symbol_info.digits in (0, 1): # Typically indices/metals without many decimals
                              pip_multiplier = 1 # Or adjust based on point value if needed
                    # else: use default 10000

                    sl_pips = abs(suggestion['entry'] - suggestion['sl']) * pip_multiplier

                    # Use current balance for calculation
                    current_balance = settings['account_balance'] # Start with setting
                    account_info = mt5.account_info()
                    if account_info:
                        current_balance = account_info.balance # Use live balance if available

                    pos_size = _calculate_position_size(current_balance, settings['risk_per_trade'], sl_pips, symbol)


                    if pos_size < 0.01:
                        print(f"Skipping {final_action} on {symbol}: Calculated position size too small ({pos_size}). SL Pips: {sl_pips}")
                        continue

                    trade_params = {
                        "symbol": symbol,
                        "trade_type": final_action,
                        "lot_size": pos_size,
                        "sl": suggestion['sl'],
                        "tp": suggestion['tp'],
                        "analysis": primary_analysis # Log the primary TF analysis
                    }

                    # Always emit the signal
                    signal_message = (
                        f"{final_action} signal on {symbol} ({primary_tf}) "
                        f"with {confluence_count}-TF confluence. "
                        f"TA Conf: {primary_analysis['confidence']}%. "
                        f"ML Pred: {predicted_rate_str}."
                    )
                    socketio.emit('trade_signal', {
                        "params": trade_params,
                        "message": signal_message
                    })

                    # Execute if auto-trading is enabled
                    if settings['auto_trading_enabled']:
                        print(f"Executing {final_action} on {symbol}...")
                        try:
                            result = _execute_trade_logic(settings['mt5_credentials'], trade_params)
                            notification_message = (
                                f"Auto-trade executed: {final_action} {pos_size:.2f} lots of {symbol}. "
                                f"Order ID: {result.order}"
                            )
                            socketio.emit('notification', {"message": notification_message})
                            print(notification_message)
                            time.sleep(300) # Cooldown after trading this pair
                        except Exception as exec_e:
                            error_message = f"Auto-trade execution failed for {symbol}: {exec_e}"
                            print(error_message)
                            socketio.emit('notification', {"message": error_message, "type": "error"})

            except Exception as e:
                error_log = f"Error in trading loop for {symbol}: {e}"
                print(error_log)
                traceback.print_exc() # Print full traceback for debugging loop errors
                # Optionally emit a notification about the loop error
                # socketio.emit('notification', {"message": error_log, "type": "error"})

            if not STATE.autotrade_running: break # Check again after processing a symbol

        if STATE.autotrade_running:
            scan_wait_time = 1800 # 30 mins wait before another scan runs
            print(f"Scan complete. Waiting {scan_wait_time} seconds...")
            time.sleep(scan_wait_time) # Wait a minute before the next full scan

    print("Auto-trading thread stopped.")


def trade_monitoring_loop():
    """Background thread loop for proactive trade management and outcome checking."""
    print("Trade outcome monitoring thread started.")
    while STATE.monitoring_running:
        if mt5_manager.is_initialized:
            # --- Proactive Trade Management ---
            open_positions = mt5.positions_get()
            if open_positions:
                with STATE.lock:
                    settings = STATE.settings.copy()

                for position in open_positions:
                    if position.magic == 234000: # Manage only bot's trades
                        symbol_info = mt5.symbol_info(position.symbol)
                        if not symbol_info:
                            continue

                        manage_breakeven(position, settings, symbol_info)
                        manage_trailing_stop(position, settings, symbol_info)
                        monitor_and_close_trades(position, settings, _run_full_analysis, TRADING_STYLE_TIMEFRAMES)

            # --- Outcome Checking for Closed Trades ---
            _update_trade_outcomes()
        else:
            print("Trade Monitor: MT5 not connected, skipping check.")

        # Wait for 1 minute (60 seconds) for more responsive management
        time.sleep(60)
    print("Trade outcome monitoring thread stopped.")


# --- API Routes ---
# (Keep handle_settings, get_account_info, get_open_positions, get_all_symbols)
@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    if request.method == 'GET':
        # Return a copy to avoid potential modification issues if state changes elsewhere
        with STATE.lock:
            current_settings = STATE.settings.copy()
        return jsonify(current_settings)
    elif request.method == 'POST':
        new_settings = request.get_json()
        if not new_settings:
            return jsonify({"error": "Invalid JSON payload"}), 400
        try:
            STATE.update_settings(new_settings)
            # Emit updated settings to potentially update UI elements if needed
            # socketio.emit('settings_updated', STATE.settings)
            return jsonify({"message": "Settings updated successfully."})
        except Exception as e:
            print(f"Error updating settings: {e}")
            return jsonify({"error": f"Failed to update settings: {e}"}), 500
    else:
        # Method Not Allowed
         return jsonify({"error": "Method not allowed"}), 405


@app.route('/api/get_account_info', methods=['POST'])
@mt5_required
def get_account_info():
    # Credentials passed but only used by mt5_required to ensure connection *if needed*
    creds = request.get_json()
    info = mt5.account_info()
    if info:
        socketio.emit('profit_update', {'profit': info.profit})
        return jsonify({"balance": info.balance, "equity": info.equity, "profit": info.profit})

    print(f"Could not fetch account info after successful connection check. Last MT5 error: {mt5.last_error()}")
    return jsonify({"error": f"Could not fetch account info. MT5 Error: {mt5.last_error()}"}), 500


@app.route('/api/get_open_positions', methods=['POST'])
@mt5_required
def get_open_positions():
    positions = mt5.positions_get()
    if positions is None:
        print(f"Failed to get positions. MT5 Error: {mt5.last_error()}")
        return jsonify([]) # Return empty list on failure, frontend expects a list
    # Format positions safely
    formatted_positions = []
    for p in positions:
        try:
             formatted_positions.append({
                 "ticket": int(p.ticket),
                 "symbol": p.symbol,
                 "type": "BUY" if p.type == mt5.ORDER_TYPE_BUY else "SELL", # Use MT5 constants
                 "volume": float(p.volume),
                 "price_open": float(p.price_open),
                 "profit": float(p.profit)
                 # Add SL and TP if needed by frontend
                 # "sl": float(p.sl),
                 # "tp": float(p.tp)
             })
        except Exception as e:
            print(f"Error formatting position {p.ticket}: {e}")
    return jsonify(formatted_positions)

@app.route('/api/get_all_symbols', methods=['POST'])
@mt5_required
def get_all_symbols():
    symbols = mt5.symbols_get()
    if symbols is None:
        print(f"Failed to get symbols. MT5 Error: {mt5.last_error()}")
        return jsonify({"error": f"Could not get symbols. MT5 Error: {mt5.last_error()}"}), 500
    # Filter for visible symbols and return only names
    visible_symbols = [s.name for s in symbols if s.visible]
    return jsonify(visible_symbols)


@app.route('/api/get_chart_data', methods=['POST'])
@mt5_required
def get_chart_data():
    print("\n--- [API LOG] /api/get_chart_data endpoint hit ---")
    try:
        creds_and_params = request.get_json()
        symbol = creds_and_params.get('symbol')
        timeframe_str = creds_and_params.get('timeframe') # This should be 'M1', 'H1' etc.
        print(f"[API LOG] Request Params: Symbol='{symbol}', Timeframe='{timeframe_str}'")

        if not symbol or not timeframe_str or timeframe_str not in TIMEFRAME_MAP:
            print(f"[API LOG] ERROR: Invalid symbol ('{symbol}') or timeframe ('{timeframe_str}').")
            return jsonify({"error": "Invalid symbol or timeframe provided."}), 400

        mt5_timeframe = TIMEFRAME_MAP[timeframe_str]
        num_bars_to_fetch = 500 # Fetch more bars for better analysis context
        rates = mt5.copy_rates_from_pos(symbol, mt5_timeframe, 0, num_bars_to_fetch)

        if rates is None:
            mt5_error = mt5.last_error()
            print(f"[API LOG] ERROR: mt5.copy_rates_from_pos returned None for {symbol}/{timeframe_str}. MT5 Error: {mt5_error}")
            return jsonify({"error": f"Could not get rates for {symbol}. MT5 Error: {mt5_error}"}), 500

        print(f"[API LOG] Fetched {len(rates)} rates from MT5 for {symbol}/{timeframe_str}.")
        if len(rates) == 0:
             print("[API LOG] ERROR: Fetched 0 rates.")
             return jsonify({"error": f"Fetched 0 rates for {symbol}/{timeframe_str}. Is the symbol/timeframe available?"}), 400

        chart_data = []
        none_count = 0
        for i, bar in enumerate(rates):
            formatted = format_bar_data(bar, timeframe_str)
            if formatted is None:
                none_count += 1
                # Log only the first few failing bars to avoid flooding logs
                if none_count <= 5:
                    print(f"[API LOG] Failed to format bar index {i}: {bar}")
            else:
                chart_data.append(formatted)

        if none_count > 0:
             print(f"[API LOG] Warning: {none_count} out of {len(rates)} bars failed to format for {symbol}/{timeframe_str}.")

        if not chart_data:
             # Add more context to the error message
             print(f"[API LOG] ERROR: No valid chart data remained after formatting for {symbol}/{timeframe_str}.")
             return jsonify({"error": f"Failed to format any chart data for {symbol}/{timeframe_str}. Check backend logs for details."}), 500

        print(f"[API LOG] Sending {len(chart_data)} formatted bars to frontend for {symbol}/{timeframe_str}.")
        return jsonify(chart_data)

    except Exception as e:
        print(f"[API LOG] CRITICAL ERROR in get_chart_data: {e}")
        traceback.print_exc() # Print full traceback
        return jsonify({"error": f"An unexpected server error occurred: {e}"}), 500


# REMOVED DUPLICATE ROUTE DEFINITION - Keep only the first one
@app.route('/api/analyze_single_timeframe', methods=['POST'])
@mt5_required
def analyze_single_timeframe():
    """Endpoint for analyzing just the currently viewed timeframe."""
    try:
        data = request.get_json()
        symbol = data.get('symbol')
        timeframe = data.get('timeframe') # e.g., 'H1'

        if not symbol or not timeframe or timeframe not in TIMEFRAME_MAP:
            return jsonify({"error": "Invalid symbol or timeframe provided."}), 400

        rates = mt5.copy_rates_from_pos(symbol, TIMEFRAME_MAP[timeframe], 0, 200)
        if rates is None or len(rates) < 50: # Ensure enough data for analysis
            return jsonify({"error": f"Could not fetch enough data ({len(rates) if rates else 0} bars) for {symbol} on {timeframe}."}), 400

        # Format data and filter errors
        chart_data = [format_bar_data(bar, timeframe) for bar in rates]
        chart_data = [bar for bar in chart_data if bar is not None]
        if len(chart_data) < 50:
             return jsonify({"error": f"Not enough valid data ({len(chart_data)} bars) for {symbol} on {timeframe} after formatting."}), 400

        df = pd.DataFrame(chart_data)

        # Run the analysis and return the raw results
        analysis_result = _run_single_timeframe_analysis(df, symbol)

        return jsonify(analysis_result)

    except Exception as e:
        print(f"Single-TF Analysis Error: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Error during single timeframe analysis: {e}"}), 500

# --- The SECOND definition below this line was removed ---
# @app.route('/api/analyze_single_timeframe', methods=['POST'])
# @mt5_required
# def analyze_single_timeframe():
#    ... (rest of the second definition was here) ...


@app.route('/api/analyze_multi_timeframe', methods=['POST'])
@mt5_required
def analyze_multi_timeframe():
    """Endpoint for multi-timeframe analysis based on trading style (used for auto-trading)."""
    try:
        data = request.get_json()
        style = data.get('trading_style', 'DAY_TRADING').upper()
        symbol = data.get('symbol')

        if not symbol:
             return jsonify({"error": "Symbol is required for multi-timeframe analysis."}), 400

        analyses = _run_full_analysis(symbol, STATE.settings['mt5_credentials'], style)

        if not analyses:
            return jsonify({"error": "Could not fetch or analyze data for any relevant timeframe."}), 400

        # --- Multi-Timeframe Confluence Logic ---
        suggestions_with_details = []
        for tf, analysis_result in analyses.items():
            if "error" not in analysis_result and analysis_result.get('suggestion'):
                suggestions_with_details.append({
                    'action': analysis_result['suggestion']['action'],
                    'confidence': analysis_result.get('confidence', 0),
                    'predicted_rate': analysis_result.get('predicted_success_rate', "N/A"),
                    'tf': tf
                })

        if not suggestions_with_details:
             return jsonify({"error": "No valid suggestions generated across timeframes."}), 400

        buys = sum(1 for s in suggestions_with_details if s['action'] == 'Buy')
        sells = sum(1 for s in suggestions_with_details if s['action'] == 'Sell')

        # Determine overall action based on majority
        final_action = "Neutral"
        if buys > sells: final_action = "Buy"
        elif sells > buys: final_action = "Sell"

        # Calculate final confidence based on agreement and individual confidences/predictions
        final_confidence_score = 0
        if final_action != "Neutral":
             agreeing_suggestions = [s for s in suggestions_with_details if s['action'] == final_action]
             confluence_count = len(agreeing_suggestions)
             base_score = 30 + (confluence_count * 20) # More agreement = higher base
             avg_ta_confidence = sum(s['confidence'] for s in agreeing_suggestions) / confluence_count if confluence_count else 0
             final_confidence_score = (base_score + avg_ta_confidence) / 2
             # Optional: Factor in ML predictions from agreeing TFs if available
             # ... (add logic here if desired)

        final_confidence_score = min(max(int(final_confidence_score), 0), 100) # Clamp between 0 and 100

        # Get primary timeframe suggestion details
        timeframes = TRADING_STYLE_TIMEFRAMES.get(style, ["M15", "H1", "H4"])
        primary_tf = next((tf for tf in timeframes if tf in analyses and "error" not in analyses[tf]), None)
        primary_suggestion = analyses[primary_tf]['suggestion'] if primary_tf else None

        # Aggregate narratives (optional, could just return primary narrative)
        full_narrative = {tf: a.get('narrative', {}) for tf, a in analyses.items() if "error" not in a}

        return jsonify({
            "final_action": final_action,
            "final_confidence": final_confidence_score, # Return numerical score
            "primary_suggestion": primary_suggestion,
            "narratives": full_narrative, # Or just analyses[primary_tf]['narrative']
            "individual_analyses": analyses # For detailed view if needed
        })

    except Exception as e:
        print(f"Multi-TF Analysis Error: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Error during multi-timeframe analysis: {e}"}), 500


@app.route('/api/run_backtest', methods=['POST'])
def handle_backtest():
    data = request.get_json()
    historical_data = data.get('historical_data')
    settings = data.get('settings') # Use settings passed from frontend for backtest params

    if not historical_data or not settings:
        return jsonify({"error": "Missing historical data or settings."}), 400
    if not isinstance(historical_data, list) or len(historical_data) == 0:
         return jsonify({"error": "Historical data must be a non-empty list."}), 400

    try:
        # Pass settings directly to run_backtest
        results = run_backtest(historical_data, settings)
        if "error" in results:
             return jsonify(results), 400 # Propagate errors from backtest function
        return jsonify(results)
    except Exception as e:
        print(f"Error during backtest execution: {e}")
        traceback.print_exc()
        return jsonify({"error": f"An unexpected error occurred during backtesting: {e}"}), 500


# Add a route for manual trade execution
@app.route('/api/execute_trade', methods=['POST'])
@mt5_required
def handle_execute_trade():
    trade_params = request.get_json()
    if not trade_params:
        return jsonify({"error": "Invalid JSON payload"}), 400

    required_keys = ['symbol', 'lot_size', 'trade_type', 'stop_loss', 'take_profit']
    if not all(key in trade_params for key in required_keys):
        return jsonify({"error": "Missing required trade parameters (symbol, lot_size, trade_type, stop_loss, take_profit)"}), 400

    try:
        # Ensure numeric types are correct
        trade_params['lot_size'] = float(trade_params['lot_size'])
        trade_params['sl'] = float(trade_params['stop_loss']) # Use 'sl'/'tp' keys for execution logic
        trade_params['tp'] = float(trade_params['take_profit'])
        trade_params['analysis'] = trade_params.get('analysis', {}) # Include analysis if sent

        if trade_params['lot_size'] <= 0:
             raise ValueError("Lot size must be positive.")

        # Use credentials from global state (safer than passing from frontend every time)
        creds = STATE.settings['mt5_credentials']

        result = _execute_trade_logic(creds, trade_params)

        return jsonify({
            "message": "Trade executed successfully!",
            "details": {
                "order_id": result.order,
                "symbol": trade_params['symbol'],
                "type": trade_params['trade_type'],
                "volume": trade_params['lot_size']
            }
        })
    except ValueError as ve: # Catch specific input errors
        print(f"ValueError during trade execution: {ve}")
        return jsonify({"error": str(ve)}), 400
    except ConnectionError as ce:
        print(f"ConnectionError during trade execution: {ce}")
        return jsonify({"error": str(ce)}), 503 # Service unavailable
    except Exception as e:
        print(f"Error executing manual trade: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to execute trade: {e}"}), 500


# --- Add Routes for Auto-Trading Control ---
@app.route('/api/start_autotrade', methods=['POST'])
def handle_start_autotrade():
    # Ensure MT5 is connected before starting
    if not mt5_manager.is_initialized:
        if not mt5_manager.connect(STATE.settings['mt5_credentials']):
             return jsonify({"error": "Cannot start auto-trading: MT5 connection failed."}), 503

    if STATE.autotrade_running:
        return jsonify({"message": "Auto-trading is already running."}), 200

    # Update the setting to ensure consistency
    STATE.update_settings({"auto_trading_enabled": True})

    with STATE.lock: # Ensure thread-safe start
        # Check again inside lock
        if not STATE.autotrade_running:
             STATE.autotrade_running = True
             # Ensure the thread is only created if it doesn't exist or isn't alive
             if STATE.autotrade_thread is None or not STATE.autotrade_thread.is_alive():
                 STATE.autotrade_thread = threading.Thread(target=trading_loop, daemon=True)
                 STATE.autotrade_thread.start()
                 print("Started auto-trading thread.")
                 return jsonify({"message": "Auto-trading started."})
             else:
                  print("Auto-trading thread already exists and is alive.")
                  return jsonify({"message": "Auto-trading is already running (thread active)."}), 200
        else:
             # This case should ideally not be hit due to the outer check, but good for safety
             return jsonify({"message": "Auto-trading was already running."}), 200


@app.route('/api/stop_autotrade', methods=['POST'])
def handle_stop_autotrade():
    if not STATE.autotrade_running:
        return jsonify({"message": "Auto-trading is not running."}), 200

    print("Received request to stop auto-trading...")
    # Update the setting first
    STATE.update_settings({"auto_trading_enabled": False})

    with STATE.lock:
        STATE.autotrade_running = False # Signal the loop to stop

    # Wait briefly for the thread to potentially exit its current loop iteration
    thread_to_join = STATE.autotrade_thread # Get ref before potentially setting to None
    if thread_to_join and thread_to_join.is_alive():
        print("Waiting for auto-trading thread to stop...")
        thread_to_join.join(timeout=5.0) # Wait up to 5 seconds
        if thread_to_join.is_alive():
            print("Warning: Auto-trading thread did not stop gracefully within timeout.")
        else:
            print("Auto-trading thread stopped.")
            STATE.autotrade_thread = None # Clear the thread reference only if stopped
    else:
        print("Auto-trading thread was not running or already stopped.")
        STATE.autotrade_thread = None # Clear ref if it wasn't running

    return jsonify({"message": "Auto-trading stopped."})


# --- New Chat Endpoint ---
@app.route('/api/chat', methods=['POST'])
def handle_chat():
    if not GEMINI_API_KEY:
        return jsonify({"error": "Gemini API key not configured."}), 500

    try:
        data = request.get_json()
        user_message = data.get('message')
        analysis_context = data.get('analysis_context')
        chat_history = data.get('history', []) # Expecting a list of {"role": "user/model", "parts": ["message"]}

        if not user_message or not analysis_context:
            return jsonify({"error": "Missing message or analysis context."}), 400

        model = genai.GenerativeModel('gemini-2.5-flash')
        chat = model.start_chat(history=chat_history)
        
        # Construct a more detailed prompt for the chat
        prompt = f"""
        You are a trading assistant AI named Zenith. A user is asking a question about a market analysis you have performed.
        
        **Analysis Context:**
        {json.dumps(analysis_context, indent=2)}

        **User's Question:**
        "{user_message}"

        **Instructions:**
        - Answer the user's question concisely and directly, based *only* on the provided analysis context.
        - Do not give financial advice.
        - Maintain the persona of Zenith, a helpful and knowledgeable trading AI.
        - If the question is outside the scope of the analysis, politely state that you can only answer questions about the current chart analysis.
        """
        
        response = chat.send_message(prompt)
        return jsonify({"reply": response.text})

    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        traceback.print_exc()
        return jsonify({"error": f"An error occurred in the chat service: {e}"}), 500


# --- New Model Training Endpoint ---
@app.route('/api/force_outcome_update', methods=['POST'])
@mt5_required
def handle_force_outcome_update():
    """
    Manually triggers the trade outcome check and returns a detailed summary.
    Accepts a JSON body with `ignore_magic_number: true` to update all trades.
    """
    try:
        data = request.get_json() or {}
        ignore_magic = data.get('ignore_magic_number', False)

        print(f"Manual trade outcome update triggered via API. Ignore Magic: {ignore_magic}")
        summary = _update_trade_outcomes(ignore_magic_number=ignore_magic)
        return jsonify(summary)
    except Exception as e:
        print(f"Error during manual outcome update: {e}")
        traceback.print_exc()
        return jsonify({"error": f"An unexpected error occurred: {e}"}), 500


@app.route('/api/train_model', methods=['POST'])
def handle_train_model():
    """Endpoint to trigger model training from historical data."""
    try:
        # Connect to the database and fetch all trades
        conn = sqlite3.connect('trades.db', check_same_thread=False)
        # Make the cursor return rows as dictionaries
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("SELECT outcome, analysis_json FROM trades WHERE outcome != -1 AND analysis_json IS NOT NULL")
        trades_data = [dict(row) for row in cursor.fetchall()]
        conn.close()

        print(f"Fetched {len(trades_data)} trades from DB for training.")

        if not trades_data:
            return jsonify({"error": "No training data available in the database."}), 400

        # Call the training function from learning.py
        result = train_and_save_model(trades_data)

        if "error" in result:
            # If training failed, return the error message
            return jsonify(result), 400
        else:
            # --- IMPORTANT: Reload the model into the app state after successful training ---
            print("Training successful. Reloading model and vectorizer into application state...")
            STATE.ml_model, STATE.ml_vectorizer = get_model_and_vectorizer()
            if STATE.ml_model is not None and STATE.ml_vectorizer is not None:
                print("Model reloaded successfully.")
                return jsonify(result)
            else:
                print("Critical Error: Model trained but failed to reload into state.")
                return jsonify({"error": "Model trained but failed to load. Please restart the server."}), 500

    except sqlite3.Error as db_e:
        print(f"Database error during model training: {db_e}")
        return jsonify({"error": f"Database error: {db_e}"}), 500
    except Exception as e:
        print(f"An unexpected error occurred during model training: {e}")
        traceback.print_exc()
        return jsonify({"error": f"An unexpected server error occurred: {e}"}), 500


@app.route('/api/get_daily_stats', methods=['POST'])
@mt5_required
def get_daily_stats():
    """
    Calculates and returns trading statistics for the current day
    based on the trade history from MT5.
    """
    try:
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

        history_deals = mt5.history_deals_get(today, datetime.now())

        if history_deals is None:
            return jsonify({"error": f"Could not get trade history from MT5. Error: {mt5.last_error()}"}), 500

        # Filter for deals that are closing trades (entry type 'OUT') and belong to the bot
        closed_trades = [d for d in history_deals if d.entry == 1 and d.magic == 234000]

        total_trades = len(closed_trades)
        if total_trades == 0:
            return jsonify({
                "trades": 0, "won": 0, "lost": 0,
                "winRate": "0%", "dailyPnl": 0.0
            })

        trades_won = sum(1 for d in closed_trades if d.profit >= 0)
        trades_lost = total_trades - trades_won
        win_rate = (trades_won / total_trades) * 100 if total_trades > 0 else 0
        total_pnl = sum(d.profit for d in closed_trades)

        stats = {
            "trades": total_trades,
            "won": trades_won,
            "lost": trades_lost,
            "winRate": f"{win_rate:.1f}%",
            "dailyPnl": total_pnl
        }
        return jsonify(stats)

    except Exception as e:
        print(f"Error in get_daily_stats: {e}")
        traceback.print_exc()
        return jsonify({"error": "An unexpected server error occurred."}), 500

# --- SocketIO Events ---
@socketio.on('connect')
def handle_connect():
    print('Client connected:', request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected:', request.sid)

# Example of a potential subscription event (not fully implemented in frontend yet)
@socketio.on('subscribe_to_chart')
def handle_subscribe(data):
    sid = request.sid
    symbol = data.get('symbol')
    tf = data.get('timeframe')
    print(f"Client {sid} subscribing to {symbol} {tf}")
    # Here you would add logic to start sending real-time updates for this symbol/tf
    # Maybe join a room: join_room(f"{symbol}_{tf}")

@socketio.on('unsubscribe_from_chart')
def handle_unsubscribe(data):
     sid = request.sid
     symbol = data.get('symbol')
     tf = data.get('timeframe')
     print(f"Client {sid} unsubscribing from {symbol} {tf}")
     # Leave the room: leave_room(f"{symbol}_{tf}")


# --- Main Execution ---
if __name__ == '__main__':
    init_db()
    STATE.load_settings()

    # --- Start Background Threads ---
    # 1. Start Trade Outcome Monitoring
    if not STATE.monitoring_running:
        STATE.monitoring_running = True
        STATE.monitoring_thread = threading.Thread(target=trade_monitoring_loop, daemon=True)
        STATE.monitoring_thread.start()
        print("Started trade outcome monitoring thread.")

    # 2. Start Auto-Trading Loop (if enabled in settings)
    if STATE.settings.get('auto_trading_enabled') and not STATE.autotrade_running:
        if mt5_manager.is_initialized:
            with STATE.lock:
                if not STATE.autotrade_running:
                    STATE.autotrade_running = True
                    STATE.autotrade_thread = threading.Thread(target=trading_loop, daemon=True)
                    STATE.autotrade_thread.start()
                    print("Auto-trading started based on loaded settings.")
        else:
            print("Auto-trading enabled in settings, but MT5 connection failed on startup. Loop not started.")

    print(f"Starting Flask-SocketIO server on http://0.0.0.0:5000")
    try:
        socketio.run(app, host='0.0.0.0', port=5000, debug=True, use_reloader=False)
    finally:
        print("Flask app shutting down...")
        # Signal threads to stop
        STATE.autotrade_running = False
        STATE.monitoring_running = False
        # Shut down MT5 connection
        mt5_manager.shutdown_mt5()