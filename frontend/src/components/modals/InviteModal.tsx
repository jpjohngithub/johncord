import React, { useState } from 'react';
import { useServerStore } from '../../stores/useServerStore';
import { X, Copy, Check, UserPlus } from 'lucide-react';

export const InviteModal: React.FC = () => {
  const { isInviteModalOpen, setInviteModalOpen, currentServer } = useServerStore();
  const [copied, setCopied] = useState(false);

  if (!isInviteModalOpen || !currentServer) return null;

  const inviteUrl = `${window.location.origin}/join/${currentServer.invite_code}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentServer.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 select-none p-4" onClick={() => setInviteModalOpen(false)}>
      <div className="flex w-full max-w-md flex-col rounded bg-[#313338] shadow-2xl border border-[#3f4147] overflow-hidden animate-scale-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
            Envie este código ou link para seus amigos entrarem instantaneamente no servidor.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
              Código de Convite do Servidor
            </label>
            <div className="flex items-center gap-2 rounded-lg bg-[#1e1f22] p-2 border border-[#3f4147]">
              <input
                type="text"
                readOnly
                value={currentServer.invite_code}
                className="flex-1 bg-transparent px-2 text-sm font-mono text-white outline-none"
              />
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 rounded-sm px-4 py-2 text-xs font-medium text-white transition cursor-pointer ${
                  copied ? 'bg-[#23a55a]' : 'bg-[#5865f2] hover:bg-[#4752c4]'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copiar
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-[#2b2d31] p-3 text-xs text-[#949ba4]">
            Seu link de convite nunca expira e pode ser compartilhado com qualquer pessoa.
          </div>
        </div>
      </div>
    </div>
  );
};
