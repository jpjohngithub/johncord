import { create } from 'zustand';
import { Message, Thread, Attachment } from '../types';
import { apiRequest } from '../services/api';
import { getSocket } from '../services/socket';
import { soundEffects } from '../utils/audio';

interface ChatState {
  messages: Message[];
  isLoadingMessages: boolean;
  activeRoomId: string | null;
  replyTo: Message | null;
  currentThread: Thread | null;
  threadParentMessage: Message | null;
  threadMessages: Message[];
  isThreadPanelOpen: boolean;
  typingUsers: { id: string; username: string }[];
  searchQuery: string;

  // Actions
  loadChannelMessages: (channelId: string) => Promise<void>;
  loadDMMessages: (dmId: string) => Promise<void>;
  loadThreadMessages: (threadParentId: string) => Promise<void>;
  sendMessage: (content: string, attachments?: Attachment[]) => Promise<void>;
  sendThreadMessage: (content: string, attachments?: Attachment[]) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  togglePin: (messageId: string) => Promise<void>;
  createThread: (parentMessageId: string, name?: string) => Promise<Thread>;
  setReplyTo: (msg: Message | null) => void;
  openThread: (parentMessageId: string) => Promise<void>;
  closeThread: () => void;
  emitTyping: () => void;
  setSearchQuery: (query: string) => void;
  setupSocketListeners: () => () => void;
}

let typingTimeout: any = null;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoadingMessages: false,
  activeRoomId: null,
  replyTo: null,
  currentThread: null,
  threadParentMessage: null,
  threadMessages: [],
  isThreadPanelOpen: false,
  typingUsers: [],
  searchQuery: '',

  loadChannelMessages: async (channelId) => {
    const socket = getSocket();
    const prevRoom = get().activeRoomId;
    if (prevRoom) {
      socket.emit('chat:leave', { roomId: prevRoom });
    }

    set({ activeRoomId: channelId, isLoadingMessages: true, messages: [], typingUsers: [] });
    socket.emit('chat:join', { roomId: channelId });

    try {
      const data = await apiRequest(`/channels/${channelId}/messages`);
      set({ messages: data.messages, isLoadingMessages: false });
    } catch (err) {
      set({ isLoadingMessages: false });
    }
  },

  loadDMMessages: async (dmId) => {
    const socket = getSocket();
    const prevRoom = get().activeRoomId;
    if (prevRoom) {
      socket.emit('chat:leave', { roomId: prevRoom });
    }

    set({ activeRoomId: dmId, isLoadingMessages: true, messages: [], typingUsers: [] });
    socket.emit('chat:join', { roomId: dmId });

    try {
      const data = await apiRequest(`/dms/${dmId}/messages`);
      set({ messages: data.messages, isLoadingMessages: false });
    } catch (err) {
      set({ isLoadingMessages: false });
    }
  },

  loadThreadMessages: async (threadParentId) => {
    const socket = getSocket();
    socket.emit('chat:join', { roomId: `thread:${threadParentId}` });
    try {
      const data = await apiRequest(`/threads/${threadParentId}/messages`);
      set({
        currentThread: data.thread,
        threadParentMessage: data.parentMessage,
        threadMessages: data.messages,
        isThreadPanelOpen: true
      });
    } catch (err) {}
  },

  sendMessage: async (content, attachments = []) => {
    const activeRoomId = get().activeRoomId;
    const replyTo = get().replyTo;
    if (!activeRoomId) return;

    // Check if active room is channel or DM
    const isChannel = !activeRoomId.startsWith('dm_') && activeRoomId.length > 0;

    const payload = {
      channel_id: isChannel ? activeRoomId : null,
      dm_conversation_id: !isChannel ? activeRoomId : null,
      content,
      attachments,
      reply_to_id: replyTo?.id || null
    };

    const data = await apiRequest('/messages', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    set({ replyTo: null });

    const socket = getSocket();
    socket.emit('chat:new_message', {
      roomId: activeRoomId,
      message: data.message
    });
  },

  sendThreadMessage: async (content, attachments = []) => {
    const threadParent = get().threadParentMessage;
    if (!threadParent) return;

    const payload = {
      channel_id: threadParent.channel_id,
      thread_parent_id: threadParent.id,
      content,
      attachments
    };

    const data = await apiRequest('/messages', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const socket = getSocket();
    socket.emit('chat:new_message', {
      roomId: `thread:${threadParent.id}`,
      message: data.message
    });
  },

  editMessage: async (messageId, content) => {
    const data = await apiRequest(`/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content })
    });

    const activeRoomId = get().activeRoomId;
    if (activeRoomId) {
      const socket = getSocket();
      socket.emit('chat:edit_message', {
        roomId: activeRoomId,
        message: data.message
      });
    }
  },

  deleteMessage: async (messageId) => {
    await apiRequest(`/messages/${messageId}`, { method: 'DELETE' });

    const activeRoomId = get().activeRoomId;
    if (activeRoomId) {
      const socket = getSocket();
      socket.emit('chat:delete_message', {
        roomId: activeRoomId,
        messageId
      });
    }
  },

  toggleReaction: async (messageId, emoji) => {
    const data = await apiRequest(`/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji })
    });

    const activeRoomId = get().activeRoomId;
    if (activeRoomId) {
      const socket = getSocket();
      socket.emit('chat:reaction_updated', {
        roomId: activeRoomId,
        messageId,
        reactions: data.reactions
      });
    }
  },

  togglePin: async (messageId) => {
    const data = await apiRequest(`/messages/${messageId}/pin`, { method: 'POST' });
    const activeRoomId = get().activeRoomId;
    if (activeRoomId) {
      const socket = getSocket();
      socket.emit('chat:edit_message', {
        roomId: activeRoomId,
        message: data.message
      });
    }
  },

  createThread: async (parentMessageId, name) => {
    const data = await apiRequest(`/messages/${parentMessageId}/threads`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    await get().openThread(parentMessageId);
    return data.thread;
  },

  openThread: async (parentMessageId) => {
    await get().loadThreadMessages(parentMessageId);
  },

  closeThread: () => {
    const thread = get().currentThread;
    if (thread) {
      const socket = getSocket();
      socket.emit('chat:leave', { roomId: `thread:${thread.parent_message_id}` });
    }
    set({ isThreadPanelOpen: false, currentThread: null, threadParentMessage: null, threadMessages: [] });
  },

  setReplyTo: (msg) => set({ replyTo: msg }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  emitTyping: () => {
    const activeRoomId = get().activeRoomId;
    const userStr = localStorage.getItem('johncord_user');
    if (!activeRoomId || !userStr) return;
    try {
      const user = JSON.parse(userStr);
      const socket = getSocket();
      socket.emit('chat:typing', {
        roomId: activeRoomId,
        user: { id: user.id, username: user.username }
      });
    } catch (e) {}
  },

  setupSocketListeners: () => {
    const socket = getSocket();

    const handleNewMessage = ({ roomId, message }: { roomId: string; message: Message }) => {
      const userStr = localStorage.getItem('johncord_user');
      let currentUserId = '';
      if (userStr) {
        try { currentUserId = JSON.parse(userStr).id; } catch (e) {}
      }

      if (roomId.startsWith('thread:')) {
        set((state) => ({
          threadMessages: [...state.threadMessages.filter(m => m.id !== message.id), message]
        }));
      } else if (roomId === get().activeRoomId) {
        set((state) => ({
          messages: [...state.messages.filter(m => m.id !== message.id), message]
        }));
      }

      // Play ping sound if sent by another user
      if (message.user_id !== currentUserId) {
        soundEffects.playMessagePing();
      }
    };

    const handleMessageUpdated = ({ message }: { message: Message }) => {
      set((state) => ({
        messages: state.messages.map(m => m.id === message.id ? message : m),
        threadMessages: state.threadMessages.map(m => m.id === message.id ? message : m)
      }));
    };

    const handleMessageDeleted = ({ messageId }: { messageId: string }) => {
      set((state) => ({
        messages: state.messages.filter(m => m.id !== messageId),
        threadMessages: state.threadMessages.filter(m => m.id !== messageId)
      }));
    };

    const handleReactionChanged = ({ messageId, reactions }: { messageId: string; reactions: any }) => {
      set((state) => ({
        messages: state.messages.map(m => m.id === messageId ? { ...m, reactions } : m),
        threadMessages: state.threadMessages.map(m => m.id === messageId ? { ...m, reactions } : m)
      }));
    };

    const handleUserTyping = ({ roomId, user }: { roomId: string; user: { id: string; username: string } }) => {
      if (roomId !== get().activeRoomId) return;
      const userStr = localStorage.getItem('johncord_user');
      let currentUserId = '';
      if (userStr) {
        try { currentUserId = JSON.parse(userStr).id; } catch (e) {}
      }
      if (user.id === currentUserId) return;

      set((state) => {
        if (state.typingUsers.some(u => u.id === user.id)) return state;
        return { typingUsers: [...state.typingUsers, user] };
      });

      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        set({ typingUsers: [] });
      }, 3000);
    };

    socket.on('chat:message_received', handleNewMessage);
    socket.on('chat:message_updated', handleMessageUpdated);
    socket.on('chat:message_deleted', handleMessageDeleted);
    socket.on('chat:reaction_changed', handleReactionChanged);
    socket.on('chat:user_typing', handleUserTyping);

    return () => {
      socket.off('chat:message_received', handleNewMessage);
      socket.off('chat:message_updated', handleMessageUpdated);
      socket.off('chat:message_deleted', handleMessageDeleted);
      socket.off('chat:reaction_changed', handleReactionChanged);
      socket.off('chat:user_typing', handleUserTyping);
    };
  }
}));
