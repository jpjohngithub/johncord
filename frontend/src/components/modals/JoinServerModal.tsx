import React, { useState } from 'react';
import { useServerStore } from '../../stores/useServerStore';
import { X, Compass } from 'lucide-react';

export const JoinServerModal: React.FC = () => {
  const { isJoinServerModalOpen, setJoinServerModalOpen, joinServer } = useServerStore();
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isJoinServerModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    setError('');
    setIsLoading(true);

    // Extract code if user pasted a full URL
    let code = inviteCode.trim();
    if (code.includes('/')) {
      const parts = code.split('/');
      code = parts[parts.length - 1];
    }

    try {
      await joinServer(code);
      setJoinServerModalOpen(false);
      setInviteCode('');
    } catch (err: any) {
      setError(err.message || 'Código de convite inválido.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 select-none p-4" onClick={() => setJoinServerModalOpen(false)}>
      <div className="flex w-full max-w-md flex-col rounded bg-[#313338] shadow-2xl border border-[#3f4147] overflow-hidden animate-scale-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 pb-2 text-center relative">
          <button
            onClick={() => setJoinServerModalOpen(false)}
            className="absolute top-4 right-4 text-[#949ba4] hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex justify-center mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5865f2] text-white">
              <Compass className="h-6 w-6" />
            </div>
          </div>
          <h2 className="text-xl font-black text-white">Entrar em um Servidor</h2>
          <p className="text-xs text-[#949ba4] mt-1">
            Insira o link ou código de convite abaixo para se juntar à comunidade.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-[#f23f43]/15 border border-[#f23f43]/40 p-2.5 text-xs text-[#f23f43]">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
              Link ou Código de Convite <span className="text-[#f23f43]">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ex: johncord-oficial ou https://johncord.gg/convite"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="w-full rounded-sm bg-[#1e1f22] p-3 text-sm text-white placeholder-[#80848e] outline-none focus:ring-0 border border-transparent focus:border-[#5865f2] transition-colors"
            />
          </div>

          <div className="rounded-lg bg-[#2b2d31] p-3 text-xs text-[#949ba4]">
            <span className="font-bold text-white block mb-0.5">Dica de convite:</span>
            O servidor oficial de exemplo está disponível no código: <strong className="text-[#5865f2] select-all">johncord-oficial</strong>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[#3f4147]">
            <button
              type="button"
              onClick={() => setJoinServerModalOpen(false)}
              className="text-xs font-semibold text-white hover:underline cursor-pointer"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={isLoading || !inviteCode.trim()}
              className="rounded-sm bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 px-6 py-2.5 text-xs font-medium text-white shadow transition cursor-pointer"
            >
              {isLoading ? 'Entrando...' : 'Entrar no Servidor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
