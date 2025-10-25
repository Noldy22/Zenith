// src/hooks/useAppSettings.ts
"use client";

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify'; // Using toast, not useAlert here
import { getBackendUrl } from '@/lib/utils';
import type { Settings } from '@/lib/types';

// Default empty state remains the same
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


export const useAppSettings = () => {
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        const backendUrl = getBackendUrl();
        const fetchUrl = `${backendUrl}/api/settings`;
        console.log("useAppSettings fetching from:", fetchUrl);
        try {
            const response = await fetch(fetchUrl, {
                method: 'GET',
                // *** ADD THIS LINE ***
                credentials: 'include', // Send session cookie for authentication
            });
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
            } else if (response.status === 401) {
                // Don't show an error toast if we're just not logged in.
                // The page (e.g., Dashboard) will handle redirection.
                console.warn("useAppSettings: Not authenticated.");
            } else {
                // Show error for other issues (e.g., 500 server error)
                const errorData = await response.json().catch(() => ({ error: "Could not fetch settings" }));
                toast.error(`Error fetching settings: ${errorData.error || response.statusText}`);
            }
        } catch (error) {
            console.error("Fetch settings error in useAppSettings:", error);
            console.error("Failed URL was:", fetchUrl);
            toast.error("Backend server might not be running or reachable.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // We will call this from the page instead
        // fetchSettings();
    }, [fetchSettings]); // Keep this effect, but we'll modify how it's called

    const saveSettings = useCallback(async (newSettings: Partial<Settings>) => {
        setIsSaving(true);
        toast.info("Saving settings...");

        const settingsToSave = {
            ...settings,
            ...newSettings,
            pairs_to_trade: Array.isArray(newSettings.pairs_to_trade)
                ? newSettings.pairs_to_trade
                : settings.pairs_to_trade
        };

        const backendUrl = getBackendUrl();
        const saveUrl = `${backendUrl}/api/settings`;
        console.log("useAppSettings saving to:", saveUrl);

        try {
            const response = await fetch(saveUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // *** ADD THIS LINE ***
                credentials: 'include', // Send session cookie for authentication
                body: JSON.stringify(settingsToSave),
            });
            if (response.ok) {
                setSettings(settingsToSave);
                toast.success("Settings saved successfully!");
                return true;
            } else if (response.status === 401) {
                 toast.error("Authentication error. Please log in again.");
                 return false;
            } else {
                 const errorData = await response.json().catch(() => ({ error: "Failed to save settings" }));
                 toast.error(`Failed to save settings: ${errorData.error || response.statusText}`);
                 return false;
            }
        } catch (error) {
            console.error("Save settings error:", error);
            console.error("Failed save URL was:", saveUrl);
            toast.error("Error connecting to backend to save settings.");
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [settings]);

    // Return fetchSettings so pages can call it *after* auth is confirmed
    return { settings, isLoading, isSaving, saveSettings, fetchSettings };
};