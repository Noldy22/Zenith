import { io } from 'socket.io-client';
import { getBackendUrl } from './utils';

const URL = getBackendUrl();

// Create a single, shared socket instance for the entire application.
// It will automatically try to connect.
export const socket = io(URL, {
    reconnectionAttempts: 5,
    reconnectionDelay: 3000,
});