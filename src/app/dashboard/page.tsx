// src/app/dashboard/page.tsx
"use client";

import { useState, useEffect } from 'react'; // Added useEffect
import Link from 'next/link';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Settings, BarChart2 } from 'lucide-react';
import { useSession } from 'next-auth/react'; // Import useSession
import { useRouter } from 'next/navigation'; // Import useRouter

// --- Core Imports ---
import { getBackendUrl } from '@/lib/utils';

// --- UI Component Imports ---
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';

// --- Hook Imports ---
import { useSocketConnection } from '@/hooks/useSocketConnection';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useAccountData } from '@/hooks/useAccountData';

// --- App Component Imports ---
import CandlestickChart from '../../components/CandlestickChart';
import PositionTracker from '../../components/PositionTracker';
import StatsPanel from '../../components/StatsPanel';

const DashboardSkeleton = () => (
    <div className="p-8 text-center animate-pulse">Loading dashboard...</div>
);

export default function DashboardPage() {
    // --- Authentication Check ---
    const { data: session, status } = useSession();
    const router = useRouter();

    // Redirect if not authenticated or still loading
    useEffect(() => {
        if (status === 'unauthenticated') {
        router.push('/auth/signin'); // Redirect to login page
        }
    }, [status, router]);

    // --- Use Custom Hooks ---
    useSocketConnection(); // Manages connection toasts
    const { settings, isLoading: settingsLoading } = useAppSettings(); // Manages settings
    const { accountInfo, tradeSignal, setTradeSignal } = useAccountData(settings); // Manages real-time data

    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Helper Functions ---
    const handleConfirmTrade = async () => {
        // ... (keep existing handleConfirmTrade logic) ...
         if (!tradeSignal) return;
        setIsSubmitting(true);
        try {
            const response = await fetch(`${getBackendUrl()}/api/execute_manual_trade`, { // Assuming this endpoint requires auth now
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tradeSignal),
            });
            const result = await response.json();
            if (response.ok) {
                toast.success("Trade confirmed and executed!");
                setTradeSignal(null);
            } else if (response.status === 401) {
                 toast.error("Authentication error. Please log in again.");
                 // Optionally redirect to login: router.push('/auth/signin');
            } else {
                toast.error(`Trade failed: ${result.error || 'Unknown error'}`);
            }
        } catch (e) {
            toast.error("Failed to connect to backend to execute trade.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Show skeleton while loading session or settings
    if (status === 'loading' || settingsLoading) {
        return <DashboardSkeleton />;
    }

    // Don't render content if unauthenticated (should be redirected anyway)
     if (status === 'unauthenticated') {
        return null; // Or a simple "Redirecting..." message
    }

    // --- Render Dashboard Content (only if authenticated) ---
    return (
        <main className="p-4 sm:p-6 lg:p-8 min-h-screen">
            <ToastContainer theme="dark" position="bottom-right" />

            {/* Header Card */}
            <Card className="mb-6">
                <CardHeader className="flex flex-row flex-wrap justify-between items-center">
                    <div>
                        <CardTitle>Trading Dashboard</CardTitle>
                        <p className="text-sm text-muted-foreground pt-1">
                            Account: {settings?.mt5_credentials?.login || 'N/A'} | Balance: ${accountInfo.balance.toFixed(2)} | Equity: ${accountInfo.equity.toFixed(2)} |
                            <span className={`ml-2 font-semibold ${accountInfo.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                P/L: ${accountInfo.profit.toFixed(2)}
                            </span>
                        </p>
                    </div>
                    <div className="flex items-center gap-4 pt-4 sm:pt-0">
                        <Button variant="ghost" asChild>
                            <Link href="/settings" className="flex items-center gap-1">
                                <Settings size={16} /> Settings
                            </Link>
                        </Button>
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${settings?.auto_trading_enabled ? 'bg-green-500' : 'bg-red-500'}`}>
                            Auto-Trade: {settings?.auto_trading_enabled ? 'ON' : 'OFF'}
                        </span>
                    </div>
                </CardHeader>
            </Card>

            {/* Trade Signal Card */}
            {tradeSignal && (
                <Card className="bg-yellow-500/20 border-yellow-500 text-yellow-300 mb-6 shadow-xl animate-pulse">
                     <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           🚨 TRADE ALERT: {tradeSignal.trade_type} {tradeSignal.symbol}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>Entry: ~{tradeSignal.entry} | SL: {tradeSignal.sl} | TP: {tradeSignal.tp}</p>
                        <p>Position Size: {tradeSignal.lot_size} lots</p>
                    </CardContent>
                    <CardFooter className="gap-4">
                        <Button
                            onClick={handleConfirmTrade}
                            className="bg-green-600 hover:bg-green-700"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "Executing..." : "Confirm Trade"}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => setTradeSignal(null)}
                            disabled={isSubmitting}
                        >
                            Reject
                        </Button>
                    </CardFooter>
                </Card>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-2xl font-semibold flex items-center gap-2">
                            <BarChart2 size={20} /> Market Analysis
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {settings?.mt5_credentials?.login ? (
                            <CandlestickChart
                                credentials={settings.mt5_credentials}
                                symbol={settings.pairs_to_trade[0] || 'EURUSD'}
                                timeframe="H1"
                            />
                        ) : (
                            <div className="h-96 flex items-center justify-center">
                                <p className="text-muted-foreground">Please enter MT5 credentials in Settings to view chart.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <aside className="space-y-6">
                    <PositionTracker credentials={settings?.mt5_credentials} />
                    <StatsPanel credentials={settings?.mt5_credentials} />
                </aside>
            </div>
        </main>
    );
}