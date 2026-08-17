import React, { useState } from 'react';
import { useServerStore } from '../../stores/useServerStore';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  X,
  Shield,
  Sliders,
  Trash2,
  Plus,
  Check,
  Hash,
  Volume2,
  FolderPlus
} from 'lucide-react';
import { Role } from '../../types';

const ALL_PERMISSIONS = [
  { id: 'admin', name: 'Administrador', desc: 'Concede todas as permissões de moderação e gerenciamento total.' },
  { id: 'manage_server', name: 'Gerenciar Servidor', desc: 'Permite alterar o nome, ícone e banner do servidor.' },
  { id: 'manage_channels', name: 'Gerenciar Canais', desc: 'Permite criar, editar e excluir canais e categorias.' },
  { id: 'manage_roles', name: 'Gerenciar Cargos', desc: 'Permite criar e atribuir cargos a outros membros.' },
  { id: 'kick_members', name: 'Expulsar Membros', desc: 'Permite remover membros do servidor.' },
  { id: 'ban_members', name: 'Banir Membros', desc: 'Permite banir membros permanentemente.' },
  { id: 'send_messages', name: 'Enviar Mensagens', desc: 'Permite postar em canais de texto.' },
  { id: 'connect_voice', name: 'Conectar em Voz', desc: 'Permite entrar e falar em canais de voz.' },
  { id: 'mute_members', name: 'Silenciar Membros', desc: 'Permite silenciar microfones de outros membros na sala de voz.' }
];

export const ServerSettingsModal: React.FC = () => {
  const {
    isServerSettingsModalOpen,
    setServerSettingsModalOpen,
    currentServer,
    updateServer,
    deleteServer,
    createRole,
    updateRole,
    deleteRole,
    deleteChannel,
    deleteCategory
  } = useServerStore();

  const user = useAuthStore((state) => state.user);

  const [activeTab, setActiveTab] = useState<'overview' | 'roles' | 'channels'>('overview');
  const [serverName, setServerName] = useState(currentServer?.name || '');
  const [iconUrl, setIconUrl] = useState(currentServer?.icon_url || '');
  const [bannerUrl, setBannerUrl] = useState(currentServer?.banner_url || '');

  // Role editing state
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('#99AAB5');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  if (!isServerSettingsModalOpen || !currentServer) return null;

  const isOwner = currentServer.owner_id === user?.id;
  const roles = currentServer.roles || [];
  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateServer(currentServer.id, {
        name: serverName.trim(),
        icon_url: iconUrl.trim() || undefined,
        banner_url: bannerUrl.trim() || undefined
      });
      setSaveMessage('Alterações salvas com sucesso!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectRole = (r: Role) => {
    setSelectedRoleId(r.id);
    setRoleName(r.name);
    setRoleColor(r.color);
    setRolePermissions(r.permissions || []);
  };

  const handleCreateNewRole = async () => {
    await createRole(currentServer.id, 'Novo Cargo', '#99AAB5', ['send_messages', 'connect_voice']);
  };

  const handleSaveRole = async () => {
    if (!selectedRole) return;
    setIsSaving(true);
    try {
      await updateRole(selectedRole.id, {
        name: roleName.trim(),
        color: roleColor,
        permissions: rolePermissions
      });
      setSaveMessage('Cargo atualizado!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const togglePermission = (permId: string) => {
    setRolePermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  const handleDeleteServer = async () => {
    if (window.confirm(`Tem certeza que deseja excluir o servidor "${currentServer.name}"? Esta ação não pode ser desfeita.`)) {
      await deleteServer(currentServer.id);
      setServerSettingsModalOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-[#313338] select-none animate-fade-in">
      {/* Left Sidebar Navigation */}
      <div className="flex w-60 flex-col items-end bg-[#2b2d31] p-6 pr-4 border-r border-[#1f2023]">
        <div className="w-48 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4] px-2 py-1">
            {currentServer.name}
          </div>

          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full rounded px-2.5 py-1.5 text-left text-xs font-semibold transition cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-[#3f4147] text-white'
                : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
            }`}
          >
            Visão Geral
          </button>

          <button
            onClick={() => {
              setActiveTab('roles');
              if (roles.length > 0) handleSelectRole(roles[0]);
            }}
            className={`w-full rounded px-2.5 py-1.5 text-left text-xs font-semibold transition cursor-pointer ${
              activeTab === 'roles'
                ? 'bg-[#3f4147] text-white'
                : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
            }`}
          >
            Cargos e Permissões
          </button>

          <button
            onClick={() => setActiveTab('channels')}
            className={`w-full rounded px-2.5 py-1.5 text-left text-xs font-semibold transition cursor-pointer ${
              activeTab === 'channels'
                ? 'bg-[#3f4147] text-white'
                : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
            }`}
          >
            Canais e Categorias
          </button>

          {isOwner && (
            <div className="pt-4 border-t border-[#3f4147] mt-4">
              <button
                onClick={handleDeleteServer}
                className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs font-semibold text-[#f23f43] hover:bg-[#f23f43]/15 transition cursor-pointer"
              >
                <span>Excluir Servidor</span>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Settings Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto p-10 max-w-3xl relative">
        {/* Close Button on Top Right */}
        <div className="absolute top-10 right-10 flex flex-col items-center">
          <button
            onClick={() => setServerSettingsModalOpen(false)}
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

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Visão Geral do Servidor</h2>
              <p className="text-xs text-[#949ba4] mt-1">
                Personalize o nome, ícone e aparência pública da sua comunidade.
              </p>
            </div>

            <form onSubmit={handleSaveOverview} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                  Nome do Servidor
                </label>
                <input
                  type="text"
                  required
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  className="w-full rounded-sm bg-[#1e1f22] p-3 text-sm text-white outline-none focus:ring-0 border border-[#3f4147] focus:border-[#5865f2] transition-colors"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                  URL do Ícone
                </label>
                <input
                  type="url"
                  value={iconUrl}
                  onChange={(e) => setIconUrl(e.target.value)}
                  className="w-full rounded-sm bg-[#1e1f22] p-3 text-sm text-white outline-none focus:ring-0 border border-[#3f4147] focus:border-[#5865f2] transition-colors"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                  URL do Banner
                </label>
                <input
                  type="url"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
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

        {/* Tab 2: Roles and Permissions */}
        {activeTab === 'roles' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Cargos e Permissões</h2>
                <p className="text-xs text-[#949ba4] mt-1">
                  Defina a hierarquia e os poderes dos membros do servidor.
                </p>
              </div>
              <button
                onClick={handleCreateNewRole}
                className="flex items-center gap-1.5 rounded-sm bg-[#5865f2] hover:bg-[#4752c4] px-3 py-1.5 text-xs font-bold text-white transition cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Criar Cargo
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Roles List */}
              <div className="space-y-1 bg-[#2b2d31] p-2 rounded-xl border border-[#3f4147]">
                <span className="text-[10px] uppercase font-bold text-[#949ba4] px-2 block mb-1">
                  Cargos ({roles.length})
                </span>
                {roles.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleSelectRole(r)}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs font-semibold transition cursor-pointer ${
                      selectedRole?.id === r.id
                        ? 'bg-[#3f4147] text-white'
                        : 'text-[#dbdee1] hover:bg-[#35373c]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: r.color }}
                      />
                      <span className="truncate">{r.name}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Role Editor */}
              {selectedRole && (
                <div className="md:col-span-2 space-y-4 bg-[#2b2d31] p-4 rounded-xl border border-[#3f4147]">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                      Nome do Cargo
                    </label>
                    <input
                      type="text"
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      className="w-full rounded-sm bg-[#1e1f22] p-2 text-xs text-white outline-none focus:ring-0 border border-[#3f4147] focus:border-[#5865f2] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                      Cor do Cargo
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={roleColor}
                        onChange={(e) => setRoleColor(e.target.value)}
                        className="h-8 w-12 rounded cursor-pointer bg-transparent border-0"
                      />
                      <span className="font-mono text-xs text-white">{roleColor}</span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                      Permissões Granulares
                    </label>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                      {ALL_PERMISSIONS.map((perm) => {
                        const isChecked = rolePermissions.includes(perm.id);
                        return (
                          <div
                            key={perm.id}
                            onClick={() => togglePermission(perm.id)}
                            className="flex items-start justify-between rounded bg-[#1e1f22] p-2.5 cursor-pointer hover:bg-[#232428] transition"
                          >
                            <div className="pr-4">
                              <div className="text-xs font-bold text-white">{perm.name}</div>
                              <div className="text-[10px] text-[#949ba4] mt-0.5">{perm.desc}</div>
                            </div>
                            <div
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                                isChecked
                                  ? 'bg-[#5865f2] border-[#5865f2] text-white'
                                  : 'border-[#4e5058]'
                              }`}
                            >
                              {isChecked && <Check className="h-3.5 w-3.5" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[#3f4147]">
                    <button
                      onClick={() => deleteRole(selectedRole.id)}
                      className="text-xs font-semibold text-[#f23f43] hover:underline cursor-pointer"
                    >
                      Excluir Cargo
                    </button>
                    <button
                      onClick={handleSaveRole}
                      className="rounded-sm bg-[#23a55a] hover:bg-[#1f914f] px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
                    >
                      Salvar Cargo
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Channels and Categories */}
        {activeTab === 'channels' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Canais e Categorias</h2>
              <p className="text-xs text-[#949ba4] mt-1">
                Gerencie e organize a estrutura dos canais do servidor.
              </p>
            </div>

            <div className="space-y-4">
              {currentServer.categories?.map((cat) => (
                <div key={cat.id} className="rounded-xl bg-[#2b2d31] p-3 border border-[#3f4147] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase">{cat.name}</span>
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      title="Excluir Categoria"
                      className="text-[#f23f43] hover:text-white text-xs cursor-pointer p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1 pl-2">
                    {cat.channels?.map((ch) => (
                      <div
                        key={ch.id}
                        className="flex items-center justify-between rounded bg-[#1e1f22] px-2.5 py-1.5 text-xs text-[#dbdee1]"
                      >
                        <div className="flex items-center gap-2">
                          {ch.type === 'voice' ? <Volume2 className="h-3.5 w-3.5 text-[#5865f2]" /> : <Hash className="h-3.5 w-3.5 text-[#80848e]" />}
                          <span>{ch.name}</span>
                        </div>
                        <button
                          onClick={() => deleteChannel(ch.id)}
                          className="text-[#949ba4] hover:text-[#f23f43] transition cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
