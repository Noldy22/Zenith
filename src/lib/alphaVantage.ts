// src/lib/alphaVantage.ts

import type { UTCTimestamp, BusinessDay } from 'lightweight-charts';

// The data structure for a single candlestick.
export interface CandlestickData {
  time: UTCTimestamp | BusinessDay;
  open: number;
  high: number;
  low: number;
  close: number;
}

// The structure of the raw data from the Alpha Vantage API
interface ApiOhlcData {
  '1. open': string;
  '2. high': string;
  '3. low': string;
  '4. close': string;
}

export async function fetchForexDailyData(fromSymbol: string, toSymbol: string): Promise<CandlestickData[]> {
  const apiKey = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;
  const url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${fromSymbol}&to_symbol=${toSymbol}&outputsize=full&apikey=${apiKey}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    const timeSeries = data['Time Series FX (Daily)'];
    if (!timeSeries) {
      console.error("API Error (Forex Daily):", data['Note'] || 'No time series data found.');
      return [];
    }
    const formattedData = Object.entries(timeSeries).map(([date, values]) => {
      const ohlc = values as ApiOhlcData;
      const [year, month, day] = date.split('-').map(Number);
      return {
        time: { year, month, day },
        open: parseFloat(ohlc['1. open']),
        high: parseFloat(ohlc['2. high']),
        low: parseFloat(ohlc['3. low']),
        close: parseFloat(ohlc['4. close']),
      };
    });
    return formattedData.reverse();
  } catch (error) {
    console.error("Failed to fetch or process forex data:", error);
    return [];
  }
}

export async function fetchForexIntradayData(fromSymbol: string, toSymbol: string, interval: string): Promise<CandlestickData[]> {
  const apiKey = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;
  const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${fromSymbol}&to_symbol=${toSymbol}&interval=${interval}&outputsize=full&apikey=${apiKey}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    const timeSeriesKey = `Time Series FX (${interval})`;
    const timeSeries = data[timeSeriesKey];

    if (!timeSeries) {
      console.error("API Error (Forex Intraday):", data['Note'] || `No data for key ${timeSeriesKey}`);
      return [];
    }
    // THIS IS THE FIX: Use the 'ApiOhlcData' type here as well
    const formattedData = Object.entries(timeSeries).map(([date, values]) => {
      const ohlc = values as ApiOhlcData;
      return {
        time: (new Date(date.replace(" ", "T") + "Z").getTime() / 1000) as UTCTimestamp,
        open: parseFloat(ohlc['1. open']),
        high: parseFloat(ohlc['2. high']),
        low: parseFloat(ohlc['3. low']),
        close: parseFloat(ohlc['4. close']),
      };
    });
    return formattedData.reverse();
  } catch (error) {
    console.error("Failed to fetch or process forex intraday data:", error);
    return [];
  }
}