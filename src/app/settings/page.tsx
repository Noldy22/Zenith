"use client";

import { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// --- Zenith/Shadcn UI Components ---
import { Button } from '@/components/ui/button';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// --- Core Imports ---
import type { Settings } from '../../lib/types';
import { getBackendUrl } from '@/lib/utils'; // Use centralized util
import { BrainCircuit } from 'lucide-react'; // Icon for the train button

// Default empty state
const defaultSettings: Settings = {
    trading_style: "DAY_TRADING",
    risk_per_trade: 2.0,
    max_daily_loss: 5.0,
    account_balance: 10000.0,
    auto_trading_enabled: false,
    notifications_enabled: true,
    min_confluence: 2,
    pairs_to_trade: [] as string[],
    mt5_credentials: {
        login: "",
        password: "",
        server: "",
        terminal_path: ""
    },
    breakeven_enabled: false,
    breakeven_pips: 20,
    trailing_stop_enabled: false,
    trailing_stop_pips: 20,
    proactive_close_enabled: false,
};

const SettingsPage = () => {
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTraining, setIsTraining] = useState(false);
    
    // State for the comma-separated string for the pairs input
    const [pairsInput, setPairsInput] = useState('');

    useEffect(() => {
        const fetchSettings = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(`${getBackendUrl()}/api/settings`);
                if (response.ok) {
                    const data = await response.json();
                    
                    // --- Data Sanitization ---
                    data.pairs_to_trade = Array.isArray(data.pairs_to_trade) ? data.pairs_to_trade : [];
                    
                    if (data.mt5_credentials) {
                        data.mt5_credentials.login = String(data.mt5_credentials.login || "");
                        data.mt5_credentials.password = data.mt5_credentials.password || "";
                        data.mt5_credentials.server = data.mt5_credentials.server || "";
                        data.mt5_credentials.terminal_path = data.mt5_credentials.terminal_path || "";
                    } else {
                        data.mt5_credentials = defaultSettings.mt5_credentials;
                    }
                    
                    setSettings({ ...defaultSettings, ...data }); // Merge with defaults
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

    // --- Component-Specific Handlers ---
    
    // Generic handler for simple Input and Select changes
    const handleChange = (name: string, value: string | number) => {
        const keys = name.split('.');
        if (keys.length > 1) {
            setSettings(prev => ({
                ...prev,
                [keys[0]]: {
                    ...(prev as any)[keys[0]],
                    [keys[1]]: value
                }
            }));
        } else {
            setSettings(prev => ({
                ...prev,
                [name]: value
            }));
        }
    };
    
    // Handler for Switch components
    const handleSwitchChange = (name: keyof Settings) => (checked: boolean) => {
        setSettings(prev => ({
            ...prev,
            [name]: checked
        }));
    };

    // Handler for Slider components
    const handleSliderChange = (name: keyof Settings) => (value: number[]) => {
        setSettings(prev => ({
            ...prev,
            [name]: value[0]
        }));
    };

    // Handler for Pairs Input
    const handlePairsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPairsInput(e.target.value);
    };

    // --- Main Actions ---

    const handleSaveSettings = async () => {
        setIsSaving(true);
        toast.info("Saving settings...");
        
        const pairsArray = pairsInput.split(',')
                                    .map(pair => pair.trim().toUpperCase())
                                    .filter(pair => pair !== '');

        const settingsToSave = {
            ...settings,
            pairs_to_trade: pairsArray,
        };

        try {
            const response = await fetch(`${getBackendUrl()}/api/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsToSave),
            });
            if (response.ok) {
                toast.success("Settings saved successfully!");
                setSettings(settingsToSave); // Update local state to match saved state
            } else {
                 const errorData = await response.json().catch(() => ({ error: "Failed to save settings" }));
                 toast.error(`Failed to save settings: ${errorData.error || response.statusText}`);
            }
        } catch (error) {
            console.error("Save settings error:", error);
            toast.error("Error connecting to backend.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleTrainModel = async () => {
        setIsTraining(true);
        toast.info("Starting model training... This may take a moment.");
        try {
            const response = await fetch(`${getBackendUrl()}/api/train_model`, {
                method: 'POST',
            });
            const result = await response.json();
            if (response.ok) {
                toast.success(`Model trained successfully! Accuracy: ${(result.accuracy * 100).toFixed(2)}%`);
            } else {
                toast.error(`Training failed: ${result.error || "Unknown error"}`);
            }
        } catch (error) {
            console.error("Train model error:", error);
            toast.error("Error connecting to backend for training.");
        } finally {
            setIsTraining(false);
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center animate-pulse">Loading settings...</div>;
    }

    return (
        <main className="p-4 sm:p-6 lg:p-8">
            <ToastContainer theme="dark" position="bottom-right" />
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 mb-8">
                Settings
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* General Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle>General</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="trading_style">Trading Style</Label>
                            <Select 
                                value={settings.trading_style} 
                                onValueChange={(value) => handleChange("trading_style", value)}
                            >
                                <SelectTrigger id="trading_style">
                                    <SelectValue placeholder="Select style..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="SCALPING">Scalping</SelectItem>
                                    <SelectItem value="DAY_TRADING">Day Trading</SelectItem>
                                    <SelectItem value="SWING_TRADING">Swing Trading</SelectItem>
                                    <SelectItem value="POSITION_TRADING">Position Trading</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Risk Per Trade: {Number(settings.risk_per_trade).toFixed(1)}%</Label>
                            <Slider 
                                value={[settings.risk_per_trade]} 
                                onValueChange={handleSliderChange("risk_per_trade")}
                                min={0.1} max={10} step={0.1}
                            />
                        </div>
                         <div className="space-y-2">
                            <Label>Max Daily Loss: {Number(settings.max_daily_loss).toFixed(1)}%</Label>
                            <Slider 
                                value={[settings.max_daily_loss]}
                                onValueChange={handleSliderChange("max_daily_loss")}
                                min={1} max={20} step={0.5}
                            />
                        </div>
                        {/* REMOVED "Account Balance" input as requested. 
                          It's now fetched automatically on the dashboard.
                        */}
                    </CardContent>
                </Card>

                {/* Trading Preferences */}
                <Card>
                    <CardHeader>
                        <CardTitle>Trading Preferences</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="auto_trading_enabled">Auto-Trading Enabled</Label>
                            <Switch 
                                id="auto_trading_enabled"
                                checked={settings.auto_trading_enabled} 
                                onCheckedChange={handleSwitchChange("auto_trading_enabled")} 
                            />
                        </div>
                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="notifications_enabled">Notifications Enabled</Label>
                            <Switch 
                                id="notifications_enabled"
                                checked={settings.notifications_enabled} 
                                onCheckedChange={handleSwitchChange("notifications_enabled")}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="min_confluence">Minimum Confluence Signals</Label>
                            <Input 
                                id="min_confluence" 
                                type="number" 
                                value={settings.min_confluence} 
                                onChange={(e) => handleChange("min_confluence", parseInt(e.target.value))} 
                                min="1" max="4"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pairs_to_trade_input">
                                Pairs to Auto-Trade (comma-separated)
                            </Label>
                            <Input
                                id="pairs_to_trade_input"
                                value={pairsInput}
                                onChange={handlePairsChange}
                                placeholder="e.g., EURUSD, GBPUSD, XAUUSD"
                                className="uppercase"
                            />
                             <p className="text-sm text-muted-foreground">Enter symbols exactly as in MT5, separated by commas.</p>
                        </div>
                    </CardContent>
                </Card>

                {/* MT5 Connection */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>MT5 Connection</CardTitle>
                        <CardDescription>
                            Your credentials are sent directly to your server and never stored by us.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="mt5_login">Account Number</Label>
                            <Input id="mt5_login" value={settings.mt5_credentials.login} onChange={(e) => handleChange("mt5_credentials.login", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mt5_password">Password</Label>
                            <Input id="mt5_password" type="password" value={settings.mt5_credentials.password} onChange={(e) => handleChange("mt5_credentials.password", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mt5_server">Broker Server</Label>
                            <Input id="mt5_server" value={settings.mt5_credentials.server} onChange={(e) => handleChange("mt5_credentials.server", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mt5_path">MT5 Terminal Path</Label>
                            <Input id="mt5_path" value={settings.mt5_credentials.terminal_path} onChange={(e) => handleChange("mt5_credentials.terminal_path", e.target.value)} placeholder="C:\Program Files\..." />
                        </div>
                    </CardContent>
                </Card>

                {/* Trade Management */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Trade Management</CardTitle>
                        <CardDescription>
                            Automated rules for managing your open positions.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        {/* Breakeven */}
                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="breakeven_enabled">Enable Breakeven</Label>
                            <Switch 
                                id="breakeven_enabled" 
                                checked={settings.breakeven_enabled}
                                onCheckedChange={handleSwitchChange("breakeven_enabled")}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="breakeven_pips">Breakeven Trigger (Pips)</Label>
                            <Input 
                                id="breakeven_pips"
                                type="number" 
                                value={settings.breakeven_pips} 
                                onChange={(e) => handleChange("breakeven_pips", parseInt(e.target.value))} 
                                disabled={!settings.breakeven_enabled} 
                            />
                        </div>

                        {/* Trailing Stop */}
                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="trailing_stop_enabled">Enable Trailing Stop</Label>
                            <Switch 
                                id="trailing_stop_enabled" 
                                checked={settings.trailing_stop_enabled}
                                onCheckedChange={handleSwitchChange("trailing_stop_enabled")}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="trailing_stop_pips">Trailing Stop Distance (Pips)</Label>
                            <Input 
                                id="trailing_stop_pips"
                                type="number" 
                                value={settings.trailing_stop_pips} 
                                onChange={(e) => handleChange("trailing_stop_pips", parseInt(e.target.value))} 
                                disabled={!settings.trailing_stop_enabled} 
                            />
                        </div>

                        {/* Proactive Close - FIXED: Removed md:col-span-2 to align with the grid */}
                        <div className="flex items-center justify-between space-x-2">
                            <Label htmlFor="proactive_close_enabled" className="text-foreground">
                                Enable Proactive Close
                            </Label>
                            <Switch 
                                id="proactive_close_enabled" 
                                checked={settings.proactive_close_enabled}
                                onCheckedChange={handleSwitchChange("proactive_close_enabled")}
                            />
                        </div>
                         {/* This description now sits neatly under the toggle in the same column */}
                        <div className="space-y-2">
                             <p className="text-sm text-muted-foreground pt-2">
                                Allow AI to close trades early based on counter-signals.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Actions Footer */}
            <div className="mt-6 flex justify-center items-center space-x-4">
                <Button 
                    size="lg" 
                    onClick={handleSaveSettings} 
                    disabled={isSaving || isTraining}
                >
                    {isSaving ? "Saving..." : "Save Settings"}
                </Button>
                <Button 
                    size="lg" 
                    variant="secondary" 
                    onClick={handleTrainModel}
                    disabled={isSaving || isTraining}
                >
                    <BrainCircuit className="w-4 h-4 mr-2" />
                    {isTraining ? "Training Model..." : "Train Model"}
                </Button>
            </div>
        </main>
    );
};

export default SettingsPage;
