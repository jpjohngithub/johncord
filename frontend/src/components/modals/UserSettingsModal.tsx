import React, { useState } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { soundEffects } from '../../utils/audio';
import {
  X,
  User,
  Volume2,
  LogOut,
  Sparkles,
  Check,
  Headphones,
  Mic,
  Smile
} from 'lucide-react';

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, updateProfile, setStatus, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'voice'>('profile');

  const [username, setUsername] = useState(user?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [bannerUrl, setBannerUrl] = useState(user?.banner_url || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [customStatus, setCustomStatus] = useState(user?.custom_status || '');
  const [presence, setPresence] = useState<'online' | 'idle' | 'dnd' | 'offline'>(
    user?.presence || 'online'
  );

  const [saveMessage, setSaveMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen || !user) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProfile({
        username: username.trim(),
        avatar_url: avatarUrl.trim() || undefined,
        banner_url: bannerUrl.trim() || undefined,
        bio: bio.trim(),
        custom_status: customStatus.trim(),
        presence
      });
      setSaveMessage('Perfil atualizado com sucesso!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-[#313338] select-none animate-fade-in">
      {/* Left Tab Sidebar */}
      <div className="flex w-60 flex-col items-end bg-[#2b2d31] p-6 pr-4 border-r border-[#1f2023]">
        <div className="w-48 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4] px-2 py-1">
            Configurações de Usuário
          </div>

          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full rounded px-2.5 py-1.5 text-left text-xs font-semibold transition cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-[#3f4147] text-white'
                : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
            }`}
          >
            Perfil do Usuário
          </button>

          <button
            onClick={() => setActiveTab('voice')}
            className={`w-full rounded px-2.5 py-1.5 text-left text-xs font-semibold transition cursor-pointer ${
              activeTab === 'voice'
                ? 'bg-[#3f4147] text-white'
                : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
            }`}
          >
            Voz e Áudio
          </button>

          <div className="pt-4 border-t border-[#3f4147] mt-4">
            <button
              onClick={logout}
              className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs font-semibold text-[#f23f43] hover:bg-[#f23f43]/15 transition cursor-pointer"
            >
              <span>Sair da Conta</span>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Form Content */}
      <div className="flex-1 flex flex-col overflow-y-auto p-10 max-w-3xl relative">
        {/* ESC button */}
        <div className="absolute top-10 right-10 flex flex-col items-center">
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#b5bac1] text-[#b5bac1] hover:border-white hover:text-white transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="text-[10px] uppercase font-bold text-[#949ba4] mt-1">ESC</span>
        </div>

        {saveMessage && (
          <div className="mb-4 rounded-lg bg-[#23a55a]/15 border border-[#23a55a]/40 p-3 text-xs text-[#23a55a] flex items-center gap-2">
            <Check className="h-4 w-4" />
            <span>{saveMessage}</span>
          </div>
        )}

        {/* Tab 1: Profile */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Perfil do Usuário</h2>
              <p className="text-xs text-[#949ba4] mt-1">
                Personalize como os outros membros veem você no Johncord.
              </p>
            </div>

            {/* Profile Live Card Preview */}
            <div className="rounded-2xl bg-[#1e1f22] overflow-hidden border border-[#3f4147] max-w-md shadow-xl">
              {/* Banner */}
              <div
                className="h-28 w-full bg-cover bg-center relative bg-[#5865f2]"
                style={{
                  backgroundImage: bannerUrl ? `url(${bannerUrl})` : undefined
                }}
              />
              {/* Avatar + Info */}
              <div className="p-4 pt-0 relative space-y-3">
                <div className="relative -mt-12 mb-2 inline-block">
                  <img
                    src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username || 'user'}`}
                    alt=""
                    className="h-20 w-20 rounded-full border-4 border-[#1e1f22] bg-[#2b2d31] object-cover"
                  />
                  <div
                    className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-[#1e1f22] ${
                      presence === 'online'
                        ? 'bg-[#23a55a]'
                        : presence === 'idle'
                        ? 'bg-[#f0b232]'
                        : presence === 'dnd'
                        ? 'bg-[#f23f43]'
                        : 'bg-[#80848e]'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-base font-bold text-white leading-tight">
                    {username || user.username}{' '}
                    <span className="text-xs text-[#949ba4]">#{user.tag}</span>
                  </div>
                  {customStatus && (
                    <div className="text-xs text-[#dbdee1] font-medium flex items-center gap-1">
                      <span>{customStatus}</span>
                    </div>
                  )}
                  {bio && (
                    <p className="text-xs text-[#949ba4] whitespace-pre-wrap pt-1">{bio}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Edit Form */}
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                  Status de Presença
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setPresence('online')}
                    className={`flex items-center gap-2 rounded-lg p-2.5 text-xs font-semibold border transition cursor-pointer ${
                      presence === 'online'
                        ? 'bg-[#23a55a]/20 border-[#23a55a] text-white'
                        : 'bg-[#1e1f22] border-[#3f4147] text-[#949ba4]'
                    }`}
                  >
                    <div className="h-2.5 w-2.5 rounded-full bg-[#23a55a]" />
                    Online
                  </button>

                  <button
                    type="button"
                    onClick={() => setPresence('idle')}
                    className={`flex items-center gap-2 rounded-lg p-2.5 text-xs font-semibold border transition cursor-pointer ${
                      presence === 'idle'
                        ? 'bg-[#f0b232]/20 border-[#f0b232] text-white'
                        : 'bg-[#1e1f22] border-[#3f4147] text-[#949ba4]'
                    }`}
                  >
                    <div className="h-2.5 w-2.5 rounded-full bg-[#f0b232]" />
                    Ausente
                  </button>

                  <button
                    type="button"
                    onClick={() => setPresence('dnd')}
                    className={`flex items-center gap-2 rounded-lg p-2.5 text-xs font-semibold border transition cursor-pointer ${
                      presence === 'dnd'
                        ? 'bg-[#f23f43]/20 border-[#f23f43] text-white'
                        : 'bg-[#1e1f22] border-[#3f4147] text-[#949ba4]'
                    }`}
                  >
                    <div className="h-2.5 w-2.5 rounded-full bg-[#f23f43]" />
                    Ocupado (DND)
                  </button>

                  <button
                    type="button"
                    onClick={() => setPresence('offline')}
                    className={`flex items-center gap-2 rounded-lg p-2.5 text-xs font-semibold border transition cursor-pointer ${
                      presence === 'offline'
                        ? 'bg-[#80848e]/20 border-[#80848e] text-white'
                        : 'bg-[#1e1f22] border-[#3f4147] text-[#949ba4]'
                    }`}
                  >
                    <div className="h-2.5 w-2.5 rounded-full bg-[#80848e]" />
                    Invisível
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                  Status Personalizado (Texto ou Atividade)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Jogando Valorant 🎮, Ouvindo Música 🎧"
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value)}
                  className="w-full rounded-sm bg-[#1e1f22] p-3 text-sm text-white outline-none focus:ring-0 border border-[#3f4147] focus:border-[#5865f2] transition-colors"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                  Nome de Exibição
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-sm bg-[#1e1f22] p-3 text-sm text-white outline-none focus:ring-0 border border-[#3f4147] focus:border-[#5865f2] transition-colors"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                  URL do Avatar
                </label>
                <input
                  type="url"
                  placeholder="https://exemplo.com/avatar.png"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full rounded-sm bg-[#1e1f22] p-3 text-sm text-white outline-none focus:ring-0 border border-[#3f4147] focus:border-[#5865f2] transition-colors"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                  URL do Banner de Perfil
                </label>
                <input
                  type="url"
                  placeholder="https://exemplo.com/banner.jpg"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  className="w-full rounded-sm bg-[#1e1f22] p-3 text-sm text-white outline-none focus:ring-0 border border-[#3f4147] focus:border-[#5865f2] transition-colors"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                  Sobre Mim (Biografia)
                </label>
                <textarea
                  rows={3}
                  placeholder="Conte um pouco sobre você..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full rounded-sm bg-[#1e1f22] p-3 text-sm text-white outline-none focus:ring-0 border border-[#3f4147] focus:border-[#5865f2] transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="rounded-sm bg-[#5865f2] hover:bg-[#4752c4] px-6 py-2.5 text-xs font-medium text-white transition cursor-pointer"
              >
                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: Voice & Audio Test */}
        {activeTab === 'voice' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Configurações de Voz e Áudio</h2>
              <p className="text-xs text-[#949ba4] mt-1">
                Ajuste os dispositivos de entrada e teste os efeitos sonoros do Johncord.
              </p>
            </div>

            <div className="rounded-xl bg-[#2b2d31] p-4 border border-[#3f4147] space-y-4">
              <h3 className="text-sm font-bold text-white">Testar Efeitos Sonoros do Johncord</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => soundEffects.playVoiceJoin()}
                  className="rounded-sm bg-[#1e1f22] hover:bg-[#35373c] p-3 text-xs font-semibold text-white transition cursor-pointer"
                >
                  🔊 Entrada de Voz
                </button>
                <button
                  type="button"
                  onClick={() => soundEffects.playVoiceLeave()}
                  className="rounded-sm bg-[#1e1f22] hover:bg-[#35373c] p-3 text-xs font-semibold text-white transition cursor-pointer"
                >
                  🔇 Saída de Voz
                </button>
                <button
                  type="button"
                  onClick={() => soundEffects.playMessagePing()}
                  className="rounded-sm bg-[#1e1f22] hover:bg-[#35373c] p-3 text-xs font-semibold text-white transition cursor-pointer"
                >
                  💬 Notificação de Chat
                </button>
                <button
                  type="button"
                  onClick={() => soundEffects.playMute()}
                  className="rounded-sm bg-[#1e1f22] hover:bg-[#35373c] p-3 text-xs font-semibold text-white transition cursor-pointer"
                >
                  🎤 Silenciar Microfone
                </button>
                <button
                  type="button"
                  onClick={() => soundEffects.playUnmute()}
                  className="rounded-sm bg-[#1e1f22] hover:bg-[#35373c] p-3 text-xs font-semibold text-white transition cursor-pointer"
                >
                  🎙️ Ativar Microfone
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
