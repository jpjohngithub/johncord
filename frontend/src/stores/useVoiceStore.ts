import { create } from 'zustand';
import { VoiceParticipant, Channel } from '../types';
import { getSocket } from '../services/socket';
import { soundEffects } from '../utils/audio';

interface VoiceState {
  currentVoiceChannel: Channel | null;
  currentVoiceServerId: string | null;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  speakingUsers: Set<string>;
  userVolumes: Record<string, number>; // userId -> volume 0 to 200
  
  // Media Streams
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>; // userId -> MediaStream

  // Actions
  joinVoiceChannel: (channel: Channel, serverId?: string) => Promise<void>;
  leaveVoiceChannel: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleVideo: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  setUserVolume: (userId: string, volume: number) => void;
  setSpeaking: (userId: string, isSpeaking: boolean) => void;
  setRemoteStream: (userId: string, stream: MediaStream) => void;
  removeRemoteStream: (userId: string) => void;
  
  setupVoiceSocketListeners: () => () => void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  currentVoiceChannel: null,
  currentVoiceServerId: null,
  participants: [],
  isMuted: false,
  isDeafened: false,
  isVideoOn: false,
  isScreenSharing: false,
  speakingUsers: new Set(),
  userVolumes: {},
  localStream: null,
  screenStream: null,
  remoteStreams: {},

  joinVoiceChannel: async (channel, serverId) => {
    // If already in same channel, do nothing
    if (get().currentVoiceChannel?.id === channel.id) return;

    // If in different channel, leave first
    if (get().currentVoiceChannel) {
      get().leaveVoiceChannel();
    }

    soundEffects.playVoiceJoin();

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
    } catch (e) {
      console.warn('Microphone access not granted or unavailable:', e);
    }

    const userStr = localStorage.getItem('johncord_user');
    let user = null;
    if (userStr) {
      try { user = JSON.parse(userStr); } catch (e) {}
    }

    set({
      currentVoiceChannel: channel,
      currentVoiceServerId: serverId || null,
      localStream: stream,
      isMuted: false,
      isDeafened: false,
      isVideoOn: false,
      isScreenSharing: false
    });

    const socket = getSocket();
    socket.emit('voice:join', {
      channelId: channel.id,
      user,
      serverId
    });
  },

  leaveVoiceChannel: () => {
    const channel = get().currentVoiceChannel;
    if (!channel) return;

    soundEffects.playVoiceLeave();

    // Stop local mic stream tracks
    const localStream = get().localStream;
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
    }

    // Stop screen share stream tracks
    const screenStream = get().screenStream;
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
    }

    const socket = getSocket();
    socket.emit('voice:leave');

    set({
      currentVoiceChannel: null,
      currentVoiceServerId: null,
      participants: [],
      localStream: null,
      screenStream: null,
      remoteStreams: {},
      speakingUsers: new Set(),
      isVideoOn: false,
      isScreenSharing: false
    });
  },

  toggleMute: () => {
    const isMuted = !get().isMuted;
    const localStream = get().localStream;
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }

    if (isMuted) {
      soundEffects.playMute();
    } else {
      soundEffects.playUnmute();
    }

    set({ isMuted });

    const channel = get().currentVoiceChannel;
    if (channel) {
      const socket = getSocket();
      socket.emit('voice:state_change', {
        channelId: channel.id,
        updates: { muted: isMuted }
      });
    }
  },

  toggleDeafen: () => {
    const isDeafened = !get().isDeafened;
    const isMuted = isDeafened ? true : get().isMuted;

    const localStream = get().localStream;
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }

    if (isDeafened) {
      soundEffects.playMute();
    } else {
      soundEffects.playUnmute();
    }

    set({ isDeafened, isMuted });

    const channel = get().currentVoiceChannel;
    if (channel) {
      const socket = getSocket();
      socket.emit('voice:state_change', {
        channelId: channel.id,
        updates: { deafened: isDeafened, muted: isMuted }
      });
    }
  },

  toggleVideo: async () => {
    const isVideoOn = !get().isVideoOn;
    const channel = get().currentVoiceChannel;

    try {
      if (isVideoOn) {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const localStream = get().localStream || new MediaStream();
        videoStream.getVideoTracks().forEach(track => localStream.addTrack(track));
        set({ isVideoOn: true, localStream });
      } else {
        const localStream = get().localStream;
        if (localStream) {
          localStream.getVideoTracks().forEach(track => {
            track.stop();
            localStream.removeTrack(track);
          });
        }
        set({ isVideoOn: false });
      }

      if (channel) {
        const socket = getSocket();
        socket.emit('voice:state_change', {
          channelId: channel.id,
          updates: { video: isVideoOn }
        });
      }
    } catch (err) {
      console.warn('Camera toggle error:', err);
    }
  },

  toggleScreenShare: async () => {
    const isScreenSharing = !get().isScreenSharing;
    const channel = get().currentVoiceChannel;

    try {
      if (isScreenSharing) {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screen.getVideoTracks()[0].onended = () => {
          get().toggleScreenShare();
        };
        set({ isScreenSharing: true, screenStream: screen });
      } else {
        const screenStream = get().screenStream;
        if (screenStream) {
          screenStream.getTracks().forEach(t => t.stop());
        }
        set({ isScreenSharing: false, screenStream: null });
      }

      if (channel) {
        const socket = getSocket();
        socket.emit('voice:state_change', {
          channelId: channel.id,
          updates: { screenShare: isScreenSharing }
        });
      }
    } catch (err) {
      console.warn('Screen share toggle error:', err);
    }
  },

  setUserVolume: (userId, volume) => {
    set((state) => ({
      userVolumes: { ...state.userVolumes, [userId]: volume }
    }));
  },

  setSpeaking: (userId, isSpeaking) => {
    set((state) => {
      const updated = new Set(state.speakingUsers);
      if (isSpeaking) {
        updated.add(userId);
      } else {
        updated.delete(userId);
      }
      return { speakingUsers: updated };
    });
  },

  setRemoteStream: (userId, stream) => {
    set((state) => ({
      remoteStreams: { ...state.remoteStreams, [userId]: stream }
    }));
  },

  removeRemoteStream: (userId) => {
    set((state) => {
      const copy = { ...state.remoteStreams };
      delete copy[userId];
      return { remoteStreams: copy };
    });
  },

  setupVoiceSocketListeners: () => {
    const socket = getSocket();

    const handleAllParticipants = ({ channelId, participants }: { channelId: string; participants: VoiceParticipant[] }) => {
      if (get().currentVoiceChannel?.id === channelId) {
        set({ participants });
      }
    };

    const handleUserJoined = ({ participant }: { participant: VoiceParticipant }) => {
      if (get().currentVoiceChannel?.id === participant.channelId) {
        set((state) => ({
          participants: [...state.participants.filter(p => p.userId !== participant.userId), participant]
        }));
      }
    };

    const handleUserLeft = ({ userId }: { userId: string }) => {
      set((state) => ({
        participants: state.participants.filter(p => p.userId !== userId)
      }));
      get().removeRemoteStream(userId);
    };

    const handleUserStateUpdated = ({ userId, updates }: { userId: string; updates: Partial<VoiceParticipant> }) => {
      set((state) => ({
        participants: state.participants.map(p => p.userId === userId ? { ...p, ...updates } : p)
      }));
    };

    const handleUserSpeaking = ({ userId, speaking }: { userId: string; speaking: boolean }) => {
      get().setSpeaking(userId, speaking);
    };

    socket.on('voice:all_participants', handleAllParticipants);
    socket.on('voice:user_joined', handleUserJoined);
    socket.on('voice:user_left', handleUserLeft);
    socket.on('voice:user_state_updated', handleUserStateUpdated);
    socket.on('voice:user_speaking', handleUserSpeaking);

    return () => {
      socket.off('voice:all_participants', handleAllParticipants);
      socket.off('voice:user_joined', handleUserJoined);
      socket.off('voice:user_left', handleUserLeft);
      socket.off('voice:user_state_updated', handleUserStateUpdated);
      socket.off('voice:user_speaking', handleUserSpeaking);
    };
  }
}));
