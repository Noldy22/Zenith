"use client";

import { TradingChart } from "@/components/TradingChart";
import SymbolSearch from "@/components/SymbolSearch";
import { CandlestickData } from "@/lib/alphaVantage"; // This interface can still be used
import { useEffect, useState } from "react";

const timeframes = {
  '1H': '60min',
  'Daily': 'Daily',
};

const forexSymbols = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
  'EURGBP', 'EURJPY', 'GBPJPY',
];

export default function ChartsPage() {
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSymbol, setActiveSymbol] = useState('EURUSD');
  const [activeTimeframe, setActiveTimeframe] = useState('Daily');

  useEffect(() => {
    setIsLoading(true);

    // First, get the MT5 credentials from localStorage.
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (!storedCreds) {
      alert('Please set your MT5 credentials in the Settings page first.');
      setIsLoading(false);
      return;
    }

    const credentials = JSON.parse(storedCreds);

    // ** THIS IS THE MODIFIED PART **
    // We now fetch data from your local Python backend.
    fetch('http://127.0.0.1:5000/api/get_chart_data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...credentials,
        symbol: activeSymbol,
        // We can add the timeframe to the request later
      }),
    })
    .then(response => {
      if (!response.ok) {
        // If the server response is not OK, we throw an error to be caught by the catch block
        return response.json().then(err => { throw new Error(err.error || 'Network response was not ok') });
      }
      return response.json();
    })
    .then(data => {
      setChartData(data);
      setIsLoading(false);
    })
    .catch(error => {
      console.error("Failed to fetch from backend:", error);
      setChartData([]); // Clear any old data
      setIsLoading(false);
    });

  }, [activeSymbol, activeTimeframe]);

  return (
    <main className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-3 items-start mb-4 gap-4">
        {/* Symbol Search Component */}
        <div className="w-full md:w-64">
          <SymbolSearch
            symbols={forexSymbols}
            onSymbolSelect={setActiveSymbol}
            initialSymbol={activeSymbol}
          />
        </div>

        {/* Chart Title */}
        <div className="text-center">
            <h1 className="text-3xl font-bold">Trading Chart for {activeSymbol}</h1>
        </div>

        {/* Timeframe Selector */}
        <div className="flex justify-end gap-2 p-1 bg-gray-800 rounded-md w-full">
          {Object.keys(timeframes).map((tf) => (
            <button
              key={tf}
              onClick={() => setActiveTimeframe(tf)}
              className={`px-3 py-1 text-sm rounded ${
                activeTimeframe === tf ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-[500px] bg-gray-900 rounded-md">
          <p className="text-gray-400">Loading chart data from local MT5...</p>
        </div>
      ) : chartData.length > 0 ? (
        <TradingChart data={chartData} />
      ) : (
        <div className="flex justify-center items-center h-[500px] bg-gray-900 rounded-md">
          <p className="text-red-400">Could not load data. Is your Python backend running and are your credentials correct?</p>
        </div>
      )}
    </main>
  );
}