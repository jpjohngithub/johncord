import { create } from 'zustand';
import { Server, Channel, Category, Role, ServerMember } from '../types';
import { apiRequest } from '../services/api';
import { getSocket } from '../services/socket';

interface ServerState {
  servers: Server[];
  currentServerId: string | null; // null = Friends / DM view
  currentServer: Server | null;
  currentChannelId: string | null;
  currentChannel: Channel | null;
  isLoadingServers: boolean;
  isLoadingCurrentServer: boolean;
  
  // Modals & Popups
  isCreateServerModalOpen: boolean;
  isJoinServerModalOpen: boolean;
  isServerSettingsModalOpen: boolean;
  isInviteModalOpen: boolean;
  isCreateChannelModalOpen: boolean;
  createChannelType: 'text' | 'voice';
  createChannelCategoryId?: string | null;
  isCreateCategoryModalOpen: boolean;
  isMemberListOpen: boolean;

  // Actions
  setupServerSocketListeners: () => () => void;
  loadServers: () => Promise<void>;
  selectServer: (serverId: string | null) => Promise<void>;
  selectChannel: (channelId: string) => void;
  createServer: (name: string, icon_url?: string) => Promise<Server>;
  updateServer: (serverId: string, updates: Partial<Server>) => Promise<void>;
  deleteServer: (serverId: string) => Promise<void>;
  joinServer: (inviteCode: string) => Promise<void>;
  leaveServer: (serverId: string) => Promise<void>;
  
  // Categories & Channels Actions
  createCategory: (serverId: string, name: string) => Promise<void>;
  updateCategory: (categoryId: string, name: string) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  createChannel: (serverId: string, name: string, type: 'text' | 'voice', categoryId?: string | null, topic?: string) => Promise<Channel>;
  updateChannel: (channelId: string, updates: Partial<Channel>) => Promise<void>;
  deleteChannel: (channelId: string) => Promise<void>;

  // Roles Actions
  createRole: (serverId: string, name: string, color: string, permissions: string[]) => Promise<void>;
  updateRole: (roleId: string, updates: Partial<Role>) => Promise<void>;
  deleteRole: (roleId: string) => Promise<void>;
  assignRole: (serverId: string, userId: string, roleId: string) => Promise<void>;
  removeRole: (serverId: string, userId: string, roleId: string) => Promise<void>;

  // UI Toggles
  setCreateServerModalOpen: (open: boolean) => void;
  setJoinServerModalOpen: (open: boolean) => void;
  setServerSettingsModalOpen: (open: boolean) => void;
  setInviteModalOpen: (open: boolean) => void;
  openCreateChannelModal: (type: 'text' | 'voice', categoryId?: string | null) => void;
  setCreateChannelModalOpen: (open: boolean) => void;
  setCreateCategoryModalOpen: (open: boolean) => void;
  toggleMemberList: () => void;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  currentServerId: null,
  currentServer: null,
  currentChannelId: null,
  currentChannel: null,
  isLoadingServers: false,
  isLoadingCurrentServer: false,

  isCreateServerModalOpen: false,
  isJoinServerModalOpen: false,
  isServerSettingsModalOpen: false,
  isInviteModalOpen: false,
  isCreateChannelModalOpen: false,
  createChannelType: 'text',
  createChannelCategoryId: null,
  isCreateCategoryModalOpen: false,
  isMemberListOpen: true,

  loadServers: async () => {
    set({ isLoadingServers: true });
    try {
      const data = await apiRequest('/servers');
      set({ servers: data.servers, isLoadingServers: false });
      
      // Auto-select first server if none selected
      if (!get().currentServerId && data.servers.length > 0) {
        get().selectServer(data.servers[0].id);
      }
    } catch (err) {
      set({ isLoadingServers: false });
    }
  },

  selectServer: async (serverId) => {
    if (!serverId) {
      set({ currentServerId: null, currentServer: null, currentChannelId: null, currentChannel: null });
      return;
    }

    set({ currentServerId: serverId, isLoadingCurrentServer: true });
    try {
      const data = await apiRequest(`/servers/${serverId}`);
      const server: Server = data.server;

      // Find first text channel to select by default
      let defaultChannel = server.channels?.find(c => c.type === 'text') || server.channels?.[0] || null;

      set({
        currentServer: server,
        currentChannelId: defaultChannel?.id || null,
        currentChannel: defaultChannel,
        isLoadingCurrentServer: false
      });
    } catch (err) {
      set({ isLoadingCurrentServer: false });
    }
  },

  selectChannel: (channelId) => {
    const server = get().currentServer;
    if (!server) return;
    const channel = server.channels?.find(c => c.id === channelId) || null;
    set({ currentChannelId: channelId, currentChannel: channel });
  },

  createServer: async (name, icon_url) => {
    const data = await apiRequest('/servers', {
      method: 'POST',
      body: JSON.stringify({ name, icon_url })
    });
    await get().loadServers();
    await get().selectServer(data.server.id);
    return data.server;
  },

  updateServer: async (serverId, updates) => {
    await apiRequest(`/servers/${serverId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    await get().loadServers();
    if (get().currentServerId === serverId) {
      await get().selectServer(serverId);
    }
  },

  deleteServer: async (serverId) => {
    await apiRequest(`/servers/${serverId}`, { method: 'DELETE' });
    await get().loadServers();
    const remaining = get().servers;
    if (remaining.length > 0) {
      get().selectServer(remaining[0].id);
    } else {
      get().selectServer(null);
    }
  },

  joinServer: async (inviteCode) => {
    const data = await apiRequest('/servers/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode })
    });
    await get().loadServers();
    await get().selectServer(data.server.id);
  },

  leaveServer: async (serverId) => {
    await apiRequest(`/servers/${serverId}/leave`, { method: 'POST' });
    await get().loadServers();
    const remaining = get().servers;
    get().selectServer(remaining.length > 0 ? remaining[0].id : null);
  },

  createCategory: async (serverId, name) => {
    await apiRequest(`/servers/${serverId}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    await get().selectServer(serverId);
  },

  updateCategory: async (categoryId, name) => {
    await apiRequest(`/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    });
    const sId = get().currentServerId;
    if (sId) await get().selectServer(sId);
  },

  deleteCategory: async (categoryId) => {
    await apiRequest(`/categories/${categoryId}`, { method: 'DELETE' });
    const sId = get().currentServerId;
    if (sId) await get().selectServer(sId);
  },

  createChannel: async (serverId, name, type, categoryId, topic) => {
    const data = await apiRequest(`/servers/${serverId}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name, type, category_id: categoryId, topic })
    });
    await get().selectServer(serverId);
    if (type === 'text') {
      get().selectChannel(data.channel.id);
    }
    return data.channel;
  },

  updateChannel: async (channelId, updates) => {
    await apiRequest(`/channels/${channelId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    const sId = get().currentServerId;
    if (sId) await get().selectServer(sId);
  },

  deleteChannel: async (channelId) => {
    await apiRequest(`/channels/${channelId}`, { method: 'DELETE' });
    const sId = get().currentServerId;
    if (sId) await get().selectServer(sId);
  },

  createRole: async (serverId, name, color, permissions) => {
    await apiRequest(`/servers/${serverId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ name, color, permissions })
    });
    await get().selectServer(serverId);
  },

  updateRole: async (roleId, updates) => {
    await apiRequest(`/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    const sId = get().currentServerId;
    if (sId) await get().selectServer(sId);
  },

  deleteRole: async (roleId) => {
    await apiRequest(`/roles/${roleId}`, { method: 'DELETE' });
    const sId = get().currentServerId;
    if (sId) await get().selectServer(sId);
  },

  assignRole: async (serverId, userId, roleId) => {
    await apiRequest('/roles/assign', {
      method: 'POST',
      body: JSON.stringify({ serverId, userId, roleId })
    });
    await get().selectServer(serverId);
  },

  removeRole: async (serverId, userId, roleId) => {
    await apiRequest('/roles/remove', {
      method: 'POST',
      body: JSON.stringify({ serverId, userId, roleId })
    });
    await get().selectServer(serverId);
  },

  setCreateServerModalOpen: (open) => set({ isCreateServerModalOpen: open }),
  setJoinServerModalOpen: (open) => set({ isJoinServerModalOpen: open }),
  setServerSettingsModalOpen: (open) => set({ isServerSettingsModalOpen: open }),
  setInviteModalOpen: (open) => set({ isInviteModalOpen: open }),
  openCreateChannelModal: (type, categoryId) => set({
    isCreateChannelModalOpen: true,
    createChannelType: type,
    createChannelCategoryId: categoryId
  }),
  setCreateChannelModalOpen: (open) => set({ isCreateChannelModalOpen: open }),
  setCreateCategoryModalOpen: (open) => set({ isCreateCategoryModalOpen: open }),
  toggleMemberList: () => set((state) => ({ isMemberListOpen: !state.isMemberListOpen })),

  setupServerSocketListeners: () => {
    const socket = getSocket();
    const handleMemberJoined = () => {
      const sId = get().currentServerId;
      if (sId) get().selectServer(sId);
    };
    const handleChannelCreated = () => {
      const sId = get().currentServerId;
      if (sId) get().selectServer(sId);
    };
    socket.on('server:member_joined', handleMemberJoined);
    socket.on('server:channel_created', handleChannelCreated);
    return () => {
      socket.off('server:member_joined', handleMemberJoined);
      socket.off('server:channel_created', handleChannelCreated);
    };
  }
}));
