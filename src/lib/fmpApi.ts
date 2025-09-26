// src/lib/fmpApi.ts

export interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Fetches and formats historical data for a given symbol and timeframe from FMP.
 * @param symbol The instrument symbol (e.g., 'EURUSD').
 * @param timeframe The timeframe (e.g., '1hour', '4hour', '1day').
 * @returns A promise that resolves to an array of candlestick data.
 */
export async function fetchChartDataFMP(symbol: string, timeframe: string): Promise<CandlestickData[]> {
  const apiKey = process.env.NEXT_PUBLIC_FMP_API_KEY;
  // Note: The FMP URL is much simpler than Alpha Vantage's
  const url = `https://financialmodelingprep.com/api/v3/historical-chart/${timeframe}/${symbol}?apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!Array.isArray(data)) {
      console.error("FMP API Error:", data.error || 'Invalid data format received.');
      return [];
    }

    // FMP data is already an array and uses standard key names, so formatting is easier.
    const formattedData = data.map((item: any) => ({
      time: new Date(item.date).getTime() / 1000,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    }));

    // Data is oldest-first, which is what the chart needs, so no reverse() is necessary.
    return formattedData;

  } catch (error) {
    console.error("Failed to fetch or process FMP data:", error);
    return [];
  }
}