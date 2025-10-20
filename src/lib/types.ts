
import type { Time } from 'lightweight-charts';

export const timeframes = {
  'M1': 'M1', 'M5': 'M5', 'M15': 'M15', 'M30': 'M30', '1H': 'H1',
  '4H': 'H4', 'Daily': 'D1', 'Weekly': 'W1', 'Monthly': 'MN1'
};

export interface Zone { high: number; low: number; time: Time; }
export interface LiquidityPoint { time: Time; price: number; }
export interface Suggestion { action: 'Buy' | 'Sell' | 'Neutral'; entry: number | null; sl: number | null; tp: number | null; reason: string; }
export interface CandlestickPattern { name: string; time: Time; position: 'above' | 'below'; price: number; }
export interface Narrative {
  overview: string;
  structure_title: string;
  structure_body: string;
  levels_title: string;
  levels_body: string[];
}
export interface AnalysisResult {
  support: number[]; resistance: number[]; demand_zones: Zone[];
  supply_zones: Zone[]; bullish_ob: Zone[]; bearish_ob: Zone[];
  bullish_fvg: Zone[]; bearish_fvg: Zone[];
  buy_side_liquidity: LiquidityPoint[];
  sell_side_liquidity: LiquidityPoint[];
  candlestick_patterns: CandlestickPattern[]; suggestion: Suggestion;
  narrative: Narrative;
  confidence: number;
  predicted_success_rate?: string;
}

export interface Settings {
    trading_style: string;
    risk_per_trade: number;
    max_daily_loss: number;
    account_balance: number;
    auto_trading_enabled: boolean;
    notifications_enabled: boolean;
    min_confluence: number;
    pairs_to_trade: string[];
    mt5_credentials: {
        login: string;
        password: string;
        server: string;
        terminal_path: string;
    };
    breakeven_enabled: boolean;
    breakeven_pips: number;
    trailing_stop_enabled: boolean;
    trailing_stop_pips: number;
    proactive_close_enabled: boolean;
}
