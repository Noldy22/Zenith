"use client";

import { TradingChart } from "@/components/TradingChart";
import SymbolSearch from "@/components/SymbolSearch"; // <-- Import the new component
import { fetchForexDailyData, fetchForexIntradayData, CandlestickData } from "@/lib/alphaVantage";
import { useEffect, useState } from "react";

const timeframes = {
  '1H': '60min',
  'Daily': 'Daily',
};

// A curated list of symbols for our dropdown
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
    // This effect now runs automatically whenever activeSymbol or activeTimeframe changes
    setIsLoading(true);
    const fromSymbol = activeSymbol.substring(0, 3);
    const toSymbol = activeSymbol.substring(3, 6);

    let dataPromise;
    if (activeTimeframe === 'Daily') {
      dataPromise = fetchForexDailyData(fromSymbol, toSymbol);
    } else {
      const interval = timeframes[activeTimeframe as keyof typeof timeframes];
      dataPromise = fetchForexIntradayData(fromSymbol, toSymbol, interval);
    }

    dataPromise.then(data => {
      setChartData(data);
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
          <p className="text-gray-400">Loading chart data...</p>
        </div>
      ) : chartData.length > 0 ? (
        <TradingChart data={chartData} />
      ) : (
        <div className="flex justify-center items-center h-[500px] bg-gray-900 rounded-md">
          <p className="text-red-400">Could not load data. Check the symbol or API limit.</p>
        </div>
      )}
    </main>
  );
}