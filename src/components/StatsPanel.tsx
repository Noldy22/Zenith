import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { getBackendUrl } from '@/lib/utils'; // Import centralized URL getter
import { socket } from '@/lib/socket'; // Import shared socket

interface Stats {
    trades: number;
    won: number;
    lost: number;
    winRate: string;
    dailyPnl: number;
}

interface StatsPanelProps {
  credentials: any; // Simplified for brevity
}

const StatsPanel: React.FC<StatsPanelProps> = ({ credentials }) => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            if (!credentials || !credentials.login) {
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            try {
                // Fetch initial stats on component mount (or when credentials change)
                const response = await fetch(`${getBackendUrl()}/api/get_daily_stats`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(credentials),
                });
                if (response.ok) {
                    const data = await response.json();
                    setStats(data);
                } else {
                    const err = await response.json();
                    toast.error(`Could not load stats: ${err.error || 'Unknown error'}`);
                    setStats(null);
                }
            } catch (error) {
                toast.error("Failed to fetch daily stats.");
                setStats(null);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();

        // **REMOVED POLLING**: Set up socket listener for real-time updates
        const handleStatsUpdate = (data: Stats) => {
            setStats(data);
        };
        
        socket.on('daily_stats_update', handleStatsUpdate);

        // Clean up the listener when the component unmounts or credentials change
        return () => {
            socket.off('daily_stats_update', handleStatsUpdate);
        };
    }, [credentials]); // Re-run effect if credentials change

    const getPnlColor = (pnl: number) => {
        if (pnl > 0) return 'text-green-400';
        if (pnl < 0) return 'text-red-400';
        return 'text-gray-400';
    };

    const renderContent = () => {
        if (isLoading) {
            return <p className="text-gray-400 text-center animate-pulse">Loading stats...</p>;
        }
        if (!stats || stats.trades === 0) {
            return <p className="text-gray-500 text-center">No closed trades found for today.</p>;
        }
        return (
            <div className="grid grid-cols-2 gap-4 text-sm">
                 <div>
                    <p className="text-gray-400">Trades</p>
                    <p className="text-lg font-bold">{stats.trades}</p>
                </div>
                <div>
                    <p className="text-gray-400">Win Rate</p>
                    <p className="text-lg font-bold">{stats.winRate}</p>
                </div>
                <div>
                    <p className="text-gray-400">Trades Won</p>
                    <p className="text-lg font-bold text-green-400">{stats.won}</p>
                </div>
                <div>
                    <p className="text-gray-400">Trades Lost</p>
                    <p className="text-lg font-bold text-red-400">{stats.lost}</p>
                </div>
                <div className="col-span-2">
                    <p className="text-gray-400">Daily PnL</p>
                    <p className={`text-xl font-bold ${getPnlColor(stats.dailyPnl)}`}>
                        ${stats.dailyPnl.toFixed(2)}
                    </p>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold mb-4">Today's Stats</h3>
            {renderContent()}
        </div>
    );
};

export default StatsPanel;