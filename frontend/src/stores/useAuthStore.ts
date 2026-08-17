import { create } from 'zustand';
import { User } from '../types';
import { apiRequest } from '../services/api';
import { getSocket } from '../services/socket';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  quickGuest: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  setStatus: (presence: 'online' | 'idle' | 'dnd' | 'offline', custom_status?: string) => Promise<void>;
  logout: () => void;
  initializeAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('johncord_token'),
  isLoading: true,
  error: null,

  initializeAuth: async () => {
    const token = localStorage.getItem('johncord_token');
    if (!token) {
      set({ isLoading: false });
      return;
    }

    try {
      const data = await apiRequest('/auth/me');
      set({ user: data.user, isLoading: false });
      localStorage.setItem('johncord_user', JSON.stringify(data.user));

      const socket = getSocket();
      socket.emit('user:authenticate', { userId: data.user.id });
    } catch (err: any) {
      localStorage.removeItem('johncord_token');
      localStorage.removeItem('johncord_user');
      set({ user: null, token: null, isLoading: false });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem('johncord_token', data.token);
      localStorage.setItem('johncord_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isLoading: false });

      const socket = getSocket();
      socket.emit('user:authenticate', { userId: data.user.id });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  register: async (username, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password })
      });
      localStorage.setItem('johncord_token', data.token);
      localStorage.setItem('johncord_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isLoading: false });

      const socket = getSocket();
      socket.emit('user:authenticate', { userId: data.user.id });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  quickGuest: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiRequest('/auth/guest', { method: 'POST' });
      localStorage.setItem('johncord_token', data.token);
      localStorage.setItem('johncord_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isLoading: false });

      const socket = getSocket();
      socket.emit('user:authenticate', { userId: data.user.id });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  updateProfile: async (updates) => {
    try {
      const data = await apiRequest('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      set({ user: data.user });
      localStorage.setItem('johncord_user', JSON.stringify(data.user));

      const socket = getSocket();
      socket.emit('user:update_status', {
        userId: data.user.id,
        presence: data.user.presence,
        custom_status: data.user.custom_status
      });
    } catch (err: any) {
      throw err;
    }
  },

  setStatus: async (presence, custom_status) => {
    const user = get().user;
    if (!user) return;
    try {
      const data = await apiRequest('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ presence, custom_status: custom_status ?? user.custom_status })
      });
      set({ user: data.user });
      localStorage.setItem('johncord_user', JSON.stringify(data.user));

      const socket = getSocket();
      socket.emit('user:update_status', {
        userId: data.user.id,
        presence,
        custom_status: custom_status ?? user.custom_status
      });
    } catch (err) {}
  },

  logout: () => {
    localStorage.removeItem('johncord_token');
    localStorage.removeItem('johncord_user');
    set({ user: null, token: null });
    window.location.reload();
  }
}));
