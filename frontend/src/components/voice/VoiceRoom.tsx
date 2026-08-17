import React, { useRef, useEffect } from 'react';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  Mic,
  MicOff,
  Headphones,
  VolumeX,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  Volume2,
  Sliders,
  Sparkles
} from 'lucide-react';
import { VoiceParticipant } from '../../types';

export const VoiceRoom: React.FC = () => {
  const {
    currentVoiceChannel,
    participants,
    leaveVoiceChannel,
    isMuted,
    isDeafened,
    isVideoOn,
    isScreenSharing,
    speakingUsers,
    userVolumes,
    setUserVolume,
    localStream,
    screenStream,
    remoteStreams,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenShare
  } = useVoiceStore();

  const user = useAuthStore((state) => state.user);

  if (!currentVoiceChannel) return null;

  return (
    <div className="flex h-full flex-1 flex-col bg-[#1e1f22] select-none relative overflow-hidden">
      {/* Header */}
      <div className="flex h-12 items-center justify-between px-4 border-b border-[#111214] bg-[#2b2d31] text-white">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-[#23a55a] animate-pulse" />
          <span className="font-bold text-sm">Canal de Voz: {currentVoiceChannel.name}</span>
          <span className="text-xs text-[#949ba4]">
            ({participants.length + (user && !participants.some(p => p.userId === user.id) ? 1 : 0)} conectados)
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#949ba4]">
          <Sparkles className="h-4 w-4 text-[#5865f2]" />
          <span>Qualidade HD WebRTC</span>
        </div>
      </div>

      {/* Main Grid View of Participants & Screen Share */}
      <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center relative">
        {/* Vignette */}
        <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-[#111214]/50 to-transparent pointer-events-none z-10" />
        
        <div className="grid w-full h-full max-h-[85vh] gap-3 auto-rows-fr grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 z-0">
          {/* Local User Tile */}
          {user && (
            <ParticipantTile
              participant={{
                userId: user.id,
                socketId: '',
                username: user.username,
                avatar_url: user.avatar_url,
                channelId: currentVoiceChannel.id,
                muted: isMuted,
                deafened: isDeafened,
                video: isVideoOn,
                screenShare: isScreenSharing
              }}
              isLocal={true}
              localStream={localStream}
              screenStream={screenStream}
              isSpeaking={speakingUsers.has(user.id)}
              volume={100}
              onVolumeChange={() => {}}
            />
          )}

          {/* Remote Participants Tiles */}
          {participants
            .filter((p) => p.userId !== user?.id)
            .map((participant) => (
              <ParticipantTile
                key={participant.userId}
                participant={participant}
                isLocal={false}
                remoteStream={remoteStreams[participant.userId]}
                isSpeaking={speakingUsers.has(participant.userId)}
                volume={userVolumes[participant.userId] ?? 100}
                onVolumeChange={(val) => setUserVolume(participant.userId, val)}
              />
            ))}
        </div>
      </div>

      {/* Bottom Voice Control Dock */}
      <div className="flex h-20 items-center justify-center gap-4 bg-[#232428] px-6 border-t border-[#111214]">
        {/* Toggle Video Camera */}
        <button
          onClick={toggleVideo}
          title={isVideoOn ? 'Desligar Câmera' : 'Ligar Câmera'}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-all cursor-pointer ${
            isVideoOn
              ? 'bg-[#23a55a] text-white hover:bg-[#1f914f]'
              : 'bg-[#313338] text-[#dbdee1] hover:bg-[#3f4147]'
          }`}
        >
          {isVideoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </button>

        {/* Toggle Screen Share */}
        <button
          onClick={toggleScreenShare}
          title={isScreenSharing ? 'Parar Transmissão' : 'Transmitir Tela'}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-all cursor-pointer ${
            isScreenSharing
              ? 'bg-[#5865f2] text-white hover:bg-[#4752c4]'
              : 'bg-[#313338] text-[#dbdee1] hover:bg-[#3f4147]'
          }`}
        >
          <Monitor className="h-5 w-5" />
        </button>

        {/* Mute Mic */}
        <button
          onClick={toggleMute}
          title={isMuted ? 'Desativar Mudo' : 'Silenciar Microfone'}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-all cursor-pointer ${
            isMuted
              ? 'bg-[#f23f43] text-white hover:bg-[#d83539]'
              : 'bg-[#313338] text-[#dbdee1] hover:bg-[#3f4147]'
          }`}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>

        {/* Deafen */}
        <button
          onClick={toggleDeafen}
          title={isDeafened ? 'Desativar Ensurdecer' : 'Ensurdecer'}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-all cursor-pointer ${
            isDeafened
              ? 'bg-[#f23f43] text-white hover:bg-[#d83539]'
              : 'bg-[#313338] text-[#dbdee1] hover:bg-[#3f4147]'
          }`}
        >
          {isDeafened ? <VolumeX className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
        </button>

        {/* Disconnect Call Button */}
        <button
          onClick={leaveVoiceChannel}
          title="Desconectar da Sala de Voz"
          className="flex h-12 w-16 items-center justify-center rounded-full bg-[#f23f43] text-white hover:bg-[#d83539] transition-all cursor-pointer shadow-lg shadow-[#f23f43]/30"
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
};

interface ParticipantTileProps {
  participant: VoiceParticipant;
  isLocal: boolean;
  localStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  remoteStream?: MediaStream;
  isSpeaking: boolean;
  volume: number;
  onVolumeChange: (vol: number) => void;
}

const ParticipantTile: React.FC<ParticipantTileProps> = ({
  participant,
  isLocal,
  localStream,
  screenStream,
  remoteStream,
  isSpeaking,
  volume,
  onVolumeChange
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Attach Video Stream
  useEffect(() => {
    if (videoRef.current) {
      if (isLocal) {
        if (screenStream) {
          videoRef.current.srcObject = screenStream;
        } else if (localStream && participant.video) {
          videoRef.current.srcObject = localStream;
        } else {
          videoRef.current.srcObject = null;
        }
      } else if (remoteStream) {
        videoRef.current.srcObject = remoteStream;
      }
    }
  }, [isLocal, localStream, screenStream, remoteStream, participant.video, participant.screenShare]);

  // Adjust Remote Audio volume
  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
      audioRef.current.volume = Math.min(Math.max(volume / 100, 0), 1);
    }
  }, [remoteStream, volume]);

  const hasVideo = isLocal
    ? !!screenStream || (!!localStream && participant.video)
    : !!remoteStream && remoteStream.getVideoTracks().length > 0;

  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-lg bg-[#2b2d31] p-4 overflow-hidden border-2 transition-all min-h-[180px] shadow-lg ${
        isSpeaking ? 'border-[#23a55a]' : 'border-[#1f2023]'
      }`}
    >
      {/* Remote Audio element */}
      {!isLocal && <audio ref={audioRef} autoPlay />}

      {/* Video or Screen Share Stream Display */}
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="absolute inset-0 h-full w-full object-cover bg-black rounded-lg"
        />
      ) : (
        /* Avatar Center Display with Speaking Ring */
        <div className="relative flex flex-col items-center justify-center z-10">
          <div className="relative">
            <img
              src={
                participant.avatar_url ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${participant.username}`
              }
              alt={participant.username}
              className={`h-20 w-20 rounded-full object-cover bg-[#1e1f22] border-4 ${
                isSpeaking ? 'speaking-ring border-[#23a55a]' : 'border-transparent'
              }`}
            />
          </div>
        </div>
      )}

      {/* Bottom Participant Info Overlay Bar */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-lg bg-[#111214]/80 backdrop-blur-md px-3 py-1.5 z-20">
        <div className="flex items-center gap-2 truncate">
          <span className="truncate text-xs font-bold text-white">
            {participant.username} {isLocal && '(Você)'}
          </span>
          {participant.screenShare && (
            <span className="rounded bg-[#5865f2] px-1.5 py-0.5 text-[9px] font-black uppercase text-white tracking-wider">
              AO VIVO
            </span>
          )}
        </div>

        {/* Status icons + Volume slider popup */}
        <div className="flex items-center gap-2">
          {participant.muted && <MicOff className="h-3.5 w-3.5 text-[#f23f43]" />}
          {participant.deafened && <VolumeX className="h-3.5 w-3.5 text-[#f23f43]" />}

          {!isLocal && (
            <div className="group relative flex items-center">
              <button title="Volume do Usuário" className="text-[#b5bac1] hover:text-white cursor-pointer">
                <Volume2 className="h-3.5 w-3.5" />
              </button>
              {/* Volume Slider Popup on hover */}
              <div className="absolute bottom-6 right-0 hidden group-hover:flex flex-col items-center rounded bg-[#1e1f22] p-2 shadow-xl border border-[#3f4147] z-30">
                <span className="text-[10px] font-bold text-white mb-1">{volume}%</span>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={volume}
                  onChange={(e) => onVolumeChange(Number(e.target.value))}
                  className="h-1.5 w-20 accent-[#5865f2] cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
