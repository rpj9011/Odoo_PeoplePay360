// frontend/src/socket.js
import { io } from 'socket.io-client';

// --- Socket.IO URL Configuration ---
// Use the environment variable or default to same origin
// If frontend and backend are on same domain, using window.location.origin is correct
const getSocketURL = () => {
    if (import.meta.env.DEV) {
        // In development, use the Vite dev server origin (not backend directly)
        // Vite proxy will forward /api/socket.io to backend
        if (typeof window !== 'undefined') {
            return window.location.origin; // e.g., http://localhost:5173
        }
        return 'http://localhost:5173'; // Fallback for dev
    }
    
    // If VITE_SOCKET_URL is explicitly set, use it
    if (import.meta.env.VITE_SOCKET_URL) {
        return import.meta.env.VITE_SOCKET_URL;
    }
    
    // For same-domain deployments, use window.location.origin
    // This ensures Socket.IO connects to the same domain as the frontend
    if (typeof window !== 'undefined') {
        return window.location.origin;
    }
    
    return ''; // SSR fallback; browser path above uses window.location.origin
};

const URL = getSocketURL();
// Socket.io client with token-based authentication
// WebSocket-first configuration for better performance
const socket = io(URL, {
    autoConnect: false,
    path: '/api/socket.io',
    transports: ['websocket', 'polling'],
    timeout: 30000,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
    upgrade: true,
    rememberUpgrade: false,
    withCredentials: true,
    closeOnBeforeunload: false,
});

// Track WebSocket upgrade failures
let websocketUpgradeFailed = false;

socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
});

socket.on('connect', () => {
    // Connected successfully
});

socket.on('disconnect', (reason) => {
    const shouldReconnect = reason === 'transport close' || 
                            reason === 'ping timeout' || 
                            reason === 'server namespace disconnect';
    
    // On disconnect we keep the existing socket.auth.token so the reconnect
    // attempt uses whatever token was valid at connect time. If the token
    // expired the server will reject the reconnect with a 401, which the
    // auth-error event chain will handle.
    if (shouldReconnect && !socket.auth?.token) {
        // Fallback: try legacy storage during transition period
        const legacyToken = sessionStorage.getItem('token') || sessionStorage.getItem('ams_token');
        if (legacyToken) {
            socket.auth = { token: legacyToken };
        }
    }
});

socket.on('reconnect_attempt', () => {
    // socket.auth.token is already set from the initial connect call.
    // Only fall back to legacy storage if auth is missing (transition period).
    if (!socket.auth?.token) {
        const legacyToken = sessionStorage.getItem('token') || sessionStorage.getItem('ams_token');
        if (legacyToken) {
            socket.auth = { token: legacyToken };
        }
    }
});

socket.on('reconnect_failed', () => {
    console.error('[Socket] ❌ Reconnection failed after all attempts');
});

// Helper function to connect socket with token
export const connectSocketWithToken = (token) => {
    if (!token) return;
    
    if (socket.connected) {
        socket.disconnect();
    }
    
    socket.auth = { token };
    socket.connect();
};

export default socket;