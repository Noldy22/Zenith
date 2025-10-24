"use client";

import { useEffect } from 'react';
import { toast } from 'react-toastify';
import { socket } from '@/lib/socket';

export const useSocketConnection = () => {
    useEffect(() => {
        const onConnect = () => toast.success("Connected to backend server.");
        const onDisconnect = () => toast.error("Disconnected from backend server.");

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);

        // Optional: Trigger a connection if it's not already connected
        if (!socket.connected) {
            socket.connect();
        }

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
        };
    }, []);
};