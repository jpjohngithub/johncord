import { useEffect, useRef } from 'react';
import { useVoiceStore } from '../stores/useVoiceStore';
import { useAuthStore } from '../stores/useAuthStore';
import { getSocket } from '../services/socket';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export function useWebRTC() {
  const {
    currentVoiceChannel,
    participants,
    localStream,
    screenStream,
    isMuted,
    setRemoteStream,
    removeRemoteStream,
    setSpeaking
  } = useVoiceStore();

  const user = useAuthStore((state) => state.user);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 1. Microphone Voice Activity Detection (AnalyserNode)
  useEffect(() => {
    if (!localStream || !user || isMuted) {
      if (user) setSpeaking(user.id, false);
      return;
    }

    try {
      const audioTrack = localStream.getAudioTracks()[0];
      if (!audioTrack) return;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(localStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let wasSpeaking = false;

      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const isSpeaking = average > 18; // threshold

        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          setSpeaking(user.id, isSpeaking);

          if (currentVoiceChannel) {
            const socket = getSocket();
            socket.emit('voice:speaking_status', {
              channelId: currentVoiceChannel.id,
              speaking: isSpeaking
            });
          }
        }

        animationFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn('Voice activity analyzer error:', e);
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (user) setSpeaking(user.id, false);
    };
  }, [localStream, user, isMuted, currentVoiceChannel]);

  // 2. WebRTC Peer Connections for Voice Room
  useEffect(() => {
    if (!currentVoiceChannel || !user) return;
    const socket = getSocket();

    // Listen for incoming signal
    const handleSignalReceived = async ({
      fromSocketId,
      fromUserId,
      signal
    }: {
      fromSocketId: string;
      fromUserId: string;
      signal: any;
    }) => {
      let pc = peerConnections.current.get(fromUserId);

      if (!pc) {
        pc = createPeerConnection(fromUserId, fromSocketId);
        peerConnections.current.set(fromUserId, pc);
      }

      if (signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('voice:signal', {
            targetSocketId: fromSocketId,
            signal: { sdp: pc.localDescription },
            fromUserId: user.id
          });
        }
      } else if (signal.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (e) {}
      }
    };

    function createPeerConnection(remoteUserId: string, remoteSocketId: string) {
      const pc = new RTCPeerConnection(RTC_CONFIG);

      // Add local tracks
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
      }
      if (screenStream) {
        screenStream.getTracks().forEach((track) => {
          pc.addTrack(track, screenStream);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('voice:signal', {
            targetSocketId: remoteSocketId,
            signal: { candidate: event.candidate },
            fromUserId: user!.id
          });
        }
      };

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0] || new MediaStream([event.track]);
        setRemoteStream(remoteUserId, remoteStream);
      };

      return pc;
    }

    // Connect to other participants
    participants.forEach(async (participant) => {
      if (participant.userId === user.id) return;
      if (!peerConnections.current.has(participant.userId)) {
        const pc = createPeerConnection(participant.userId, participant.socketId);
        peerConnections.current.set(participant.userId, pc);

        // Caller creates offer
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('voice:signal', {
            targetSocketId: participant.socketId,
            signal: { sdp: pc.localDescription },
            fromUserId: user.id
          });
        } catch (err) {
          console.warn('Error creating WebRTC offer:', err);
        }
      }
    });

    socket.on('voice:signal_received', handleSignalReceived);

    return () => {
      socket.off('voice:signal_received', handleSignalReceived);
    };
  }, [currentVoiceChannel, participants, localStream, screenStream, user]);

  // Clean up removed peers
  useEffect(() => {
    const currentParticipantIds = new Set(participants.map((p) => p.userId));
    peerConnections.current.forEach((pc, pId) => {
      if (!currentParticipantIds.has(pId)) {
        pc.close();
        peerConnections.current.delete(pId);
        removeRemoteStream(pId);
      }
    });
  }, [participants]);
}
