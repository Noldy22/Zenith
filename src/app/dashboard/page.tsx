"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Settings, BarChart2 } from 'lucide-react';

// --- Core Imports ---
import { getBackendUrl } from '@/lib/utils';

// --- Hook Imports ---
import { useSocketConnection } from '@/hooks/useSocketConnection';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useAccountData } from '@/hooks/useAccountData';

// --- Component Imports ---
import CandlestickChart from '../../components/CandlestickChart';
import PositionTracker from '../../components/PositionTracker';
import StatsPanel from '../../components/StatsPanel';

const DashboardSkeleton = () => (
    <div className="p-8 text-center animate-pulse">Loading dashboard...</div>
);

export default function DashboardPage() {
    // --- Use Custom Hooks ---
    useSocketConnection(); // Manages connection toasts
    const { settings, isLoading } = useAppSettings(); // Manages settings
    const { accountInfo, tradeSignal, setTradeSignal } = useAccountData(settings); // Manages real-time data

    // This local state is fine to keep here, as it's specific to this component's UI
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Helper Functions ---
    const handleConfirmTrade = async () => {
        if (!tradeSignal) return;
        setIsSubmitting(true);
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
        } finally {
            setIsSubmitting(false);
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
                    <h1 className="text-xl font-bold">Trading Dashboard</h1>
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
                        <button 
                            onClick={handleConfirmTrade} 
                            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-bold mr-2 disabled:opacity-50"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "Executing..." : "Confirm Trade"}
                        </button>
                        <button 
                            onClick={() => setTradeSignal(null)} 
                            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-bold disabled:opacity-50"
                            disabled={isSubmitting}
                        >
                            Reject
                        </button>
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