# app.py
# --- (Keep all existing imports and configurations above this line) ---
import MetaTrader5 as mt5
import pandas as pd
from datetime import datetime, timedelta, timezone
import sqlite3
import json
import threading
import time
import os
from functools import wraps
import socket # Import socket to get local IP
import traceback # Import traceback for detailed error logging
import logging
import google.generativeai as genai
from dotenv import load_dotenv
from flask import Flask, request, jsonify, redirect, url_for, session
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flask_bcrypt import Bcrypt
from werkzeug.security import generate_password_hash, check_password_hash
from google_auth_oauthlib.flow import Flow
from google.oauth2 import id_token
from google.auth.transport.requests import Request as GoogleRequest
import numpy
import jwt
from itsdangerous import URLSafeTimedSerializer


# --- AI & Learning Imports ---
from analysis import (
    find_levels, find_sd_zones, find_order_blocks, find_liquidity_pools,
    find_fvgs, find_candlestick_patterns, get_trade_suggestion,
    calculate_confidence, generate_market_narrative, determine_market_structure,
    calculate_volume_profile, calculate_rsi, find_rsi_divergence,
    calculate_emas, find_ema_crosses
)
from learning import get_model_and_vectorizer, train_and_save_model, extract_features, predict_success_rate
from backtest import run_backtest
from trade_monitor import manage_breakeven, manage_trailing_stop, close_trade

# --- Gemini Configuration ---
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    print("Gemini API Key loaded successfully.")
else:
    print("Warning: GEMINI_API_KEY not found in .env file. Gemini features will be disabled.")

# --- Flask App Setup ---
app = Flask(__name__)

# --- Dynamic Origin Configuration for CORS ---
def get_local_ip():
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
# Make sure your frontend URL is included if deploying
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    f"http://{local_ip}:3000",
    os.getenv("FRONTEND_URL", "http://localhost:3000") # Add deployed frontend URL via env var
]

# --- App Configuration ---
# Use a strong, randomly generated secret key stored in an environment variable
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'default-unsafe-secret-key-please-change')
if app.config['SECRET_KEY'] == 'default-unsafe-secret-key-please-change':
    print("WARNING: Using default Flask SECRET_KEY. Please set a strong FLASK_SECRET_KEY environment variable for production.")

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trades.db' # The DB file will now store users and trades
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# Required for Flask-Login sessions to work across requests
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax' # Can be 'Strict' if frontend/backend are same domain
app.config['SESSION_COOKIE_SECURE'] = os.getenv('FLASK_ENV') == 'production' # Use secure cookies only over HTTPS

# --- Extensions Initialization ---
# supports_credentials=True allows cookies (like the session cookie) to be sent from the frontend
CORS(app, resources={r"/api/*": {"origins": allowed_origins}}, supports_credentials=True)
socketio = SocketIO(app, cors_allowed_origins=allowed_origins, async_mode='gevent')
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
login_manager = LoginManager()
login_manager.init_app(app)
# If a route requires login and the user isn't logged in, Flask-Login usually redirects.
# For an API, we want it to return a 401 Unauthorized error instead.
login_manager.login_view = None # Disable redirect
login_manager.unauthorized_handler(lambda: (jsonify(error="Login required."), 401))

# --- Google OAuth Configuration ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

# --- MODIFICATION START ---
# Determine the base URL for the backend
# For local development, ALWAYS use 127.0.0.1 for consistency with cookies.
# For production, use the BACKEND_URL environment variable.
if os.getenv('FLASK_ENV') == 'production':
    BACKEND_BASE_URL = os.getenv('BACKEND_URL')
    if not BACKEND_BASE_URL:
        print("CRITICAL WARNING: FLASK_ENV is 'production' but BACKEND_URL environment variable is not set!")
        # Fallback, but this should be configured in production
        BACKEND_BASE_URL = f'http://{get_local_ip()}:5000'
else:
    # Use 127.0.0.1 for local development to avoid cookie domain issues
    BACKEND_BASE_URL = 'http://127.0.0.1:5000'
    print(f"INFO: Using development BACKEND_BASE_URL: {BACKEND_BASE_URL}")
# --- MODIFICATION END ---


GOOGLE_REDIRECT_URI = f"{BACKEND_BASE_URL}/api/auth/google/callback"

# !! IMPORTANT FOR LOCAL DEVELOPMENT ONLY !!
# Allow OAuthlib to work over HTTP. Remove this line in production (HTTPS is required).
if os.getenv('FLASK_ENV') != 'production':
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
    print("WARNING: Allowing insecure transport for OAuth (HTTP). This should NOT be enabled in production.")

google_flow = None
if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
    try:
        # Construct the client_secrets dictionary needed by the Flow object
        client_secrets = {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                # Make sure 127.0.0.1 callback is listed here AND in Google Cloud Console
                "redirect_uris": [GOOGLE_REDIRECT_URI, f"http://127.0.0.1:5000/api/auth/google/callback"],
            }
        }
        google_flow = Flow.from_client_config(
            client_config=client_secrets, # Pass the structured config
            scopes=[ # Define the permissions we need from Google
                "https://www.googleapis.com/auth/userinfo.profile", # Get name, picture
                "https://www.googleapis.com/auth/userinfo.email",   # Get email address
                "openid" # Standard OpenID Connect scope
            ],
            redirect_uri=GOOGLE_REDIRECT_URI
        )
        print("Google OAuth Flow configured successfully.")
    except Exception as e:
        print(f"Error configuring Google OAuth Flow: {e}. Check client secrets structure and environment variables.")
        google_flow = None
else:
    print("Warning: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables not found. Google Login will be disabled.")

print("\n--- Zenith Backend Configuration Summary ---")
print(f"Detected Local IP: {local_ip}")
print(f"Allowed CORS Origins: {allowed_origins}")
print(f"Flask Secret Key Loaded: {'Yes' if os.getenv('FLASK_SECRET_KEY') and app.config['SECRET_KEY'] != 'default-unsafe-secret-key-please-change' else 'No (Using default - UNSAFE FOR PRODUCTION)'}")
print(f"Database URI: {app.config['SQLALCHEMY_DATABASE_URI']}")
print(f"Session Cookie Secure: {app.config['SESSION_COOKIE_SECURE']}")
print(f"Google OAuth Enabled: {'Yes' if google_flow else 'No'}")
if google_flow:
    print(f"Google Redirect URI: {GOOGLE_REDIRECT_URI}") # Reflects the logic change above
print("------------------------------------------\n")

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO, # Changed to INFO for less verbosity, DEBUG for more
                    format='%(asctime)s [%(levelname)s] %(message)s (%(filename)s:%(lineno)d)',
                    handlers=[
                        logging.FileHandler("zenith_app.log"), # Log to a file
                        logging.StreamHandler() # Also log to console
                    ])
logging.info("Flask application starting up...")

# --- User Model (SQLAlchemy) ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(150), unique=True, nullable=False, index=True) # Added index
    password_hash = db.Column(db.String(150), nullable=True) # Nullable for OAuth users
    name = db.Column(db.String(150), nullable=True)
    google_id = db.Column(db.String(150), unique=True, nullable=True, index=True) # Added index
    # Add timestamps?
    # created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        # Use bcrypt for hashing
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password):
        if not self.password_hash:
            return False
        return bcrypt.check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<User {self.email}>'

    def get_reset_token(self, expires_sec=1800):
        s = URLSafeTimedSerializer(app.config['SECRET_KEY'])
        return s.dumps({'user_id': self.id})

    @staticmethod
    def verify_reset_token(token, expires_sec=1800):
        s = URLSafeTimedSerializer(app.config['SECRET_KEY'])
        try:
            user_id = s.loads(token, max_age=expires_sec)['user_id']
        except:
            return None
        return User.query.get(user_id)


# --- Flask-Login User Loader ---
@login_manager.user_loader
def load_user(user_id):
    # Use the recommended db.session.get() instead of User.query.get()
    return db.session.get(User, int(user_id))

# --- MT5 Connection Manager ---
class MT5Manager:
    def __init__(self):
        self.lock = threading.Lock()
        self.is_initialized = False
        logging.info("MT5Manager initialized.")

    def connect(self, credentials):
        with self.lock:
            # Safely get and convert login ID
            login_str = credentials.get('login', '')
            try:
                login_int = int(login_str) if login_str else 0
            except (ValueError, TypeError):
                logging.warning(f"Invalid MT5 login format received: '{login_str}'. Using 0.")
                login_int = 0

            # Check if already connected with the *same* account
            if self.is_initialized:
                account_info = mt5.account_info()
                if account_info and account_info.login == login_int:
                    logging.debug(f"MT5 already initialized for account {login_int}.")
                    return True
                # If login changed or connection lost, shutdown before reconnecting
                logging.info(f"MT5 login changed (was {account_info.login if account_info else 'N/A'}, now {login_int}) or connection lost. Re-initializing.")
                mt5.shutdown()
                self.is_initialized = False

            # Extract other credentials
            terminal_path = credentials.get('terminal_path', '').strip('\'"')
            password = credentials.get('password', '')
            server = credentials.get('server', '')

            # Validate essential credentials
            if not login_int or not password or not server:
                logging.error("MT5 Connection Error: Missing credentials (login, password, or server).")
                self.is_initialized = False
                return False

            logging.info(f"Attempting MT5 initialize with path: '{terminal_path if terminal_path else 'Default Path'}'")
            # Initialize MT5 terminal connection
            if not mt5.initialize(path=terminal_path if terminal_path else None, timeout=10000): # Increased timeout
                logging.error(f"MT5 initialize() failed, error code = {mt5.last_error()}")
                self.is_initialized = False
                return False
            logging.info("MT5 initialized successfully.")

            # Login to the trading account
            logging.info(f"Attempting MT5 login for account {login_int} on server '{server}'")
            if not mt5.login(login=login_int, password=password, server=server):
                logging.error(f"MT5 login() failed for account {login_int}, error code = {mt5.last_error()}")
                mt5.shutdown() # Shutdown if login fails
                self.is_initialized = False
                return False

            logging.info(f"MT5 Connection Successful for account {login_int}")
            self.is_initialized = True
            return True

    def shutdown_mt5(self):
        with self.lock:
            if self.is_initialized:
                logging.info("Shutting down MT5 connection.")
                mt5.shutdown()
                self.is_initialized = False
            else:
                logging.debug("Shutdown requested, but MT5 was not initialized.")

mt5_manager = MT5Manager() # Instantiate the manager

# --- Global Application State ---
class AppState:
    def __init__(self):
        self.autotrade_running = False
        self.autotrade_thread = None
        self.monitoring_running = False
        self.monitoring_thread = None
        # Initialize with default settings structure
        self.settings = {
            "trading_style": "DAY_TRADING", "risk_per_trade": 2.0, "max_daily_loss": 5.0,
            "account_balance": 10000.0, "auto_trading_enabled": False, "notifications_enabled": True,
            "min_confluence": 2, "pairs_to_trade": [],
            "mt5_credentials": { "login": 0, "password": "", "server": "", "terminal_path": "" },
            "breakeven_enabled": False, "breakeven_pips": 20, "trailing_stop_enabled": False,
            "trailing_stop_pips": 20, "proactive_close_enabled": False
        }
        self.lock = threading.Lock() # Lock for thread-safe access to settings/state
        # Load ML model and vectorizer at startup
        self.ml_model, self.ml_vectorizer = get_model_and_vectorizer()
        if self.ml_model and self.ml_vectorizer:
            logging.info("ML Model and Vectorizer loaded successfully at startup.")
        else:
            logging.warning("ML Model or Vectorizer not found or failed to load at startup.")

    def update_settings(self, new_settings):
        """Safely updates application settings and handles MT5 reconnection if needed."""
        reconnect_needed = False
        creds_valid_for_reconnect = False

        with self.lock:
            current_creds = self.settings.get('mt5_credentials', {}).copy()
            logging.debug(f"Updating settings. Current creds: {current_creds}")

            # --- Sanitize and Validate MT5 Credentials ---
            if 'mt5_credentials' in new_settings and isinstance(new_settings.get('mt5_credentials'), dict):
                new_creds_partial = new_settings['mt5_credentials']
                login_str = new_creds_partial.get('login', current_creds.get('login', 0)) # Use current if missing
                password = new_creds_partial.get('password', current_creds.get('password', ''))
                server = new_creds_partial.get('server', current_creds.get('server', ''))
                terminal_path = new_creds_partial.get('terminal_path', current_creds.get('terminal_path', ''))

                try:
                    login_int = int(login_str) if login_str else 0
                except (ValueError, TypeError):
                    logging.warning(f"Invalid MT5 login format in update: '{login_str}'. Using 0.")
                    login_int = 0

                # Form the complete, validated credentials for the update
                validated_new_creds = {
                    "login": login_int,
                    "password": password,
                    "server": server,
                    "terminal_path": terminal_path
                }
                new_settings['mt5_credentials'] = validated_new_creds # Replace partial with full

                # Check if credentials *actually* changed compared to current state
                if validated_new_creds != current_creds:
                    reconnect_needed = True
                    logging.info(f"MT5 credentials changed. New: {validated_new_creds}")
                    # Check if the new credentials are minimally valid for a connection attempt
                    if validated_new_creds['login'] and validated_new_creds['password'] and validated_new_creds['server']:
                        creds_valid_for_reconnect = True

            # --- Merge Settings Deeply (especially for mt5_credentials) ---
            updated_settings = self.settings.copy() # Start with current
            for key, value in new_settings.items():
                if key == 'mt5_credentials' and isinstance(value, dict):
                    # Ensure mt5_credentials exists before updating
                    if 'mt5_credentials' not in updated_settings:
                        updated_settings['mt5_credentials'] = {}
                    updated_settings['mt5_credentials'].update(value)
                else:
                    updated_settings[key] = value # Update other keys normally

            self.settings = updated_settings # Apply the fully merged settings

            # --- Save to File ---
            try:
                with open('settings.json', 'w') as f:
                    json.dump(self.settings, f, indent=2)
                logging.info("Saved updated settings to settings.json")
            except IOError as e:
                logging.error(f"Error saving settings.json: {e}")

        # --- Attempt Reconnect Outside Lock ---
        if reconnect_needed and creds_valid_for_reconnect:
            logging.info("Attempting to reconnect MT5 due to credential change...")
            if mt5_manager.connect(self.settings['mt5_credentials']):
                 logging.info("MT5 reconnected successfully with new credentials.")
            else:
                 logging.error("MT5 reconnection failed after settings update.")
        elif reconnect_needed:
             logging.warning("Credentials changed, but new credentials seem invalid. Skipping MT5 reconnect attempt.")


    def load_settings(self):
        """Loads settings from file, merging with defaults, and attempts initial MT5 connection."""
        settings_file = 'settings.json'
        defaults = self.settings.copy() # Keep a copy of initial defaults

        if os.path.exists(settings_file):
            try:
                with open(settings_file, 'r') as f:
                    loaded_settings = json.load(f)
                    logging.info(f"Loaded settings from {settings_file}")

                    # --- Merge loaded settings onto defaults (deep merge for credentials) ---
                    merged_settings = defaults # Start with defaults
                    for key, value in loaded_settings.items():
                        if key == 'mt5_credentials' and isinstance(value, dict):
                            # Ensure mt5_credentials exists before updating
                            if 'mt5_credentials' not in merged_settings:
                                merged_settings['mt5_credentials'] = {}
                            merged_settings['mt5_credentials'].update(value) # Merge dict
                        elif key in merged_settings: # Only update keys that exist in defaults
                            merged_settings[key] = value

                    # --- Sanitize Loaded Credentials ---
                    if 'mt5_credentials' in merged_settings:
                        creds = merged_settings['mt5_credentials']
                        login_str = creds.get('login', '')
                        try:
                            creds['login'] = int(login_str) if login_str else 0
                        except (ValueError, TypeError):
                            logging.warning(f"Invalid MT5 login format in settings file: '{login_str}'. Using 0.")
                            creds['login'] = 0
                        # Ensure other keys exist
                        creds['password'] = creds.get('password', '')
                        creds['server'] = creds.get('server', '')
                        creds['terminal_path'] = creds.get('terminal_path', '')

                    with self.lock:
                        self.settings = merged_settings # Apply the merged settings

            except json.JSONDecodeError:
                logging.error(f"Error decoding JSON from {settings_file}. Using default settings.")
                # Optionally save defaults back here if the file is corrupt
            except Exception as e:
                 logging.error(f"Unexpected error loading settings from {settings_file}: {e}", exc_info=True)
                 logging.info("Using default settings.")
        else:
             logging.warning(f"{settings_file} not found. Using default settings and creating the file.")
             try:
                 with open(settings_file, 'w') as f:
                     json.dump(self.settings, f, indent=2) # Save defaults
             except IOError as e:
                 logging.error(f"Error creating default {settings_file}: {e}")

        # --- Initial MT5 Connection Attempt ---
        creds = self.settings.get('mt5_credentials')
        if creds and creds.get('login'): # Only connect if login ID is valid (non-zero)
             logging.info("Attempting initial MT5 connection from loaded settings...")
             mt5_manager.connect(creds)
        else:
            logging.info("No valid MT5 login found in settings, skipping initial connection.")

STATE = AppState() # Instantiate the global state

# --- Authentication Decorator ---
def login_required_api(f):
    """Decorator to ensure the user is logged in via Flask-Login session."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            logging.warning(f"Unauthorized access attempt to {request.path}")
            return jsonify({"error": "Authentication required."}), 401
        logging.debug(f"User {current_user.id} authorized for {request.path}")
        return f(*args, **kwargs)
    return decorated_function

# --- MT5 Connection Decorator ---
def mt5_required(f):
    """Decorator ensuring user is logged in AND MT5 is connected."""
    @wraps(f)
    @login_required_api # User must be logged in first
    def decorated_function(*args, **kwargs):
        if not mt5_manager.is_initialized:
            logging.warning(f"MT5 connection required for {request.path}, but not initialized. Attempting reconnect...")
            creds = STATE.settings.get('mt5_credentials')
            if creds and creds.get('login'):
                if not mt5_manager.connect(creds):
                    logging.error(f"MT5 reconnect failed for {request.path}.")
                    return jsonify({"error": "MetaTrader 5 connection failed. Check settings and terminal status."}), 503
                logging.info(f"MT5 reconnected successfully for {request.path}.")
            else:
                 logging.warning(f"Cannot reconnect MT5 for {request.path}: No valid credentials.")
                 return jsonify({"error": "MetaTrader 5 credentials not configured."}), 503
        # If already initialized or reconnected successfully
        logging.debug(f"MT5 connection verified for {request.path}")
        return f(*args, **kwargs)
    return decorated_function


# --- Timeframe & Style Mapping ---
# (No changes needed here)
TIMEFRAME_MAP = {
    'M1': mt5.TIMEFRAME_M1, 'M5': mt5.TIMEFRAME_M5, 'M15': mt5.TIMEFRAME_M15,
    'M30': mt5.TIMEFRAME_M30, 'H1': mt5.TIMEFRAME_H1, 'H4': mt5.TIMEFRAME_H4,
    'D1': mt5.TIMEFRAME_D1, 'W1': mt5.TIMEFRAME_W1, 'MN1': mt5.TIMEFRAME_MN1
}
TRADING_STYLE_TIMEFRAMES = {
    "SCALPING": ["M1", "M5", "M15"], "DAY_TRADING": ["M15", "H1", "H4"],
    "SWING_TRADING": ["H1", "H4", "D1"], "POSITION_TRADING": ["H4", "D1", "W1"]
}

# --- Database Initialization ---
def init_db():
    """Initializes the SQLite database and creates tables if they don't exist."""
    logging.info("Initializing database...")
    # Separate connection for the trades table (if you keep it separate)
    # If User model is in the same DB, SQLAlchemy handles it below.
    try:
        conn_trade = sqlite3.connect('trades.db', check_same_thread=False)
        cursor_trade = conn_trade.cursor()
        cursor_trade.execute('''CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, symbol TEXT,
            trade_type TEXT, open_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            outcome INTEGER DEFAULT -1, analysis_json TEXT, open_price REAL,
            sl REAL, tp REAL )''')
        conn_trade.commit()
        conn_trade.close()
        logging.info("Trades table checked/created successfully.")
    except sqlite3.Error as e:
         logging.error(f"Error initializing trades table in trades.db: {e}")

    # Create User table using SQLAlchemy within the app context
    try:
        with app.app_context():
            logging.info("Creating SQLAlchemy tables (including User)...")
            db.create_all()
            logging.info("SQLAlchemy tables checked/created successfully.")
    except Exception as e:
         logging.error(f"Error creating SQLAlchemy tables: {e}", exc_info=True)


# --- MT5 Data Formatting ---
def format_bar_data(bar, tf_str):
    """Converts MT5 bar tuple/object to a dictionary suitable for the frontend chart."""
    try:
        # Check if 'bar' is a numpy structured array element (numpy.void)
        # Access elements by key/name
        if isinstance(bar, numpy.void) and hasattr(bar.dtype, 'names') and all(name in bar.dtype.names for name in ['time', 'open', 'high', 'low', 'close']):
            time_raw = bar['time']
            open_val = bar['open']
            high_val = bar['high']
            low_val = bar['low']
            close_val = bar['close']
        # Fallback to assuming it's a sequence (tuple/list)
        elif isinstance(bar, (tuple, list)) and len(bar) >= 5:
             time_raw, open_val, high_val, low_val, close_val = bar[:5]
        # Check if 'bar' has named attributes (less common for MT5 rates but worth checking)
        elif hasattr(bar, 'time') and hasattr(bar, 'open') and hasattr(bar, 'high') and hasattr(bar, 'low') and hasattr(bar, 'close'):
            time_raw = bar.time
            open_val = bar.open
            high_val = bar.high
            low_val = bar.low
            close_val = bar.close
        else:
            # If it's none of the expected types, raise error
            raise TypeError(f"Unexpected bar data type or structure: {type(bar)}, Content: {bar}")

        dt = datetime.fromtimestamp(int(time_raw))

        # Use BusinessDay for daily/weekly/monthly, timestamp for intraday
        if tf_str in ['D1', 'W1', 'MN1']:
            time_data = {"year": dt.year, "month": dt.month, "day": dt.day}
        else:
            time_data = int(time_raw) # UTCTimestamp (seconds)

        return {
            "time": time_data, "open": float(open_val), "high": float(high_val),
            "low": float(low_val), "close": float(close_val)
        }
    except (IndexError, ValueError, TypeError, AttributeError) as e:
        logging.error(f"Error formatting bar data: {e}. Bar data: {bar}", exc_info=False)
        return None # Return None on failure

# --- (Keep the rest of your _run_full_analysis, get_gemini_analysis, etc. functions here) ---
def _run_full_analysis(symbol, credentials, style):
    """Runs analysis across multiple timeframes based on trading style."""
    logging.info(f"Running full analysis for {symbol}, style {style}")
    timeframes = TRADING_STYLE_TIMEFRAMES.get(style, TRADING_STYLE_TIMEFRAMES["DAY_TRADING"])
    analyses = {}
    for tf in timeframes:
        if tf not in TIMEFRAME_MAP:
            logging.warning(f"Timeframe '{tf}' not in TIMEFRAME_MAP. Skipping.")
            continue
        # Ensure MT5 is connected before fetching rates
        if not mt5_manager.connect(credentials): # Pass creds for potential reconnect
             logging.error(f"MT5 connection lost during full analysis for {symbol}/{tf}. Skipping timeframe.")
             analyses[tf] = {"error": "MT5 connection lost."}
             continue # Skip this timeframe

        rates = mt5.copy_rates_from_pos(symbol, TIMEFRAME_MAP[tf], 0, 200)
        if rates is None or len(rates) < 50:
            logging.warning(f"Not enough data ({len(rates) if rates is not None else 0} bars) for {symbol} on {tf}. Skipping.")
            continue

        chart_data = [bar for bar in (format_bar_data(r, tf) for r in rates) if bar is not None]
        if len(chart_data) < 50:
             logging.warning(f"Not enough valid data ({len(chart_data)} bars) for {symbol} on {tf} after formatting. Skipping.")
             continue

        df = pd.DataFrame(chart_data)
        try:
             analyses[tf] = _run_single_timeframe_analysis(df, symbol) # Call the single TF analysis
             logging.debug(f"Completed analysis for {symbol}/{tf}")
        except Exception as e:
            logging.error(f"Error running analysis for {symbol} on {tf}: {e}", exc_info=True)
            analyses[tf] = {"error": str(e)}

    logging.info(f"Finished full analysis for {symbol}")
    return analyses


def get_gemini_analysis(analysis_data):
    """Gets trade suggestion refinement from Gemini AI."""
    if not GEMINI_API_KEY:
        logging.warning("Gemini analysis requested but API key not configured.")
        return { "action": "Neutral", "reason": "Gemini AI not configured.", "entry": None, "sl": None, "tp": None }

    logging.info("Requesting analysis refinement from Gemini...")
    try:
        model = genai.GenerativeModel('gemini-2.5-flash') # Use 'gemini-2.5-flash' for potentially better performance
        prompt = f"""
        As a professional trading analyst AI, your task is to identify a single, high-probability trading setup from the provided multi-timeframe technical analysis data. Focus on confluence and risk management.

        **Aggregated Market Data:**
        ```json
        {json.dumps(analysis_data, indent=2)}
        ```

        **Instructions:**
        1.  **Synthesize Narrative:** Create a brief market narrative considering HTF structure and LTF signals.
        2.  **Identify Confluence:** Look for alignment of multiple factors (structure, zones, indicators).
        3.  **Contrarian View:** State the main risk or argument against the trade.
        4.  **Trade Plan:** Propose ONE precise Buy, Sell, or Neutral plan. If Neutral, explain why.
        5.  **JSON Output ONLY:** Respond with only the JSON object below.

        **JSON Output Structure:**
        {{
          "action": "Buy" | "Sell" | "Neutral",
          "reason": "Concise justification (max 3 sentences) incorporating narrative and confluence.",
          "contrarian_view": "Strongest argument against this trade.",
          "entry": 1.23456 | null,
          "sl": 1.23300 | null,
          "tp": 1.23800 | null
        }}
        """
        response = model.generate_content(prompt)
        # Attempt to clean and parse the response
        cleaned_response = response.text.strip().lstrip('```json').rstrip('```').strip()
        gemini_suggestion = json.loads(cleaned_response)
        logging.info("Received Gemini analysis suggestion.")
        logging.debug(f"Gemini Suggestion: {gemini_suggestion}")
        return gemini_suggestion

    except json.JSONDecodeError as json_err:
         logging.error(f"Error decoding Gemini JSON response: {json_err}. Response text: '{cleaned_response}'")
         return { "action": "Neutral", "reason": "Error parsing Gemini response.", "entry": None, "sl": None, "tp": None }
    except Exception as e:
        logging.error(f"Error getting analysis from Gemini: {e}", exc_info=True)
        return { "action": "Neutral", "reason": f"Error communicating with Gemini AI.", "entry": None, "sl": None, "tp": None }


def _run_single_timeframe_analysis(df, symbol):
    """Runs the full technical analysis suite for a given DataFrame."""
    logging.debug(f"Running single timeframe analysis for {symbol} with {len(df)} bars.")
    analysis = {"symbol": symbol, "current_price": df.iloc[-1]['close']}
    try:
        socketio.emit('analysis_progress', {'message': 'Analyzing levels & structure...'})
        analysis["support"], analysis["resistance"], pivots = find_levels(df)
        analysis["market_structure"] = determine_market_structure(pivots)

        socketio.emit('analysis_progress', {'message': 'Calculating indicators (EMA, RSI, Vol)...'})
        emas = calculate_emas(df); analysis["emas"] = {key: val.iloc[-1] for key, val in emas.items()}
        analysis["ema_crosses"] = find_ema_crosses(df, emas)
        rsi = calculate_rsi(df); analysis["rsi_value"] = rsi.iloc[-1]
        analysis["rsi_divergence"] = find_rsi_divergence(df, rsi, pivots)
        analysis["volume_profile"] = calculate_volume_profile(df)

        socketio.emit('analysis_progress', {'message': 'Identifying zones & liquidity...'})
        analysis["demand_zones"], analysis["supply_zones"] = find_sd_zones(df)
        analysis["bullish_ob"], analysis["bearish_ob"] = find_order_blocks(df, pivots)
        analysis["bullish_fvg"], analysis["bearish_fvg"] = find_fvgs(df)
        analysis["buy_side_liquidity"], analysis["sell_side_liquidity"] = find_liquidity_pools(pivots)

        socketio.emit('analysis_progress', {'message': 'Detecting patterns...'})
        analysis["candlestick_patterns"] = find_candlestick_patterns(df)

        socketio.emit('analysis_progress', {'message': 'Getting Gemini analysis...'})
        gemini_suggestion = get_gemini_analysis(analysis) # Use Gemini for the primary suggestion
        analysis["suggestion"] = gemini_suggestion

        analysis["confidence"] = calculate_confidence(analysis, analysis["suggestion"])
        analysis["narrative"] = generate_market_narrative(analysis)

        # Get ML prediction as additional info
        predicted_rate = predict_success_rate(analysis, STATE.ml_model, STATE.ml_vectorizer)
        analysis["predicted_success_rate"] = predicted_rate
        logging.debug(f"Analysis complete for {symbol}. Action: {analysis['suggestion']['action']}, Confidence: {analysis['confidence']}")

    except Exception as e:
        logging.error(f"Error during single timeframe analysis for {symbol}: {e}", exc_info=True)
        analysis["error"] = f"Analysis failed: {e}"
        # Set default/error values
        analysis["suggestion"] = {"action": "Neutral", "reason": "Analysis error.", "entry": None, "sl": None, "tp": None}
        analysis["confidence"] = 0
        analysis["narrative"] = {"overview": f"Analysis failed for {symbol}", "structure_body": str(e), "levels_body": [], "prediction_body": ""}
        analysis["predicted_success_rate"] = "N/A (Analysis error)"

    return analysis


def _calculate_position_size(balance, risk_pct, entry_price, sl_price, symbol):
    """Calculates trade volume based on risk percentage, SL distance, and contract size."""
    logging.debug(f"Calculating position size for {symbol}: Balance={balance}, Risk%={risk_pct}, Entry={entry_price}, SL={sl_price}")
    if not mt5_manager.is_initialized:
        logging.error("Cannot calculate position size: MT5 not connected.")
        return 0.01 # Return minimum as fallback

    symbol_info = mt5.symbol_info(symbol)
    if not symbol_info:
        logging.error(f"Could not get symbol info for {symbol}")
        return 0.01

    try:
        # Validate inputs
        if balance <= 0 or risk_pct <= 0:
            logging.warning("Invalid balance or risk percentage for size calculation.")
            return 0.01
        if entry_price is None or sl_price is None or entry_price == sl_price:
             logging.warning(f"Invalid entry/SL prices for size calculation: Entry={entry_price}, SL={sl_price}")
             return 0.01

        amount_to_risk = balance * (risk_pct / 100.0)
        sl_distance_price = abs(entry_price - sl_price)
        contract_size = symbol_info.trade_contract_size
        min_lot, max_lot, step_lot = symbol_info.volume_min, symbol_info.volume_max, symbol_info.volume_step

        if contract_size <= 0:
            logging.error(f"Symbol {symbol} has invalid contract size: {contract_size}")
            return 0.01

        # Calculate risk per standard lot (assuming quote currency = account currency)
        # TODO: Add currency conversion if quote currency != account currency
        risk_per_lot = sl_distance_price * contract_size
        if risk_per_lot <= 0:
            logging.error(f"Invalid risk per lot ({risk_per_lot}). SL Dist: {sl_distance_price}, Contract: {contract_size}")
            return 0.01

        position_size = amount_to_risk / risk_per_lot

        # Apply volume constraints
        position_size = max(position_size, min_lot) # Ensure minimum
        position_size = min(position_size, max_lot) # Ensure maximum

        # Round to step lot *after* min/max checks
        if step_lot > 0:
            position_size = round(position_size / step_lot) * step_lot
            # Re-check min after rounding down potentially
            position_size = max(position_size, min_lot)

        final_size = round(position_size, 2) # Typically round to 2 decimal places for lots

        logging.info(f"Position Size Calculation Result: RiskAmt={amount_to_risk:.2f}, SL_Dist={sl_distance_price:.5f}, ContractSize={contract_size}, RiskPerLot={risk_per_lot:.2f}, CalcSize={position_size:.4f}, FinalSize={final_size}")
        return final_size

    except Exception as e:
        logging.error(f"Error calculating position size for {symbol}: {e}", exc_info=True)
        return 0.01 # Fallback on any error


def _execute_trade_logic(creds, trade_params):
    """Connects to MT5, executes a trade, and logs it to the database."""
    logging.info(f"Attempting trade execution: {trade_params['trade_type']} {trade_params['symbol']}")
    if not mt5_manager.connect(creds): # Ensure connection/reconnect if needed
        raise ConnectionError("MT5 connection failed for trade execution")

    symbol = trade_params['symbol']
    trade_type_action = trade_params['trade_type'].upper()
    volume = float(trade_params['lot_size'])
    sl_price = float(trade_params['sl']) if trade_params.get('sl') is not None else 0.0
    tp_price = float(trade_params['tp']) if trade_params.get('tp') is not None else 0.0

    tick = mt5.symbol_info_tick(symbol)
    if not tick:
        raise ValueError(f"Could not get current tick data for {symbol}")

    price = tick.ask if trade_type_action == 'BUY' else tick.bid
    mt5_trade_type = mt5.ORDER_TYPE_BUY if trade_type_action == 'BUY' else mt5.ORDER_TYPE_SELL

    request = {
        "action": mt5.TRADE_ACTION_DEAL, "symbol": symbol, "volume": volume,
        "type": mt5_trade_type, "price": price, "sl": sl_price, "tp": tp_price,
        "deviation": 10, "magic": 234000, "comment": "Zenith AI Trade",
        "type_time": mt5.ORDER_TIME_GTC, "type_filling": mt5.ORDER_FILLING_FOK,
    }
    logging.info(f"Sending trade request to MT5: {request}")

    result = mt5.order_send(request)
    logging.info(f"MT5 order_send result: {result}")

    if not result:
        last_error = mt5.last_error()
        logging.error(f"MT5 order_send returned None. Last error: {last_error}")
        raise ValueError(f"Order send failed (MT5 Error: {last_error})")
    if result.retcode != mt5.TRADE_RETCODE_DONE:
        logging.error(f"Order failed. Retcode: {result.retcode}, Comment: {result.comment}, Request: {result.request}")
        raise ValueError(f"Order failed: {result.comment} (Retcode: {result.retcode})")

    logging.info(f"Trade successful. Order ID: {result.order}, Executed Price: {result.price}")

    # Log successful trade to DB
    conn = None
    try:
        conn = sqlite3.connect('trades.db', check_same_thread=False)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO trades (order_id, symbol, trade_type, analysis_json, open_price, sl, tp)
            VALUES (?, ?, ?, ?, ?, ?, ?) """, (
            result.order, symbol, trade_type_action,
            json.dumps(trade_params.get('analysis', {})), # Store analysis context
            result.price, # Use actual executed price
            sl_price, tp_price ))
        conn.commit()
        logging.info(f"Successfully logged trade {result.order} to DB.")
    except sqlite3.Error as e:
        logging.error(f"Database Error logging trade {result.order}: {e}")
        if conn: conn.rollback()
    finally:
        if conn: conn.close()

    return result


def _update_trade_outcomes(ignore_magic_number=False):
    """Checks closed MT5 deals against pending trades in DB and updates outcomes."""
    logging.info(f"Running trade outcome check... (Ignore Magic Number: {ignore_magic_number})")
    summary = { "deals_found": 0, "pending_in_db": 0, "updated": 0, "error": None }
    conn = None # Initialize conn outside try block
    try:
        if not mt5_manager.is_initialized: # Check connection before proceeding
            raise ConnectionError("MT5 not connected, cannot update trade outcomes.")

        # Get deals from the last 90 days (adjust as needed)
        from_date = datetime.now() - timedelta(days=90)
        history_deals = mt5.history_deals_get(from_date, datetime.now())

        if history_deals is None:
            raise ConnectionError(f"Could not get trade history from MT5. Error: {mt5.last_error()}")

        summary["deals_found"] = len(history_deals)
        logging.debug(f"Found {len(history_deals)} deals in MT5 history.")

        conn = sqlite3.connect('trades.db', check_same_thread=False)
        cursor = conn.cursor()

        # Get trades from DB that haven't had an outcome recorded yet
        cursor.execute("SELECT id, order_id FROM trades WHERE outcome = -1")
        # Create a dictionary for quick lookup: {mt5_order_id: db_trade_id}
        pending_trades = {row[1]: row[0] for row in cursor.fetchall()}
        summary["pending_in_db"] = len(pending_trades)
        logging.debug(f"Found {len(pending_trades)} pending trades in DB.")

        if not pending_trades:
            return summary # No pending trades to update

        updated_count = 0
        # Iterate through MT5 deals to find matches for our pending trades
        for deal in history_deals:
            # A deal represents a trade entry or exit. We care about exits.
            # deal.entry == 1 means exit deal
            # Check if this deal's order ID is in our pending list and matches magic number (optionally)
            is_matching_exit_deal = (
                deal.order in pending_trades and
                deal.entry == 1 and # DEAL_ENTRY_OUT (Normal close by SL/TP/Manual)
                (ignore_magic_number or deal.magic == 234000)
            )

            if is_matching_exit_deal:
                outcome = 1 if deal.profit >= 0 else 0 # 1 for win/breakeven, 0 for loss
                db_id = pending_trades[deal.order]
                cursor.execute("UPDATE trades SET outcome = ? WHERE id = ?", (outcome, db_id))
                updated_count += 1
                del pending_trades[deal.order] # Remove from pending list
                logging.info(f"Updated outcome for Order ID {deal.order} (DB ID: {db_id}) to {outcome} (Profit: {deal.profit:.2f})")

        if updated_count > 0:
            conn.commit()
            logging.info(f"Committed {updated_count} trade outcome updates to the database.")

        summary["updated"] = updated_count

    except ConnectionError as ce:
        error_msg = f"MT5 Connection Error during outcome update: {ce}"
        logging.error(error_msg)
        summary["error"] = error_msg
    except sqlite3.Error as db_e:
        error_msg = f"Database Error during outcome update: {db_e}"
        logging.error(error_msg, exc_info=True)
        if conn: conn.rollback()
        summary["error"] = error_msg
    except Exception as e:
        error_msg = f"Unexpected error in _update_trade_outcomes: {e}"
        logging.error(error_msg, exc_info=True)
        summary["error"] = error_msg
    finally:
        if conn: conn.close() # Ensure connection is closed

    return summary


# --- Background Threads ---

def trading_loop():
    """Background thread to scan for new auto-trading opportunities."""
    logging.info("Auto-trading thread started.")
    while STATE.autotrade_running:
        try: # Wrap main loop iteration in try/except
            with STATE.lock: settings = STATE.settings.copy()

            if not settings.get('auto_trading_enabled') or not mt5_manager.is_initialized:
                logging.debug("Auto-trade disabled or MT5 disconnected. Sleeping.")
                time.sleep(30) # Sleep longer if disabled
                continue

            logging.info(f"[{datetime.now()}] Auto-trader: Starting scan for NEW trades...")
            symbols_to_trade = settings.get('pairs_to_trade', [])
            if not symbols_to_trade:
                 logging.warning("Auto-trader: No pairs selected for auto-trading in settings.")
                 time.sleep(60)
                 continue

            creds = settings.get('mt5_credentials') # Use credentials from the copied settings

            for symbol in symbols_to_trade:
                if not STATE.autotrade_running: break # Exit if stopped

                # --- Skip if bot already has position on this symbol ---
                open_positions = mt5.positions_get(symbol=symbol)
                if open_positions and any(p.magic == 234000 for p in open_positions):
                    logging.debug(f"Auto-trader: Skipping {symbol}, existing bot position found.")
                    continue

                try:
                    # --- Run Analysis ---
                    analyses = _run_full_analysis(symbol, creds, settings['trading_style'])
                    if not analyses:
                        logging.warning(f"Auto-trader: No analysis data for {symbol}.")
                        continue

                    # --- Confluence Check ---
                    suggestions = [(tf, a) for tf, a in analyses.items() if "error" not in a and a.get('suggestion')]
                    if not suggestions: continue

                    buys = sum(1 for _, a in suggestions if a['suggestion']['action'] == 'Buy')
                    sells = sum(1 for _, a in suggestions if a['suggestion']['action'] == 'Sell')
                    final_action = "Buy" if buys > sells else "Sell" if sells > buys else "Neutral"
                    confluence_count = max(buys, sells)

                    min_confluence = settings.get('min_confluence', 2)
                    logging.debug(f"Auto-trader: {symbol} confluence - Buys={buys}, Sells={sells}. Action={final_action}, Count={confluence_count}, MinReq={min_confluence}")

                    if final_action != "Neutral" and confluence_count >= min_confluence:
                        # --- Prepare & Execute Trade ---
                        primary_tf = TRADING_STYLE_TIMEFRAMES.get(settings['trading_style'], ["M15"])[0]
                        primary_analysis = next((a for tf, a in suggestions if tf == primary_tf), None)
                        if not primary_analysis:
                             logging.warning(f"Auto-trader: Primary timeframe {primary_tf} analysis missing/failed for {symbol}. Skipping.")
                             continue

                        suggestion = primary_analysis['suggestion']
                        if suggestion['action'] != final_action:
                            logging.warning(f"Auto-trader: Primary TF action ({suggestion['action']}) mismatches final action ({final_action}) for {symbol}. Skipping.")
                            continue
                        if suggestion['entry'] is None or suggestion['sl'] is None or suggestion['tp'] is None:
                            logging.warning(f"Auto-trader: Incomplete suggestion details for {symbol} on {primary_tf}. Skipping.")
                            continue

                        # Double-check position before execution (race condition)
                        if mt5.positions_get(symbol=symbol):
                            logging.info(f"Auto-trader: Position opened on {symbol} during analysis. Skipping.")
                            continue

                        # Calculate Size
                        account_info = mt5.account_info(); current_balance = account_info.balance if account_info else settings['account_balance']
                        pos_size = _calculate_position_size(current_balance, settings['risk_per_trade'], suggestion['entry'], suggestion['sl'], symbol)
                        if pos_size < 0.01:
                            logging.warning(f"Auto-trader: Calculated position size too small ({pos_size}) for {symbol}. Skipping.")
                            continue

                        trade_params = {
                            "symbol": symbol, "trade_type": final_action, "lot_size": pos_size,
                            "sl": suggestion['sl'], "tp": suggestion['tp'], "analysis": primary_analysis
                        }

                        # Emit Signal (always)
                        signal_msg = f"{final_action} signal: {symbol} ({primary_tf}), {confluence_count}-TF confluence. TA:{primary_analysis['confidence']}%, ML:{primary_analysis.get('predicted_success_rate', 'N/A')}"
                        socketio.emit('trade_signal', {"params": trade_params, "message": signal_msg})
                        logging.info(f"Emitted trade signal: {signal_msg}")

                        # Execute Trade (if auto-trading enabled)
                        if settings['auto_trading_enabled']:
                            logging.info(f"Auto-trader: Executing {final_action} {pos_size:.2f} lots on {symbol}...")
                            try:
                                result = _execute_trade_logic(creds, trade_params)
                                exec_msg = f"Auto-trade executed: {final_action} {pos_size:.2f} {symbol}. Order: {result.order}"
                                socketio.emit('notification', {"message": exec_msg})
                                logging.info(exec_msg)
                                time.sleep(180) # Cooldown for this symbol after trading
                            except Exception as exec_e:
                                error_msg = f"Auto-trade execution failed for {symbol}: {exec_e}"
                                logging.error(error_msg)
                                socketio.emit('notification', {"message": error_msg, "type": "error"})

                except Exception as sym_e:
                     logging.error(f"Error processing symbol {symbol} in trading loop: {sym_e}", exc_info=True)

                if not STATE.autotrade_running: break # Check again after symbol processing

            # --- Wait before next full scan ---
            if STATE.autotrade_running:
                scan_wait_time = 1800 # 30 minutes
                logging.info(f"Auto-trader: Scan complete. Waiting {scan_wait_time} seconds...")
                time.sleep(scan_wait_time)

        except Exception as loop_e:
             logging.critical(f"Critical error in main trading loop: {loop_e}", exc_info=True)
             time.sleep(60) # Wait a bit before retrying after a major error

    logging.info("Auto-trading thread stopped.")


def trade_monitoring_loop():
    """Background thread for managing active trades (BE, TS, Proactive Close)."""
    logging.info("Trade monitoring thread started.")
    while STATE.monitoring_running:
        try: # Wrap main loop iteration
            if not mt5_manager.is_initialized:
                logging.debug("Trade Monitor: MT5 not connected. Sleeping.")
                time.sleep(60)
                continue

            open_positions = mt5.positions_get()
            if not open_positions:
                logging.debug("Trade Monitor: No open positions found.")
                time.sleep(60)
                continue

            with STATE.lock: settings = STATE.settings.copy()
            creds = settings.get('mt5_credentials')

            bot_positions = [p for p in open_positions if p.magic == 234000]
            active_symbols = list(set(p.symbol for p in bot_positions))

            if not active_symbols:
                logging.debug("Trade Monitor: No open *bot* positions found.")
                time.sleep(60)
                continue

            logging.info(f"[{datetime.now()}] Trade Monitor: Checking active bot symbols: {active_symbols}")

            for symbol in active_symbols:
                if not STATE.monitoring_running: break

                try:
                    # --- Run Analysis for Current Bias ---
                    analyses = _run_full_analysis(symbol, creds, settings['trading_style'])
                    if not analyses:
                        logging.warning(f"Trade Monitor: Failed to get analysis for active symbol {symbol}")
                        continue

                    # --- Determine Market Bias ---
                    buys = sum(1 for _, a in analyses.items() if not a.get("error") and a.get('suggestion', {}).get('action') == 'Buy')
                    sells = sum(1 for _, a in analyses.items() if not a.get("error") and a.get('suggestion', {}).get('action') == 'Sell')
                    current_market_bias = "Buy" if buys > sells else "Sell" if sells > buys else "Neutral"
                    logging.debug(f"Trade Monitor: Bias for {symbol} = {current_market_bias} (B:{buys}/S:{sells})")

                    # --- Manage Existing Positions for this Symbol ---
                    positions_to_check = [p for p in bot_positions if p.symbol == symbol]
                    for position in list(positions_to_check): # Iterate over a copy
                        # Verify position still exists
                        if mt5.positions_get(ticket=position.ticket) is None:
                            logging.info(f"Trade Monitor: Position {position.ticket} closed during check.")
                            continue

                        symbol_info = mt5.symbol_info(position.symbol)
                        if not symbol_info:
                             logging.warning(f"Trade Monitor: Could not get symbol info for {position.symbol}. Skipping management for {position.ticket}.")
                             continue

                        # Apply BE and TS
                        manage_breakeven(position, settings, symbol_info)
                        manage_trailing_stop(position, settings, symbol_info)

                        # Proactive Close Check
                        if settings.get('proactive_close_enabled', False):
                            position_type = 0 if position.type == mt5.ORDER_TYPE_BUY else 1 # 0=Buy, 1=Sell
                            should_close = (position_type == 0 and current_market_bias == "Sell") or \
                                           (position_type == 1 and current_market_bias == "Buy")
                            if should_close:
                                logging.info(f"Trade Monitor: Proactively closing {symbol} {'BUY' if position_type==0 else 'SELL'} {position.ticket} due to market bias shift to {current_market_bias}.")
                                try:
                                    close_trade(position) # Call the imported close function
                                    socketio.emit('notification', {"message": f"Proactively closed {symbol} position {position.ticket}."})
                                except Exception as close_e:
                                     logging.error(f"Trade Monitor: Error during proactive close for {position.ticket}: {close_e}")
                                     socketio.emit('notification', {"message": f"Error closing {position.ticket}: {close_e}", "type": "error"})

                    # --- Scale-in Logic (Optional - keep if desired) ---
                    # Re-fetch remaining positions after potential closes
                    remaining_positions = mt5.positions_get(symbol=symbol)
                    bot_positions_remaining = [p for p in (remaining_positions or []) if p.magic == 234000]

                    if not bot_positions_remaining:
                        logging.debug(f"Trade Monitor: No bot positions remain on {symbol} after checks.")
                        continue # Move to next symbol

                    # Add scale-in logic here if needed, similar to the previous version
                    # Ensure you check if scaling-in is enabled via settings, check max positions etc.
                    # logging.debug(f"Trade Monitor: Skipping scale-in logic for {symbol} (not implemented/enabled).")


                except Exception as sym_e:
                    logging.error(f"Error processing symbol {symbol} in monitoring loop: {sym_e}", exc_info=True)

                if not STATE.monitoring_running: break

            # --- Update DB Outcomes After Checking All Symbols ---
            outcome_summary = _update_trade_outcomes()
            logging.info(f"Trade outcome update summary: {outcome_summary}")

            # --- Wait Before Next Monitoring Cycle ---
            monitor_wait_time = 60 # Check every 60 seconds
            logging.debug(f"Trade monitor: Check complete. Waiting {monitor_wait_time} seconds...")
            time.sleep(monitor_wait_time)

        except Exception as loop_e:
             logging.critical(f"Critical error in main monitoring loop: {loop_e}", exc_info=True)
             time.sleep(60) # Wait before retrying after a major error

    logging.info("Trade monitoring thread stopped.")



# --- API Routes ---

# GET /api/settings - Fetch current settings
# POST /api/settings - Update settings
@app.route('/api/settings', methods=['GET', 'POST'])
@login_required_api # Require login to view/change settings
def handle_settings():
    if request.method == 'GET':
        with STATE.lock:
            # Return a copy to prevent external modification
            current_settings = STATE.settings.copy()
            # Ensure credentials aren't accidentally missing if empty
            if 'mt5_credentials' not in current_settings:
                current_settings['mt5_credentials'] = {"login": 0, "password": "", "server": "", "terminal_path": ""}
        return jsonify(current_settings)

    elif request.method == 'POST':
        new_settings = request.get_json()
        if not new_settings or not isinstance(new_settings, dict):
            return jsonify({"error": "Invalid JSON payload"}), 400
        try:
            # Update_settings handles validation, saving, and potential reconnect
            STATE.update_settings(new_settings)
            logging.info(f"User {current_user.id} updated settings.")
            # Emit updated settings to all clients (optional, if UI needs live updates)
            # with STATE.lock: socketio.emit('settings_updated', STATE.settings)
            return jsonify({"message": "Settings updated successfully."})
        except Exception as e:
            logging.error(f"Error updating settings via API: {e}", exc_info=True)
            return jsonify({"error": f"Failed to update settings: {e}"}), 500
    else:
        return jsonify({"error": "Method not allowed"}), 405


# Get basic MT5 account info (balance, equity, profit)
@app.route('/api/get_account_info', methods=['POST'])
@mt5_required # Requires login and MT5 connection
def get_account_info():
    # Credentials are used by the decorator to ensure connection
    logging.debug(f"API: get_account_info called by user {current_user.id}")
    info = mt5.account_info()
    if info:
        account_data = {"balance": info.balance, "equity": info.equity, "profit": info.profit}
        # Emit real-time profit update (useful for dashboard)
        socketio.emit('profit_update', {'profit': info.profit})
        logging.debug(f"API: get_account_info returning data: {account_data}")
        return jsonify(account_data)
    else:
        logging.error(f"API: Could not fetch account info. Last MT5 error: {mt5.last_error()}")
        return jsonify({"error": f"Could not fetch account info. MT5 Error: {mt5.last_error()}"}), 500

# Get currently open MT5 positions
@app.route('/api/get_open_positions', methods=['POST'])
@mt5_required # Requires login and MT5 connection
def get_open_positions():
    logging.debug(f"API: get_open_positions called by user {current_user.id}")
    positions = mt5.positions_get()
    if positions is None:
        logging.error(f"API: Failed to get positions. MT5 Error: {mt5.last_error()}")
        return jsonify([]) # Return empty list on failure

    formatted_positions = []
    for p in positions:
        try:
             # Ensure types are correct for JSON serialization
             formatted_positions.append({
                 "ticket": int(p.ticket), "symbol": p.symbol,
                 "type": "BUY" if p.type == mt5.ORDER_TYPE_BUY else "SELL",
                 "volume": float(p.volume), "price_open": float(p.price_open),
                 "profit": float(p.profit), "sl": float(p.sl), "tp": float(p.tp),
                 "magic": int(p.magic) # Include magic number
             })
        except Exception as e:
            logging.error(f"Error formatting position {p.ticket}: {e}", exc_info=True)
    logging.debug(f"API: get_open_positions returning {len(formatted_positions)} positions.")
    return jsonify(formatted_positions)

# Get list of available symbols from MT5
@app.route('/api/get_all_symbols', methods=['POST'])
@mt5_required # Requires login and MT5 connection
def get_all_symbols():
    logging.debug(f"API: get_all_symbols called by user {current_user.id}")
    symbols = mt5.symbols_get()
    if symbols is None:
        logging.error(f"API: Failed to get symbols. MT5 Error: {mt5.last_error()}")
        return jsonify({"error": f"Could not get symbols. MT5 Error: {mt5.last_error()}"}), 500
    # Return only the names of symbols marked as visible in Market Watch
    visible_symbols = sorted([s.name for s in symbols if s.visible])
    logging.debug(f"API: get_all_symbols returning {len(visible_symbols)} symbols.")
    return jsonify(visible_symbols)

# Get historical chart data for a specific symbol/timeframe
@app.route('/api/get_chart_data', methods=['POST'])
@mt5_required # Requires login and MT5 connection
def get_chart_data():
    logging.debug(f"API: get_chart_data called by user {current_user.id}")
    try:
        req_data = request.get_json()
        symbol = req_data.get('symbol')
        timeframe_str = req_data.get('timeframe') # e.g., 'H1'
        logging.info(f"API: Requesting chart data for {symbol}/{timeframe_str}")

        if not symbol or not timeframe_str or timeframe_str not in TIMEFRAME_MAP:
            logging.warning(f"API: Invalid symbol ('{symbol}') or timeframe ('{timeframe_str}') requested.")
            return jsonify({"error": "Invalid symbol or timeframe provided."}), 400

        mt5_timeframe = TIMEFRAME_MAP[timeframe_str]
        num_bars_to_fetch = 500 # Adjust number of bars as needed
        rates = mt5.copy_rates_from_pos(symbol, mt5_timeframe, 0, num_bars_to_fetch)

        if rates is None:
            mt5_error = mt5.last_error()
            logging.error(f"API: mt5.copy_rates_from_pos returned None for {symbol}/{timeframe_str}. MT5 Error: {mt5_error}")
            return jsonify({"error": f"Could not get rates for {symbol}. MT5 Error: {mt5_error}"}), 500

        logging.debug(f"API: Fetched {len(rates)} rates from MT5 for {symbol}/{timeframe_str}.")
        if not rates:
             logging.warning(f"API: Fetched 0 rates for {symbol}/{timeframe_str}.")
             # Return empty list instead of error if 0 rates is valid (e.g., new symbol)
             return jsonify([])
             # return jsonify({"error": f"Fetched 0 rates for {symbol}/{timeframe_str}. Symbol/timeframe available?"}), 400

        # Format bars, filter out None results from formatting errors
        chart_data = [bar for bar in (format_bar_data(r, timeframe_str) for r in rates) if bar is not None]

        if not chart_data and rates: # If formatting failed for all bars
             logging.error(f"API: Failed to format any chart data for {symbol}/{timeframe_str}. Check format_bar_data logs.")
             return jsonify({"error": f"Failed to format chart data for {symbol}/{timeframe_str}."}), 500

        logging.info(f"API: Sending {len(chart_data)} formatted bars for {symbol}/{timeframe_str}.")
        return jsonify(chart_data)

    except Exception as e:
        logging.critical(f"API: CRITICAL ERROR in get_chart_data: {e}", exc_info=True)
        return jsonify({"error": f"An unexpected server error occurred: {e}"}), 500

# Run analysis on a single specified timeframe
@app.route('/api/analyze_single_timeframe', methods=['POST'])
@mt5_required # Requires login and MT5 connection
def analyze_single_timeframe():
    logging.debug(f"API: analyze_single_timeframe called by user {current_user.id}")
    try:
        data = request.get_json()
        symbol = data.get('symbol')
        timeframe = data.get('timeframe') # e.g., 'H1'
        logging.info(f"API: Requesting single-TF analysis for {symbol}/{timeframe}")

        if not symbol or not timeframe or timeframe not in TIMEFRAME_MAP:
            return jsonify({"error": "Invalid symbol or timeframe provided."}), 400

        rates = mt5.copy_rates_from_pos(symbol, TIMEFRAME_MAP[timeframe], 0, 200) # Fetch enough for analysis
        if rates is None or len(rates) < 50:
            return jsonify({"error": f"Could not fetch enough data ({len(rates) if rates else 0} bars) for {symbol}/{timeframe}."}), 400

        chart_data = [bar for bar in (format_bar_data(r, timeframe) for r in rates) if bar is not None]
        if len(chart_data) < 50:
             return jsonify({"error": f"Not enough valid data ({len(chart_data)} bars) for {symbol}/{timeframe} after formatting."}), 400

        df = pd.DataFrame(chart_data)
        analysis_result = _run_single_timeframe_analysis(df, symbol) # Run the analysis logic

        logging.info(f"API: Completed single-TF analysis for {symbol}/{timeframe}")
        return jsonify(analysis_result)

    except Exception as e:
        logging.error(f"API: Error during single timeframe analysis: {e}", exc_info=True)
        return jsonify({"error": f"Error during single timeframe analysis: {e}"}), 500

# Run analysis across multiple timeframes based on trading style
@app.route('/api/analyze_multi_timeframe', methods=['POST'])
@mt5_required # Requires login and MT5 connection
def analyze_multi_timeframe():
    # This might be less used if single TF analysis is preferred, but keep for potential future use
    logging.debug(f"API: analyze_multi_timeframe called by user {current_user.id}")
    try:
        data = request.get_json()
        style = data.get('trading_style', STATE.settings['trading_style']).upper() # Default to current setting
        symbol = data.get('symbol')
        logging.info(f"API: Requesting multi-TF analysis for {symbol}, style {style}")

        if not symbol:
             return jsonify({"error": "Symbol is required."}), 400

        creds = STATE.settings.get('mt5_credentials') # Use credentials from state
        analyses = _run_full_analysis(symbol, creds, style)

        if not analyses:
            return jsonify({"error": "Could not generate analysis for any relevant timeframe."}), 400

        # --- Aggregate Results (Example) ---
        suggestions = [(tf, a) for tf, a in analyses.items() if "error" not in a and a.get('suggestion')]
        # ... (further processing like confluence check, final confidence, etc.) ...
        # This part might need refinement based on how you want to present multi-TF results

        logging.info(f"API: Completed multi-TF analysis for {symbol}")
        return jsonify({"individual_analyses": analyses}) # Return all results for now

    except Exception as e:
        logging.error(f"API: Error during multi-timeframe analysis: {e}", exc_info=True)
        return jsonify({"error": f"Error during multi-timeframe analysis: {e}"}), 500


# Run a backtest using provided historical data and settings
@app.route('/api/run_backtest', methods=['POST'])
@login_required_api # Requires login
def handle_backtest():
    logging.debug(f"API: run_backtest called by user {current_user.id}")
    data = request.get_json()
    historical_data = data.get('historical_data')
    settings_for_backtest = data.get('settings') # Settings specific to this backtest run

    if not historical_data or not isinstance(historical_data, list) or not settings_for_backtest:
        return jsonify({"error": "Missing or invalid historical data or settings."}), 400

    logging.info(f"API: Starting backtest with {len(historical_data)} bars.")
    try:
        results = run_backtest(historical_data, settings_for_backtest) # Pass settings
        if "error" in results:
             logging.warning(f"API: Backtest function returned error: {results['error']}")
             return jsonify(results), 400
        logging.info(f"API: Backtest completed. Trades: {results.get('total_trades')}, PnL: {results.get('total_pnl')}")
        return jsonify(results)
    except Exception as e:
        logging.error(f"API: Error during backtest execution: {e}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred during backtesting: {e}"}), 500


# Execute a trade manually based on user input or suggestion confirmation
@app.route('/api/execute_trade', methods=['POST'])
@mt5_required # Requires login and MT5 connection
def handle_execute_trade():
    logging.debug(f"API: execute_trade called by user {current_user.id}")
    trade_params = request.get_json()
    if not trade_params or not isinstance(trade_params, dict):
        return jsonify({"error": "Invalid JSON payload"}), 400

    required = ['symbol', 'lot_size', 'trade_type', 'stop_loss', 'take_profit']
    if not all(k in trade_params for k in required):
        return jsonify({"error": f"Missing required parameters: {required}"}), 400

    try:
        # Prepare parameters for the execution logic
        params_for_exec = {
            'symbol': str(trade_params['symbol']),
            'lot_size': float(trade_params['lot_size']),
            'trade_type': str(trade_params['trade_type']).upper(),
            'sl': float(trade_params['stop_loss']) if trade_params['stop_loss'] else 0.0,
            'tp': float(trade_params['take_profit']) if trade_params['take_profit'] else 0.0,
            'analysis': trade_params.get('analysis', {}) # Include analysis context if provided
        }

        if params_for_exec['lot_size'] <= 0: raise ValueError("Lot size must be positive.")
        if params_for_exec['trade_type'] not in ['BUY', 'SELL']: raise ValueError("trade_type must be BUY or SELL.")

        creds = STATE.settings.get('mt5_credentials') # Use stored credentials
        result = _execute_trade_logic(creds, params_for_exec) # Execute the trade

        logging.info(f"API: Manual trade executed successfully. Order ID: {result.order}")
        return jsonify({
            "message": "Trade executed successfully!",
            "details": { "order_id": result.order, "symbol": result.request.symbol, "type": params_for_exec['trade_type'], "volume": result.volume }
        })
    except ValueError as ve:
        logging.warning(f"API: Invalid trade parameters: {ve}")
        return jsonify({"error": str(ve)}), 400
    except ConnectionError as ce:
        logging.error(f"API: MT5 Connection error during trade execution: {ce}")
        return jsonify({"error": str(ce)}), 503
    except Exception as e:
        logging.error(f"API: Error executing manual trade: {e}", exc_info=True)
        return jsonify({"error": f"Failed to execute trade: {e}"}), 500

# Start the auto-trading background thread
@app.route('/api/start_autotrade', methods=['POST'])
@mt5_required # Requires login and MT5 connection
def handle_start_autotrade():
    logging.info(f"API: start_autotrade called by user {current_user.id}")
    if STATE.autotrade_running:
        logging.info("API: Auto-trading already running.")
        return jsonify({"message": "Auto-trading is already running."}), 200

    # Update setting first
    STATE.update_settings({"auto_trading_enabled": True})

    with STATE.lock: # Ensure thread-safe start
        if not STATE.autotrade_running:
             STATE.autotrade_running = True
             # Start only if thread doesn't exist or is not alive
             if STATE.autotrade_thread is None or not STATE.autotrade_thread.is_alive():
                 STATE.autotrade_thread = threading.Thread(target=trading_loop, daemon=True)
                 STATE.autotrade_thread.start()
                 logging.info("Started auto-trading thread.")
                 return jsonify({"message": "Auto-trading started."})
             else:
                  logging.warning("API: Start requested, but thread already exists and is alive.")
                  return jsonify({"message": "Auto-trading is already running (thread active)."}), 200
        else:
             # This case means it was started between the outer check and acquiring the lock
             logging.info("API: Start requested, but auto-trading was already running (race condition).")
             return jsonify({"message": "Auto-trading was already running."}), 200

# Stop the auto-trading background thread
@app.route('/api/stop_autotrade', methods=['POST'])
@login_required_api # Requires login
def handle_stop_autotrade():
    logging.info(f"API: stop_autotrade called by user {current_user.id}")
    if not STATE.autotrade_running and (STATE.autotrade_thread is None or not STATE.autotrade_thread.is_alive()):
        logging.info("API: Auto-trading is already stopped.")
        return jsonify({"message": "Auto-trading is not running."}), 200

    logging.info("API: Stopping auto-trading...")
    # Update setting first to prevent loop continuation if it checks mid-stop
    STATE.update_settings({"auto_trading_enabled": False})

    # Signal the loop to stop and wait for it
    thread_to_join = None
    with STATE.lock:
        STATE.autotrade_running = False
        thread_to_join = STATE.autotrade_thread # Get reference while holding lock

    if thread_to_join and thread_to_join.is_alive():
        logging.info("API: Waiting for auto-trading thread to finish current cycle...")
        thread_to_join.join(timeout=10.0) # Wait up to 10 seconds
        if thread_to_join.is_alive():
            logging.warning("API: Auto-trading thread did not stop gracefully within timeout.")
            # Depending on strictness, you might want to prevent clearing the thread ref here
        else:
            logging.info("API: Auto-trading thread stopped successfully.")
            with STATE.lock: STATE.autotrade_thread = None # Clear ref only if stopped
    else:
        logging.info("API: Auto-trading thread was not running or already stopped.")
        with STATE.lock: STATE.autotrade_thread = None # Ensure ref is cleared

    return jsonify({"message": "Auto-trading stopped."})


# Handle chat messages with Gemini AI
@app.route('/api/chat', methods=['POST'])
@login_required_api # Requires login
def handle_chat():
    logging.debug(f"API: chat called by user {current_user.id}")
    if not GEMINI_API_KEY:
        return jsonify({"error": "Gemini AI is not configured on the server."}), 503

    try:
        data = request.get_json()
        user_message = data.get('message')
        analysis_context = data.get('analysis_context')
        # Ensure history is a list of correctly formatted message objects
        chat_history_raw = data.get('history', [])
        chat_history = []
        if isinstance(chat_history_raw, list):
             for msg in chat_history_raw:
                 if isinstance(msg, dict) and 'role' in msg and 'parts' in msg:
                     # Gemini expects parts to be a list of strings
                     parts_text = msg['parts'] if isinstance(msg['parts'], str) else str(msg.get('parts', ''))
                     chat_history.append({"role": msg['role'], "parts": [parts_text]})


        if not user_message or not analysis_context:
            return jsonify({"error": "Missing user message or analysis context."}), 400

        model = genai.GenerativeModel('gemini-2.5-flash') # Or 'gemini-pro'
        # Start chat with potentially processed history
        chat = model.start_chat(history=chat_history)

        # Construct a clear prompt including context and history (implicitly handled by start_chat)
        prompt = f"""
        **Analysis Context:**
        ```json
        {json.dumps(analysis_context, indent=1)}
        ```

        **User's Question:** {user_message}

        **Your Task:** Answer the user's question concisely based *only* on the provided analysis context. You are Zenith, an AI trading assistant. Do not give financial advice. If the question is outside the scope, state that.
        """

        logging.info(f"API: Sending prompt to Gemini for user {current_user.id}")
        response = chat.send_message(prompt)

        logging.debug(f"API: Received Gemini response: {response.text[:100]}...") # Log beginning of response
        return jsonify({"reply": response.text})

    except Exception as e:
        logging.error(f"API: Error in chat endpoint: {e}", exc_info=True)
        return jsonify({"error": f"An error occurred in the chat service: {e}"}), 500


# Manually trigger the update of trade outcomes in the DB
@app.route('/api/force_outcome_update', methods=['POST'])
@mt5_required # Requires login and MT5 connection
def handle_force_outcome_update():
    logging.info(f"API: force_outcome_update called by user {current_user.id}")
    try:
        data = request.get_json() or {}
        ignore_magic = data.get('ignore_magic_number', False)
        logging.info(f"Manual trade outcome update triggered. Ignore Magic Number: {ignore_magic}")
        summary = _update_trade_outcomes(ignore_magic_number=ignore_magic)
        return jsonify(summary)
    except Exception as e:
        logging.error(f"API: Error during manual outcome update: {e}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {e}"}), 500

# Trigger the retraining of the ML model
@app.route('/api/train_model', methods=['POST'])
@login_required_api # Requires login
def handle_train_model():
    logging.info(f"API: train_model called by user {current_user.id}")
    conn = None
    try:
        conn = sqlite3.connect('trades.db', check_same_thread=False)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        # Select only necessary columns and filter for completed trades with analysis
        cursor.execute("SELECT outcome, analysis_json FROM trades WHERE outcome IN (0, 1) AND analysis_json IS NOT NULL AND analysis_json != ''")
        trades_data = [dict(row) for row in cursor.fetchall()]
        logging.info(f"Fetched {len(trades_data)} completed trades from DB for training.")

        if not trades_data or len(trades_data) < 10: # Ensure minimum data
            return jsonify({"error": f"Not enough training data available ({len(trades_data)} records found, need at least 10)."}), 400

        # Run training in a separate thread to avoid blocking the API request
        # This requires careful state management if you need immediate feedback beyond "started"
        # For simplicity now, run synchronously but inform user it might take time
        logging.info("Starting model training synchronously...")
        result = train_and_save_model(trades_data) # This function should handle errors internally

        if "error" in result:
            logging.error(f"Model training failed: {result['error']}")
            return jsonify(result), 400
        else:
            logging.info(f"Model training successful. Accuracy: {result.get('accuracy', 'N/A')}")
            # --- Reload Model into State ---
            logging.info("Reloading model and vectorizer into application state...")
            STATE.ml_model, STATE.ml_vectorizer = get_model_and_vectorizer()
            if STATE.ml_model and STATE.ml_vectorizer:
                logging.info("Model reloaded successfully.")
                # Optionally emit an event if clients need to know model updated
                # socketio.emit('model_updated', {'accuracy': result.get('accuracy')})
                return jsonify(result)
            else:
                logging.critical("CRITICAL ERROR: Model trained but failed to reload into state.")
                return jsonify({"error": "Model trained but failed to load. Please restart server."}), 500

    except sqlite3.Error as db_e:
        logging.error(f"Database error during model training trigger: {db_e}", exc_info=True)
        return jsonify({"error": f"Database error: {db_e}"}), 500
    except Exception as e:
        logging.error(f"Unexpected error during model training trigger: {e}", exc_info=True)
        return jsonify({"error": f"An unexpected server error occurred: {e}"}), 500
    finally:
        if conn: conn.close()


# Get daily trading statistics based on MT5 history
@app.route('/api/get_daily_stats', methods=['POST'])
@mt5_required # Requires login and MT5 connection
def get_daily_stats():
    logging.info(f"API: get_daily_stats called by user {current_user.id}")
    try:
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        logging.debug(f"Fetching deals from {today_start} to now.")
        history_deals = mt5.history_deals_get(today_start, datetime.now())

        if history_deals is None:
            raise ConnectionError(f"Could not get trade history. MT5 Error: {mt5.last_error()}")

        logging.info(f"Found {len(history_deals)} total deals today.")
        # Filter for *closing* deals made by the bot
        closed_bot_deals = [d for d in history_deals if d.entry == 1 and d.magic == 234000] # entry=1 is DEAL_ENTRY_OUT
        logging.info(f"Found {len(closed_bot_deals)} closed bot deals today.")

        total_trades = len(closed_bot_deals)
        if total_trades == 0:
            stats = {"trades": 0, "won": 0, "lost": 0, "winRate": "0%", "dailyPnl": 0.0}
            logging.debug("Returning zero stats as no closed bot trades found.")
            return jsonify(stats)

        trades_won = sum(1 for d in closed_bot_deals if d.profit >= 0)
        trades_lost = total_trades - trades_won
        win_rate = (trades_won / total_trades) * 100
        total_pnl = sum(d.profit for d in closed_bot_deals)

        stats = {
            "trades": total_trades, "won": trades_won, "lost": trades_lost,
            "winRate": f"{win_rate:.1f}%", "dailyPnl": round(total_pnl, 2)
        }
        logging.info(f"Calculated daily stats: {stats}")
        # Optionally emit update via socket
        # socketio.emit('daily_stats_update', stats)
        return jsonify(stats)

    except ConnectionError as ce:
        logging.error(f"API: MT5 connection error getting daily stats: {ce}")
        return jsonify({"error": str(ce)}), 503
    except Exception as e:
        logging.critical(f"API: CRITICAL ERROR in get_daily_stats: {e}", exc_info=True)
        return jsonify({"error": "An unexpected server error occurred."}), 500


# --- START: Authentication API Routes ---

@app.route('/api/auth/signup', methods=['POST'])
def handle_signup():
    logging.info("API: signup attempt received.")
    data = request.get_json()
    if not data or not data.get('email') or not data.get('password') or not data.get('name'):
        logging.warning("API: signup failed - missing name, email or password.")
        return jsonify({"error": "Name, email and password are required."}), 400

    email = data.get('email')
    password = data.get('password')
    name = data.get('name')

    # Check if user already exists
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        logging.warning(f"API: signup failed - email '{email}' already exists.")
        return jsonify({"error": f"Email '{email}' already exists."}), 409 # Conflict

    # Validate password length (basic example)
    if len(password) < 6:
         logging.warning("API: signup failed - password too short.")
         return jsonify({"error": "Password must be at least 6 characters long."}), 400

    # Create new user
    new_user = User(email=email, name=name)
    new_user.set_password(password) # Hashes the password

    try:
        db.session.add(new_user)
        db.session.commit()
        logging.info(f"API: User '{email}' created successfully.")

        # --- Automatically log in after signup ---
        login_user(new_user)
        logging.info(f"API: User '{email}' automatically logged in after signup.")
        return jsonify({
            "message": "Signup successful!",
            "user": {"id": new_user.id, "email": new_user.email, "name": new_user.name}
        }), 201 # Created
    except Exception as e:
        db.session.rollback()
        logging.error(f"API: Database error during signup for '{email}': {e}", exc_info=True)
        return jsonify({"error": "Database error during signup."}), 500

@app.route('/api/auth/signin', methods=['POST'])
def handle_signin():
    logging.info("API: signin attempt received.")
    data = request.get_json()
    if not data or not data.get('email') or not data.get('password'):
        logging.warning("API: signin failed - missing email or password.")
        return jsonify({"error": "Email and password are required."}), 400

    email = data.get('email')
    password = data.get('password')

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        logging.warning(f"API: signin failed - invalid credentials for '{email}'.")
        return jsonify({"error": "Invalid email or password."}), 401 # Unauthorized

    login_user(user)
    logging.info(f"API: User '{email}' logged in successfully.")
    return jsonify({
        "message": "Login successful!",
        "user": {"id": user.id, "email": user.email, "name": user.name}
    }), 200

@app.route('/api/auth/logout', methods=['POST'])
@login_required # Ensure user is logged in to log out
def handle_logout():
    user_email = current_user.email
    logout_user()
    logging.info(f"API: User '{user_email}' logged out successfully.")
    session.clear()
    return jsonify({"message": "Logout successful."}), 200

@app.route('/api/auth/session', methods=['GET'])
@login_required_api # Use our custom decorator that returns JSON on failure
def get_session():
    logging.debug(f"API: Session check for user {current_user.id}")
    return jsonify({
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "name": current_user.name
        }
    }), 200

def send_reset_email(user):
    token = user.get_reset_token()
    # Replace with your actual email sending logic
    print(f"Password reset link: {os.getenv('FRONTEND_URL', 'http://localhost:3000')}/auth/reset-password?token={token}")

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json()
    email = data.get('email')
    user = User.query.filter_by(email=email).first()
    if user:
        send_reset_email(user)
    return jsonify({"message": "If an account with that email exists, a password reset link has been sent."})

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json()
    token = data.get('token')
    password = data.get('password')
    user = User.verify_reset_token(token)
    if not user:
        return jsonify({"error": "That is an invalid or expired token."}), 400
    user.set_password(password)
    db.session.commit()
    return jsonify({"message": "Your password has been updated! You can now log in."})

@app.route('/api/auth/set-token')
@login_required
def set_token():
    if not current_user.is_authenticated:
        return redirect(f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/auth/signin?error=AuthenticationFailed")

    # --- Create JWT Token ---
    try:
        payload = {
            'id': current_user.id,
            'email': current_user.email,
            'name': current_user.name,
            'exp': datetime.now(timezone.utc) + timedelta(days=1) # Use timezone-aware UTC now
        }
        secret = app.config['SECRET_KEY']
        token = jwt.encode(payload, secret, algorithm='HS256')

        # --- Redirect to Frontend Token Verification Page ---
        frontend_verify_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/auth/verify-token?token={token}"
        logging.info(f"Generated JWT for user {current_user.email} and redirecting to frontend verification.")
        return redirect(frontend_verify_url)

    except Exception as e:
        logging.error(f"Error creating JWT for user {current_user.email}: {e}", exc_info=True)
        return redirect(f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/auth/signin?error=TokenGenerationFailed")


# --- END: Authentication API Routes ---

# --- Google OAuth Routes ---
@app.route('/api/auth/google/login')
def google_login():
    if not google_flow:
        logging.error("API: Google OAuth login attempt failed - flow not configured.")
        return jsonify({"error": "Google Login is not configured on the server."}), 503
    authorization_url, state = google_flow.authorization_url(
        access_type='offline', include_granted_scopes='true'
    )
    session['oauth_state'] = state
    logging.info(f"API: Redirecting user to Google for OAuth. State: {state}")
    return redirect(authorization_url)


@app.route('/api/auth/google/callback')
def google_callback():
    logging.info("API: Google OAuth callback received.")
    if not google_flow:
        logging.error("API: Google OAuth callback failed - flow not configured.")
        return redirect(f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/auth/signin?error=GoogleOAuthNotConfigured")

    state = session.pop('oauth_state', None)
    # Compare against request.args.get('state')
    if not state or state != request.args.get('state'):
        logging.error(f"API: Google OAuth callback failed - state mismatch. Session state: {state}, Request state: {request.args.get('state')}")
        return redirect(f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/auth/signin?error=StateMismatch")

    try:
        # Construct the full callback URL from the request
        # This handles HTTP vs HTTPS automatically based on how the callback was received
        callback_url = request.url
        logging.debug(f"Using callback URL for fetch_token: {callback_url}")

        # Remove OAUTHLIB_INSECURE_TRANSPORT override if using HTTPS in production
        google_flow.fetch_token(authorization_response=callback_url)
        credentials = google_flow.credentials

        id_info = id_token.verify_oauth2_token(
            credentials.id_token, GoogleRequest(), GOOGLE_CLIENT_ID
        )

        google_id = id_info.get('sub')
        email = id_info.get('email')
        name = id_info.get('name')

        if not email:
            logging.error("API: Google OAuth callback failed - email not found in token.")
            return redirect(f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/auth/signin?error=EmailNotFoundInToken")

        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(email=email, name=name, google_id=google_id)
            db.session.add(user)
            db.session.commit()
            logging.info(f"API: New user created via Google OAuth: '{email}'.")
        elif not user.google_id:
            user.google_id = google_id
            db.session.commit()
            logging.info(f"API: Linked existing user '{email}' with Google ID.")
        # If user exists and google_id already matches, just log them in

        login_user(user) # This sets the session cookie for the domain the request came from (127.0.0.1)
        logging.info(f"API: User '{email}' logged in via Google OAuth, redirecting to set token.")
        # Instead of redirecting to the frontend, redirect to our new token setter endpoint
        return redirect(url_for('set_token'))

    except Exception as e:
        logging.error(f"API: Error during Google OAuth callback: {e}", exc_info=True)
        return redirect(f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/auth/signin?error=GoogleOAuthCallbackFailed")

# --- SocketIO Event Handlers ---
@socketio.on('connect')
def handle_connect():
    logging.info(f'Socket client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    logging.info(f'Socket client disconnected: {request.sid}')

@socketio.on('subscribe_to_chart')
def handle_subscribe(data):
    sid = request.sid
    symbol = data.get('symbol', 'N/A')
    tf = data.get('timeframe', 'N/A')
    logging.info(f"Client {sid} attempting to subscribe to {symbol} {tf}")
    # Add actual subscription logic here if needed

@socketio.on('unsubscribe_from_chart')
def handle_unsubscribe(data):
    sid = request.sid
    symbol = data.get('symbol', 'N/A')
    tf = data.get('timeframe', 'N/A')
    logging.info(f"Client {sid} unsubscribing from {symbol} {tf}")
    # Add actual unsubscription logic here if needed

# --- Main Execution Block ---
if __name__ == '__main__':
    init_db() # Create DB tables if they don't exist
    STATE.load_settings() # Load settings from file and attempt initial MT5 connect

    # --- Start Background Threads ---
    # 1. Trade Monitoring (Always runs if app is running)
    if not STATE.monitoring_running:
        STATE.monitoring_running = True
        STATE.monitoring_thread = threading.Thread(target=trade_monitoring_loop, daemon=True)
        STATE.monitoring_thread.start()
        logging.info("Started trade monitoring thread.")

    # 2. Auto-Trading (Starts only if enabled in settings AND MT5 connected)
    if STATE.settings.get('auto_trading_enabled') and not STATE.autotrade_running:
        if mt5_manager.is_initialized:
            with STATE.lock:
                if not STATE.autotrade_running: # Double check inside lock
                    STATE.autotrade_running = True
                    STATE.autotrade_thread = threading.Thread(target=trading_loop, daemon=True)
                    STATE.autotrade_thread.start()
                    logging.info("Auto-trading thread started based on loaded settings.")
        else:
            logging.warning("Auto-trading enabled in settings, but MT5 connection failed on startup. Auto-trade loop NOT started.")
    elif STATE.settings.get('auto_trading_enabled') and STATE.autotrade_running:
         logging.info("Auto-trading thread already running from a previous start.")


    # --- Run Flask App with SocketIO ---
    host = '0.0.0.0' # Listen on all available network interfaces
    port = 5000
    logging.info(f"Starting Flask-SocketIO server on http://{host}:{port} (Accessible locally via http://127.0.0.1:{port})")
    try:
        # use_reloader=False is important when using threads like this
        # debug=False is recommended for stability, rely on logging instead
        socketio.run(app, host=host, port=port, debug=False, use_reloader=False)
    except KeyboardInterrupt:
         logging.info("Keyboard interrupt received, shutting down...")
    except Exception as e:
         logging.critical(f"Server crashed: {e}", exc_info=True)
    finally:
        logging.info("Flask app shutting down...")
        # Signal threads to stop gracefully
        STATE.autotrade_running = False
        STATE.monitoring_running = False
        # Optional: Wait briefly for threads to potentially finish
        # if STATE.autotrade_thread and STATE.autotrade_thread.is_alive():
        #     STATE.autotrade_thread.join(timeout=2)
        # if STATE.monitoring_thread and STATE.monitoring_thread.is_alive():
        #     STATE.monitoring_thread.join(timeout=2)
        # Ensure MT5 connection is closed
        mt5_manager.shutdown_mt5()
        logging.info("Shutdown complete.")