import pandas as pd
import numpy as np

# --- UTILITY FUNCTIONS ---

def _merge_zones(zones, tolerance_multiplier=0.5):
    """Merges overlapping or very close zones."""
    if not zones:
        return []

    # Sort zones by their low price
    zones.sort(key=lambda z: z['low'])

    merged_zones = [zones[0]]

    for current_zone in zones[1:]:
        last_merged_zone = merged_zones[-1]

        # Calculate tolerance based on the size of the last merged zone
        tolerance = (last_merged_zone['high'] - last_merged_zone['low']) * tolerance_multiplier

        # Check for overlap or if they are close enough
        if current_zone['low'] <= last_merged_zone['high'] + tolerance:
            # Merge the zones by taking the min low and max high
            last_merged_zone['high'] = max(last_merged_zone['high'], current_zone['high'])
            last_merged_zone['low'] = min(last_merged_zone['low'], current_zone['low'])
        else:
            merged_zones.append(current_zone)

    return merged_zones

# --- CORE ANALYSIS FUNCTIONS ---

def find_levels(data, window=5):
    """Finds support and resistance levels using pivot points."""
    df = pd.DataFrame(data)
    highs = df['high']
    lows = df['low']
    
    pivots = []
    # Identify all pivot highs and lows
    for i in range(window, len(df) - window):
        is_low = all(lows[i] < lows[i - j] for j in range(1, window + 1)) and \
                 all(lows[i] < lows[i + j] for j in range(1, window + 1))
        if is_low:
            pivots.append({'type': 'low', 'price': lows[i], 'index': i})

        is_high = all(highs[i] > highs[i - j] for j in range(1, window + 1)) and \
                  all(highs[i] > highs[i + j] for j in range(1, window + 1))
        if is_high:
            pivots.append({'type': 'high', 'price': highs[i], 'index': i})
    
    pivots.sort(key=lambda x: x['index'])
    
    support_levels = [p['price'] for p in pivots if p['type'] == 'low']
    resistance_levels = [p['price'] for p in pivots if p['type'] == 'high']

    return sorted(list(set(support_levels)), reverse=True)[:3], \
           sorted(list(set(resistance_levels)), reverse=True)[:3], \
           pivots

def determine_market_structure(pivots, lookback=10):
    """Determines the market structure (trend) by analyzing recent swing highs and lows."""
    swing_highs = [p for p in pivots if p['type'] == 'high'][-lookback:]
    swing_lows = [p for p in pivots if p['type'] == 'low'][-lookback:]

    if len(swing_highs) < 2 or len(swing_lows) < 2:
        return 'Ranging', "Not enough swing points to determine a clear trend."

    last_high, prev_high = swing_highs[-1]['price'], swing_highs[-2]['price']
    last_low, prev_low = swing_lows[-1]['price'], swing_lows[-2]['price']

    if last_high > prev_high and last_low > prev_low:
        return 'Uptrend', f"The market is in an uptrend (HH, HL). Last high at {last_high:.5f} > previous high at {prev_high:.5f}."
    
    if last_high < prev_high and last_low < prev_low:
        return 'Downtrend', f"The market is in a downtrend (LL, LH). Last low at {last_low:.5f} < previous low at {prev_low:.5f}."

    return 'Ranging', "The market is consolidating with no clear directional bias from recent swing points."

def find_sd_zones(data, lookback=50, threshold_multiplier=1.5):
    """Finds and clusters Supply and Demand zones."""
    df = pd.DataFrame(data)
    df['range'] = df['high'] - df['low']
    avg_range = df['range'].tail(lookback).mean()
    
    supply_zones, demand_zones = [], []

    for i in range(1, len(df) - 1):
        base_candle = df.iloc[i]
        explosive_candle = df.iloc[i+1]

        is_base = base_candle['range'] < avg_range
        is_explosive = explosive_candle['range'] > avg_range * threshold_multiplier

        if is_base and is_explosive:
            zone_data = {'high': base_candle['high'], 'low': base_candle['low'], 'time': base_candle['time']}
            if explosive_candle['close'] > explosive_candle['open']:
                demand_zones.append(zone_data)
            elif explosive_candle['close'] < explosive_candle['open']:
                supply_zones.append(zone_data)

    # Merge overlapping/close zones and return the most recent 2 of each
    clustered_demand = _merge_zones(demand_zones)[-2:]
    clustered_supply = _merge_zones(supply_zones)[-2:]
    
    return clustered_demand, clustered_supply

def find_liquidity_pools(pivots, lookback=20, tolerance=0.001):
    """Identifies liquidity pools from recent swing highs and lows."""
    swing_highs = [p for p in pivots if p['type'] == 'high'][-lookback:]
    swing_lows = [p for p in pivots if p['type'] == 'low'][-lookback:]
    
    buy_side_liquidity = [p['price'] for p in swing_highs]
    sell_side_liquidity = [p['price'] for p in swing_lows]
    
    # Optional: Look for "equal" highs/lows for stronger pools
    # This is a simplified example; a more complex one would check for multiple highs/lows at similar levels.
    
    return sorted(list(set(buy_side_liquidity)), reverse=True), \
           sorted(list(set(sell_side_liquidity)))

def find_fvgs(data):
    """Identifies unmitigated Fair Value Gaps (FVGs)."""
    df = pd.DataFrame(data)
    bullish_fvg, bearish_fvg = [], []

    for i in range(2, len(df)):
        c1, c2, c3 = df.iloc[i-2], df.iloc[i-1], df.iloc[i]
        
        # Bullish FVG (gap between c1 high and c3 low)
        if c1['high'] < c3['low']:
            fvg_zone = {'high': c3['low'], 'low': c1['high'], 'time': c2['time'], 'mitigated': False}
            # Check if any subsequent candle has filled this gap
            for j in range(i + 1, len(df)):
                if df.iloc[j]['low'] <= fvg_zone['high']:
                    fvg_zone['mitigated'] = True
                    break
            if not fvg_zone['mitigated']:
                bullish_fvg.append(fvg_zone)
            
        # Bearish FVG (gap between c1 low and c3 high)
        if c1['low'] > c3['high']:
            fvg_zone = {'high': c1['low'], 'low': c3['high'], 'time': c2['time'], 'mitigated': False}
            # Check if any subsequent candle has filled this gap
            for j in range(i + 1, len(df)):
                if df.iloc[j]['high'] >= fvg_zone['low']:
                    fvg_zone['mitigated'] = True
                    break
            if not fvg_zone['mitigated']:
                bearish_fvg.append(fvg_zone)

    return bullish_fvg[-2:], bearish_fvg[-2:]

def find_order_blocks(data, pivots):
    """Identifies order blocks confirmed by a displacement (strong move creating an FVG)."""
    df = pd.DataFrame(data)
    bullish_ob, bearish_ob = [], []

    swing_highs = [p for p in pivots if p['type'] == 'high']
    swing_lows = [p for p in pivots if p['type'] == 'low']

    # Find Bearish OB
    for i in range(len(swing_lows) - 1):
        prev_low, current_low = swing_lows[i], swing_lows[i+1]
        if current_low['price'] < prev_low['price']: # Break of Structure (BOS)
            try:
                high_point_index = df.iloc[prev_low['index']:current_low['index']]['high'].idxmax()
                for j in range(high_point_index, prev_low['index'], -1):
                    if df['close'].iloc[j] > df['open'].iloc[j]: # Find last up candle
                        # Check for FVG creation after the OB
                        if (j + 2) < len(df) and df['low'].iloc[j+2] > df['high'].iloc[j]:
                            ob_candle = df.iloc[j]
                            bearish_ob.append({'high': ob_candle['high'], 'low': ob_candle['low'], 'time': ob_candle['time']})
                            break
            except ValueError: continue

    # Find Bullish OB
    for i in range(len(swing_highs) - 1):
        prev_high, current_high = swing_highs[i], swing_highs[i+1]
        if current_high['price'] > prev_high['price']: # BOS
            try:
                low_point_index = df.iloc[prev_high['index']:current_high['index']]['low'].idxmin()
                for j in range(low_point_index, prev_high['index'], -1):
                    if df['close'].iloc[j] < df['open'].iloc[j]: # Find last down candle
                        # Check for FVG creation after the OB
                        if (j + 2) < len(df) and df['high'].iloc[j+2] < df['low'].iloc[j]:
                            ob_candle = df.iloc[j]
                            bullish_ob.append({'high': ob_candle['high'], 'low': ob_candle['low'], 'time': ob_candle['time']})
                            break
            except ValueError: continue

    return list({(z['high'], z['low']): z for z in reversed(bullish_ob)}.values())[-2:], \
           list({(z['high'], z['low']): z for z in reversed(bearish_ob)}.values())[-2:]

def find_candlestick_patterns(data):
    """Detects various candlestick patterns."""
    df = pd.DataFrame(data)
    patterns = []
    for i in range(2, len(df)):
        c1, c2, c3 = df.iloc[i-2], df.iloc[i-1], df.iloc[i]
        if c2['close'] < c2['open'] and c3['close'] > c3['open'] and c3['close'] > c2['open'] and c3['open'] < c2['close']:
            patterns.append({'name': 'Bullish Engulfing', 'time': c3['time'], 'position': 'below', 'price': c3['low']})
        if c2['close'] > c2['open'] and c3['close'] < c3['open'] and c3['close'] < c2['open'] and c3['open'] > c2['close']:
            patterns.append({'name': 'Bearish Engulfing', 'time': c3['time'], 'position': 'above', 'price': c3['high']})
    return patterns[-5:]

def get_trade_suggestion(analysis, risk_reward_ratio=2.0):
    """Generates a trade suggestion based on market structure and confluent zones."""
    current_price = analysis['current_price']
    market_structure = analysis['market_structure'][0]

    if market_structure == 'Uptrend':
        for zone_type in ['demand_zones', 'bullish_ob', 'bullish_fvg']:
            for zone in analysis.get(zone_type, []):
                if zone['low'] <= current_price <= zone['high']:
                    sl = zone['low'] * 0.999 # Place SL slightly below the zone
                    risk = current_price - sl
                    # Target the next buy-side liquidity pool
                    tp_target = min([l for l in analysis.get('buy_side_liquidity', []) if l > current_price], default=None)
                    tp = tp_target if tp_target else current_price + (risk * risk_reward_ratio)
                    return {"action": "Buy", "entry": current_price, "sl": sl, "tp": tp, "reason": f"Uptrend, price retesting {zone_type.replace('_', ' ')}."}
        return {"action": "Neutral", "reason": "Uptrend, but not in a key support zone."}

    if market_structure == 'Downtrend':
        for zone_type in ['supply_zones', 'bearish_ob', 'bearish_fvg']:
            for zone in analysis.get(zone_type, []):
                if zone['low'] <= current_price <= zone['high']:
                    sl = zone['high'] * 1.001 # Place SL slightly above the zone
                    risk = sl - current_price
                    # Target the next sell-side liquidity pool
                    tp_target = max([l for l in analysis.get('sell_side_liquidity', []) if l < current_price], default=None)
                    tp = tp_target if tp_target else current_price - (risk * risk_reward_ratio)
                    return {"action": "Sell", "entry": current_price, "sl": sl, "tp": tp, "reason": f"Downtrend, price retesting {zone_type.replace('_', ' ')}."}
        return {"action": "Neutral", "reason": "Downtrend, but not in a key resistance zone."}

    return {"action": "Neutral", "reason": "Ranging market, no clear edge."}

def calculate_confidence(analysis, suggestion):
    """Calculates a confidence score based on confluence."""
    if suggestion['action'] == 'Neutral': return 30

    score = 50  # Base score for a valid setup
    entry = suggestion.get('entry', 0)
    
    if suggestion['action'] == 'Buy':
        confluences = 0
        if any(z['low'] <= entry <= z['high'] for z in analysis.get('bullish_ob', [])): confluences += 1
        if any(z['low'] <= entry <= z['high'] for z in analysis.get('bullish_fvg', [])): confluences += 1
        if any(abs(level - entry) / entry < 0.001 for level in analysis.get('support', [])): confluences += 1
        if any(p['name'] == 'Bullish Engulfing' for p in analysis.get('candlestick_patterns', [])): confluences += 1
        score += confluences * 15

    elif suggestion['action'] == 'Sell':
        confluences = 0
        if any(z['low'] <= entry <= z['high'] for z in analysis.get('bearish_ob', [])): confluences += 1
        if any(z['low'] <= entry <= z['high'] for z in analysis.get('bearish_fvg', [])): confluences += 1
        if any(abs(level - entry) / entry < 0.001 for level in analysis.get('resistance', [])): confluences += 1
        if any(p['name'] == 'Bearish Engulfing' for p in analysis.get('candlestick_patterns', [])): confluences += 1
        score += confluences * 15

    return min(score, 95)

def generate_market_narrative(analysis):
    """Creates a structured narrative of the market analysis."""
    symbol = analysis.get('symbol', 'the asset')
    price = analysis.get('current_price', 0)
    structure, reason = analysis.get('market_structure', ('Ranging', ''))
    
    narrative = {
        "overview": f"Market Overview for {symbol} at {price:.5f}",
        "structure_title": "Market Structure", "structure_body": reason,
        "liquidity_title": "Liquidity Analysis", "liquidity_body": "",
        "prediction_title": "AI Prediction", "prediction_body": ""
    }

    buy_liq = analysis.get('buy_side_liquidity', [])
    sell_liq = analysis.get('sell_side_liquidity', [])

    if buy_liq: narrative['liquidity_body'] += f"Buy-side liquidity targets are seen above {min(buy_liq):.5f}. "
    if sell_liq: narrative['liquidity_body'] += f"Sell-side liquidity targets are seen below {max(sell_liq):.5f}."

    if structure == 'Uptrend':
        narrative['prediction_body'] = "The AI expects the price to continue higher, likely targeting buy-side liquidity after a potential pullback into nearby demand zones or FVGs."
    elif structure == 'Downtrend':
        narrative['prediction_body'] = "The AI expects the price to continue lower, likely targeting sell-side liquidity after a potential rally into nearby supply zones or FVGs."
    else:
        narrative['prediction_body'] = "The AI expects the price to remain range-bound, potentially sweeping liquidity on either side before a clear trend emerges."

    return narrative