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
        
        if current_low['price'] < prev_low['price']:
            high_point_index = df['high'].iloc[prev_low['index']:current_low['index']].idxmax()
            
            for j in range(high_point_index, prev_low['index'], -1):
                if df['close'].iloc[j] > df['open'].iloc[j]:
                    ob_candle = df.iloc[j]
                    bearish_ob.append({'high': ob_candle['high'], 'low': ob_candle['low'], 'time': ob_candle['time']})
                    break

    # Find Bullish Order Blocks (last down-candle before an up-move that breaks a high)
    for i in range(len(swing_highs) - 1):
        prev_high = swing_highs[i]
        current_high = swing_highs[i+1]
        
        if current_high['price'] > prev_high['price']:
            low_point_index = df['low'].iloc[prev_high['index']:current_high['index']].idxmin()
            
            for j in range(low_point_index, prev_high['index'], -1):
                if df['close'].iloc[j] < df['open'].iloc[j]:
                    ob_candle = df.iloc[j]
                    bullish_ob.append({'high': ob_candle['high'], 'low': ob_candle['low'], 'time': ob_candle['time']})
                    break

    unique_bullish = list({(z['high'], z['low']): z for z in reversed(bullish_ob)}.values())
    unique_bearish = list({(z['high'], z['low']): z for z in reversed(bearish_ob)}.values())
    
    return unique_bullish[:2], unique_bearish[:2]

def get_trade_suggestion(current_price, demand_zones, supply_zones, risk_reward_ratio=2.0):
    """Generates a structured trade suggestion with improved neutral guidance."""
    # Check for active Buy setup
    if demand_zones:
        for zone in demand_zones:
            if zone['low'] <= current_price <= zone['high']:
                risk = zone['high'] - zone['low']
                return {
                    "action": "Buy",
                    "entry": zone['high'], "sl": zone['low'],
                    "tp": zone['high'] + (risk * risk_reward_ratio),
                    "reason": f"Price has entered a key Demand Zone between {zone['low']:.5f} and {zone['high']:.5f}."
                }

    # Check for active Sell setup
    if supply_zones:
        for zone in supply_zones:
            if zone['low'] <= current_price <= zone['high']:
                risk = zone['high'] - zone['low']
                return {
                    "action": "Sell",
                    "entry": zone['low'], "sl": zone['high'],
                    "tp": zone['low'] - (risk * risk_reward_ratio),
                    "reason": f"Price has entered a key Supply Zone between {zone['low']:.5f} and {zone['high']:.5f}."
                }

    # Improved Neutral Suggestion Logic
    closest_demand = min(demand_zones, key=lambda z: abs(z['low'] - current_price)) if demand_zones else None
    closest_supply = min(supply_zones, key=lambda z: abs(z['high'] - current_price)) if supply_zones else None
    
    reason = "Market conditions are neutral. No high-probability setup detected at the current price."
    if closest_demand and current_price > closest_demand['high']:
        if closest_supply and current_price < closest_supply['low']:
             reason = (f"Price is trading between supply ({closest_supply['high']:.5f}) and demand "
                       f"({closest_demand['low']:.5f}). Wait for a test of these boundaries before considering a trade.")
        else:
            reason = f"The nearest area of interest is the demand zone around {closest_demand['low']:.5f}. A pullback to this level could present a buying opportunity."
    elif closest_supply and current_price < closest_supply['low']:
        reason = f"The nearest area of interest is the supply zone around {closest_supply['high']:.5f}. A rally towards this level could present a selling opportunity."

    return {"action": "Neutral", "entry": None, "sl": None, "tp": None, "reason": reason}


def calculate_confidence(analysis, suggestion):
    """Calculates a confidence score as a percentage based on confluence."""
    if suggestion['action'] == 'Neutral':
        return 30

    score = 50  # Base confidence for any valid trade setup
    
    if suggestion['action'] == 'Buy' and suggestion['entry'] is not None:
        entry_price = suggestion['entry']
        # Confluence with Bullish Order Block
        for ob in analysis.get('bullish_ob', []):
            if abs(ob['high'] - entry_price) / entry_price < 0.001: 
                score += 25
        # Confluence with Support level
        for level in analysis.get('support', []):
            if abs(level - entry_price) / entry_price < 0.001:
                score += 15

    elif suggestion['action'] == 'Sell' and suggestion['entry'] is not None:
        entry_price = suggestion['entry']
        # Confluence with Bearish Order Block
        for ob in analysis.get('bearish_ob', []):
            if abs(ob['low'] - entry_price) / entry_price < 0.001:
                score += 25
        # Confluence with Resistance level
        for level in analysis.get('resistance', []):
            if abs(level - entry_price) / entry_price < 0.001:
                score += 15
    
    return min(score, 95) # Cap at 95% to manage expectations

def generate_market_narrative(current_price, analysis):
    """Creates a human-readable explanation of the market structure."""
    symbol = analysis.get('symbol', 'the asset')
    narrative = f"The current price of {symbol} is {current_price:.5f}. "
    
    s_levels = analysis.get('support', [])
    r_levels = analysis.get('resistance', [])
    d_zones = analysis.get('demand_zones', [])
    s_zones = analysis.get('supply_zones', [])
    
    # Find the closest significant level/zone above and below the current price
    potential_resistances = r_levels + [z['high'] for z in s_zones]
    potential_supports = s_levels + [z['low'] for z in d_zones]
    
    closest_res = min([r for r in potential_resistances if r > current_price], default=None)
    closest_sup = max([s for s in potential_supports if s < current_price], default=None)

    if closest_res:
        narrative += f"We see immediate resistance around {closest_res:.5f}. A break above this level could signal further upward momentum. "
    else:
        narrative += "There is no significant overhead resistance nearby, suggesting potential for upward movement. "
        
    if closest_sup:
        narrative += f"On the downside, key support is located near {closest_sup:.5f}. If this level holds, it could act as a floor for the price. "
    else:
        narrative += "There is no clear immediate support, which could indicate volatility if the price starts to fall. "
        
    if analysis.get('bullish_ob') and analysis.get('bearish_ob'):
         narrative += "Both bullish and bearish order blocks are present, indicating institutional interest on both sides of the market."
    elif analysis.get('bullish_ob'):
         narrative += "The presence of bullish order blocks suggests that buyers have previously shown strength at lower levels."
    elif analysis.get('bearish_ob'):
         narrative += "Bearish order blocks above the current price suggest areas where sellers might re-emerge."

    return narrative