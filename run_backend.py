from app import app, socketio, init_db, STATE, trading_loop
import threading

def start_backend():
    """Initializes and runs the backend server."""
    print("Initializing database...")
    init_db()

    print("Loading settings...")
    STATE.load_settings()

    # Start the auto-trading loop in a background thread if it's not already running
    if not STATE.autotrade_running:
        print("Starting auto-trading thread...")
        STATE.autotrade_running = True
        # The target for the thread should be the function object itself
        STATE.autotrade_thread = threading.Thread(target=trading_loop, daemon=True)
        STATE.autotrade_thread.start()
    else:
        print("Auto-trading thread is already running or enabled.")

    # Run the Flask-SocketIO server, making it accessible on the local network
    print("\n--- Backend Server Starting ---")
    print("URL: http://0.0.0.0:5000")
    print("Accessible on your local network.")
    print("-----------------------------\n")

    # Use gevent for better performance with WebSockets
    socketio.run(app, host='0.0.0.0', port=5000)

if __name__ == '__main__':
    start_backend()