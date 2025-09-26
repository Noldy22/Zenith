// src/lib/alphaVantage.ts

// Defines the structure of a single candlestick data point
export interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Fetches and formats daily time series data for STOCKS from Alpha Vantage.
 * @param symbol The stock symbol to fetch data for (e.g., 'IBM').
 * @returns A promise that resolves to an array of candlestick data.
 */
export async function fetchStockDailyData(symbol: string): Promise<CandlestickData[]> {
  const apiKey = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    const timeSeries = data['Time Series (Daily)'];

    if (!timeSeries) {
      console.error("API Error or limit reached:", data['Note'] || 'No time series data found.');
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
    console.error("Failed to fetch or process stock data:", error);
    return [];
  }
}

/**
 * Fetches and formats daily time series data for FOREX from Alpha Vantage.
 * @param fromSymbol The base currency (e.g., 'EUR').
 * @param toSymbol The quote currency (e.g., 'USD').
 * @returns A promise that resolves to an array of candlestick data.
 */
export async function fetchForexDailyData(fromSymbol: string, toSymbol: string): Promise<CandlestickData[]> {
  const apiKey = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;
  const url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${fromSymbol}&to_symbol=${toSymbol}&apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    const timeSeries = data['Time Series FX (Daily)']; // Note the different key here

    if (!timeSeries) {
      console.error("API Error or limit reached:", data['Note'] || 'No time series data found.');
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