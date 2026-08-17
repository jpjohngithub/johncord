import { io, Socket } from 'socket.io-client';
import { subscribeLocalEvents } from './mockBackend';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const rawUrl = (import.meta as any).env?.VITE_API_URL || '';
    const socketHost = rawUrl ? rawUrl.replace(/\/api\/?$/, '') : window.location.origin;

    socket = io(socketHost, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 3000
    });

    socket.on('connect', () => {
      console.log('⚡ Connected to Johncord Socket.IO Server');
      const userStr = localStorage.getItem('johncord_user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          socket?.emit('user:authenticate', { userId: user.id });
        } catch (e) {}
      }
    });

    socket.on('connect_error', () => {
      // Gracefully silent in standalone Netlify mode
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
