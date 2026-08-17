import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { Sparkles, MessageSquare, Zap, Shield, Headphones, MonitorPlay, LogIn, UserPlus, Compass } from 'lucide-react';

export const AuthScreen: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const { login, register, quickGuest, isLoading, error } = useAuthStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite') || params.get('join') || window.location.pathname.match(/\/invite\/([A-Za-z0-9_-]+)/)?.[1] || window.location.pathname.match(/\/join\/([A-Za-z0-9_-]+)/)?.[1];
    if (code) {
      setInviteCode(code);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    try {
      if (isRegister) {
        if (!username.trim()) {
          setLocalError('Informe o nome de usuário.');
          return;
        }
        await register(username, email, password);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setLocalError(err.message || 'Ocorreu um erro.');
    }
  };

  const handleQuickGuest = async () => {
    try {
      await quickGuest();
    } catch (err: any) {
      setLocalError(err.message || 'Erro ao entrar como convidado.');
    }
  };

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-gradient-to-br from-[#5865f2]/30 via-[#1e1f22] to-[#23a55a]/20 overflow-hidden">
      {/* Background Decorative Blur Orbs */}
      <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[#5865f2]/40 blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-[#00a8fc]/30 blur-[120px] pointer-events-none" />

      {/* Main Container Card */}
      <div className="z-10 flex w-full max-w-4xl overflow-hidden rounded bg-[#313338] shadow-2xl border border-[#3f4147]">
        {/* Left Side: Auth Form */}
        <div className="flex flex-1 flex-col justify-center p-8 sm:p-12">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center gap-2 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5865f2] text-white shadow-lg shadow-[#5865f2]/30">
                <MessageSquare className="h-6 w-6" />
              </div>
              <span className="text-2xl font-black tracking-tight text-white">Johncord</span>
            </div>

            {inviteCode ? (
              <div className="mb-4 rounded-lg bg-[#5865f2]/20 border border-[#5865f2]/50 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#5865f2] uppercase tracking-wider mb-1">
                  <Compass className="h-4 w-4" /> Convite para Servidor
                </div>
                <div className="text-sm font-semibold text-white">
                  Você foi convidado para entrar no servidor!
                </div>
                <div className="text-xs text-[#dbdee1] mt-0.5">
                  Código: <span className="font-mono font-bold text-white bg-[#1e1f22] px-1.5 py-0.5 rounded">{inviteCode}</span>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-bold text-white">
                  {isRegister ? 'Crie sua conta Johncord' : 'Boas-vindas de volta!'}
                </h1>
                <p className="text-sm text-[#949ba4] mt-1">
                  {isRegister
                    ? 'Conecte-se com amigos, jogue e converse em alta qualidade.'
                    : 'Estamos muito animados em ver você de novo!'}
                </p>
              </>
            )}
          </div>

          {(error || localError) && (
            <div className="mb-4 rounded-lg bg-[#f23f43]/15 border border-[#f23f43]/40 p-3 text-sm text-[#f23f43]">
              {error || localError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                  Nome de Usuário <span className="text-[#f23f43]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ex: JohnDev"
                  className="w-full rounded-sm bg-[#1e1f22] p-3 text-sm text-white placeholder-[#80848e] outline-none border border-transparent focus:border-[#5865f2] transition-colors"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                E-mail <span className="text-[#f23f43]">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="w-full rounded-sm bg-[#1e1f22] p-3 text-sm text-white placeholder-[#80848e] outline-none border border-transparent focus:border-[#5865f2] transition-colors"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                Senha <span className="text-[#f23f43]">*</span>
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-sm bg-[#1e1f22] p-3 text-sm text-white placeholder-[#80848e] outline-none border border-transparent focus:border-[#5865f2] transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-sm bg-[#5865f2] p-3 text-sm font-medium text-white transition hover:bg-[#4752c4] active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-lg shadow-[#5865f2]/25"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Carregando...
                </span>
              ) : isRegister ? (
                <span className="inline-flex items-center gap-2">
                  <UserPlus className="h-4 w-4" /> Continuar
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <LogIn className="h-4 w-4" /> Entrar
                </span>
              )}
            </button>

            {/* Quick Guest Access */}
            <button
              type="button"
              onClick={handleQuickGuest}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 rounded-sm border border-[#23a55a]/40 bg-[#23a55a]/10 p-3 text-sm font-medium text-[#23a55a] transition hover:bg-[#23a55a]/20 cursor-pointer"
            >
              <Zap className="h-4 w-4" /> Entrar como Convidado Rápido (1-Clique)
            </button>
          </form>

          {/* Toggle between Login and Register */}
          <div className="mt-6 text-center text-xs text-[#949ba4]">
            {isRegister ? (
              <>
                Já tem uma conta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(false);
                    setLocalError('');
                  }}
                  className="font-semibold text-[#00a8fc] hover:underline cursor-pointer"
                >
                  Entrar
                </button>
              </>
            ) : (
              <>
                Precisando de uma conta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(true);
                    setLocalError('');
                  }}
                  className="font-semibold text-[#00a8fc] hover:underline cursor-pointer"
                >
                  Registre-se
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right Side: Feature showcase */}
        <div className="hidden lg:flex lg:w-96 flex-col justify-between bg-[#2b2d31] p-8 border-l border-[#232428]">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#5865f2]">
              <Sparkles className="h-4 w-4" /> Experiência Completa
            </div>
            <h3 className="mt-2 text-xl font-bold text-white leading-snug">
              Comunique-se em tempo real sem limites
            </h3>
            <p className="mt-2 text-xs text-[#949ba4] leading-relaxed">
              Canais de voz WebRTC de baixa latência, detecção de voz em tempo real e compartilhamento de tela.
            </p>

            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3 rounded bg-[#1e1f22]/70 p-2.5 border border-white/5">
                <Headphones className="h-5 w-5 text-[#23a55a] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-white">Voz e Vídeo WebRTC</div>
                  <div className="text-[11px] text-[#949ba4]">Áudio de alta qualidade e anel de fala verde ao vivo.</div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded bg-[#1e1f22]/70 p-2.5 border border-white/5">
                <Compass className="h-5 w-5 text-[#5865f2] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-white">Convites por URL</div>
                  <div className="text-[11px] text-[#949ba4]">Convide amigos com 1 link e conversem instantaneamente.</div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded bg-[#1e1f22]/70 p-2.5 border border-white/5">
                <Shield className="h-5 w-5 text-[#f0b232] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-white">Cargos e Permissões</div>
                  <div className="text-[11px] text-[#949ba4]">Crie servidores personalizados com controle total.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded bg-[#1e1f22] p-3 text-center text-[11px] text-[#949ba4] border border-white/5">
            Johncord — Clone Discord em Tempo Real
          </div>
        </div>
      </div>
    </div>
  );
};
