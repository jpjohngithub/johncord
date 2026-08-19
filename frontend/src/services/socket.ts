import { io, Socket } from 'socket.io-client';
import { subscribeLocalEvents } from './mockBackend';

let socket: Socket | null = null;

const CLOUDFLARE_URL = 'https://circulation-noticed-significant-prints.trycloudflare.com';
const SOCKET_CANDIDATES = [
  CLOUDFLARE_URL,
  (import.meta as any).env?.VITE_API_URL?.replace(/\/api\/?$/, ''),
  'https://johncord-backend.onrender.com',
].filter(Boolean);

export function getSocket(): Socket {
  if (!socket) {
    const socketHost = SOCKET_CANDIDATES[0] || window.location.origin;

    socket = io(socketHost, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 2000,
      timeout: 8000,
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log(`⚡ Connected to Johncord Socket.IO at ${socketHost}`);
      const userStr = localStorage.getItem('johncord_user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          socket?.emit('user:authenticate', { userId: user.id });
        } catch (e) {}
      }
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket.IO connection attempt warning:', err.message);
    });

    // Bridge local broadcast events for standalone mode (Netlify / offline)
    subscribeLocalEvents((event, data) => {
      if (socket) {
        (socket as any)._callbacks?.[`$${event}`]?.forEach((cb: Function) => cb(data));
      }
    });
  }

  return socket;
}

export function resetSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
