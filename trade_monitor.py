# trade_monitor.py
import MetaTrader5 as mt5

def manage_breakeven(position, settings, symbol_info):
    """Moves the stop loss to breakeven if the trade is in sufficient profit."""
    if not settings.get('breakeven_enabled', False):
        return

    be_pips = settings.get('breakeven_pips', 20)
    if be_pips <= 0:
        return

    pip_size = symbol_info.point * 10
    current_price = mt5.symbol_info_tick(position.symbol).bid if position.type == 0 else mt5.symbol_info_tick(position.symbol).ask

    if position.type == 0: # Buy position
        profit_pips = (current_price - position.price_open) / pip_size
        if profit_pips >= be_pips and position.sl != position.price_open:
            request = {
                "action": mt5.TRADE_ACTION_SLTP,
                "position": position.ticket,
                "sl": position.price_open,
                "tp": position.tp,
            }
            result = mt5.order_send(request)
            if result.retcode == mt5.TRADE_RETCODE_DONE:
                print(f"Moved SL to breakeven for position {position.ticket}")
            else:
                print(f"Failed to move SL to breakeven for position {position.ticket}: {result.comment}")
    else: # Sell position
        profit_pips = (position.price_open - current_price) / pip_size
        if profit_pips >= be_pips and position.sl != position.price_open:
            request = {
                "action": mt5.TRADE_ACTION_SLTP,
                "position": position.ticket,
                "sl": position.price_open,
                "tp": position.tp,
            }
            result = mt5.order_send(request)
            if result.retcode == mt5.TRADE_RETCODE_DONE:
                print(f"Moved SL to breakeven for position {position.ticket}")
            else:
                print(f"Failed to move SL to breakeven for position {position.ticket}: {result.comment}")

def manage_trailing_stop(position, settings, symbol_info):
    """Manages a trailing stop loss for a profitable position."""
    if not settings.get('trailing_stop_enabled', False):
        return

    ts_pips = settings.get('trailing_stop_pips', 20)
    if ts_pips <= 0:
        return

    pip_size = symbol_info.point * 10

    if position.type == 0:  # Buy
        current_price = mt5.symbol_info_tick(position.symbol).bid
        new_sl = current_price - (ts_pips * pip_size)
        if new_sl > position.sl:
            request = {
                "action": mt5.TRADE_ACTION_SLTP,
                "position": position.ticket,
                "sl": new_sl,
                "tp": position.tp,
            }
            mt5.order_send(request)
    else:  # Sell
        current_price = mt5.symbol_info_tick(position.symbol).ask
        new_sl = current_price + (ts_pips * pip_size)
        if new_sl < position.sl:
            request = {
                "action": mt5.TRADE_ACTION_SLTP,
                "position": position.ticket,
                "sl": new_sl,
                "tp": position.tp,
            }
            mt5.order_send(request)

def monitor_and_close_trades(position, settings, _run_full_analysis, TRADING_STYLE_TIMEFRAMES):
    """Monitors a trade and closes it if the market conditions are no longer favorable."""
    if not settings.get('proactive_close_enabled', False):
        return

    symbol = position.symbol
    analyses = _run_full_analysis(symbol, settings['mt5_credentials'], settings['trading_style'])

    buys = sum(1 for tf, analysis in analyses.items() if analysis.get('suggestion', {}).get('action') == 'Buy')
    sells = sum(1 for tf, analysis in analyses.items() if analysis.get('suggestion', {}).get('action') == 'Sell')

    current_market_bias = "Neutral"
    if buys > sells:
        current_market_bias = "Buy"
    elif sells > buys:
        current_market_bias = "Sell"

    if position.type == 0 and current_market_bias == "Sell": # Open buy, market is now bearish
        close_trade(position)
    elif position.type == 1 and current_market_bias == "Buy": # Open sell, market is now bullish
        close_trade(position)

def close_trade(position):
    """Closes an open position."""
    tick = mt5.symbol_info_tick(position.symbol)
    if not tick:
        print(f"Could not get tick for {position.symbol} to close trade.")
        return

    price = tick.bid if position.type == 0 else tick.ask # Close buy at bid, sell at ask

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "position": position.ticket,
        "symbol": position.symbol,
        "volume": position.volume,
        "type": mt5.ORDER_TYPE_SELL if position.type == 0 else mt5.ORDER_TYPE_BUY,
        "price": price,
        "deviation": 20,
        "magic": 234000,
        "comment": "Zenith AI Proactive Close",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }

    result = mt5.order_send(request)
    if result.retcode == mt5.TRADE_RETCODE_DONE:
        print(f"Proactively closed position {position.ticket} for {position.symbol}.")
    else:
        print(f"Failed to close position {position.ticket}: {result.comment}")
