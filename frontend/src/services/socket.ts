import { io, Socket } from 'socket.io-client';
import { subscribeLocalEvents } from './mockBackend';

let socket: Socket | null = null;
let socketAttempts = 0;

const SOCKET_CANDIDATES = [
  (import.meta as any).env?.VITE_API_URL?.replace(/\/api\/?$/, ''),
  'https://johncord-backend.onrender.com',
  'https://johncord-backend-live.loca.lt',
].filter(Boolean);

export function getSocket(): Socket {
  if (!socket) {
    const socketHost = SOCKET_CANDIDATES[socketAttempts % SOCKET_CANDIDATES.length] || window.location.origin;

    socket = io(socketHost, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 3000,
      timeout: 6000,
      extraHeaders: {
        'bypass-tunnel-reminder': 'true'
      }
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

    socket.on('connect_error', () => {
      // Silently retry
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
