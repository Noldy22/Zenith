# trade_monitor.py

import MetaTrader5 as mt5
import sqlite3
from datetime import datetime, timedelta
import time
import json # You'll need to parse the stored credentials

# --- Configuration ---
DB_PATH = 'trades.db'
TERMINAL_PATH = 'C:\\Program Files\\MetaTrader 5 EXNESS\\terminal64.exe' # Make sure this is correct
CHECK_INTERVAL_SECONDS = 300 # Check every 5 minutes

def get_credentials():
    """ A helper function to get credentials.
        In a real-world app, you'd have a more secure way to do this.
        For now, we'll assume a file named 'mt5_credentials.json' exists.
    """
    try:
        with open('mt5_credentials.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print("Error: `mt5_credentials.json` not found.")
        print("Please create this file in the same directory with your login, password, and server.")
        return None

def update_trade_outcomes(credentials):
    """Checks for closed trades and updates their outcomes in the database."""
    if not mt5.initialize(path=TERMINAL_PATH):
        print("initialize() failed, error code =", mt5.last_error())
        return

    login = int(credentials.get('login'))
    password = credentials.get('password')
    server = credentials.get('server')

    if not mt5.login(login=login, password=password, server=server):
        print("MT5 login failed")
        return

    # Get trades from the last 30 days
    from_date = datetime.now() - timedelta(days=30)
    history_orders = mt5.history_deals_get(from_date, datetime.now())

    if history_orders is None:
        print("No history deals found, error code =", mt5.last_error())
        mt5.shutdown()
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    for order in history_orders:
        # Check if this order was placed by Zenith (magic number) and is an exit deal
        if order.magic == 234000 and order.entry == 1: # Entry type 1 is 'out'
            # Check if we have this trade in our DB and it's pending
            cursor.execute("SELECT id, outcome FROM trades WHERE order_id = ? AND outcome = -1", (order.order,))
            trade_to_update = cursor.fetchone()

            if trade_to_update:
                # Simple logic: if profit is positive, it was a success (TP), else failure (SL)
                outcome = 1 if order.profit > 0 else 0
                cursor.execute("UPDATE trades SET outcome = ? WHERE id = ?", (outcome, trade_to_update[0]))
                print(f"Updated outcome for order {order.order} to {outcome}")

    conn.commit()
    conn.close()
    mt5.shutdown()
    print("Trade monitoring check complete.")

if __name__ == '__main__':
    creds = get_credentials()
    if creds:
        while True:
            print(f"[{datetime.now()}] Running trade monitor...")
            update_trade_outcomes(creds)
            print(f"Sleeping for {CHECK_INTERVAL_SECONDS} seconds...")
            time.sleep(CHECK_INTERVAL_SECONDS)