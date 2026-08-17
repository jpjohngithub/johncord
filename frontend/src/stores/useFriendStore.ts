import { create } from 'zustand';
import { FriendItem, DMConversation, User } from '../types';
import { apiRequest } from '../services/api';
import { getSocket } from '../services/socket';
import { soundEffects } from '../utils/audio';

interface IncomingCallData {
  dmId: string;
  caller: User;
  withVideo: boolean;
}

interface FriendState {
  friends: FriendItem[];
  dms: DMConversation[];
  currentDMId: string | null;
  currentDM: DMConversation | null;
  activeTab: 'online' | 'all' | 'pending' | 'add';
  isLoadingFriends: boolean;
  isLoadingDMs: boolean;
  
  // Calling state
  incomingCall: IncomingCallData | null;
  outgoingCall: { dmId: string; targetUser: User; withVideo: boolean } | null;
  isCallActive: boolean;
  callWithVideo: boolean;

  // Actions
  loadFriends: () => Promise<void>;
  sendFriendRequest: (userTag: string) => Promise<string>;
  acceptFriendRequest: (friendshipId: string) => Promise<void>;
  rejectFriendRequest: (friendshipId: string) => Promise<void>;
  loadDMs: () => Promise<void>;
  openDMWithUser: (userId: string) => Promise<DMConversation>;
  selectDM: (dmId: string) => void;
  setActiveTab: (tab: 'online' | 'all' | 'pending' | 'add') => void;
  
  // Call actions
  startCall: (targetUser: User, withVideo?: boolean) => void;
  answerCall: () => void;
  declineCall: () => void;
  endCall: () => void;

  setupFriendSocketListeners: () => () => void;
}

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  dms: [],
  currentDMId: null,
  currentDM: null,
  activeTab: 'online',
  isLoadingFriends: false,
  isLoadingDMs: false,

  incomingCall: null,
  outgoingCall: null,
  isCallActive: false,
  callWithVideo: false,

  loadFriends: async () => {
    set({ isLoadingFriends: true });
    try {
      const data = await apiRequest('/friends');
      set({ friends: data.friends, isLoadingFriends: false });
    } catch (err) {
      set({ isLoadingFriends: false });
    }
  },

  sendFriendRequest: async (userTag) => {
    const data = await apiRequest('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ userTag })
    });
    await get().loadFriends();
    return data.message;
  },

  acceptFriendRequest: async (friendshipId) => {
    await apiRequest(`/friends/${friendshipId}/accept`, { method: 'POST' });
    await get().loadFriends();
  },

  rejectFriendRequest: async (friendshipId) => {
    await apiRequest(`/friends/${friendshipId}`, { method: 'DELETE' });
    await get().loadFriends();
  },

  loadDMs: async () => {
    set({ isLoadingDMs: true });
    try {
      const data = await apiRequest('/dms');
      set({ dms: data.conversations, isLoadingDMs: false });
    } catch (err) {
      set({ isLoadingDMs: false });
    }
  },

  openDMWithUser: async (userId) => {
    const data = await apiRequest('/dms', {
      method: 'POST',
      body: JSON.stringify({ targetUserId: userId })
    });
    await get().loadDMs();
    get().selectDM(data.conversation.id);
    return data.conversation;
  },

  selectDM: (dmId) => {
    const dm = get().dms.find(d => d.id === dmId) || null;
    set({ currentDMId: dmId, currentDM: dm });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  startCall: (targetUser, withVideo = false) => {
    const currentDM = get().currentDM;
    const userStr = localStorage.getItem('johncord_user');
    if (!currentDM || !userStr) return;
    const caller = JSON.parse(userStr);

    set({
      outgoingCall: { dmId: currentDM.id, targetUser, withVideo },
      callWithVideo: withVideo
    });

    soundEffects.startRinging();

    const socket = getSocket();
    socket.emit('dm:call_start', {
      dmId: currentDM.id,
      caller,
      receiverId: targetUser.id,
      withVideo
    });
  },

  answerCall: () => {
    const incoming = get().incomingCall;
    if (!incoming) return;

    soundEffects.stopRinging();
    soundEffects.playVoiceJoin();

    set({
      incomingCall: null,
      isCallActive: true,
      callWithVideo: incoming.withVideo
    });

    const socket = getSocket();
    socket.emit('dm:call_accepted', {
      dmId: incoming.dmId,
      callerId: incoming.caller.id
    });
  },

  declineCall: () => {
    const incoming = get().incomingCall;
    if (!incoming) return;

    soundEffects.stopRinging();
    set({ incomingCall: null });

    const socket = getSocket();
    socket.emit('dm:call_rejected', {
      dmId: incoming.dmId,
      callerId: incoming.caller.id
    });
  },

  endCall: () => {
    soundEffects.stopRinging();
    soundEffects.playVoiceLeave();

    const outgoing = get().outgoingCall;
    const incoming = get().incomingCall;
    const targetUserId = outgoing?.targetUser.id || incoming?.caller.id;
    const dmId = outgoing?.dmId || incoming?.dmId || get().currentDMId;

    set({
      outgoingCall: null,
      incomingCall: null,
      isCallActive: false
    });

    const socket = getSocket();
    socket.emit('dm:call_end', {
      dmId,
      targetUserId
    });
  },

  setupFriendSocketListeners: () => {
    const socket = getSocket();

    const handleIncomingCall = (data: IncomingCallData) => {
      set({ incomingCall: data });
      soundEffects.startRinging();
    };

    const handleCallAnswered = () => {
      soundEffects.stopRinging();
      soundEffects.playVoiceJoin();
      set({ outgoingCall: null, isCallActive: true });
    };

    const handleCallDeclined = () => {
      soundEffects.stopRinging();
      soundEffects.playVoiceLeave();
      set({ outgoingCall: null });
    };

    const handleCallTerminated = () => {
      soundEffects.stopRinging();
      soundEffects.playVoiceLeave();
      set({ outgoingCall: null, incomingCall: null, isCallActive: false });
    };

    const handlePresenceChanged = ({ userId, presence, custom_status }: { userId: string; presence: any; custom_status?: string }) => {
      set((state) => ({
        friends: state.friends.map(f => {
          if (f.friend?.id === userId) {
            return {
              ...f,
              friend: { ...f.friend, presence, custom_status: custom_status ?? f.friend.custom_status }
            };
          }
          return f;
        }),
        dms: state.dms.map(dm => ({
          ...dm,
          members: dm.members?.map(m => m.id === userId ? { ...m, presence, custom_status: custom_status ?? m.custom_status } : m)
        }))
      }));
    };

    socket.on('dm:incoming_call', handleIncomingCall);
    socket.on('dm:call_answered', handleCallAnswered);
    socket.on('dm:call_declined', handleCallDeclined);
    socket.on('dm:call_terminated', handleCallTerminated);
    socket.on('user:presence_changed', handlePresenceChanged);

    return () => {
      socket.off('dm:incoming_call', handleIncomingCall);
      socket.off('dm:call_answered', handleCallAnswered);
      socket.off('dm:call_declined', handleCallDeclined);
      socket.off('dm:call_terminated', handleCallTerminated);
      socket.off('user:presence_changed', handlePresenceChanged);
    };
  }
}));
