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
    """Generates a structured trade suggestion with Entry, SL, and TP."""
    suggestion = {"action": "Neutral", "entry": None, "sl": None, "tp": None, "reason": "Price is between zones"}
    
    if demand_zones:
        first_demand = demand_zones[0]
        if first_demand['low'] <= current_price <= first_demand['high']:
            risk = first_demand['high'] - first_demand['low']
            suggestion = {
                "action": "Buy",
                "entry": first_demand['high'],
                "sl": first_demand['low'],
                "tp": first_demand['high'] + (risk * risk_reward_ratio),
                "reason": "Price in Demand Zone"
            }
            return suggestion

    if supply_zones:
        first_supply = supply_zones[0]
        if first_supply['low'] <= current_price <= first_supply['high']:
            risk = first_supply['high'] - first_supply['low']
            suggestion = {
                "action": "Sell",
                "entry": first_supply['low'],
                "sl": first_supply['high'],
                "tp": first_supply['low'] - (risk * risk_reward_ratio),
                "reason": "Price in Supply Zone"
            }
            return suggestion
            
    return suggestion

def calculate_confidence(analysis):
    """Calculates a confidence score based on confluence of analysis."""
    score = 0
    if analysis.get("support") or analysis.get("resistance"):
        score += 1
    if analysis.get("demand_zones"):
        score += 1
    if analysis.get("supply_zones"):
        score += 1
    if analysis.get("bullish_ob") or analysis.get("bearish_ob"):
        score += 2 

    if score >= 4:
        return "High"
    if score >= 2:
        return "Medium"
    return "Low"