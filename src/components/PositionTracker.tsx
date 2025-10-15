"use client";

import { useState, useEffect } from 'react';

const PositionTracker = ({ credentials }) => {
    const [positions, setPositions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchPositions = async () => {
            if (!credentials || !credentials.login) return;

            try {
                const response = await fetch('http://127.0.0.1:5000/api/get_open_positions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(credentials),
                });
                if (response.ok) {
                    const data = await response.json();
                    setPositions(data);
                }
            } catch (error) {
                console.error("Failed to fetch positions:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPositions();
        const interval = setInterval(fetchPositions, 5000); // Poll every 5 seconds

        return () => clearInterval(interval);
    }, [credentials]);

    const getProfitColor = (profit) => {
        if (profit > 0) return 'text-green-400';
        if (profit < 0) return 'text-red-400';
        return 'text-gray-400';
    };

    return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold mb-4">Open Positions ({positions.length})</h3>
            {isLoading ? (
                <p>Loading positions...</p>
            ) : positions.length > 0 ? (
                <div className="space-y-3 text-sm">
                    {positions.map((pos) => (
                        <div key={pos.ticket} className="p-2 bg-gray-700 rounded-md">
                            <div className="flex justify-between font-bold">
                                <span>{pos.symbol} {pos.type}</span>
                                <span className={getProfitColor(pos.profit)}>
                                    ${pos.profit.toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-400">
                                <span>Lots: {pos.volume}</span>
                                <span>@ {pos.price_open}</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-gray-500 text-center">No open positions.</p>
            )}
        </div>
    );
};

export default PositionTracker;