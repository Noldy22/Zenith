"use client";

import { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const getBackendUrl = () => {
    // Keep this function as is
    if (typeof window !== 'undefined') {
        return `http://${window.location.hostname}:5000`;
    }
    return 'http://127.0.0.1:5000'; // Default for server-side rendering
};

const SettingsPage = () => {
    const [settings, setSettings] = useState({
        trading_style: "DAY_TRADING",
        risk_per_trade: 2.0,
        max_daily_loss: 5.0, // This wasn't used in backend logic, but keep for consistency
        account_balance: 10000.0,
        auto_trading_enabled: false,
        notifications_enabled: true,
        min_confluence: 2,
        // Initialize pairs_to_trade as an array
        pairs_to_trade: [] as string[], // Explicitly type as string array
        mt5_credentials: {
            login: "", // Keep as string for input, backend converts to int
            password: "",
            server: "",
            terminal_path: ""
        }
    });
    const [isLoading, setIsLoading] = useState(true);
    // State to hold the comma-separated string for the pairs input
    const [pairsInput, setPairsInput] = useState('');

    useEffect(() => {
        // Fetch initial settings from backend
        const fetchSettings = async () => {
            setIsLoading(true); // Set loading true at the start
            try {
                const response = await fetch(`${getBackendUrl()}/api/settings`);
                if (response.ok) {
                    const data = await response.json();
                    // Ensure pairs_to_trade is always an array
                    data.pairs_to_trade = Array.isArray(data.pairs_to_trade) ? data.pairs_to_trade : [];
                    // Ensure login is treated as a string for the input field
                    if (data.mt5_credentials && data.mt5_credentials.login) {
                        data.mt5_credentials.login = String(data.mt5_credentials.login);
                    } else if (data.mt5_credentials) {
                        data.mt5_credentials.login = ""; // Ensure it's an empty string if 0 or null/undefined
                    }
                    setSettings(data);
                    // Initialize the pairsInput state based on fetched data
                    setPairsInput(data.pairs_to_trade.join(', '));
                } else {
                    const errorData = await response.json().catch(() => ({ error: "Could not fetch settings" }));
                    toast.error(`Error fetching settings: ${errorData.error || response.statusText}`);
                }
            } catch (error) {
                console.error("Fetch settings error:", error);
                toast.error("Backend server might not be running or reachable.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        // Use 'checked' for checkbox type, otherwise use 'value'
        const isCheckbox = type === 'checkbox';
        const finalValue = isCheckbox ? (e.target as HTMLInputElement).checked : value;

        const keys = name.split('.');

        // Special handling for pairs_to_trade input
        if (name === 'pairs_to_trade_input') {
            setPairsInput(value); // Update the raw input string
            // Convert comma-separated string to array, trim whitespace, remove empty strings
            const pairsArray = value.split(',')
                                  .map(pair => pair.trim().toUpperCase()) // Trim and convert to uppercase
                                  .filter(pair => pair !== ''); // Remove empty entries
            setSettings(prev => ({
                ...prev,
                pairs_to_trade: pairsArray
            }));
        } else if (keys.length > 1) {
            // Handle nested properties like mt5_credentials.login
            setSettings(prev => {
                let temp = { ...prev };
                let current = temp as any; // Use 'any' for easier nested access
                for (let i = 0; i < keys.length - 1; i++) {
                    // Ensure intermediate objects exist
                    if (!current[keys[i]]) {
                        current[keys[i]] = {};
                    }
                    current = current[keys[i]];
                }
                current[keys[keys.length - 1]] = finalValue;
                return temp;
            });
        } else {
            // Handle top-level properties
            setSettings(prev => ({
                ...prev,
                [name]: finalValue
            }));
        }
    };


    const handleSaveSettings = async () => {
        toast.info("Saving settings...");
        // Ensure pairs_to_trade is derived from the latest pairsInput before saving
        const pairsArray = pairsInput.split(',')
                                    .map(pair => pair.trim().toUpperCase())
                                    .filter(pair => pair !== '');

        const settingsToSave = {
            ...settings,
            pairs_to_trade: pairsArray,
             // Convert login back to number or null before sending if needed by backend,
             // but current backend handles string/int conversion safely.
             // mt5_credentials: {
             //    ...settings.mt5_credentials,
             //    login: settings.mt5_credentials.login ? parseInt(settings.mt5_credentials.login, 10) : 0
             // }
        };


        try {
            const response = await fetch(`${getBackendUrl()}/api/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsToSave), // Send the potentially modified settings
            });
            if (response.ok) {
                toast.success("Settings saved successfully!");
                // Optionally re-fetch settings to confirm or update local state precisely
                // fetchSettings();
            } else {
                 const errorData = await response.json().catch(() => ({ error: "Failed to save settings" }));
                 toast.error(`Failed to save settings: ${errorData.error || response.statusText}`);
            }
        } catch (error) {
            console.error("Save settings error:", error);
            toast.error("Error connecting to backend.");
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center">Loading settings...</div>;
    }

    return (
        <main className="p-8 bg-gray-900 text-white min-h-screen">
            <ToastContainer theme="dark" position="bottom-right" />
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 mb-8">
                Settings
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* General Settings */}
                <div className="bg-gray-800 p-6 rounded-lg shadow-md">
                    <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">General</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block mb-2 text-sm font-medium text-gray-300">Trading Style</label>
                            <select name="trading_style" value={settings.trading_style} onChange={handleInputChange} className="w-full p-2 bg-gray-700 rounded border border-gray-600 focus:ring-primary focus:border-primary">
                                <option value="SCALPING">Scalping</option>
                                <option value="DAY_TRADING">Day Trading</option>
                                <option value="SWING_TRADING">Swing Trading</option>
                                <option value="POSITION_TRADING">Position Trading</option>
                            </select>
                        </div>
                        <div>
                            <label className="block mb-2 text-sm font-medium text-gray-300">Risk Per Trade: {Number(settings.risk_per_trade).toFixed(1)}%</label>
                            <input type="range" name="risk_per_trade" min="0.1" max="10" step="0.1" value={settings.risk_per_trade} onChange={handleInputChange} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg accent-primary" />
                        </div>
                         <div>
                            <label className="block mb-2 text-sm font-medium text-gray-300">Max Daily Loss: {Number(settings.max_daily_loss).toFixed(1)}%</label>
                            <input type="range" name="max_daily_loss" min="1" max="20" step="0.5" value={settings.max_daily_loss} onChange={handleInputChange} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg accent-primary" />
                        </div>
                        <div>
                            <label className="block mb-2 text-sm font-medium text-gray-300">Account Balance</label>
                            <input type="number" name="account_balance" value={settings.account_balance} onChange={handleInputChange} className="w-full p-2 bg-gray-700 rounded border border-gray-600 focus:ring-primary focus:border-primary" />
                        </div>
                    </div>
                </div>

                {/* Trading Preferences */}
                <div className="bg-gray-800 p-6 rounded-lg shadow-md">
                    <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">Trading Preferences</h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-300">Auto-Trading Enabled</label>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" name="auto_trading_enabled" checked={settings.auto_trading_enabled} onChange={handleInputChange} className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-300">Notifications Enabled</label>
                             <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" name="notifications_enabled" checked={settings.notifications_enabled} onChange={handleInputChange} className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                        </div>
                        <div>
                            <label className="block mb-2 text-sm font-medium text-gray-300">Minimum Confluence Signals</label>
                            <input type="number" name="min_confluence" min="1" max="4" value={settings.min_confluence} onChange={handleInputChange} className="w-full p-2 bg-gray-700 rounded border border-gray-600 focus:ring-primary focus:border-primary" />
                        </div>
                        {/* --- NEW INPUT FOR AUTO-TRADE PAIRS --- */}
                        <div>
                            <label htmlFor="pairs_to_trade_input" className="block mb-2 text-sm font-medium text-gray-300">
                                Pairs to Auto-Trade (comma-separated)
                            </label>
                            <input
                                type="text"
                                id="pairs_to_trade_input"
                                name="pairs_to_trade_input"
                                value={pairsInput}
                                onChange={handleInputChange}
                                placeholder="e.g., EURUSD, GBPUSD, XAUUSD"
                                className="w-full p-2 bg-gray-700 rounded border border-gray-600 focus:ring-primary focus:border-primary uppercase"
                            />
                             <p className="mt-1 text-xs text-gray-500">Enter symbols exactly as shown in MT5, separated by commas.</p>
                        </div>
                         {/* --- END NEW INPUT --- */}
                    </div>
                </div>

                {/* MT5 Connection */}
                <div className="bg-gray-800 p-6 rounded-lg shadow-md col-span-1 md:col-span-2">
                    <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">MT5 Connection</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" name="mt5_credentials.login" placeholder="Account Number" value={settings.mt5_credentials.login} onChange={handleInputChange} className="p-2 bg-gray-700 rounded border border-gray-600 focus:ring-primary focus:border-primary" />
                        <input type="password" name="mt5_credentials.password" placeholder="Password" value={settings.mt5_credentials.password} onChange={handleInputChange} className="p-2 bg-gray-700 rounded border border-gray-600 focus:ring-primary focus:border-primary" />
                        <input type="text" name="mt5_credentials.server" placeholder="Broker Server" value={settings.mt5_credentials.server} onChange={handleInputChange} className="p-2 bg-gray-700 rounded border border-gray-600 focus:ring-primary focus:border-primary" />
                        <input type="text" name="mt5_credentials.terminal_path" placeholder="MT5 Terminal Path (e.g., C:\\Program Files\\...)" value={settings.mt5_credentials.terminal_path} onChange={handleInputChange} className="p-2 bg-gray-700 rounded border border-gray-600 focus:ring-primary focus:border-primary" />
                    </div>
                </div>
            </div>

            <div className="mt-8 text-center">
                <button onClick={handleSaveSettings} className="px-8 py-3 bg-amber-500 text-gray-900 font-bold rounded-lg hover:bg-amber-600 transition-colors shadow-md">
                    Save Settings
                </button>
            </div>
        </main>
    );
};

export default SettingsPage;