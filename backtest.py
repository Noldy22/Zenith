import pandas as pd
from datetime import datetime
from analysis import (
    find_levels, determine_market_structure, find_sd_zones,
    find_order_blocks, find_fvgs, find_liquidity_pools,
    get_trade_suggestion
)

def _calculate_position_size(balance, risk_pct, sl_pips, pip_value=0.0001):
    """Simplified position size calculation for backtesting."""
    amount_to_risk = balance * (risk_pct / 100)
    risk_per_lot = sl_pips * pip_value * 100000 # For a standard lot
    if risk_per_lot == 0: return 0.01
    position_size = round(amount_to_risk / risk_per_lot, 2)
    return max(position_size, 0.01)

def run_backtest(historical_data, settings):
    """
    Runs a backtest of the trading strategy on historical data.

    :param historical_data: A list of dictionaries with OHLCV data.
    :param settings: A dictionary with strategy settings.
    :return: A dictionary with backtest results.
    """
    df = pd.DataFrame(historical_data)
    if df.empty:
        return {"error": "No historical data provided."}

    balance = settings.get('account_balance', 10000.0)
    risk_per_trade = settings.get('risk_per_trade', 2.0)

    trades = []
    open_trade = None

    for i in range(50, len(df)): # Start after a warmup period
        current_data = df.iloc[0:i]
        current_price = current_data.iloc[-1]['close']

        # --- Check if an open trade should be closed ---
        if open_trade:
            if (open_trade['type'] == 'BUY' and current_price >= open_trade['tp']) or \
               (open_trade['type'] == 'SELL' and current_price <= open_trade['tp']):
                profit = (open_trade['tp'] - open_trade['entry']) * open_trade['size_in_units']
                if open_trade['type'] == 'SELL': profit = -profit
                balance += profit
                open_trade['outcome'] = 'TP'
                open_trade['pnl'] = profit
                trades.append(open_trade)
                open_trade = None
            elif (open_trade['type'] == 'BUY' and current_price <= open_trade['sl']) or \
                 (open_trade['type'] == 'SELL' and current_price >= open_trade['sl']):
                loss = (open_trade['entry'] - open_trade['sl']) * open_trade['size_in_units']
                if open_trade['type'] == 'SELL': loss = -loss
                balance -= loss
                open_trade['outcome'] = 'SL'
                open_trade['pnl'] = -loss
                trades.append(open_trade)
                open_trade = None

        # --- Look for a new trade if none is open ---
        if not open_trade:
            analysis = {}
            _, _, pivots = find_levels(current_data)
            analysis['market_structure'] = determine_market_structure(pivots)
            analysis['demand_zones'], analysis['supply_zones'] = find_sd_zones(current_data)
            analysis['bullish_ob'], analysis['bearish_ob'] = find_order_blocks(current_data, pivots)
            analysis['bullish_fvg'], analysis['bearish_fvg'] = find_fvgs(current_data)
            analysis['buy_side_liquidity'], analysis['sell_side_liquidity'] = find_liquidity_pools(pivots)
            analysis['current_price'] = current_price

            suggestion = get_trade_suggestion(analysis)

            if suggestion['action'] != 'Neutral':
                sl_pips = abs(suggestion['entry'] - suggestion['sl']) * 10000
                lot_size = _calculate_position_size(balance, risk_per_trade, sl_pips)

                open_trade = {
                    'type': suggestion['action'],
                    'entry': suggestion['entry'],
                    'sl': suggestion['sl'],
                    'tp': suggestion['tp'],
                    'lot_size': lot_size,
                    'size_in_units': lot_size * 100000, # Standard lot
                    'open_time': current_data.iloc[-1]['time']
                }

    # --- Final Results Calculation ---
    total_trades = len(trades)
    wins = len([t for t in trades if t['outcome'] == 'TP'])
    losses = total_trades - wins
    win_rate = (wins / total_trades) * 100 if total_trades > 0 else 0

    total_pnl = sum(t['pnl'] for t in trades)

    return {
        "starting_balance": settings.get('account_balance', 10000.0),
        "final_balance": balance,
        "total_trades": total_trades,
        "wins": wins,
        "losses": losses,
        "win_rate_pct": win_rate,
        "total_pnl": total_pnl,
        "trades": trades
    }