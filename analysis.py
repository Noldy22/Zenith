import pandas as pd
import pandas_ta as ta
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
    """
    Finds, clusters, and checks the mitigation status of Supply and Demand zones.
    Prioritizes fresh (unmitigated) zones.
    """
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
            zone_data = {'high': base_candle['high'], 'low': base_candle['low'], 'time': base_candle['time'], 'mitigated': False}

            # Check for mitigation
            for k in range(i + 2, len(df)):
                if explosive_candle['close'] > explosive_candle['open']: # Demand
                    if df.iloc[k]['low'] <= zone_data['high']:
                        zone_data['mitigated'] = True
                        break
                else: # Supply
                    if df.iloc[k]['high'] >= zone_data['low']:
                        zone_data['mitigated'] = True
                        break

            if not zone_data['mitigated']:
                if explosive_candle['close'] > explosive_candle['open']:
                    demand_zones.append(zone_data)
                else:
                    supply_zones.append(zone_data)

    clustered_demand = _merge_zones(demand_zones)[-2:]
    clustered_supply = _merge_zones(supply_zones)[-2:]

    return clustered_demand, clustered_supply

def find_liquidity_pools(pivots, lookback=30, tolerance_percent=0.05):
    """
    Identifies liquidity pools by finding clusters of "equal" highs and lows.
    These are areas where price has touched a similar level multiple times.
    """
    swing_highs = sorted([p['price'] for p in pivots if p['type'] == 'high'], reverse=True)
    swing_lows = sorted([p['price'] for p in pivots if p['type'] == 'low'])

    buy_side_pools, sell_side_pools = [], []
    
    # Find Buy-Side Liquidity Pools (Equal Highs)
    if len(swing_highs) > 1:
        # Group highs that are close to each other
        groups = []
        current_group = [swing_highs[0]]
        for i in range(1, len(swing_highs)):
            tolerance = swing_highs[i] * (tolerance_percent / 100)
            if abs(swing_highs[i] - current_group[-1]) <= tolerance:
                current_group.append(swing_highs[i])
            else:
                if len(current_group) > 1:
                    groups.append(np.mean(current_group))
                current_group = [swing_highs[i]]
        if len(current_group) > 1:
            groups.append(np.mean(current_group))
        buy_side_pools = groups

    # Find Sell-Side Liquidity Pools (Equal Lows)
    if len(swing_lows) > 1:
        groups = []
        current_group = [swing_lows[0]]
        for i in range(1, len(swing_lows)):
            tolerance = swing_lows[i] * (tolerance_percent / 100)
            if abs(swing_lows[i] - current_group[-1]) <= tolerance:
                current_group.append(swing_lows[i])
            else:
                if len(current_group) > 1:
                    groups.append(np.mean(current_group))
                current_group = [swing_lows[i]]
        if len(current_group) > 1:
            groups.append(np.mean(current_group))
        sell_side_pools = groups

    return buy_side_pools, sell_side_pools

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
    """
    Identifies high-probability order blocks.
    A high-probability OB has:
    1. A liquidity sweep of a prior swing high/low.
    2. A displacement (strong move) that causes a Break of Structure (BOS).
    3. An FVG created by the displacement.
    4. Has not yet been mitigated.
    """
    df = pd.DataFrame(data)
    bullish_obs, bearish_obs = [], []

    swing_highs = [p for p in pivots if p['type'] == 'high']
    swing_lows = [p for p in pivots if p['type'] == 'low']

    # Find Bearish OBs
    for i in range(1, len(swing_highs)):
        # 1. Liquidity Sweep: Current high sweeps the previous high
        if swing_highs[i]['price'] > swing_highs[i-1]['price']:
            # 2. Break of Structure: A subsequent low breaks a previous low
            subsequent_lows = [sl for sl in swing_lows if sl['index'] > swing_highs[i]['index']]
            if not subsequent_lows: continue

            bos_happened = False
            for sl in subsequent_lows:
                if sl['price'] < swing_highs[i-1]['price']: # Simplified BOS condition
                    bos_happened = True
                    break
            if not bos_happened: continue

            # Find the OB candle (last up-candle before the sweep)
            for j in range(swing_highs[i]['index'], swing_highs[i-1]['index'], -1):
                if df.iloc[j]['close'] > df.iloc[j]['open']:
                    ob_candle = df.iloc[j]
                    ob_zone = {'high': ob_candle['high'], 'low': ob_candle['low'], 'time': ob_candle['time'], 'mitigated': False}

                    # 4. Mitigation Check
                    for k in range(swing_highs[i]['index'] + 1, len(df)):
                        if df.iloc[k]['high'] >= ob_zone['low']:
                            ob_zone['mitigated'] = True
                            break

                    if not ob_zone['mitigated']:
                        bearish_obs.append(ob_zone)
                    break

    # Find Bullish OBs (logic is inverse of bearish)
    for i in range(1, len(swing_lows)):
        # 1. Liquidity Sweep
        if swing_lows[i]['price'] < swing_lows[i-1]['price']:
            # 2. Break of Structure
            subsequent_highs = [sh for sh in swing_highs if sh['index'] > swing_lows[i]['index']]
            if not subsequent_highs: continue

            bos_happened = False
            for sh in subsequent_highs:
                if sh['price'] > swing_lows[i-1]['price']:
                    bos_happened = True
                    break
            if not bos_happened: continue

            # Find OB candle
            for j in range(swing_lows[i]['index'], swing_lows[i-1]['index'], -1):
                if df.iloc[j]['close'] < df.iloc[j]['open']:
                    ob_candle = df.iloc[j]
                    ob_zone = {'high': ob_candle['high'], 'low': ob_candle['low'], 'time': ob_candle['time'], 'mitigated': False}

                    # 4. Mitigation Check
                    for k in range(swing_lows[i]['index'] + 1, len(df)):
                        if df.iloc[k]['low'] <= ob_zone['high']:
                            ob_zone['mitigated'] = True
                            break

                    if not ob_zone['mitigated']:
                        bullish_obs.append(ob_zone)
                    break

    return bullish_obs[-2:], bearish_obs[-2:]

def find_candlestick_patterns(data):
    """Detects various candlestick patterns using pandas-ta."""
    df = pd.DataFrame(data)

    # Use the candlestick pattern detection function from pandas-ta
    # This will scan for all available patterns
    pattern_data = df.ta.cdl_pattern(name="all")

    # Rename columns to be more descriptive
    pattern_data.columns = [col.replace('CDL_', '') for col in pattern_data.columns]

    patterns = []
    # Find the last 5 candles that indicated a pattern
    # A value of 100 indicates a bullish pattern, -100 a bearish one, 0 no pattern
    for i in range(len(pattern_data) - 5, len(pattern_data)):
        row = pattern_data.iloc[i]
        candle = df.iloc[i]

        # Check for bullish patterns
        bullish_patterns = row[row == 100]
        for pattern_name in bullish_patterns.index:
            patterns.append({
                'name': f"Bullish {pattern_name}",
                'time': candle['time'],
                'position': 'below',
                'price': candle['low']
            })

        # Check for bearish patterns
        bearish_patterns = row[row == -100]
        for pattern_name in bearish_patterns.index:
            patterns.append({
                'name': f"Bearish {pattern_name}",
                'time': candle['time'],
                'position': 'above',
                'price': candle['high']
            })

    return patterns

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
        if any('Bullish' in p['name'] for p in analysis.get('candlestick_patterns', [])): confluences += 1
        score += confluences * 15

    elif suggestion['action'] == 'Sell':
        confluences = 0
        if any(z['low'] <= entry <= z['high'] for z in analysis.get('bearish_ob', [])): confluences += 1
        if any(z['low'] <= entry <= z['high'] for z in analysis.get('bearish_fvg', [])): confluences += 1
        if any(abs(level - entry) / entry < 0.001 for level in analysis.get('resistance', [])): confluences += 1
        if any('Bearish' in p['name'] for p in analysis.get('candlestick_patterns', [])): confluences += 1
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