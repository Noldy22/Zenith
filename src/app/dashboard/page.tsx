"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface AccountInfo {
  balance: number;
  equity: number;
  profit: number;
}

interface Position {
  ticket: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  price_open: number;
  profit: number;
}

interface Deal {
    ticket: number;
    symbol: string;
    type: 'BUY' | 'SELL';
    volume: number;
    price: number;
    profit: number;
    time: number;
}

export default function DashboardPage() {
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const storedCreds = localStorage.getItem('mt5_credentials');
      if (!storedCreds) {
        setIsConnected(false);
        setIsLoading(false);
        return;
      }
      
      setIsConnected(true);
      try {
        const credentials = JSON.parse(storedCreds);
        
        // Create promises for all API calls
        const accountPromise = fetch('http://127.0.0.1:5000/api/get_account_info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        });
        const positionsPromise = fetch('http://127.0.0.1:5000/api/get_open_positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        });
        const historyPromise = fetch('http://127.0.0.1:5000/api/get_history_deals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
        });

        // Wait for all promises to resolve
        const [accountResponse, positionsResponse, historyResponse] = await Promise.all([accountPromise, positionsPromise, historyPromise]);

        if (accountResponse.ok) setAccountInfo(await accountResponse.json());
        if (positionsResponse.ok) setPositions(await positionsResponse.json());
        if (historyResponse.ok) setTradeHistory(await historyResponse.json());

        if (!accountResponse.ok || !positionsResponse.ok || !historyResponse.ok) {
            throw new Error('One or more API calls failed');
        }

      } catch (error) {
        console.error("Error fetching data:", error);
        setIsConnected(false);
        setAccountInfo(null);
        setPositions([]);
        setTradeHistory([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData(); // Initial fetch
    const interval = setInterval(fetchData, 5000); // Poll every 5 seconds

    return () => clearInterval(interval); // Cleanup on component unmount
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };
  
  const getProfitColor = (profit: number) => {
    if (profit > 0) return 'text-green-400';
    if (profit < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const formatTimestamp = (timestamp: number) => {
      return new Date(timestamp * 1000).toLocaleString();
  }

  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 mb-8">Dashboard</h1>
      
      {!isConnected ? (
        <div className="bg-secondary p-8 rounded-lg shadow-lg text-center">
          <h2 className="text-2xl font-semibold mb-4">Not Connected</h2>
          <p className="text-gray-400 mb-6">Please connect your MT5 account on the Charts page to see your live data.</p>
          <Link href="/charts" className="px-6 py-2 bg-primary text-background font-bold rounded-lg hover:bg-yellow-600 transition-colors">
            Go to Charts
          </Link>
        </div>
      ) : isLoading ? (
        <div className="bg-secondary p-6 rounded-lg shadow-lg">
          <p className="text-center text-gray-400">Loading Account Data...</p>
        </div>
      ) : (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Account Summary */}
                <div className="bg-secondary p-6 rounded-lg shadow-lg lg:col-span-1">
                    <h2 className="text-2xl font-semibold mb-4">Account Summary</h2>
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-gray-400">Balance:</span>
                            <span className="font-mono">{formatCurrency(accountInfo?.balance ?? 0)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Equity:</span>
                            <span className="font-mono">{formatCurrency(accountInfo?.equity ?? 0)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Floating P/L:</span>
                            <span className={`font-mono ${getProfitColor(accountInfo?.profit ?? 0)}`}>
                            {formatCurrency(accountInfo?.profit ?? 0)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Open Positions */}
                <div className="bg-secondary p-6 rounded-lg shadow-lg lg:col-span-2">
                    <h2 className="text-2xl font-semibold mb-4">Open Positions</h2>
                    {positions.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-400 uppercase border-b border-border">
                            <tr>
                            <th scope="col" className="px-4 py-3">Symbol</th>
                            <th scope="col" className="px-4 py-3">Type</th>
                            <th scope="col" className="px-4 py-3">Volume</th>
                            <th scope="col" className="px-4 py-3">Open Price</th>
                            <th scope="col" className="px-4 py-3 text-right">Profit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {positions.map((pos) => (
                            <tr key={pos.ticket} className="border-b border-border">
                                <td className="px-4 py-3 font-medium">{pos.symbol}</td>
                                <td className={`px-4 py-3 font-semibold ${pos.type === 'BUY' ? 'text-blue-400' : 'text-orange-400'}`}>{pos.type}</td>
                                <td className="px-4 py-3">{pos.volume}</td>
                                <td className="px-4 py-3">{pos.price_open}</td>
                                <td className={`px-4 py-3 text-right font-mono ${getProfitColor(pos.profit)}`}>{formatCurrency(pos.profit)}</td>
                            </tr>
                            ))}
                        </tbody>
                        </table>
                    </div>
                    ) : (
                    <p className="text-gray-400 text-center mt-4">No open positions.</p>
                    )}
                </div>
            </div>
            {/* Trade History */}
            <div className="bg-secondary p-6 rounded-lg shadow-lg">
                <h2 className="text-2xl font-semibold mb-4">Trade History (Last 7 Days)</h2>
                {tradeHistory.length > 0 ? (
                    <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-400 uppercase border-b border-border sticky top-0 bg-secondary">
                                <tr>
                                    <th scope="col" className="px-4 py-3">Symbol</th>
                                    <th scope="col" className="px-4 py-3">Type</th>
                                    <th scope="col" className="px-4 py-3">Volume</th>
                                    <th scope="col" className="px-4 py-3">Close Price</th>
                                    <th scope="col" className="px-4 py-3">Close Time</th>
                                    <th scope="col" className="px-4 py-3 text-right">Profit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tradeHistory.map((deal) => (
                                <tr key={deal.ticket} className="border-b border-border">
                                    <td className="px-4 py-3 font-medium">{deal.symbol}</td>
                                    <td className={`px-4 py-3 font-semibold ${deal.type === 'BUY' ? 'text-blue-400' : 'text-orange-400'}`}>{deal.type}</td>
                                    <td className="px-4 py-3">{deal.volume}</td>
                                    <td className="px-4 py-3">{deal.price}</td>
                                    <td className="px-4 py-3">{formatTimestamp(deal.time)}</td>
                                    <td className={`px-4 py-3 text-right font-mono ${getProfitColor(deal.profit)}`}>{formatCurrency(deal.profit)}</td>
                                </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-gray-400 text-center mt-4">No closed trades in the last 7 days.</p>
                )}
            </div>
        </div>
      )}
    </main>
  );
}