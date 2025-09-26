"use client";

import { TradingChart } from "@/components/TradingChart";
import { fetchChartDataFMP, CandlestickData } from "@/lib/fmpApi"; // <-- Import from our new file
import { useEffect, useState } from "react";

// Updated timeframes for the FMP API
const timeframes = {
  '1H': '1hour',
  '4H': '4hour',
  'Daily': '1day',
};

export default function ChartsPage() {
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [symbol, setSymbol] = useState('EURUSD'); // Simpler state for the symbol
  const [activeTimeframe, setActiveTimeframe] = useState('Daily');

  useEffect(() => {
    setIsLoading(true);
    const interval = timeframes[activeTimeframe as keyof typeof timeframes];
    
    fetchChartDataFMP(symbol, interval).then(data => {
      setChartData(data);
      setIsLoading(false);
    });

  }, [symbol, activeTimeframe]); // Re-fetch when symbol or timeframe changes

  return (
    <main className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Trading Chart for {symbol}</h1>
        <div className="flex gap-2 p-1 bg-gray-800 rounded-md">
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
          <p className="text-gray-400">Loading chart data...</p>
        </div>
      ) : chartData.length > 0 ? (
        <TradingChart data={chartData} />
      ) : (
        <div className="flex justify-center items-center h-[500px] bg-gray-900 rounded-md">
          <p className="text-red-400">Could not load data for {symbol}.</p>
        </div>
      )}
    </main>
  );
}