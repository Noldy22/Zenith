"use client";

import { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const SettingsPage = () => {
    const [settings, setSettings] = useState({
        trading_style: "DAY_TRADING",
        risk_per_trade: 2.0,
        max_daily_loss: 5.0,
        account_balance: 10000.0,
        auto_trading_enabled: false,
        notifications_enabled: true,
        min_confluence: 2,
        pairs_to_trade: ["EURUSD", "GBPUSD", "XAUUSD"],
        mt5_credentials: {
            login: "",
            password: "",
            server: "",
            terminal_path: ""
        }
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Fetch initial settings from backend
        const fetchSettings = async () => {
            try {
                const response = await fetch('http://127.0.0.1:5000/api/settings');
                if (response.ok) {
                    const data = await response.json();
                    setSettings(data);
                } else {
                    toast.error("Could not fetch settings from backend.");
                }
            } catch (error) {
                toast.error("Backend server is not running.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        const keys = name.split('.');

        setSettings(prev => {
            let temp = { ...prev };
            let current = temp;
            for (let i = 0; i < keys.length - 1; i++) {
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = type === 'checkbox' ? checked : value;
            return temp;
        });
    };

    const handleSaveSettings = async () => {
        toast.info("Saving settings...");
        try {
            const response = await fetch('http://127.0.0.1:5000/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            if (response.ok) {
                toast.success("Settings saved successfully!");
            } else {
                toast.error("Failed to save settings.");
            }
        } catch (error) {
            toast.error("Error connecting to backend.");
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center">Loading settings...</div>;
    }

    return (
        <main className="p-8 bg-gray-900 text-white min-h-screen">
            <ToastContainer theme="dark" />
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 mb-8">
                Settings
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* General Settings */}
                <div className="bg-gray-800 p-6 rounded-lg">
                    <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">General</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block mb-2">Trading Style</label>
                            <select name="trading_style" value={settings.trading_style} onChange={handleInputChange} className="w-full p-2 bg-gray-700 rounded">
                                <option value="SCALPING">Scalping</option>
                                <option value="DAY_TRADING">Day Trading</option>
                                <option value="SWING_TRADING">Swing Trading</option>
                                <option value="POSITION_TRADING">Position Trading</option>
                            </select>
                        </div>
                        <div>
                            <label className="block mb-2">Risk Per Trade: {settings.risk_per_trade}%</label>
                            <input type="range" name="risk_per_trade" min="0.1" max="10" step="0.1" value={settings.risk_per_trade} onChange={handleInputChange} className="w-full" />
                        </div>
                        <div>
                            <label className="block mb-2">Account Balance</label>
                            <input type="number" name="account_balance" value={settings.account_balance} onChange={handleInputChange} className="w-full p-2 bg-gray-700 rounded" />
                        </div>
                    </div>
                </div>

                {/* Trading Preferences */}
                <div className="bg-gray-800 p-6 rounded-lg">
                    <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">Trading Preferences</h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label>Auto-Trading</label>
                            <input type="checkbox" name="auto_trading_enabled" checked={settings.auto_trading_enabled} onChange={handleInputChange} className="toggle-checkbox" />
                        </div>
                        <div className="flex items-center justify-between">
                            <label>Notifications</label>
                            <input type="checkbox" name="notifications_enabled" checked={settings.notifications_enabled} onChange={handleInputChange} className="toggle-checkbox" />
                        </div>
                        <div>
                            <label className="block mb-2">Minimum Confluence Signals</label>
                            <input type="number" name="min_confluence" min="1" max="4" value={settings.min_confluence} onChange={handleInputChange} className="w-full p-2 bg-gray-700 rounded" />
                        </div>
                    </div>
                </div>

                {/* MT5 Connection */}
                <div className="bg-gray-800 p-6 rounded-lg col-span-1 md:col-span-2">
                    <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">MT5 Connection</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" name="mt5_credentials.login" placeholder="Account Number" value={settings.mt5_credentials.login} onChange={handleInputChange} className="p-2 bg-gray-700 rounded" />
                        <input type="password" name="mt5_credentials.password" placeholder="Password" value={settings.mt5_credentials.password} onChange={handleInputChange} className="p-2 bg-gray-700 rounded" />
                        <input type="text" name="mt5_credentials.server" placeholder="Broker Server" value={settings.mt5_credentials.server} onChange={handleInputChange} className="p-2 bg-gray-700 rounded" />
                        <input type="text" name="mt5_credentials.terminal_path" placeholder="MT5 Terminal Path (e.g., C:\\Program Files\\...)" value={settings.mt5_credentials.terminal_path} onChange={handleInputChange} className="p-2 bg-gray-700 rounded" />
                    </div>
                </div>
            </div>

            <div className="mt-8 text-center">
                <button onClick={handleSaveSettings} className="px-8 py-3 bg-amber-500 text-white font-bold rounded-lg hover:bg-amber-600 transition-colors">
                    Save & Close
                </button>
            </div>
        </main>
    );
};

export default SettingsPage;