import React, { useState } from 'react';
import { useServerStore } from '../../stores/useServerStore';
import { X, FolderPlus } from 'lucide-react';

export const CreateCategoryModal: React.FC = () => {
  const { isCreateCategoryModalOpen, setCreateCategoryModalOpen, currentServer, createCategory } = useServerStore();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isCreateCategoryModalOpen || !currentServer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await createCategory(currentServer.id, name.trim());
      setCreateCategoryModalOpen(false);
      setName('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 select-none p-4" onClick={() => setCreateCategoryModalOpen(false)}>
      <div className="flex w-full max-w-md flex-col rounded bg-[#313338] shadow-2xl border border-[#3f4147] overflow-hidden animate-scale-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 pb-2 relative">
          <button
            onClick={() => setCreateCategoryModalOpen(false)}
            className="absolute top-4 right-4 text-[#949ba4] hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-[#5865f2]" />
            <h2 className="text-lg font-black text-white">Criar Categoria</h2>
          </div>
          <p className="text-xs text-[#949ba4] mt-1">
            Organize seus canais agrupando-os por tópicos.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
              Nome da Categoria <span className="text-[#f23f43]">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ex: JOGOS & DIVERSÃO"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-sm bg-[#1e1f22] p-3 text-sm text-white placeholder-[#80848e] outline-none focus:ring-0 border border-transparent focus:border-[#5865f2] transition-colors"
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#3f4147]">
            <button
              type="button"
              onClick={() => setCreateCategoryModalOpen(false)}
              className="text-xs font-semibold text-white hover:underline cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="rounded-sm bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 px-6 py-2.5 text-xs font-medium text-white shadow transition cursor-pointer"
            >
              {isLoading ? 'Criando...' : 'Criar Categoria'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
