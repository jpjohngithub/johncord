import React, { useState } from 'react';
import { useFriendStore } from '../../stores/useFriendStore';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  Users,
  MessageSquare,
  Phone,
  Video,
  Check,
  X,
  UserPlus,
  Search,
  Sparkles,
  Gamepad2,
  Headphones
} from 'lucide-react';
import { User } from '../../types';

interface FriendsDashboardProps {
  onSelectUser: (user: User) => void;
}

export const FriendsDashboard: React.FC<FriendsDashboardProps> = ({ onSelectUser }) => {
  const {
    friends,
    activeTab,
    setActiveTab,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    openDMWithUser,
    startCall
  } = useFriendStore();

  const [tagInput, setTagInput] = useState('');
  const [requestStatus, setRequestStatus] = useState<{ msg: string; isError: boolean } | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestStatus(null);
    if (!tagInput.trim()) return;

    try {
      const msg = await sendFriendRequest(tagInput.trim());
      setRequestStatus({ msg, isError: false });
      setTagInput('');
    } catch (err: any) {
      setRequestStatus({ msg: err.message || 'Erro ao enviar pedido.', isError: true });
    }
  };

  // Filter friends based on activeTab
  const onlineFriends = friends.filter(
    (f) => f.status === 'accepted' && f.friend && f.friend.presence !== 'offline'
  );
  const allAcceptedFriends = friends.filter((f) => f.status === 'accepted' && f.friend);
  const pendingRequests = friends.filter((f) => f.status === 'pending' && f.friend);
  const pendingIncomingCount = friends.filter((f) => f.status === 'pending' && !f.isSender).length;

  let displayFriends = allAcceptedFriends;
  if (activeTab === 'online') displayFriends = onlineFriends;
  if (activeTab === 'pending') displayFriends = pendingRequests;

  if (searchFilter.trim()) {
    displayFriends = displayFriends.filter((f) =>
      f.friend?.username.toLowerCase().includes(searchFilter.toLowerCase())
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-[#313338] select-none">
      {/* Top Navbar with Tabs */}
      <div className="flex h-12 items-center justify-between px-4 border-b border-[#1f2023] bg-[#313338] shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-white font-bold text-sm pr-2 border-r border-[#3f4147]">
            <Users className="h-5 w-5 text-[#80848e]" />
            <span>Amigos</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('online')}
              className={`rounded px-2.5 py-1 text-sm font-semibold transition cursor-pointer ${
                activeTab === 'online'
                  ? 'bg-[#3f4147] text-white'
                  : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
              }`}
            >
              Disponível ({onlineFriends.length})
            </button>

            <button
              onClick={() => setActiveTab('all')}
              className={`rounded px-2.5 py-1 text-sm font-semibold transition cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-[#3f4147] text-white'
                  : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
              }`}
            >
              Todos ({allAcceptedFriends.length})
            </button>

            <button
              onClick={() => setActiveTab('pending')}
              className={`relative rounded px-2.5 py-1 text-sm font-semibold transition cursor-pointer ${
                activeTab === 'pending'
                  ? 'bg-[#3f4147] text-white'
                  : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
              }`}
            >
              Pendentes
              {pendingIncomingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-[#f23f43] px-1.5 py-0.2 text-[10px] font-bold text-white">
                  {pendingIncomingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('add')}
              className={`rounded px-2.5 py-1 text-sm font-semibold transition cursor-pointer ${
                activeTab === 'add'
                  ? 'bg-[#23a55a] text-white'
                  : 'bg-[#23a55a]/20 text-[#23a55a] hover:bg-[#23a55a] hover:text-white'
              }`}
            >
              Adicionar Amigo
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Friends List or Add Friend Form */}
        <div className="flex flex-1 flex-col overflow-y-auto p-6">
          {activeTab === 'add' ? (
            /* Add Friend Tab */
            <div className="max-w-xl space-y-4">
              <div>
                <h2 className="text-base font-bold uppercase text-white">Adicionar Amigo</h2>
                <p className="text-xs text-[#949ba4] mt-1">
                  Você pode adicionar amigos usando o nome de usuário e a tag no formato{' '}
                  <strong className="text-white">Nome#0000</strong>.
                </p>
              </div>

              <form onSubmit={handleSendRequest} className="relative mt-3">
                <input
                  type="text"
                  placeholder="Ex: JohnDev#1337 ou AnaGamer#4040"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  className="w-full rounded-xl bg-[#1e1f22] p-3.5 pr-48 text-sm text-white placeholder-[#80848e] outline-none border border-transparent focus:border-[#5865f2] transition"
                />
                <button
                  type="submit"
                  disabled={!tagInput.trim()}
                  className="absolute right-2 top-2 rounded-lg bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-40 px-4 py-2 text-xs font-semibold text-white transition cursor-pointer"
                >
                  Enviar Pedido
                </button>
              </form>

              {requestStatus && (
                <div
                  className={`rounded-lg p-3 text-xs ${
                    requestStatus.isError
                      ? 'bg-[#f23f43]/15 text-[#f23f43] border border-[#f23f43]/30'
                      : 'bg-[#23a55a]/15 text-[#23a55a] border border-[#23a55a]/30'
                  }`}
                >
                  {requestStatus.msg}
                </div>
              )}
            </div>
          ) : (
            /* Friends List View */
            <div className="space-y-4">
              {/* Search filter input */}
              <div className="flex items-center gap-2 rounded-lg bg-[#1e1f22] px-3 py-2 text-xs text-white max-w-md">
                <Search className="h-4 w-4 text-[#80848e]" />
                <input
                  type="text"
                  placeholder="Buscar amigo..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full bg-transparent text-xs text-white placeholder-[#80848e] outline-none"
                />
              </div>

              <div className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4]">
                {activeTab === 'online'
                  ? `Disponível — ${displayFriends.length}`
                  : activeTab === 'all'
                  ? `Todos os Amigos — ${displayFriends.length}`
                  : `Pedidos Pendentes — ${displayFriends.length}`}
              </div>

              {displayFriends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-[#949ba4]">
                  <Users className="h-16 w-16 text-[#4e5058] mb-3" />
                  <p className="text-sm font-semibold text-[#dbdee1]">Ninguém por aqui ainda.</p>
                  <p className="text-xs mt-1">
                    {activeTab === 'online'
                      ? 'Nenhum amigo online no momento.'
                      : activeTab === 'pending'
                      ? 'Nenhum pedido de amizade pendente.'
                      : 'Adicione amigos para começar a conversar!'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {displayFriends.map((f) => {
                    const u = f.friend!;
                    return (
                      <div
                        key={f.id}
                        className="group flex items-center justify-between rounded-lg p-2.5 hover:bg-[#35373c] transition-colors border-t border-[#3f4147]/50 first:border-none"
                      >
                        {/* User Card */}
                        <button
                          onClick={() => onSelectUser(u)}
                          className="flex items-center gap-3 cursor-pointer text-left"
                        >
                          <div className="relative">
                            <img
                              src={
                                u.avatar_url ||
                                `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`
                              }
                              alt=""
                              className="h-10 w-10 rounded-full object-cover bg-[#1e1f22]"
                            />
                            <div
                              className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#313338] ${
                                u.presence === 'online'
                                  ? 'bg-[#23a55a]'
                                  : u.presence === 'idle'
                                  ? 'bg-[#f0b232]'
                                  : u.presence === 'dnd'
                                  ? 'bg-[#f23f43]'
                                  : 'bg-[#80848e]'
                              }`}
                            />
                          </div>

                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm text-white group-hover:underline">
                                {u.username}
                              </span>
                              <span className="text-xs text-[#949ba4]">#{u.tag}</span>
                            </div>
                            <div className="text-xs text-[#949ba4] truncate max-w-[200px]" title={u.custom_status || (u.presence === 'online' ? 'Online' : 'Offline')}>
                              {u.custom_status || (u.presence === 'online' ? 'Online' : 'Offline')}
                            </div>
                          </div>
                        </button>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          {f.status === 'accepted' ? (
                            <>
                              <button
                                onClick={() => openDMWithUser(u.id)}
                                title="Abrir Mensagem Direta"
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2b2d31] text-[#dbdee1] hover:bg-[#111214] hover:text-white transition cursor-pointer"
                              >
                                <MessageSquare className="h-4 w-4" />
                              </button>

                              <button
                                onClick={() => {
                                  openDMWithUser(u.id).then(() => startCall(u, false));
                                }}
                                title="Iniciar Chamada de Voz"
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2b2d31] text-[#dbdee1] hover:bg-[#111214] hover:text-[#23a55a] transition cursor-pointer"
                              >
                                <Phone className="h-4 w-4" />
                              </button>

                              <button
                                onClick={() => {
                                  openDMWithUser(u.id).then(() => startCall(u, true));
                                }}
                                title="Iniciar Chamada de Vídeo"
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2b2d31] text-[#dbdee1] hover:bg-[#111214] hover:text-[#5865f2] transition cursor-pointer"
                              >
                                <Video className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            /* Pending request actions */
                            <>
                              {!f.isSender ? (
                                <>
                                  <button
                                    onClick={() => acceptFriendRequest(f.id)}
                                    title="Aceitar Pedido"
                                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[#23a55a]/20 text-[#23a55a] hover:bg-[#23a55a] hover:text-white transition cursor-pointer"
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => rejectFriendRequest(f.id)}
                                    title="Recusar Pedido"
                                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f23f43]/20 text-[#f23f43] hover:bg-[#f23f43] hover:text-white transition cursor-pointer"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => rejectFriendRequest(f.id)}
                                  title="Cancelar Pedido"
                                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2b2d31] text-[#f23f43] hover:bg-[#f23f43] hover:text-white transition cursor-pointer"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: "Ativo Agora" Activity Panel */}
        <div className="hidden xl:flex w-80 flex-col bg-[#2b2d31] p-4 border-l border-[#1f2023] select-none">
          <h3 className="font-black text-sm uppercase tracking-wider text-white mb-4">
            Ativo Agora
          </h3>

          <div className="space-y-3">
            {allAcceptedFriends.filter((f) => f.friend?.custom_status).length > 0 ? (
              allAcceptedFriends
                .filter((f) => f.friend?.custom_status)
                .map((f) => {
                  const u = f.friend!;
                  return (
                    <div
                      key={u.id}
                      onClick={() => onSelectUser(u)}
                      className="rounded-xl bg-[#1e1f22] p-3 border border-[#3f4147]/40 hover:border-[#5865f2] transition cursor-pointer space-y-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                        <div className="truncate">
                          <div className="text-xs font-bold text-white">{u.username}</div>
                          <div className="text-[10px] text-[#23a55a] font-medium">Jogando / Ativo</div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-[#2b2d31] p-2 text-xs font-medium text-[#dbdee1] flex items-center gap-2">
                        <Gamepad2 className="h-4 w-4 text-[#5865f2] shrink-0" />
                        <span className="truncate">{u.custom_status}</span>
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="text-center py-8 text-[#949ba4]">
                <p className="text-xs">Está tudo quieto por enquanto...</p>
                <p className="text-[11px] mt-1">
                  Quando seus amigos começarem a jogar ou ouvir música, eles aparecerão aqui!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
