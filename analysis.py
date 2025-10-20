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

# --- NEW INDICATOR FUNCTIONS ---

def calculate_volume_profile(df, bins=20):
    """Calculates a simple volume profile."""
    if 'volume' not in df.columns:
        # If no real volume data, use tick volume as a proxy
        df['volume'] = df.get('tick_volume', pd.Series(np.ones(len(df)), index=df.index))

    price_range = pd.cut(df['close'], bins=bins)
    volume_distribution = df.groupby(price_range)['volume'].sum()

    poc_level = volume_distribution.idxmax().mid if not volume_distribution.empty else 0
    hvn_levels = volume_distribution[volume_distribution > volume_distribution.quantile(0.75)]

    return {
        "poc": poc_level,
        "hvns": [interval.mid for interval in hvn_levels.index]
    }

def calculate_rsi(df, period=14):
    """Calculates the Relative Strength Index (RSI)."""
    rsi = df.ta.rsi(length=period)
    return rsi

def find_rsi_divergence(df, rsi, pivots):
    """Identifies bullish and bearish RSI divergence."""
    divergences = []
    swing_highs = [p for p in pivots if p['type'] == 'high']
    swing_lows = [p for p in pivots if p['type'] == 'low']

    # Bearish Divergence: Higher High in price, Lower High in RSI
    if len(swing_highs) >= 2:
        for i in range(1, len(swing_highs)):
            p1_price, p2_price = swing_highs[i-1]['price'], swing_highs[i]['price']
            p1_rsi, p2_rsi = rsi.iloc[swing_highs[i-1]['index']], rsi.iloc[swing_highs[i]['index']]

            if p2_price > p1_price and p2_rsi < p1_rsi:
                divergences.append({
                    'type': 'Bearish',
                    'time': int(df.iloc[swing_highs[i]['index']]['time']),
                    'price': p2_price
                })

    # Bullish Divergence: Lower Low in price, Higher Low in RSI
    if len(swing_lows) >= 2:
        for i in range(1, len(swing_lows)):
            p1_price, p2_price = swing_lows[i-1]['price'], swing_lows[i]['price']
            p1_rsi, p2_rsi = rsi.iloc[swing_lows[i-1]['index']], rsi.iloc[swing_lows[i]['index']]

            if p2_price < p1_price and p2_rsi > p1_rsi:
                divergences.append({
                    'type': 'Bullish',
                    'time': int(df.iloc[swing_lows[i]['index']]['time']),
                    'price': p2_price
                })

    return divergences[-2:] # Return the 2 most recent

def calculate_emas(df, periods=[21, 50, 200]):
    """Calculates multiple Exponential Moving Averages (EMAs)."""
    emas = {}
    for period in periods:
        emas[f'EMA_{period}'] = df.ta.ema(length=period)
    return emas

def find_ema_crosses(df, emas, lookback=5):
    """Detects golden cross (e.g., EMA50 crosses above EMA200) and death cross."""
    crosses = []
    ema_short = emas.get('EMA_50')
    ema_long = emas.get('EMA_200')

    if ema_short is None or ema_long is None:
        return []

    # Check for crosses in the recent lookback period
    for i in range(len(df) - lookback, len(df)):
        # Golden Cross
        if ema_short.iloc[i-1] < ema_long.iloc[i-1] and ema_short.iloc[i] > ema_long.iloc[i]:
            crosses.append({
                'type': 'Golden Cross',
                'time': int(df.iloc[i]['time']),
                'price': df.iloc[i]['close']
            })
        # Death Cross
        if ema_short.iloc[i-1] > ema_long.iloc[i-1] and ema_short.iloc[i] < ema_long.iloc[i]:
            crosses.append({
                'type': 'Death Cross',
                'time': int(df.iloc[i]['time']),
                'price': df.iloc[i]['close']
            })
    return crosses

# --- CORE ANALYSIS FUNCTIONS ---

def find_levels(data, window=5):
    """Finds support and resistance levels using pivot points."""
    df = pd.DataFrame(data)
    
    pivots = []
    # Identify all pivot highs and lows
    for i in range(window, len(df) - window):
        is_low = all(df['low'][i] < df['low'][i - j] for j in range(1, window + 1)) and \
                 all(df['low'][i] < df['low'][i + j] for j in range(1, window + 1))
        if is_low:
            # Include the timestamp ('time') in the pivot data, ensuring it's a standard Python int
            pivots.append({'type': 'low', 'price': df['low'][i], 'index': i, 'time': int(df['time'][i])})

        is_high = all(df['high'][i] > df['high'][i - j] for j in range(1, window + 1)) and \
                  all(df['high'][i] > df['high'][i + j] for j in range(1, window + 1))
        if is_high:
            # Include the timestamp ('time') in the pivot data, ensuring it's a standard Python int
            pivots.append({'type': 'high', 'price': df['high'][i], 'index': i, 'time': int(df['time'][i])})
    
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
            # Ensure time is a standard Python int
            zone_data = {'high': base_candle['high'], 'low': base_candle['low'], 'time': int(base_candle['time']), 'mitigated': False}

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
    Returns the actual pivot points (including time) for marking on the chart.
    """
    # Keep the pivot objects, not just the prices
    swing_highs = sorted([p for p in pivots if p['type'] == 'high'], key=lambda p: p['price'], reverse=True)
    swing_lows = sorted([p for p in pivots if p['type'] == 'low'], key=lambda p: p['price'])

    buy_side_pools, sell_side_pools = [], []

    # Find Buy-Side Liquidity Pools (Equal Highs)
    if len(swing_highs) > 1:
        groups = []
        current_group = [swing_highs[0]]
        for i in range(1, len(swing_highs)):
            tolerance = current_group[-1]['price'] * (tolerance_percent / 100)
            if abs(swing_highs[i]['price'] - current_group[-1]['price']) <= tolerance:
                current_group.append(swing_highs[i])
            else:
                if len(current_group) > 1:
                    groups.extend(current_group) # Add all pivots in the group
                current_group = [swing_highs[i]]
        if len(current_group) > 1:
            groups.extend(current_group)
        # We only want the *points* for markers, not an average line
        # Ensure time is a standard Python int
        buy_side_pools = [{'time': int(p['time']), 'price': p['price']} for p in groups]


    # Find Sell-Side Liquidity Pools (Equal Lows)
    if len(swing_lows) > 1:
        groups = []
        current_group = [swing_lows[0]]
        for i in range(1, len(swing_lows)):
            tolerance = current_group[-1]['price'] * (tolerance_percent / 100)
            if abs(swing_lows[i]['price'] - current_group[-1]['price']) <= tolerance:
                current_group.append(swing_lows[i])
            else:
                if len(current_group) > 1:
                    groups.extend(current_group)
                current_group = [swing_lows[i]]
        if len(current_group) > 1:
            groups.extend(current_group)
        # Ensure time is a standard Python int
        sell_side_pools = [{'time': int(p['time']), 'price': p['price']} for p in groups]

    return buy_side_pools, sell_side_pools

def find_fvgs(data):
    """Identifies unmitigated Fair Value Gaps (FVGs)."""
    df = pd.DataFrame(data)
    bullish_fvg, bearish_fvg = [], []

    for i in range(2, len(df)):
        c1, c2, c3 = df.iloc[i-2], df.iloc[i-1], df.iloc[i]

        # Bullish FVG (gap between c1 high and c3 low)
        if c1['high'] < c3['low']:
            # Ensure time is a standard Python int
            fvg_zone = {'high': c3['low'], 'low': c1['high'], 'time': int(c2['time']), 'mitigated': False}
            # Check if any subsequent candle has filled this gap
            for j in range(i + 1, len(df)):
                if df.iloc[j]['low'] <= fvg_zone['high']:
                    fvg_zone['mitigated'] = True
                    break
            if not fvg_zone['mitigated']:
                bullish_fvg.append(fvg_zone)

        # Bearish FVG (gap between c1 low and c3 high)
        if c1['low'] > c3['high']:
            # Ensure time is a standard Python int
            fvg_zone = {'high': c1['low'], 'low': c3['high'], 'time': int(c2['time']), 'mitigated': False}
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
    3. Has not yet been mitigated.
    """
    df = pd.DataFrame(data)
    bullish_obs, bearish_obs = [], []

    swing_highs = [p for p in pivots if p['type'] == 'high']
    swing_lows = [p for p in pivots if p['type'] == 'low']

    # Find Bearish OBs
    for i in range(1, len(swing_highs)):
        sweep_high = swing_highs[i]
        prev_high = swing_highs[i-1]

        # 1. Liquidity Sweep
        if sweep_high['price'] > prev_high['price']:
            # Find the candle that performed the sweep
            sweep_candle_index = sweep_high['index']

            # 2. Break of Structure: Find a subsequent low that breaks a *previous* low
            # The low being broken should exist *before* the sweep high for a valid BOS
            relevant_lows = [sl for sl in swing_lows if sl['index'] < sweep_candle_index]
            if not relevant_lows: continue

            bos_happened = False
            for subsequent_low in [sl for sl in swing_lows if sl['index'] > sweep_candle_index]:
                if any(subsequent_low['price'] < rl['price'] for rl in relevant_lows):
                    bos_happened = True
                    break
            if not bos_happened: continue

            # Find the OB candle (last up-candle before the sweep)
            for j in range(sweep_candle_index, prev_high['index'], -1):
                if df.iloc[j]['close'] > df.iloc[j]['open']:
                    ob_candle = df.iloc[j]
                    ob_zone = {'high': ob_candle['high'], 'low': ob_candle['low'], 'time': int(ob_candle['time']), 'mitigated': False}

                    # 3. Mitigation Check
                    for k in range(sweep_candle_index + 1, len(df)):
                        if df.iloc[k]['high'] >= ob_zone['low']:
                            ob_zone['mitigated'] = True
                            break
                    if not ob_zone['mitigated']:
                        bearish_obs.append(ob_zone)
                    break

    # Find Bullish OBs (logic is inverse of bearish)
    for i in range(1, len(swing_lows)):
        sweep_low = swing_lows[i]
        prev_low = swing_lows[i-1]

        # 1. Liquidity Sweep
        if sweep_low['price'] < prev_low['price']:
            sweep_candle_index = sweep_low['index']

            # 2. Break of Structure
            relevant_highs = [sh for sh in swing_highs if sh['index'] < sweep_candle_index]
            if not relevant_highs: continue

            bos_happened = False
            for subsequent_high in [sh for sh in swing_highs if sh['index'] > sweep_candle_index]:
                 if any(subsequent_high['price'] > rh['price'] for rh in relevant_highs):
                    bos_happened = True
                    break
            if not bos_happened: continue

            # Find OB candle
            for j in range(sweep_candle_index, prev_low['index'], -1):
                if df.iloc[j]['close'] < df.iloc[j]['open']:
                    ob_candle = df.iloc[j]
                    ob_zone = {'high': ob_candle['high'], 'low': ob_candle['low'], 'time': int(ob_candle['time']), 'mitigated': False}

                    # 3. Mitigation Check
                    for k in range(sweep_candle_index + 1, len(df)):
                        if df.iloc[k]['low'] <= ob_zone['high']:
                            ob_zone['mitigated'] = True
                            break
                    if not ob_zone['mitigated']:
                        bullish_obs.append(ob_zone)
                    break

    return bullish_obs[-2:], bearish_obs[-2:]

def find_candlestick_patterns(data):
    """Detects a curated list of famous candlestick patterns."""
    df = pd.DataFrame(data)

    # List of well-known patterns to look for
    famous_patterns = [
        "morningstar", "eveningstar",
        "hammer", "invertedhammer", "hangingman", "shootingstar",
        "engulfing"
    ]

    # Use the candlestick pattern detection function from pandas-ta for the specific list
    pattern_data = df.ta.cdl_pattern(name=famous_patterns)
    
    # Rename columns to be more descriptive and consistent
    pattern_data.columns = [col.replace('CDL_', '') for col in pattern_data.columns]

    patterns = []
    # Find all candles that indicated a pattern across the entire dataset
    for i in range(len(pattern_data)):
        row = pattern_data.iloc[i]
        candle = df.iloc[i]
        
        # Check for bullish patterns (value of 100)
        bullish_patterns = row[row == 100]
        for pattern_name in bullish_patterns.index:
            patterns.append({
                'name': f"B_{pattern_name.upper()}", # Shorten name for display
                'time': int(candle['time']),
                'position': 'below',
                'price': candle['low']
            })

        # Check for bearish patterns (value of -100)
        bearish_patterns = row[row == -100]
        for pattern_name in bearish_patterns.index:
            patterns.append({
                'name': f"S_{pattern_name.upper()}", # Shorten name for display
                'time': int(candle['time']),
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
                    sl = zone['low'] * 0.999  # Place SL slightly below the zone
                    risk = current_price - sl
                    # Target the next buy-side liquidity pool
                    buy_liq_prices = [p['price'] for p in analysis.get('buy_side_liquidity', []) if p['price'] > current_price]
                    tp_target = min(buy_liq_prices, default=None)
                    tp = tp_target if tp_target else current_price + (risk * risk_reward_ratio)
                    return {"action": "Buy", "entry": current_price, "sl": sl, "tp": tp, "reason": f"Uptrend, price retesting {zone_type.replace('_', ' ')}."}
        return {"action": "Neutral", "reason": "Uptrend, but not in a key support zone.", "entry": None, "sl": None, "tp": None}

    if market_structure == 'Downtrend':
        for zone_type in ['supply_zones', 'bearish_ob', 'bearish_fvg']:
            for zone in analysis.get(zone_type, []):
                if zone['low'] <= current_price <= zone['high']:
                    sl = zone['high'] * 1.001  # Place SL slightly above the zone
                    risk = sl - current_price
                    # Target the next sell-side liquidity pool
                    sell_liq_prices = [p['price'] for p in analysis.get('sell_side_liquidity', []) if p['price'] < current_price]
                    tp_target = max(sell_liq_prices, default=None)
                    tp = tp_target if tp_target else current_price - (risk * risk_reward_ratio)
                    return {"action": "Sell", "entry": current_price, "sl": sl, "tp": tp, "reason": f"Downtrend, price retesting {zone_type.replace('_', ' ')}."}
        return {"action": "Neutral", "reason": "Downtrend, but not in a key resistance zone.", "entry": None, "sl": None, "tp": None}

    return {"action": "Neutral", "reason": "Ranging market, no clear edge.", "entry": None, "sl": None, "tp": None}

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
        "levels_title": "Key Levels & Liquidity",
        "levels_body": [],
    }

    buy_liq = analysis.get('buy_side_liquidity', [])
    sell_liq = analysis.get('sell_side_liquidity', [])

    # Extract just the prices for the narrative text
    buy_liq_prices = [p['price'] for p in buy_liq]
    sell_liq_prices = [p['price'] for p in sell_liq]

    if buy_liq_prices:
        narrative['levels_body'].append(f"Buy-side liquidity is targeting the equal highs around {min(buy_liq_prices):.5f}.")
    else:
        narrative['levels_body'].append("No significant buy-side liquidity pools identified.")

    if sell_liq_prices:
        narrative['levels_body'].append(f"Sell-side liquidity is targeting the equal lows around {max(sell_liq_prices):.5f}.")
    else:
        narrative['levels_body'].append("No significant sell-side liquidity pools identified.")

    return narrative