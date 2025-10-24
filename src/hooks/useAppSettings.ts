"use client";

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { getBackendUrl } from '@/lib/utils';

// --- Types ---
// (You might want to move these to a central src/lib/types.ts file later)
interface Mt5Credentials {
    login: string;
    password: string;
    server: string;
    terminal_path: string;
}
export interface AppSettings {
    mt5_credentials: Mt5Credentials;
    pairs_to_trade: string[];
    auto_trading_enabled: boolean;
}

const defaultSettings: AppSettings = {
    mt5_credentials: { login: '', password: '', server: '', terminal_path: '' },
    pairs_to_trade: ['EURUSD'],
    auto_trading_enabled: false,
};

export const useAppSettings = () => {
    const [settings, setSettings] = useState<AppSettings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchSettings = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(`${getBackendUrl()}/api/settings`);
                if (response.ok) {
                    const data: AppSettings = await response.json();
                    setSettings(data);
                } else {
                    toast.error("Failed to fetch settings.");
                }
            } catch (e) {
                console.error("Failed to fetch settings:", e);
                toast.error("Failed to connect to server for settings.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchSettings();
    }, []);

    return { settings, isLoading };
};