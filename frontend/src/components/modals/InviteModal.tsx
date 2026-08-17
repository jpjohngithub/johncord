import React, { useState } from 'react';
import { useServerStore } from '../../stores/useServerStore';
import { X, Copy, Check, UserPlus, Link, ShieldCheck } from 'lucide-react';

export const InviteModal: React.FC = () => {
  const { isInviteModalOpen, setInviteModalOpen, currentServer } = useServerStore();
  const [copied, setCopied] = useState(false);

  if (!isInviteModalOpen || !currentServer) return null;

  const fullInviteUrl = `${window.location.origin}/?invite=${currentServer.invite_code}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullInviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 select-none p-4" onClick={() => setInviteModalOpen(false)}>
      <div className="flex w-full max-w-md flex-col rounded bg-[#313338] shadow-2xl border border-[#3f4147] overflow-hidden animate-scale-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 pb-2 relative">
          <button
            onClick={() => setInviteModalOpen(false)}
            className="absolute top-4 right-4 text-[#949ba4] hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[#5865f2]" />
            <h2 className="text-lg font-black text-white">Convidar amigos para {currentServer.name}</h2>
          </div>
          <p className="text-xs text-[#949ba4] mt-1">
            Envie este link para qualquer pessoa entrar instantaneamente no seu servidor.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
              <span>Link de Convite do Servidor</span>
              <span className="text-[10px] text-[#23a55a] font-semibold flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Nunca expira
              </span>
            </label>
            <div className="flex items-center gap-2 rounded-lg bg-[#1e1f22] p-2 border border-[#3f4147]">
              <Link className="h-4 w-4 text-[#80848e] ml-1 shrink-0" />
              <input
                type="text"
                readOnly
                value={fullInviteUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 bg-transparent px-1 text-xs font-mono text-white outline-none truncate select-all"
              />
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 rounded-sm px-4 py-2 text-xs font-medium text-white transition cursor-pointer shadow-md shrink-0 ${
                  copied ? 'bg-[#23a55a]' : 'bg-[#5865f2] hover:bg-[#4752c4]'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copiar Link
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-[#2b2d31] p-3 text-xs text-[#949ba4] border border-[#3f4147]/50">
            <span className="font-bold text-white block mb-0.5">Código de Convite Direto:</span>
            <span className="font-mono text-[#5865f2] bg-[#1e1f22] px-2 py-0.5 rounded text-xs select-all">
              {currentServer.invite_code}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
