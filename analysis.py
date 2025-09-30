import pandas as pd
import numpy as np

def find_levels(data, window=5):
    """Finds support and resistance levels using pivot points."""
    df = pd.DataFrame(data)
    highs = df['high']
    lows = df['low']
    
    pivots = []
    # Identify all pivot highs and lows
    for i in range(window, len(df) - window):
        # Support (Pivot Low)
        is_low = all(lows[i] < lows[i - j] for j in range(1, window + 1)) and \
                 all(lows[i] < lows[i + j] for j in range(1, window + 1))
        if is_low:
            pivots.append({'type': 'low', 'price': lows[i], 'index': i})

        # Resistance (Pivot High)
        is_high = all(highs[i] > highs[i - j] for j in range(1, window + 1)) and \
                  all(highs[i] > highs[i + j] for j in range(1, window + 1))
        if is_high:
            pivots.append({'type': 'high', 'price': highs[i], 'index': i})
    
    # Sort pivots by index to get them in chronological order
    pivots.sort(key=lambda x: x['index'])
    
    support_levels = [p['price'] for p in pivots if p['type'] == 'low']
    resistance_levels = [p['price'] for p in pivots if p['type'] == 'high']

    # Return the 3 most recent unique levels, and all pivots for other functions
    return sorted(list(set(support_levels)), reverse=True)[:3], \
           sorted(list(set(resistance_levels)), reverse=True)[:3], \
           pivots

def determine_market_structure(pivots, lookback=10):
    """
    Determines the market structure (trend) by analyzing recent swing highs and lows.
    Returns 'Uptrend', 'Downtrend', or 'Ranging'.
    """
    swing_highs = [p for p in pivots if p['type'] == 'high'][-lookback:]
    swing_lows = [p for p in pivots if p['type'] == 'low'][-lookback:]

    if len(swing_highs) < 2 or len(swing_lows) < 2:
        return 'Ranging', "Not enough swing points to determine a clear trend."

    last_high = swing_highs[-1]['price']
    prev_high = swing_highs[-2]['price']
    last_low = swing_lows[-1]['price']
    prev_low = swing_lows[-2]['price']

    # Check for Uptrend (Higher Highs and Higher Lows)
    if last_high > prev_high and last_low > prev_low:
        return 'Uptrend', f"The market is in an uptrend, forming higher highs (HH) and higher lows (HL). The last swing high at {last_high:.5f} surpassed the previous one at {prev_high:.5f}."
    
    # Check for Downtrend (Lower Highs and Lower Lows)
    if last_high < prev_high and last_low < prev_low:
        return 'Downtrend', f"The market is in a downtrend, forming lower highs (LH) and lower lows (LL). The last swing low at {last_low:.5f} broke below the previous one at {prev_low:.5f}."

    # Otherwise, it's ranging or consolidating
    return 'Ranging', "The market is currently in a consolidation or ranging phase, with no clear directional bias from recent swing points."


def find_sd_zones(data, lookback=50, threshold_multiplier=1.5):
    """Finds Supply and Demand zones."""
    df = pd.DataFrame(data)
    df['range'] = df['high'] - df['low']
    avg_range = df['range'].tail(lookback).mean()
    
    supply_zones = []
    demand_zones = []

    for i in range(1, len(df) - 1):
        base_candle = df.iloc[i]
        explosive_candle = df.iloc[i+1]

        is_base = base_candle['range'] < avg_range
        is_explosive = explosive_candle['range'] > avg_range * threshold_multiplier

        if is_base and is_explosive:
            zone_data = {
                'high': base_candle['high'], 
                'low': base_candle['low'],
                'time': base_candle['time']
            }
            if explosive_candle['close'] > explosive_candle['open']:
                demand_zones.append(zone_data)
            elif explosive_candle['close'] < explosive_candle['open']:
                supply_zones.append(zone_data)

    unique_supply = list({(z['high'], z['low']): z for z in reversed(supply_zones)}.values())
    unique_demand = list({(z['high'], z['low']): z for z in reversed(demand_zones)}.values())
    
    return unique_demand[:2], unique_supply[:2]


def find_order_blocks(data, pivots):
    """Identifies order blocks based on breaks of market structure."""
    df = pd.DataFrame(data)
    bullish_ob = []
    bearish_ob = []
    
    swing_highs = [p for p in pivots if p['type'] == 'high']
    swing_lows = [p for p in pivots if p['type'] == 'low']

    # Find Bearish Order Blocks (last up-candle before a down-move that breaks a low)
    for i in range(len(swing_lows) - 1):
        prev_low = swing_lows[i]
        current_low = swing_lows[i+1]
        
        if current_low['price'] < prev_low['price']: # Break of structure
            high_point_index = df['high'].iloc[prev_low['index']:current_low['index']].idxmax()
            
            for j in range(high_point_index, prev_low['index'], -1):
                if df['close'].iloc[j] > df['open'].iloc[j]: # Find last up candle
                    ob_candle = df.iloc[j]
                    bearish_ob.append({'high': ob_candle['high'], 'low': ob_candle['low'], 'time': ob_candle['time']})
                    break

    # Find Bullish Order Blocks (last down-candle before an up-move that breaks a high)
    for i in range(len(swing_highs) - 1):
        prev_high = swing_highs[i]
        current_high = swing_highs[i+1]
        
        if current_high['price'] > prev_high['price']: # Break of structure
            low_point_index = df['low'].iloc[prev_high['index']:current_high['index']].idxmin()
            
            for j in range(low_point_index, prev_high['index'], -1):
                if df['close'].iloc[j] < df['open'].iloc[j]: # Find last down candle
                    ob_candle = df.iloc[j]
                    bullish_ob.append({'high': ob_candle['high'], 'low': ob_candle['low'], 'time': ob_candle['time']})
                    break

    unique_bullish = list({(z['high'], z['low']): z for z in reversed(bullish_ob)}.values())
    unique_bearish = list({(z['high'], z['low']): z for z in reversed(bearish_ob)}.values())
    
    return unique_bullish[:2], unique_bearish[:2]
    
def find_fvgs(data, lookback=50):
    """Identifies Fair Value Gaps (FVGs) or imbalances."""
    df = pd.DataFrame(data)
    bullish_fvg = []
    bearish_fvg = []

    for i in range(2, len(df) - 1):
        c1, c2, c3 = df.iloc[i-2], df.iloc[i-1], df.iloc[i]
        
        # Bullish FVG (gap between candle 1's high and candle 3's low)
        if c1['high'] < c3['low']:
            bullish_fvg.append({'high': c3['low'], 'low': c1['high'], 'time': c2['time']})
            
        # Bearish FVG (gap between candle 1's low and candle 3's high)
        if c1['low'] > c3['high']:
            bearish_fvg.append({'high': c1['low'], 'low': c3['high'], 'time': c2['time']})

    return bullish_fvg[-2:], bearish_fvg[-2:] # Return the 2 most recent of each

def find_candlestick_patterns(data):
    """Detects various candlestick patterns."""
    df = pd.DataFrame(data)
    patterns = []
    
    for i in range(2, len(df)):
        c1, c2, c3 = df.iloc[i-2], df.iloc[i-1], df.iloc[i]
        
        # --- Bullish Engulfing ---
        if c2['close'] < c2['open'] and c3['close'] > c3['open'] and \
           c3['close'] > c2['open'] and c3['open'] < c2['close']:
            patterns.append({'name': 'Bullish Engulfing', 'time': c3['time'], 'position': 'below', 'price': c3['low']})

        # --- Bearish Engulfing ---
        if c2['close'] > c2['open'] and c3['close'] < c3['open'] and \
           c3['close'] < c2['open'] and c3['open'] > c2['close']:
            patterns.append({'name': 'Bearish Engulfing', 'time': c3['time'], 'position': 'above', 'price': c3['high']})
            
        # --- Morning Star ---
        if c1['close'] < c1['open'] and \
           abs(c2['close'] - c2['open']) < (c2['high'] - c2['low']) * 0.2 and \
           c3['close'] > c3['open'] and c3['close'] > c1['open']:
            patterns.append({'name': 'Morning Star', 'time': c3['time'], 'position': 'below', 'price': c3['low']})
            
        # --- Shooting Star ---
        if c3['high'] - c3['close'] > 2 * abs(c3['open'] - c3['close']) and \
           c3['high'] - c3['open'] > 2 * abs(c3['open'] - c3['close']) and \
           c3['close'] > c2['high']: # Occurs after an uptrend
            patterns.append({'name': 'Shooting Star', 'time': c3['time'], 'position': 'above', 'price': c3['high']})

    return patterns[-5:] # Return last 5 found patterns

def get_trade_suggestion(analysis, risk_reward_ratio=2.0):
    """
    Generates a structured trade suggestion based on market structure and zones of interest.
    """
    current_price = analysis['current_price']
    market_structure = analysis['market_structure'][0]

    # --- UPTREND LOGIC: Prioritize buys on pullbacks ---
    if market_structure == 'Uptrend':
        # Check for entries in Demand Zones, Bullish OBs, or Bullish FVGs
        for zone_type in ['demand_zones', 'bullish_ob', 'bullish_fvg']:
            for zone in analysis.get(zone_type, []):
                if zone['low'] <= current_price <= zone['high']:
                    risk = current_price - zone['low']
                    return {
                        "action": "Buy", "entry": current_price, "sl": zone['low'],
                        "tp": current_price + (risk * risk_reward_ratio),
                        "reason": f"Uptrend confirmed. Price is retesting a key {zone_type.replace('_', ' ')} between {zone['low']:.5f} and {zone['high']:.5f}, presenting a potential buying opportunity."
                    }
        return {"action": "Neutral", "reason": "Market is in an uptrend, but price is not at a significant support level (Demand, OB, FVG). Waiting for a pullback."}

    # --- DOWNTREND LOGIC: Prioritize sells on rallies ---
    if market_structure == 'Downtrend':
        # Check for entries in Supply Zones, Bearish OBs, or Bearish FVGs
        for zone_type in ['supply_zones', 'bearish_ob', 'bearish_fvg']:
            for zone in analysis.get(zone_type, []):
                if zone['low'] <= current_price <= zone['high']:
                    risk = zone['high'] - current_price
                    return {
                        "action": "Sell", "entry": current_price, "sl": zone['high'],
                        "tp": current_price - (risk * risk_reward_ratio),
                        "reason": f"Downtrend confirmed. Price is rallying into a key {zone_type.replace('_', ' ')} between {zone['low']:.5f} and {zone['high']:.5f}, presenting a potential selling opportunity."
                    }
        return {"action": "Neutral", "reason": "Market is in a downtrend, but price is not at a significant resistance level (Supply, OB, FVG). Waiting for a rally."}

    # --- RANGING LOGIC: Trade the edges of the range ---
    if market_structure == 'Ranging':
        # Look for sells at supply
        for zone in analysis.get('supply_zones', []):
            if zone['low'] <= current_price <= zone['high']:
                risk = zone['high'] - current_price
                return { "action": "Sell", "entry": current_price, "sl": zone['high'], "tp": current_price - (risk * risk_reward_ratio), "reason": "Ranging market. Price is at a supply zone, potentially the top of the range." }
        # Look for buys at demand
        for zone in analysis.get('demand_zones', []):
            if zone['low'] <= current_price <= zone['high']:
                risk = current_price - zone['low']
                return { "action": "Buy", "entry": current_price, "sl": zone['low'], "tp": current_price + (risk * risk_reward_ratio), "reason": "Ranging market. Price is at a demand zone, potentially the bottom of the range." }

    return {"action": "Neutral", "reason": "Market conditions are neutral or ranging. No high-probability setup detected at the current price."}


def calculate_confidence(analysis, suggestion):
    """Calculates a confidence score as a percentage based on confluence."""
    if suggestion['action'] == 'Neutral':
        return 30

    score = 50  # Base confidence for any valid trade setup
    entry_price = suggestion.get('entry', 0)
    
    if suggestion['action'] == 'Buy':
        # Confluence with multiple zone types
        if any(z['low'] <= entry_price <= z['high'] for z in analysis.get('bullish_ob', [])): score += 15
        if any(z['low'] <= entry_price <= z['high'] for z in analysis.get('bullish_fvg', [])): score += 15
        # Confluence with Support level
        if any(abs(level - entry_price) / entry_price < 0.001 for level in analysis.get('support', [])): score += 10
        # Confluence with Bullish candlestick patterns
        if any(p['name'] in ['Bullish Engulfing', 'Morning Star'] for p in analysis.get('candlestick_patterns', [])): score += 10

    elif suggestion['action'] == 'Sell':
        # Confluence with multiple zone types
        if any(z['low'] <= entry_price <= z['high'] for z in analysis.get('bearish_ob', [])): score += 15
        if any(z['low'] <= entry_price <= z['high'] for z in analysis.get('bearish_fvg', [])): score += 15
        # Confluence with Resistance level
        if any(abs(level - entry_price) / entry_price < 0.001 for level in analysis.get('resistance', [])): score += 10
        # Confluence with Bearish candlestick patterns
        if any(p['name'] in ['Bearish Engulfing', 'Shooting Star'] for p in analysis.get('candlestick_patterns', [])): score += 10
    
    return min(score, 95)

def generate_market_narrative(analysis):
    """Creates a structured dictionary explaining the market."""
    symbol = analysis.get('symbol', 'the asset')
    current_price = analysis.get('current_price', 0)
    structure, structure_reason = analysis.get('market_structure', ('Ranging', ''))
    
    # Find closest zones of interest above and below
    potential_resistances = analysis.get('resistance', []) + [z['high'] for z in analysis.get('supply_zones', [])] + [z['high'] for z in analysis.get('bearish_ob', [])] + [z['high'] for z in analysis.get('bearish_fvg', [])]
    potential_supports = analysis.get('support', []) + [z['low'] for z in analysis.get('demand_zones', [])] + [z['low'] for z in analysis.get('bullish_ob', [])] + [z['low'] for z in analysis.get('bullish_fvg', [])]
    
    closest_res = min([r for r in potential_resistances if r > current_price], default=None)
    closest_sup = max([s for s in potential_supports if s < current_price], default=None)

    # Build the structured narrative
    narrative = {
        "overview": f"Market Overview for {symbol} at {current_price:.5f}",
        "structure_title": "Structure",
        "structure_body": structure_reason,
        "levels_title": "Key Levels & Zones",
        "levels_body": [],
        "prediction_title": "AI Prediction & Reasoning",
        "prediction_body": ""
    }

    if closest_res:
        narrative["levels_body"].append(f"Immediate resistance is identified around {closest_res:.5f}. This area may act as a ceiling where selling pressure could increase.")
    if closest_sup:
        narrative["levels_body"].append(f"Immediate support is located near {closest_sup:.5f}. This level could act as a floor where buying pressure might step in.")

    # Prediction based on structure
    if structure == 'Uptrend':
        prediction = "Given the current uptrend, the price has recently come from a lower point, establishing upward momentum. The AI predicts that the price is likely to continue its upward trajectory. "
        if closest_sup:
            prediction += f"We are currently observing a pullback. The price may be heading towards the support level at {closest_sup:.5f} to retest it. This area, potentially a demand zone or an FVG, could be where buyers regain control to push the price to new highs."
        else:
            prediction += "The price is in a strong upward phase with no immediate support below, suggesting buyers are firmly in control."
        narrative["prediction_body"] = prediction

    elif structure == 'Downtrend':
        prediction = f"With a confirmed downtrend, the price has been declining from a higher point. The AI predicts that the price is likely to continue its downward movement. "
        if closest_res:
            prediction += f"The market is currently in a pullback (rally) phase. The price seems to be heading towards the resistance level at {closest_res:.5f}. This could be a retest of a supply zone or a bearish order block, where sellers might overpower buyers to continue the downtrend."
        else:
            prediction += "The price is in a strong downward phase with no immediate resistance above, suggesting sellers are dominating."
        narrative["prediction_body"] = prediction
    
    else: # Ranging
        narrative["prediction_body"] = "The price is moving sideways, indicating a balance between buyers and sellers. The AI predicts the price will likely continue to trade between the key support and resistance levels. A breakout above resistance or below support would be needed to establish a new trend."
         
    return narrative