"use client";

// This is a placeholder component for now.
// A full implementation would require the backend to provide daily trade history.

const StatsPanel = () => {
    // Hardcoded data for demonstration
    const stats = {
        trades: 5,
        won: 3,
        lost: 2,
        winRate: "60%",
        dailyPnl: 8.50,
    };

    const getPnlColor = (pnl: number) => {
        if (pnl > 0) return 'text-green-400';
        if (pnl < 0) return 'text-red-400';
        return 'text-gray-400';
    };

    return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold mb-4">Today's Stats</h3>
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
        </div>
    );
};

export default StatsPanel;