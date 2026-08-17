import { Peer, MediaConnection } from 'peerjs';
import { useVoiceStore } from '../stores/useVoiceStore';
import { publishGlobalEvent, subscribeGlobalTopic } from './globalRealtime';
import { VoiceParticipant } from '../types';

let peerInstance: Peer | null = null;
const activeCalls: Map<string, MediaConnection> = new Map();
const audioAnalysers: Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }> = new Map();
let globalAudioCtx: AudioContext | null = null;
let volumeCheckRaf: number | null = null;
let currentChannelTopicUnsub: (() => void) | null = null;

function getAudioContext(): AudioContext {
  if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
    globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

export function startVoiceConnection(
  channelId: string,
  localStream: MediaStream,
  user: any
) {
  stopVoiceConnection();

  const peerId = `jc_peer_${user.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  console.log(`🎙️ [Johncord Voice] Initializing WebRTC voice mesh for channel ${channelId} with PeerID: ${peerId}`);

  try {
    peerInstance = new Peer(peerId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      },
      debug: 1
    });

    peerInstance.on('open', (id) => {
      console.log('🎤 [Johncord Voice] PeerJS ready on global mesh:', id);

      // Broadcast join event to global real-time room
      publishGlobalEvent(`johncord/voice/${channelId}`, {
        type: 'peer_join',
        peerId: id,
        user,
        channelId
      });
    });

    // Handle incoming voice calls from other users in this channel
    peerInstance.on('call', (call) => {
      console.log('📞 [Johncord Voice] Answering incoming audio stream from:', call.peer);
      call.answer(localStream);

      call.on('stream', (remoteStream) => {
        console.log('🔊 [Johncord Voice] Audio stream active from:', call.peer);
        const remoteUserId = call.peer.replace('jc_peer_', '');
        
        useVoiceStore.getState().setRemoteStream(remoteUserId, remoteStream);

        const currentParticipants = useVoiceStore.getState().participants;
        if (!currentParticipants.some(p => p.userId === remoteUserId)) {
          const newParticipant: VoiceParticipant = {
            userId: remoteUserId,
            socketId: call.peer,
            username: call.metadata?.username || `Usuário`,
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

        attachStreamVolumeAnalyser(remoteUserId, remoteStream);
      });

      activeCalls.set(call.peer, call);
    });

    peerInstance.on('error', (err) => {
      console.warn('⚠️ [Johncord Voice] Peer error:', err.type, err.message);
    });
  } catch (err) {
    console.warn('Failed to start PeerJS:', err);
  }

  // Monitor local microphone volume for glowing green speaking stroke
  attachLocalMicAnalyser(localStream, user.id, channelId);

  // Subscribe to voice room signaling across the internet
  currentChannelTopicUnsub = subscribeGlobalTopic(`johncord/voice/${channelId}`, (payload) => {
    if (payload.type === 'peer_join' && payload.peerId !== peerId) {
      console.log(`👋 [Johncord Voice] Discovered remote peer in room: ${payload.peerId} (${payload.user?.username})`);
      
      // Call the newcomer
      callRemotePeer(payload.peerId, localStream, user, payload.user);

      // Reply with our presence so they know we are already here
      publishGlobalEvent(`johncord/voice/${channelId}`, {
        type: 'peer_presence',
        peerId,
        user,
        channelId
      });
    } else if (payload.type === 'peer_presence' && payload.peerId !== peerId) {
      callRemotePeer(payload.peerId, localStream, user, payload.user);
    } else if (payload.type === 'peer_speaking' && payload.userId !== user.id) {
      useVoiceStore.getState().setSpeaking(payload.userId, payload.speaking);
    } else if (payload.type === 'peer_leave') {
      const remoteUserId = payload.peerId.replace('jc_peer_', '');
      useVoiceStore.getState().removeRemoteStream(remoteUserId);
      activeCalls.get(payload.peerId)?.close();
      activeCalls.delete(payload.peerId);
    }
  });

  return () => {
    publishGlobalEvent(`johncord/voice/${channelId}`, {
      type: 'peer_leave',
      peerId,
      userId: user.id
    });
    stopVoiceConnection();
  };
}

export function callRemotePeer(remotePeerId: string, localStream: MediaStream, localUser: any, remoteUser: any) {
  if (!peerInstance || peerInstance.destroyed || !localStream) return;
  if (activeCalls.has(remotePeerId)) return;

  console.log('📡 [Johncord Voice] Dialing peer across internet:', remotePeerId);

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
        console.log('🔊 [Johncord Voice] Audio stream connected with:', remotePeerId);
        const remoteUserId = remotePeerId.replace('jc_peer_', '');
        
        useVoiceStore.getState().setRemoteStream(remoteUserId, remoteStream);

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

function attachLocalMicAnalyser(stream: MediaStream, userId: string, channelId: string) {
  try {
    const audioCtx = getAudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;
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
          publishGlobalEvent(`johncord/voice/${channelId}`, {
            type: 'peer_speaking',
            userId,
            speaking: false
          });
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
      const isSpeaking = avg > 12; // High sensitivity threshold

      if (isSpeaking !== wasSpeaking) {
        wasSpeaking = isSpeaking;
        useVoiceStore.getState().setSpeaking(userId, isSpeaking);

        publishGlobalEvent(`johncord/voice/${channelId}`, {
          type: 'peer_speaking',
          userId,
          speaking: isSpeaking
        });
      }

      volumeCheckRaf = requestAnimationFrame(checkLocalVolume);
    };

    checkLocalVolume();
  } catch (e) {
    console.warn('Mic analyser setup error:', e);
  }
}

function attachStreamVolumeAnalyser(userId: string, stream: MediaStream) {
  try {
    if (audioAnalysers.has(userId)) return;

    const audioCtx = getAudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser);

    audioAnalysers.set(userId, { analyser, source });

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let wasSpeaking = false;

    const checkRemoteVolume = () => {
      if (!useVoiceStore.getState().remoteStreams[userId]) return;

      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const avg = sum / bufferLength;
      const isSpeaking = avg > 12;

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

  if (currentChannelTopicUnsub) {
    currentChannelTopicUnsub();
    currentChannelTopicUnsub = null;
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
