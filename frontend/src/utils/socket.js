import { io } from "socket.io-client";

const getSocketUrl = () => {
  if (import.meta.env.DEV) return "http://localhost:5173";
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
};

export const socket = io(getSocketUrl(), {
  path: "/api/socket.io/",
  autoConnect: false,
  transports: ["websocket"],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

export default socket;
