"use client"; // This page needs to be a client component to use state and effects

import { TradingChart } from "@/components/TradingChart";
import { fetchForexDailyData, CandlestickData } from "@/lib/alphaVantage";
import { useEffect, useState } from "react";

export default function ChartsPage() {
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch EUR to USD data by default
    fetchForexDailyData('EUR', 'USD').then(data => {
      setChartData(data);
      setIsLoading(false);
    });
  }, []); // The empty array [] means this effect runs only once

  return (
    <main className="p-4">
      <h1 className="text-3xl font-bold mb-4">Trading Chart for EUR/USD</h1>
      {isLoading ? (
        <div className="flex justify-center items-center h-[500px]">
          <p>Loading chart...</p>
        </div>
      ) : (
        <TradingChart data={chartData} />
      )}
    </main>
  );
}