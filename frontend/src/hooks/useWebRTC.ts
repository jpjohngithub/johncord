import { useEffect } from 'react';
import { useVoiceStore } from '../stores/useVoiceStore';
import { useAuthStore } from '../stores/useAuthStore';
import { startVoiceConnection, stopVoiceConnection } from '../services/voiceWebRTC';

export function useWebRTC() {
  const { currentVoiceChannel, localStream } = useVoiceStore();
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (currentVoiceChannel && localStream && user) {
      console.log(`🎙️ [Johncord WebRTC] Starting voice room mesh in channel: ${currentVoiceChannel.name} (${currentVoiceChannel.id})`);
      const cleanup = startVoiceConnection(currentVoiceChannel.id, localStream, user);
      return () => {
        cleanup();
      };
    } else {
      stopVoiceConnection();
    }
  }, [currentVoiceChannel?.id, localStream, user?.id]);
}
