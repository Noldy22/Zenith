"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Settings, BarChart2 } from 'lucide-react'; // Import icons

// --- Core Imports ---
import { socket } from '@/lib/socket'; // Import the shared socket instance
import { getBackendUrl } from '@/lib/utils'; // Import the centralized URL getter

// --- Component Imports ---
import CandlestickChart from '../../components/CandlestickChart';
import PositionTracker from '../../components/PositionTracker';
import StatsPanel from '../../components/StatsPanel';

// --- Types ---
interface Mt5Credentials {
    login: string;
    password: string;
    server: string;
    terminal_path: string;
}
interface Settings {
    mt5_credentials: Mt5Credentials;
    pairs_to_trade: string[];
    auto_trading_enabled: boolean;
}
interface AccountInfo {
    balance: number;
    equity: number;
    profit: number;
}
interface TradeSignal {
    trade_type: string;
    symbol: string;
    entry: number;
    sl: number;
    tp: number;
    lot_size: number;
}

// --- Constants ---
const defaultSettings: Settings = {
    mt5_credentials: { login: '', password: '', server: '', terminal_path: '' },
    pairs_to_trade: ['EURUSD'],
    auto_trading_enabled: false,
};

const DashboardSkeleton = () => (
    <div className="p-8 text-center animate-pulse">Loading dashboard...</div>
);

export default function DashboardPage() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [accountInfo, setAccountInfo] = useState<AccountInfo>({ balance: 0, equity: 0, profit: 0 });
  const [tradeSignal, setTradeSignal] = useState<TradeSignal | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- Data Fetching Effect ---
  useEffect(() => {
    const fetchSettings = async () => {
        try {
            const response = await fetch(`${getBackendUrl()}/api/settings`);
            if (response.ok) {
                const data: Settings = await response.json();
                setSettings(data);
                // Once settings are loaded, fetch initial account info
                if (data.mt5_credentials.login) {
                    fetchAccountInfo(data.mt5_credentials);
                }
            }
        } catch (e) { 
            console.error("Failed to fetch settings:", e);
            toast.error("Failed to fetch settings.");
        } finally {
            setIsLoading(false);
        }
    };
    
    fetchSettings();
  }, []);

  // --- Socket Listeners Effect ---
  useEffect(() => {
    // --- Socket Connection Events ---
    socket.on('connect', () => toast.success("Connected to backend server."));
    socket.on('disconnect', () => toast.error("Disconnected from backend server."));

    // --- Data Update Events ---
    socket.on('trade_signal', (data) => {
        toast.info(data.message, { autoClose: 10000 });
        setTradeSignal(data.params);
    });
    
    socket.on('notification', (data) => toast.info(data.message));
    
    // **REMOVED POLLING**: This now updates from a socket push
    socket.on('account_info_update', (data: AccountInfo) => {
        setAccountInfo(data);
    });

    // This is a partial update, so we merge it with existing data
    socket.on('profit_update', (data: { profit: number }) => {
        setAccountInfo(prev => ({ ...prev, profit: data.profit }));
    });

    // --- Cleanup ---
    return () => {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('trade_signal');
        socket.off('notification');
        socket.off('account_info_update');
        socket.off('profit_update');
    };
  }, []); // This effect runs once to set up listeners

  // --- Helper Functions ---
  const fetchAccountInfo = async (creds: Mt5Credentials) => {
    if (!creds || !creds.login) return;
    try {
        const response = await fetch(`${getBackendUrl()}/api/get_account_info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(creds),
        });
        if (response.ok) {
            const data: AccountInfo = await response.json();
            if (data.balance) setAccountInfo(data);
        }
    } catch(e) { console.error("Failed to fetch account info:", e); }
  };
  
  const handleConfirmTrade = async () => {
    if (!tradeSignal) return;
    try {
        const response = await fetch(`${getBackendUrl()}/api/execute_manual_trade`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tradeSignal),
        });
        const result = await response.json();
        if (response.ok) {
            toast.success("Trade confirmed and executed!");
            setTradeSignal(null);
        } else {
            toast.error(`Trade failed: ${result.error}`);
        }
    } catch (e) {
        toast.error("Failed to connect to backend to execute trade.");
    }
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <main className="p-4 sm:p-6 lg:p-8 bg-gray-900 text-white min-h-screen">
        <ToastContainer theme="dark" position="bottom-right" />

        <header className="flex justify-between items-center mb-6 p-4 bg-gray-800 rounded-lg shadow-lg">
            <div>
                <h1 className="text-xl font-bold">Forex Trading Bot</h1>
                <p className="text-sm text-gray-400">
                    Account: {settings?.mt5_credentials?.login || 'N/A'} | Balance: ${accountInfo.balance.toFixed(2)} | Equity: ${accountInfo.equity.toFixed(2)} |
                    <span className={`ml-2 font-semibold ${accountInfo.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        P/L: ${accountInfo.profit.toFixed(2)}
                    </span>
                </p>
            </div>
            <div className="flex items-center gap-4">
                <Link href="/settings" className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-1">
                    <Settings size={16} /> Settings
                </Link>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${settings?.auto_trading_enabled ? 'bg-green-500' : 'bg-red-500'}`}>
                    Auto-Trade: {settings?.auto_trading_enabled ? 'ON' : 'OFF'}
                </span>
            </div>
        </header>

        {tradeSignal && (
             <div className="bg-yellow-500/20 border border-yellow-500 text-yellow-300 p-4 rounded-lg mb-6 shadow-xl animate-pulse">
                <h3 className="font-bold">🚨 TRADE ALERT: {tradeSignal.trade_type} {tradeSignal.symbol}</h3>
                <p>Entry: ~{tradeSignal.entry} | SL: {tradeSignal.sl} | TP: {tradeSignal.tp}</p>
                <p>Position Size: {tradeSignal.lot_size} lots</p>
                <div className="mt-4">
                    <button onClick={handleConfirmTrade} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-bold mr-2">Confirm Trade</button>
                    <button onClick={() => setTradeSignal(null)} className="bg-red-600 hover:be-red-700 px-4 py-2 rounded-lg font-bold">Reject</button>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-gray-800 p-4 rounded-lg shadow-lg">
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                    <BarChart2 size={20} /> Market Analysis
                </h2>
                {settings?.mt5_credentials?.login ? (
                    <CandlestickChart
                        credentials={settings.mt5_credentials}
                        symbol={settings.pairs_to_trade[0] || 'EURUSD'}
                        timeframe="H1"
                    />
                ) : (
                    <div className="h-96 flex items-center justify-center">
                        <p className="text-gray-500">Please enter MT5 credentials in Settings to view chart.</p>
                    </div>
                )}
            </div>

            <aside className="space-y-6">
                <PositionTracker credentials={settings?.mt5_credentials} />
                <StatsPanel credentials={settings?.mt5_credentials} />
            </aside>
        </div>
    </main>
  );
}