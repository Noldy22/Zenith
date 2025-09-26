// src/lib/alphaVantage.ts

export interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ... (The fetchStockDailyData function remains the same)
export async function fetchStockDailyData(symbol: string): Promise<CandlestickData[]> {
  // ...
  return []; // Collapsed for brevity
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
    const formattedData = Object.entries(timeSeries).map(([date, values]: [string, any]) => ({
      time: new Date(date).getTime() / 1000,
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
    }));
    return formattedData.reverse();
  } catch (error) {
    console.error("Failed to fetch or process forex data:", error);
    return [];
  }
}

/**
 * NEW: Fetches and formats intraday time series data for FOREX from Alpha Vantage.
 * @param fromSymbol The base currency (e.g., 'EUR').
 * @param toSymbol The quote currency (e.g., 'USD').
 * @param interval The timeframe interval (e.g., '60min').
 * @returns A promise that resolves to an array of candlestick data.
 */
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
    const formattedData = Object.entries(timeSeries).map(([date, values]: [string, any]) => ({
      time: new Date(date.replace(" ", "T") + "Z").getTime() / 1000, // Adjust for UTC
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
    }));
    return formattedData.reverse();
  } catch (error) {
    console.error("Failed to fetch or process forex intraday data:", error);
    return [];
  }
}