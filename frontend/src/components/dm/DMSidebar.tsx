import React from 'react';
import { useFriendStore } from '../../stores/useFriendStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import {
  Users,
  Plus,
  MessageSquare,
  Mic,
  MicOff,
  Headphones,
  VolumeX,
  Settings,
  PhoneOff,
  Video,
  Monitor
} from 'lucide-react';

interface DMSidebarProps {
  onOpenUserSettings: () => void;
}

export const DMSidebar: React.FC<DMSidebarProps> = ({ onOpenUserSettings }) => {
  const { dms, currentDMId, selectDM, friends } = useFriendStore();
  const user = useAuthStore((state) => state.user);
  const {
    currentVoiceChannel,
    leaveVoiceChannel,
    isMuted,
    isDeafened,
    isVideoOn,
    isScreenSharing,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenShare
  } = useVoiceStore();

  const pendingCount = friends.filter((f) => f.status === 'pending' && !f.isSender).length;

  return (
    <div className="flex h-full w-60 flex-col bg-[#2b2d31] select-none shrink-0 border-r border-[#1f2023]">
      {/* Search Header Button */}
      <div className="flex h-12 items-center px-3 border-b border-[#1f2023] shadow-sm">
        <button
          onClick={() => selectDM('')}
          className="flex h-7 w-full items-center justify-center rounded bg-[#1e1f22] px-2 text-xs text-[#949ba4] hover:text-[#dbdee1] transition"
        >
          Buscar ou iniciar conversa
        </button>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {/* Friends Navigation Item */}
        <button
          onClick={() => selectDM('')}
          className={`flex w-full items-center justify-between rounded px-3 py-[6px] min-h-[34px] text-sm font-medium transition cursor-pointer ${
            !currentDMId
              ? 'bg-[#404249] text-white'
              : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
          }`}
        >
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5" />
            <span>Amigos</span>
          </div>

          {pendingCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#f23f43] text-[10px] font-bold text-white">
              {pendingCount}
            </span>
          )}
        </button>

        {/* Direct Messages Header */}
        <div className="flex items-center justify-between px-3 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#949ba4]">
          <span>Mensagens Diretas</span>
        </div>

        {/* DM Conversations List */}
        {dms.map((dm) => {
          const otherUser = dm.members?.find((m) => m.id !== user?.id) || dm.members?.[0];
          const isSelected = currentDMId === dm.id;

          return (
            <button
              key={dm.id}
              onClick={() => selectDM(dm.id)}
              className={`group flex w-full items-center gap-3 rounded px-2 py-[6px] min-h-[34px] text-sm font-medium transition cursor-pointer ${
                isSelected
                  ? 'bg-[#404249] text-white'
                  : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
              }`}
            >
              <div className="relative shrink-0">
                <img
                  src={
                    otherUser?.avatar_url ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUser?.username || 'DM'}`
                  }
                  alt=""
                  className="h-8 w-8 rounded-full object-cover bg-[#1e1f22]"
                />
                <div
                  className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#2b2d31] ${
                    otherUser?.presence === 'online'
                      ? 'bg-[#23a55a]'
                      : otherUser?.presence === 'idle'
                      ? 'bg-[#f0b232]'
                      : otherUser?.presence === 'dnd'
                      ? 'bg-[#f23f43]'
                      : 'bg-[#80848e]'
                  }`}
                />
              </div>

              <div className="truncate flex-1 text-left">
                <div className="truncate text-xs font-semibold text-[#dbdee1]">
                  {otherUser?.username || 'Conversa'}
                </div>
                {otherUser?.custom_status && (
                  <div className="truncate text-[10px] text-[#949ba4]">
                    {otherUser.custom_status}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Voice Status Card if connected */}
      {currentVoiceChannel && (
        <div className="p-2 border-t border-[#1f2023] bg-[#232428]">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-[#23a55a] animate-pulse" />
              <div>
                <div className="text-xs font-bold text-[#23a55a]">Conectado a Voz</div>
                <div className="text-[11px] text-[#949ba4] truncate max-w-[120px]">
                  {currentVoiceChannel.name}
                </div>
              </div>
            </div>

            <button
              onClick={leaveVoiceChannel}
              title="Desconectar"
              className="rounded p-1 text-[#f23f43] hover:bg-[#f23f43]/20 transition-colors cursor-pointer"
            >
              <PhoneOff className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom User Bar */}
      <div className="flex h-[52px] items-center justify-between bg-[#232428] px-2 border-t border-[#1f2023]">
        <button
          onClick={onOpenUserSettings}
          className="flex items-center gap-2 rounded p-1 hover:bg-[#35373c] transition-colors cursor-pointer flex-1 truncate text-left mr-1"
        >
          <div className="relative shrink-0">
            <img
              src={user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`}
              alt={user?.username}
              className="h-8 w-8 rounded-full object-cover bg-[#1e1f22]"
            />
            <div
              className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#232428] ${
                user?.presence === 'online'
                  ? 'bg-[#23a55a]'
                  : user?.presence === 'idle'
                  ? 'bg-[#f0b232]'
                  : user?.presence === 'dnd'
                  ? 'bg-[#f23f43]'
                  : 'bg-[#80848e]'
              }`}
            />
          </div>

          <div className="truncate">
            <div className="truncate text-xs font-bold text-white">{user?.username}</div>
            <div className="text-[11px] text-[#949ba4]">#{user?.tag}</div>
          </div>
        </button>

        <div className="flex items-center gap-0.5 text-[#b5bac1]">
          <button
            onClick={toggleMute}
            className={`rounded p-1.5 hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer ${
              isMuted ? 'text-[#f23f43]' : ''
            }`}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <button
            onClick={toggleDeafen}
            className={`rounded p-1.5 hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer ${
              isDeafened ? 'text-[#f23f43]' : ''
            }`}
          >
            {isDeafened ? <VolumeX className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
          </button>

          <button
            onClick={onOpenUserSettings}
            className="rounded p-1.5 hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
