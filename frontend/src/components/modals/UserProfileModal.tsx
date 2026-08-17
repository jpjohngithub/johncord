import React from 'react';
import { User } from '../../types';
import { useFriendStore } from '../../stores/useFriendStore';
import { useServerStore } from '../../stores/useServerStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { X, MessageSquare, Phone, Video, Shield } from 'lucide-react';

interface UserProfileModalProps {
  user: User | null;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ user: targetUser, onClose }) => {
  const currentUser = useAuthStore((state) => state.user);
  const { openDMWithUser, startCall } = useFriendStore();
  const { selectServer } = useServerStore();

  if (!targetUser) return null;

  const isMe = targetUser.id === currentUser?.id;
  const isBot = targetUser.username.toLowerCase().includes('bot');

  const handleOpenDM = async () => {
    onClose();
    selectServer(null);
    await openDMWithUser(targetUser.id);
  };

  const handleCall = async (withVideo: boolean) => {
    onClose();
    selectServer(null);
    await openDMWithUser(targetUser.id);
    startCall(targetUser, withVideo);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 select-none p-4 animate-fade-in" onClick={onClose}>
      <div className="flex w-full max-w-sm flex-col rounded bg-[#1e1f22] shadow-2xl border border-[#3f4147] overflow-hidden animate-scale-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Banner */}
        <div
          className="h-28 w-full bg-cover bg-center relative bg-[#5865f2]"
          style={{
            backgroundImage: targetUser.banner_url ? `url(${targetUser.banner_url})` : undefined
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/80 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Avatar & User Details */}
        <div className="p-4 pt-0 relative space-y-4">
          <div className="relative -mt-12 inline-block">
            <img
              src={
                targetUser.avatar_url ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetUser.username}`
              }
              alt=""
              className="h-20 w-20 rounded-full border-4 border-[#1e1f22] bg-[#2b2d31] object-cover"
            />
            <div
              className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-[#1e1f22] ${
                targetUser.presence === 'online'
                  ? 'bg-[#23a55a]'
                  : targetUser.presence === 'idle'
                  ? 'bg-[#f0b232]'
                  : targetUser.presence === 'dnd'
                  ? 'bg-[#f23f43]'
                  : 'bg-[#80848e]'
              }`}
            />
          </div>

          <div className="rounded-xl bg-[#2b2d31] p-3 space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white leading-tight">
                  {targetUser.username}
                </h3>
                <span className="text-xs text-[#949ba4]">#{targetUser.tag}</span>
                {isBot && (
                  <span className="rounded bg-[#5865f2] px-1 py-0.2 text-[9px] font-bold uppercase text-white">
                    BOT
                  </span>
                )}
              </div>

              {targetUser.custom_status && (
                <div className="text-xs text-[#23a55a] font-semibold mt-1">
                  {targetUser.custom_status}
                </div>
              )}
            </div>

            <div className="h-[1px] w-full bg-[#3f4147]" />

            {/* About Me */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#b5bac1] mb-1">
                Sobre Mim
              </h4>
              <p className="text-xs text-[#dbdee1] whitespace-pre-wrap">
                {targetUser.bio || 'Este usuário ainda não adicionou uma biografia.'}
              </p>
            </div>

            {/* Member Since */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#b5bac1] mb-1">
                Membro do Johncord Desde
              </h4>
              <p className="text-xs text-[#dbdee1]">
                {targetUser.created_at
                  ? new Date(targetUser.created_at).toLocaleDateString('pt-BR', {
                      month: 'long',
                      year: 'numeric'
                    })
                  : 'Agosto de 2026'}
              </p>
            </div>
          </div>

          {/* Action Buttons if not myself */}
          {!isMe && (
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleOpenDM}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#5865f2] hover:bg-[#4752c4] py-2 text-xs font-medium text-white transition cursor-pointer"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Mensagem
              </button>

              <button
                onClick={() => handleCall(false)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#2b2d31] hover:bg-[#35373c] text-white py-2 text-xs font-bold transition cursor-pointer"
              >
                <Phone className="h-3.5 w-3.5 text-[#23a55a]" />
                Voz
              </button>

              <button
                onClick={() => handleCall(true)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#2b2d31] hover:bg-[#35373c] text-white py-2 text-xs font-bold transition cursor-pointer"
              >
                <Video className="h-3.5 w-3.5 text-[#5865f2]" />
                Vídeo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
