"use client"; // This page needs to be a client component to use the chart

import { TradingChart } from "@/components/TradingChart";

// Sample data for the candlestick chart
const initialData = [
  { open: 178.53, high: 179.35, low: 176.82, close: 179.23, time: 1642425300 },
  { open: 179.28, high: 180.12, low: 178.51, close: 179.97, time: 1642511700 },
  { open: 179.98, high: 181.66, low: 179.12, close: 180.45, time: 1642598100 },
  { open: 180.42, high: 182.34, low: 179.89, close: 181.9, time: 1642684500 },
  { open: 181.92, high: 183.08, low: 180.23, close: 182.8, time: 1642770900 },
];

export default function ChartsPage() {
  return (
    <main className="p-4">
      <h1 className="text-3xl font-bold mb-4">Trading Chart</h1>
      <TradingChart data={initialData} />
    </main>
  );
}