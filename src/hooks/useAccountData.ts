"use client";

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { socket } from '@/lib/socket';
import { getBackendUrl } from '@/lib/utils';
import { AppSettings } from './useAppSettings'; // Import the type

// --- Types ---
// (Also candidates for a central types.ts file)
export interface AccountInfo {
    balance: number;
    equity: number;
    profit: number;
}
export interface TradeSignal {
    trade_type: string;
    symbol: string;
    entry: number;
    sl: number;
    tp: number;
    lot_size: number;
}

const initialAccountInfo: AccountInfo = { balance: 0, equity: 0, profit: 0 };

export const useAccountData = (settings: AppSettings) => {
    const [accountInfo, setAccountInfo] = useState<AccountInfo>(initialAccountInfo);
    const [tradeSignal, setTradeSignal] = useState<TradeSignal | null>(null);

    // 1. Fetch initial account info when settings are loaded
    useEffect(() => {
        const fetchAccountInfo = async () => {
            const creds = settings.mt5_credentials;
            if (!creds || !creds.login) return; // Don't fetch if no credentials

            try {
                const response = await fetch(`${getBackendUrl()}/api/get_account_info`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(creds),
                });
                if (response.ok) {
                    const data: AccountInfo = await response.json();
                    if (data.balance) setAccountInfo(data);
                }
            } catch (e) {
                console.error("Failed to fetch account info:", e);
            }
        };

        fetchAccountInfo();
    }, [settings]); // Re-run if settings (e.g., credentials) change

    // 2. Set up all socket listeners for real-time data
    useEffect(() => {
        const onTradeSignal = (data: { message: string, params: TradeSignal }) => {
            toast.info(data.message, { autoClose: 10000 });
            setTradeSignal(data.params);
        };

        const onNotification = (data: { message: string }) => toast.info(data.message);
        
        const onAccountInfoUpdate = (data: AccountInfo) => setAccountInfo(data);

        const onProfitUpdate = (data: { profit: number }) => {
            setAccountInfo(prev => ({ ...prev, profit: data.profit }));
        };

        // Register listeners
        socket.on('trade_signal', onTradeSignal);
        socket.on('notification', onNotification);
        socket.on('account_info_update', onAccountInfoUpdate);
        socket.on('profit_update', onProfitUpdate);

        // Cleanup
        return () => {
            socket.off('trade_signal', onTradeSignal);
            socket.off('notification', onNotification);
            socket.off('account_info_update', onAccountInfoUpdate);
            socket.off('profit_update', onProfitUpdate);
        };
    }, []); // This effect runs once to set up listeners

    return { accountInfo, tradeSignal, setTradeSignal };
};