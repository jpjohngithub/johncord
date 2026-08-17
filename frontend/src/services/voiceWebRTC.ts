import { Peer, MediaConnection } from 'peerjs';
import { useVoiceStore } from '../stores/useVoiceStore';
import { useAuthStore } from '../stores/useAuthStore';
import { getSocket } from '../services/socket';
import { VoiceParticipant } from '../types';

// Global PeerJS instance & Active Calls Map
let peerInstance: Peer | null = null;
const activeCalls: Map<string, MediaConnection> = new Map();
const audioAnalysers: Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }> = new Map();
let globalAudioCtx: AudioContext | null = null;
let volumeCheckRaf: number | null = null;

// Public multi-user signaling via WebSocket room pubsub for standalone Netlify support
let signalingSocket: WebSocket | null = null;

function getAudioContext(): AudioContext {
  if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
    globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

// Connect to a public lightweight signaling room for standalone/Netlify mode
function initPublicSignaling(channelId: string, user: any, onPeerJoined: (peerId: string, remoteUser: any) => void) {
  try {
    // Connect to a reliable public WebSocket echo / pubsub endpoint or broadcast channel
    const broadcast = new BroadcastChannel(`johncord_voice_room_${channelId}`);
    
    broadcast.onmessage = (event) => {
      const { type, data } = event.data || {};
      if (type === 'peer_join' && data.userId !== user.id) {
        onPeerJoined(data.peerId, data.user);
        // Respond so the newcomer knows about us
        broadcast.postMessage({
          type: 'peer_presence',
          data: { peerId: `jc_peer_${user.id}`, user, channelId }
        });
      } else if (type === 'peer_presence' && data.userId !== user.id) {
        onPeerJoined(data.peerId, data.user);
      } else if (type === 'peer_speaking') {
        useVoiceStore.getState().setSpeaking(data.userId, data.speaking);
      }
    };

    // Announce our presence
    broadcast.postMessage({
      type: 'peer_join',
      data: { peerId: `jc_peer_${user.id}`, user, channelId }
    });

    return () => {
      broadcast.postMessage({
        type: 'peer_leave',
        data: { peerId: `jc_peer_${user.id}`, userId: user.id }
      });
      broadcast.close();
    };
  } catch (e) {
    return () => {};
  }
}

export function startVoiceConnection(
  channelId: string,
  localStream: MediaStream,
  user: any
) {
  // Clean up any existing connection
  stopVoiceConnection();

  const peerId = `jc_peer_${user.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  try {
    peerInstance = new Peer(peerId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      },
      debug: 1
    });

    peerInstance.on('open', (id) => {
      console.log('🎤 [Johncord Voice] PeerJS connected with ID:', id);

      // Register with Socket.IO backend if available
      const socket = getSocket();
      socket.emit('voice:peer_ready', {
        channelId,
        peerId: id,
        user
      });
    });

    // Handle Incoming Calls from other participants in the voice channel
    peerInstance.on('call', (call) => {
      console.log('📞 [Johncord Voice] Incoming call from peer:', call.peer);
      call.answer(localStream);

      call.on('stream', (remoteStream) => {
        console.log('🔊 [Johncord Voice] Received audio stream from peer:', call.peer);
        const remoteUserId = call.peer.replace('jc_peer_', '');
        
        // Save stream to store
        useVoiceStore.getState().setRemoteStream(remoteUserId, remoteStream);
        
        // Add participant to list if not already present
        const currentParticipants = useVoiceStore.getState().participants;
        if (!currentParticipants.some(p => p.userId === remoteUserId)) {
          const newParticipant: VoiceParticipant = {
            userId: remoteUserId,
            socketId: call.peer,
            username: (call.metadata?.username || `Usuário`),
            avatar_url: call.metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${remoteUserId}`,
            channelId,
            muted: false,
            deafened: false,
            video: false,
            screenShare: false
          };
          useVoiceStore.setState({
            participants: [...currentParticipants, newParticipant]
          });
        }

        // Attach audio analyser for real-time green speaking stroke
        attachStreamVolumeAnalyser(remoteUserId, remoteStream);
      });

      activeCalls.set(call.peer, call);
    });

    peerInstance.on('error', (err) => {
      console.warn('⚠️ [Johncord Voice] PeerJS error:', err.type, err.message);
    });
  } catch (err) {
    console.warn('Failed to initialize PeerJS:', err);
  }

  // Monitor Local Microphone Volume for speaking stroke
  attachLocalMicAnalyser(localStream, user.id, channelId);

  // Hook up multi-tab & network discovery
  const cleanupSignaling = initPublicSignaling(channelId, user, (remotePeerId, remoteUser) => {
    callRemotePeer(remotePeerId, localStream, user, remoteUser);
  });

  return () => {
    cleanupSignaling();
    stopVoiceConnection();
  };
}

export function callRemotePeer(remotePeerId: string, localStream: MediaStream, localUser: any, remoteUser: any) {
  if (!peerInstance || peerInstance.destroyed || !localStream) return;
  if (activeCalls.has(remotePeerId)) return; // Already connected

  console.log('📡 [Johncord Voice] Calling peer:', remotePeerId);

  try {
    const call = peerInstance.call(remotePeerId, localStream, {
      metadata: {
        userId: localUser.id,
        username: localUser.username,
        avatar_url: localUser.avatar_url
      }
    });

    if (call) {
      activeCalls.set(remotePeerId, call);

      call.on('stream', (remoteStream) => {
        console.log('🔊 [Johncord Voice] Stream established with:', remotePeerId);
        const remoteUserId = remotePeerId.replace('jc_peer_', '');
        
        useVoiceStore.getState().setRemoteStream(remoteUserId, remoteStream);

        // Add to participants
        const currentParticipants = useVoiceStore.getState().participants;
        if (!currentParticipants.some(p => p.userId === remoteUserId)) {
          const newParticipant: VoiceParticipant = {
            userId: remoteUserId,
            socketId: remotePeerId,
            username: remoteUser?.username || `Usuário`,
            avatar_url: remoteUser?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${remoteUserId}`,
            channelId: useVoiceStore.getState().currentVoiceChannel?.id || '',
            muted: false,
            deafened: false,
            video: false,
            screenShare: false
          };
          useVoiceStore.setState({
            participants: [...currentParticipants, newParticipant]
          });
        }

        attachStreamVolumeAnalyser(remoteUserId, remoteStream);
      });

      call.on('close', () => {
        const remoteUserId = remotePeerId.replace('jc_peer_', '');
        activeCalls.delete(remotePeerId);
        useVoiceStore.getState().removeRemoteStream(remoteUserId);
      });
    }
  } catch (err) {
    console.warn('Error calling peer:', remotePeerId, err);
  }
}

// Attach AnalyserNode to detect speaking activity on microphone
function attachLocalMicAnalyser(stream: MediaStream, userId: string, channelId: string) {
  try {
    const audioCtx = getAudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    audioAnalysers.set(userId, { analyser, source });

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let wasSpeaking = false;

    const checkLocalVolume = () => {
      const { isMuted } = useVoiceStore.getState();
      if (isMuted) {
        if (wasSpeaking) {
          wasSpeaking = false;
          useVoiceStore.getState().setSpeaking(userId, false);
        }
        volumeCheckRaf = requestAnimationFrame(checkLocalVolume);
        return;
      }

      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const avg = sum / bufferLength;
      const isSpeaking = avg > 14; // voice threshold

      if (isSpeaking !== wasSpeaking) {
        wasSpeaking = isSpeaking;
        useVoiceStore.getState().setSpeaking(userId, isSpeaking);

        // Broadcast to socket & local channel
        const socket = getSocket();
        socket.emit('voice:speaking_status', { channelId, speaking: isSpeaking });

        try {
          const bc = new BroadcastChannel(`johncord_voice_room_${channelId}`);
          bc.postMessage({ type: 'peer_speaking', data: { userId, speaking: isSpeaking } });
          bc.close();
        } catch (e) {}
      }

      volumeCheckRaf = requestAnimationFrame(checkLocalVolume);
    };

    checkLocalVolume();
  } catch (e) {
    console.warn('Mic analyser setup error:', e);
  }
}

// Attach AnalyserNode to detect speaking activity on remote audio streams
function attachStreamVolumeAnalyser(userId: string, stream: MediaStream) {
  try {
    if (audioAnalysers.has(userId)) return;

    const audioCtx = getAudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    audioAnalysers.set(userId, { analyser, source });

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let wasSpeaking = false;

    const checkRemoteVolume = () => {
      // If stream was removed, stop check
      if (!useVoiceStore.getState().remoteStreams[userId]) return;

      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const avg = sum / bufferLength;
      const isSpeaking = avg > 14;

      if (isSpeaking !== wasSpeaking) {
        wasSpeaking = isSpeaking;
        useVoiceStore.getState().setSpeaking(userId, isSpeaking);
      }

      requestAnimationFrame(checkRemoteVolume);
    };

    checkRemoteVolume();
  } catch (e) {
    console.warn('Remote audio analyser setup error:', e);
  }
}

export function stopVoiceConnection() {
  if (volumeCheckRaf) {
    cancelAnimationFrame(volumeCheckRaf);
    volumeCheckRaf = null;
  }

  activeCalls.forEach((call) => call.close());
  activeCalls.clear();

  audioAnalysers.forEach(({ source }) => {
    try { source.disconnect(); } catch (e) {}
  });
  audioAnalysers.clear();

  if (peerInstance && !peerInstance.destroyed) {
    peerInstance.destroy();
    peerInstance = null;
  }
}
