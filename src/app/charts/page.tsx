"use client";

import { TradingChart } from "@/components/TradingChart";
import SymbolSearch from "@/components/SymbolSearch";
import { CandlestickData } from "@/lib/alphaVantage";
import { useEffect, useState, useRef, useCallback } from "react";
import type { ISeriesApi } from "lightweight-charts";

const timeframes = {
  'M1': 'M1',
  'M5': 'M5',
  'M15': 'M15',
  'M30': 'M30',
  '1H': 'H1',
  '4H': 'H4',
  'Daily': 'D1',
  'Weekly': 'W1',
  'Monthly': 'MN1'
};

const forexSymbols = [
  'EURUSDm', 'GBPUSDm', 'USDJPYm', 'USDCHFm', 'AUDUSDm', 'USDCADm', 'NZUSDm',
  'EURGBPm', 'EURJPYm', 'GBPJPYm',
];

export default function ChartsPage() {
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSymbol, setActiveSymbol] = useState('EURUSDm');
  const [activeTimeframe, setActiveTimeframe] = useState('Daily');
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false);
  const timeframeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (timeframeDropdownRef.current && !timeframeDropdownRef.current.contains(event.target as Node)) {
        setIsTimeframeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    const storedCreds = localStorage.getItem('mt5_credentials');
    if (!storedCreds) {
      alert('Please set your MT5 credentials in the Settings page first.');
      setIsLoading(false);
      return;
    }
    const credentials = JSON.parse(storedCreds);
    const timeframeValue = timeframes[activeTimeframe as keyof typeof timeframes];

    fetch('http://127.0.0.1:5000/api/get_chart_data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...credentials, symbol: activeSymbol, timeframe: timeframeValue }),
    })
    .then(res => res.ok ? res.json() : res.json().then(err => Promise.reject(err)))
    .then(data => {
      setChartData(data);
      setIsLoading(false);
    })
    .catch(error => {
      console.error("Failed to fetch from backend:", error);
      setChartData([]);
      setIsLoading(false);
    });
  }, [activeSymbol, activeTimeframe]);

  useEffect(() => {
    if (!seriesRef.current || chartData.length === 0) return;

    const interval = setInterval(() => {
      const storedCreds = localStorage.getItem('mt5_credentials');
      if (!storedCreds) return;
      const credentials = JSON.parse(storedCreds);
      const timeframeValue = timeframes[activeTimeframe as keyof typeof timeframes];
      fetch('http://127.0.0.1:5000/api/get_latest_bar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, symbol: activeSymbol, timeframe: timeframeValue }),
      })
      .then(res => res.ok ? res.json() : null)
      .then(latestBar => {
        if (latestBar && seriesRef.current) {
          seriesRef.current.update(latestBar);
        }
      })
      .catch(error => console.error("Polling error:", error));
    // --- UPDATE INTERVAL CHANGED TO 1 SECOND ---
    }, 1000); 

    return () => clearInterval(interval);
  }, [chartData, activeSymbol, activeTimeframe]);

  const handleChartReady = useCallback((series: ISeriesApi<"Candlestick">) => {
    seriesRef.current = series;
  }, []);

  return (
    <main className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 items-center mb-4 gap-4">
            <div className="w-full md:w-64">
              <SymbolSearch
                symbols={forexSymbols}
                onSymbolSelect={setActiveSymbol}
                initialSymbol={activeSymbol}
              />
            </div>
            <div className="flex justify-end">
              <div className="relative" ref={timeframeDropdownRef}>
                <button
                  onClick={() => setIsTimeframeOpen(!isTimeframeOpen)}
                  className="px-4 py-2 text-sm rounded bg-blue-600 text-white w-24"
                >
                  {activeTimeframe}
                </button>
                {isTimeframeOpen && (
                  <div className="absolute top-full right-0 mt-1 w-24 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-20">
                    {Object.keys(timeframes).map((tfKey) => (
                      <button
                        key={tfKey}
                        onClick={() => {
                          setActiveTimeframe(tfKey);
                          setIsTimeframeOpen(false);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                      >
                        {tfKey}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="text-center mb-4">
            <h1 className="text-3xl font-bold">Trading Chart for {activeSymbol}</h1>
          </div>
          
          {/* --- SIMPLIFIED CHART CONTAINER --- */}
          <div className="relative rounded-md overflow-hidden h-[450px]">
            {isLoading ? (
              <div className="flex justify-center items-center h-full"><p className="text-gray-400">Loading chart data...</p></div>
            ) : chartData.length > 0 ? (
              <TradingChart data={chartData} onChartReady={handleChartReady} />
            ) : (
              <div className="flex justify-center items-center h-full"><p className="text-red-400">Could not load data.</p></div>
            )}
          </div>
        </div>

        <div className="md:col-span-1 bg-gray-800 rounded-md p-4 min-h-[600px]">
          <h2 className="text-xl font-bold text-white">Analysis & Insights</h2>
          <p className="text-gray-400 mt-2">AI analysis panel will be here.</p>
        </div>
      </div>
    </main>
  );
}