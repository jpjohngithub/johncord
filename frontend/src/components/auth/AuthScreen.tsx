import React, { useState } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { Sparkles, MessageSquare, Zap, Shield, Headphones, MonitorPlay, LogIn, UserPlus } from 'lucide-react';

export const AuthScreen: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const { login, register, quickGuest, isLoading, error } = useAuthStore();

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
            <h1 className="text-xl font-bold text-white">
              {isRegister ? 'Crie sua conta Johncord' : 'Boas-vindas de volta!'}
            </h1>
            <p className="text-sm text-[#949ba4] mt-1">
              {isRegister
                ? 'Conecte-se com amigos, jogue e converse em alta qualidade.'
                : 'Estamos muito animados em ver você de novo!'}
            </p>
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
              className="w-full rounded-sm bg-[#5865f2] hover:bg-[#4752c4] active:bg-[#3c45a5] py-3 text-sm font-semibold text-white shadow transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : isRegister ? (
                <>
                  <UserPlus className="h-4 w-4" /> Cadastrar Conta
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" /> Entrar
                </>
              )}
            </button>
          </form>

          {/* Quick Guest Mode Button for Instant Pairing/Testing */}
          <div className="mt-4 pt-4 border-t border-[#3f4147]">
            <button
              type="button"
              onClick={handleQuickGuest}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 rounded-sm bg-[#2b2d31] hover:bg-[#383a40] text-emerald-400 border border-emerald-500/30 py-2.5 text-sm font-medium transition cursor-pointer"
            >
              <Zap className="h-4 w-4 text-emerald-400" />
              Entrar como Convidado Rápido (1-Clique)
            </button>
          </div>

          {/* Switch Register / Login */}
          <div className="mt-4 text-left text-xs text-[#949ba4]">
            {isRegister ? (
              <span>
                Já tem uma conta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(false);
                    setLocalError('');
                  }}
                  className="text-[#00a8fc] hover:underline font-medium cursor-pointer"
                >
                  Entrar
                </button>
              </span>
            ) : (
              <span>
                Precisando de uma conta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(true);
                    setLocalError('');
                  }}
                  className="text-[#00a8fc] hover:underline font-medium cursor-pointer"
                >
                  Registre-se
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Right Side: Showcase Features */}
        <div className="hidden lg:flex lg:w-96 flex-col justify-between bg-[#2b2d31] p-8 border-l border-[#3f4147]">
          <div>
            <div className="flex items-center gap-2 text-white font-bold text-sm uppercase tracking-wider mb-4 text-[#5865f2]">
              <Sparkles className="h-4 w-4" />
              Tudo em um só lugar
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded bg-[#1e1f22] text-[#5865f2]">
                  <Headphones className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Voz e Vídeo em Tempo Real</h4>
                  <p className="text-[11px] text-[#949ba4]">Salas de alta qualidade, sem atraso e com detecção de fala.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded bg-[#1e1f22] text-amber-400">
                  <MonitorPlay className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Transmissão de Tela HD</h4>
                  <p className="text-[11px] text-[#949ba4]">Compartilhe jogos, abas e vídeos com sua comunidade.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded bg-[#1e1f22] text-emerald-400">
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Cargos e Comunidades</h4>
                  <p className="text-[11px] text-[#949ba4]">Crie servidores, categorias e defina permissões completas.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded bg-[#1e1f22] p-3 text-center border border-[#3f4147]/50">
            <div className="text-xs font-semibold text-white">Contas de Demonstração</div>
            <div className="text-[11px] text-[#949ba4] mt-1">
              dev@johncord.gg / 123456<br />
              ana@johncord.gg / 123456
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
