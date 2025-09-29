"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface AccountInfo {
  balance: number;
  equity: number;
  profit: number;
}

export default function DashboardPage() {
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const fetchAccountInfo = async () => {
      const storedCreds = localStorage.getItem('mt5_credentials');
      if (!storedCreds) {
        setIsConnected(false);
        setIsLoading(false);
        return;
      }
      
      setIsConnected(true);
      try {
        const credentials = JSON.parse(storedCreds);
        const response = await fetch('http://127.0.0.1:5000/api/get_account_info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch account details');
        }
        
        const data = await response.json();
        setAccountInfo(data);
      } catch (error) {
        console.error("Error fetching account info:", error);
        // If there's an error (e.g., Python server down), show disconnected state
        setIsConnected(false);
        setAccountInfo(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccountInfo(); // Initial fetch
    const interval = setInterval(fetchAccountInfo, 5000); // Poll every 5 seconds

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-secondary p-6 rounded-lg shadow-lg">
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

          <div className="bg-secondary p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold mb-4">Market Overview</h2>
             <p className="text-gray-400">Market data coming soon.</p>
          </div>

          <div className="bg-secondary p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold mb-4">Recent Trades</h2>
            <p className="text-gray-400">Trade history coming soon.</p>
          </div>
        </div>
      )}
    </main>
  );
}