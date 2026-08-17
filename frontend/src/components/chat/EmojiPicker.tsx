import React, { useState } from 'react';
import { Smile, Search, Heart, Flame, ThumbsUp, Sparkles, Gamepad2 } from 'lucide-react';

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES = [
  {
    name: 'Frequentes & Reações',
    emojis: ['👍', '❤️', '🔥', '😂', '🎉', '🚀', '👀', '✨', '💀', '💯', '👏', '🙏', '😎', '😍', '🥳']
  },
  {
    name: 'Carinhas & Emoções',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😭', '😉', '😊', '😇', '🥰', '😘', '😋', '😜', '🤪', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😴', '😷', '🤒', '🤕']
  },
  {
    name: 'Gestos & Pessoas',
    emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏']
  },
  {
    name: 'Gaming & Objetos',
    emojis: ['🎮', '🕹️', '🎲', '🎯', '🏆', '🥇', '🥈', '🥉', '💻', '🖥️', '⌨️', '🖱️', '📱', '🎧', '🎤', '🎬', '🍿', '🎧', '⚡', '💡', '🔔', '💬', '📢', '💎', '🔑', '🔒', '🛡️', '⚔️', '💣', '🚀']
  },
  {
    name: 'Corações & Símbolos',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💖', '💗', '💓', '💞', '💕', '💌', '⭐', '🌟', '✨', '⚡', '💥', '🔥', '🌈', '☀️', '🌙', '☁️', '❄️', '💤']
  }
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelectEmoji, onClose }) => {
  const [search, setSearch] = useState('');

  const allEmojis = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
  const filteredEmojis = search.trim()
    ? allEmojis.filter((e) => e.includes(search.trim()))
    : null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-14 right-4 z-50 flex h-96 w-[420px] flex-col rounded-xl bg-[#2b2d31] shadow-2xl border border-[#1f2023] overflow-hidden">
        {/* Search Header */}
        <div className="p-2.5 border-b border-[#1f2023] bg-[#232428]">
          <div className="flex items-center gap-2 rounded-md bg-[#1e1f22] px-2.5 py-1.5 text-xs text-white">
            <Search className="h-4 w-4 text-[#80848e]" />
            <input
              type="text"
              autoFocus
              placeholder="Buscar emoji..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-white placeholder-[#80848e] outline-none"
            />
          </div>
        </div>

        {/* Emoji Grid List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {filteredEmojis ? (
            <div>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#949ba4]">
                Resultados
              </h4>
              <div className="grid grid-cols-9 gap-1">
                {filteredEmojis.map((emoji, idx) => (
                  <button
                    key={`${emoji}-${idx}`}
                    onClick={() => {
                      onSelectEmoji(emoji);
                      onClose();
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[#35373c] text-xl transition-transform hover:scale-125 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            EMOJI_CATEGORIES.map((category, i) => (
              <div key={category.name} id={`emoji-cat-${i}`}>
                <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#949ba4]">
                  {category.name}
                </h4>
                <div className="grid grid-cols-9 gap-1">
                  {category.emojis.map((emoji, idx) => (
                    <button
                      key={`${emoji}-${idx}`}
                      onClick={() => {
                        onSelectEmoji(emoji);
                        onClose();
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#35373c] text-xl transition-transform hover:scale-125 cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center justify-around px-2 py-1.5 border-t border-[#1f2023] bg-[#2b2d31]">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={i}
              onClick={() => {
                document.getElementById(`emoji-cat-${i}`)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="p-1.5 rounded hover:bg-[#35373c] text-[#949ba4] hover:text-white transition cursor-pointer"
            >
              <span className="text-sm">{cat.emojis[0]}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
