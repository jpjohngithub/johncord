import React, { useState } from 'react';
import { useServerStore } from '../../stores/useServerStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  Hash,
  Volume2,
  ChevronDown,
  Plus,
  Settings,
  UserPlus,
  FolderPlus,
  LogOut,
  Mic,
  MicOff,
  Headphones,
  SlidersHorizontal,
  Monitor,
  Video,
  VolumeX,
  PhoneOff
} from 'lucide-react';
import { Channel } from '../../types';

interface ChannelSidebarProps {
  onOpenUserSettings: () => void;
}

export const ChannelSidebar: React.FC<ChannelSidebarProps> = ({ onOpenUserSettings }) => {
  const {
    currentServer,
    currentChannelId,
    selectChannel,
    openCreateChannelModal,
    setCreateCategoryModalOpen,
    setServerSettingsModalOpen,
    setInviteModalOpen,
    leaveServer
  } = useServerStore();

  const {
    currentVoiceChannel,
    participants,
    joinVoiceChannel,
    leaveVoiceChannel,
    isMuted,
    isDeafened,
    isVideoOn,
    isScreenSharing,
    speakingUsers,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenShare
  } = useVoiceStore();

  const user = useAuthStore((state) => state.user);
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  if (!currentServer) return null;

  const toggleCategory = (catId: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const handleChannelClick = (channel: Channel) => {
    if (channel.type === 'text') {
      selectChannel(channel.id);
    } else {
      // Join voice channel
      joinVoiceChannel(channel, currentServer.id);
    }
  };

  const isOwner = currentServer.owner_id === user?.id;

  return (
    <div className="flex h-full w-60 flex-col bg-[#2b2d31] select-none shrink-0 relative">
      {/* Server Header Dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsServerMenuOpen(!isServerMenuOpen)}
          className="flex h-12 w-full items-center justify-between px-4 border-b border-[#1f2023] hover:bg-[#35373c] transition-colors font-bold text-white shadow-sm cursor-pointer"
        >
          <span className="truncate text-sm font-semibold">{currentServer.name}</span>
          <ChevronDown
            className={`h-4 w-4 text-[#949ba4] transition-transform duration-200 ${
              isServerMenuOpen ? 'rotate-180 text-white' : ''
            }`}
          />
        </button>

        {/* Server Context Dropdown Menu */}
        {isServerMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setIsServerMenuOpen(false)}
            />
            <div className="absolute top-12 left-2 right-2 z-40 rounded-lg bg-[#111214] p-1.5 shadow-xl border border-[#232428] space-y-0.5 animate-scale-up">
              <button
                onClick={() => {
                  setInviteModalOpen(true);
                  setIsServerMenuOpen(false);
                }}
                className="flex w-full items-center justify-between rounded px-2.5 py-2 text-xs font-medium text-[#5865f2] hover:bg-[#5865f2] hover:text-white transition-colors cursor-pointer"
              >
                <span>Convidar Pessoas</span>
                <UserPlus className="h-4 w-4" />
              </button>

              <button
                onClick={() => {
                  setServerSettingsModalOpen(true);
                  setIsServerMenuOpen(false);
                }}
                className="flex w-full items-center justify-between rounded px-2.5 py-2 text-xs font-medium text-[#dbdee1] hover:bg-[#5865f2] hover:text-white transition-colors cursor-pointer"
              >
                <span>Configurações do Servidor</span>
                <Settings className="h-4 w-4" />
              </button>

              <button
                onClick={() => {
                  openCreateChannelModal('text');
                  setIsServerMenuOpen(false);
                }}
                className="flex w-full items-center justify-between rounded px-2.5 py-2 text-xs font-medium text-[#dbdee1] hover:bg-[#5865f2] hover:text-white transition-colors cursor-pointer"
              >
                <span>Criar Canal</span>
                <Plus className="h-4 w-4" />
              </button>

              <button
                onClick={() => {
                  setCreateCategoryModalOpen(true);
                  setIsServerMenuOpen(false);
                }}
                className="flex w-full items-center justify-between rounded px-2.5 py-2 text-xs font-medium text-[#dbdee1] hover:bg-[#5865f2] hover:text-white transition-colors cursor-pointer"
              >
                <span>Criar Categoria</span>
                <FolderPlus className="h-4 w-4" />
              </button>

              {!isOwner && (
                <div className="pt-1 border-t border-[#2b2d31]">
                  <button
                    onClick={() => {
                      leaveServer(currentServer.id);
                      setIsServerMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded px-2.5 py-2 text-xs font-medium text-[#f23f43] hover:bg-[#f23f43] hover:text-white transition-colors cursor-pointer"
                  >
                    <span>Sair do Servidor</span>
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Channels & Categories List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 space-y-4">
        {/* Categories */}
        {currentServer.categories?.map((cat) => {
          const isCollapsed = !!collapsedCategories[cat.id];
          return (
            <div key={cat.id} className="space-y-0.5">
              {/* Category Header */}
              <div className="group flex items-center justify-between px-1 py-1 text-[11px] font-bold text-[#949ba4] uppercase tracking-wider hover:text-[#dbdee1]">
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="flex items-center gap-1 cursor-pointer flex-1 text-left truncate"
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform duration-150 ${
                      isCollapsed ? '-rotate-90' : ''
                    }`}
                  />
                  <span className="truncate">{cat.name}</span>
                </button>

                <button
                  onClick={() => openCreateChannelModal('text', cat.id)}
                  title="Criar Canal na Categoria"
                  className="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity p-0.5 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Channels inside this Category */}
              {!isCollapsed && (
                <div className="space-y-[2px] pl-1">
                  {cat.channels?.map((ch) => {
                    const isSelected = currentChannelId === ch.id;
                    const isVoice = ch.type === 'voice';
                    const isInVoice = currentVoiceChannel?.id === ch.id;

                    return (
                      <div key={ch.id} className="space-y-[2px]">
                        <button
                          onClick={() => handleChannelClick(ch)}
                          className={`group flex w-full items-center gap-2 rounded px-2 py-[6px] min-h-[34px] text-sm font-medium transition-colors cursor-pointer ${
                            isSelected && !isVoice
                              ? 'bg-[#404249] text-white'
                              : isInVoice
                              ? 'bg-[#35373c] text-[#23a55a]'
                              : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
                          }`}
                        >
                          {isVoice ? (
                            <Volume2 className="h-4 w-4 shrink-0 text-[#80848e] group-hover:text-white" />
                          ) : (
                            <Hash className="h-4 w-4 shrink-0 text-[#80848e] group-hover:text-white" />
                          )}
                          <span className="truncate flex-1 text-left">{ch.name}</span>
                        </button>

                        {/* Live voice participants in this channel */}
                        {isVoice && isInVoice && (
                          <div className="pl-6 pr-2 space-y-1 py-1">
                            {participants.map((p) => {
                              const isTalking = speakingUsers.has(p.userId);
                              return (
                                <div
                                  key={p.userId}
                                  className="flex items-center justify-between text-xs py-1 px-1.5 rounded bg-[#232428]/60"
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <div className="relative">
                                      <img
                                        src={p.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.username}`}
                                        alt={p.username}
                                        className={`h-5 w-5 rounded-full object-cover ${
                                          isTalking ? 'speaking-ring' : ''
                                        }`}
                                      />
                                    </div>
                                    <span
                                      className={`truncate text-xs font-medium ${
                                        isTalking ? 'text-[#23a55a] font-bold' : 'text-[#dbdee1]'
                                      }`}
                                    >
                                      {p.username}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 text-[#949ba4]">
                                    {p.muted && <MicOff className="h-3 w-3 text-[#f23f43]" />}
                                    {p.deafened && <VolumeX className="h-3 w-3 text-[#f23f43]" />}
                                    {p.screenShare && (
                                      <span className="flex items-center gap-0.5 rounded bg-[#5865f2] px-1 text-[9px] font-bold text-white uppercase">
                                        AO VIVO
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Unassigned channels if any */}
        {currentServer.unassignedChannels && currentServer.unassignedChannels.length > 0 && (
          <div className="space-y-[2px] pl-1">
            {currentServer.unassignedChannels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => handleChannelClick(ch)}
                className={`group flex w-full items-center gap-2 rounded px-2 py-[6px] min-h-[34px] text-sm font-medium transition-colors cursor-pointer ${
                  currentChannelId === ch.id
                    ? 'bg-[#404249] text-white'
                    : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
                }`}
              >
                {ch.type === 'voice' ? <Volume2 className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                <span className="truncate flex-1 text-left">{ch.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Voice Connected Status Card */}
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

      {/* User Bottom Bar */}
      <div className="flex h-[52px] items-center justify-between bg-[#232428] px-2 border-t border-[#1f2023]">
        {/* User Avatar + Tag */}
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
            {/* Status dot */}
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

        {/* Audio Control Quick Buttons */}
        <div className="flex items-center gap-0.5 text-[#b5bac1]">
          <button
            onClick={toggleMute}
            title={isMuted ? 'Desativar Mudo' : 'Silenciar Microfone'}
            className={`rounded p-1.5 hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer ${
              isMuted ? 'text-[#f23f43]' : ''
            }`}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <button
            onClick={toggleDeafen}
            title={isDeafened ? 'Desativar Ensurdecer' : 'Ensurdecer'}
            className={`rounded p-1.5 hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer ${
              isDeafened ? 'text-[#f23f43]' : ''
            }`}
          >
            {isDeafened ? <VolumeX className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
          </button>

          <button
            onClick={onOpenUserSettings}
            title="Configurações de Usuário"
            className="rounded p-1.5 hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
