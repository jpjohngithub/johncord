import React, { useState } from 'react';
import { useServerStore } from '../../stores/useServerStore';
import { X, Hash, Volume2 } from 'lucide-react';

export const CreateChannelModal: React.FC = () => {
  const {
    isCreateChannelModalOpen,
    setCreateChannelModalOpen,
    createChannelType,
    createChannelCategoryId,
    currentServer,
    createChannel
  } = useServerStore();

  const [type, setType] = useState<'text' | 'voice'>(createChannelType || 'text');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isCreateChannelModalOpen || !currentServer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await createChannel(currentServer.id, name.trim(), type, createChannelCategoryId, topic.trim());
      setCreateChannelModalOpen(false);
      setName('');
      setTopic('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 select-none p-4" onClick={() => setCreateChannelModalOpen(false)}>
      <div className="flex w-full max-w-md flex-col rounded bg-[#313338] shadow-2xl border border-[#3f4147] overflow-hidden animate-scale-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 pb-2 relative">
          <button
            onClick={() => setCreateChannelModalOpen(false)}
            className="absolute top-4 right-4 text-[#949ba4] hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-black text-white">Criar Canal</h2>
          <p className="text-xs text-[#949ba4] mt-0.5">
            em {currentServer.name}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Channel Type Selector */}
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
              Tipo de Canal
            </label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setType('text')}
                className={`flex w-full items-center gap-3 rounded-lg p-3 text-left border transition cursor-pointer ${
                  type === 'text'
                    ? 'bg-[#3f4147] border-[#5865f2] text-white'
                    : 'bg-[#2b2d31] border-transparent text-[#b5bac1] hover:bg-[#35373c]'
                }`}
              >
                <Hash className="h-6 w-6 text-[#80848e]" />
                <div>
                  <div className="text-sm font-bold">Texto</div>
                  <div className="text-xs text-[#949ba4]">
                    Envie mensagens, imagens, memes e opiniões.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setType('voice')}
                className={`flex w-full items-center gap-3 rounded-lg p-3 text-left border transition cursor-pointer ${
                  type === 'voice'
                    ? 'bg-[#3f4147] border-[#5865f2] text-white'
                    : 'bg-[#2b2d31] border-transparent text-[#b5bac1] hover:bg-[#35373c]'
                }`}
              >
                <Volume2 className="h-6 w-6 text-[#80848e]" />
                <div>
                  <div className="text-sm font-bold">Voz</div>
                  <div className="text-xs text-[#949ba4]">
                    Reúna-se em salas com voz, vídeo e transmissão de tela.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Channel Name */}
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
              Nome do Canal <span className="text-[#f23f43]">*</span>
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-sm text-[#80848e]">
                {type === 'text' ? '#' : '🔊'}
              </span>
              <input
                type="text"
                required
                placeholder="novo-canal"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-sm bg-[#1e1f22] p-3 pl-8 text-sm text-white placeholder-[#80848e] outline-none focus:ring-0 border border-transparent focus:border-[#5865f2] transition-colors"
              />
            </div>
          </div>

          {/* Channel Topic */}
          {type === 'text' && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                Tópico do Canal (Opcional)
              </label>
              <input
                type="text"
                placeholder="Defina o propósito deste canal..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full rounded-sm bg-[#1e1f22] p-3 text-sm text-white placeholder-[#80848e] outline-none focus:ring-0 border border-transparent focus:border-[#5865f2] transition-colors"
              />
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[#3f4147]">
            <button
              type="button"
              onClick={() => setCreateChannelModalOpen(false)}
              className="text-xs font-semibold text-white hover:underline cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="rounded-sm bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 px-6 py-2.5 text-xs font-medium text-white shadow transition cursor-pointer"
            >
              {isLoading ? 'Criando...' : 'Criar Canal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
