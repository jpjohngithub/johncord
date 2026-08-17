import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const rawUrl = (import.meta as any).env?.VITE_API_URL || '';
    const socketHost = rawUrl ? rawUrl.replace(/\/api\/?$/, '') : window.location.origin;

    socket = io(socketHost, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
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

    socket.on('disconnect', () => {
      console.log('🔌 Disconnected from Johncord Socket.IO Server');
    });
  }

  return socket;
}
