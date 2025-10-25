"use client";

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { getBackendUrl } from '@/lib/utils';
import type { Settings } from '@/lib/types'; // FIX: Changed AppSettings to Settings

// Default empty state remains the same
const defaultSettings: Settings = { // FIX: Changed AppSettings to Settings
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


export const useAppSettings = () => {
    const [settings, setSettings] = useState<Settings>(defaultSettings); // FIX: Changed AppSettings to Settings
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false); // Add saving state

    const fetchSettings = useCallback(async () => { // Wrap fetch in useCallback
        setIsLoading(true);
        const backendUrl = getBackendUrl(); // Get URL
        const fetchUrl = `${backendUrl}/api/settings`;
        console.log("useAppSettings fetching from:", fetchUrl); // <<< ADDED LOGGING
        try {
            const response = await fetch(fetchUrl);
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
            } else {
                const errorData = await response.json().catch(() => ({ error: "Could not fetch settings" }));
                toast.error(`Error fetching settings: ${errorData.error || response.statusText}`);
            }
        } catch (error) {
            console.error("Fetch settings error in useAppSettings:", error); // <<< ADDED CONSOLE ERROR
            console.error("Failed URL was:", fetchUrl); // <<< ADDED CONSOLE ERROR
            toast.error("Backend server might not be running or reachable.");
        } finally {
            setIsLoading(false);
        }
    }, []); // Empty dependency array means this function is created once

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]); // Run fetchSettings on mount

    // --- NEW: Function to save settings ---
    const saveSettings = useCallback(async (newSettings: Partial<Settings>) => { // FIX: Changed AppSettings to Settings
        setIsSaving(true);
        toast.info("Saving settings...");

        // Ensure pairs_to_trade is always an array before saving
        const settingsToSave = {
            ...settings, // Start with current settings
            ...newSettings, // Override with new changes
            pairs_to_trade: Array.isArray(newSettings.pairs_to_trade)
                ? newSettings.pairs_to_trade
                : settings.pairs_to_trade // Fallback if not provided or invalid
        };

        const backendUrl = getBackendUrl(); // Get URL for saving
        const saveUrl = `${backendUrl}/api/settings`;
        console.log("useAppSettings saving to:", saveUrl); // Log save URL

        try {
            const response = await fetch(saveUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsToSave),
            });
            if (response.ok) {
                setSettings(settingsToSave); // Update local state on success
                toast.success("Settings saved successfully!");
                return true; // Indicate success
            } else {
                 const errorData = await response.json().catch(() => ({ error: "Failed to save settings" }));
                 toast.error(`Failed to save settings: ${errorData.error || response.statusText}`);
                 return false; // Indicate failure
            }
        } catch (error) {
            console.error("Save settings error:", error);
            console.error("Failed save URL was:", saveUrl); // Log failed save URL
            toast.error("Error connecting to backend to save settings.");
            return false; // Indicate failure
        } finally {
            setIsSaving(false);
        }
    }, [settings]); // Depend on current settings to merge correctly

    // Return the save function along with existing state
    return { settings, isLoading, isSaving, saveSettings, fetchSettings };
};