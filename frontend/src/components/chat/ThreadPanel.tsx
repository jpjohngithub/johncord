import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/useChatStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { X, Send, Smile, Paperclip, MessageSquare } from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';
import { Message } from '../../types';

function shouldShowHeader(messages: Message[], index: number): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const curr = messages[index];
  if (prev.user_id !== curr.user_id) return true;
  const prevTime = new Date(prev.created_at).getTime();
  const currTime = new Date(curr.created_at).getTime();
  if (currTime - prevTime > 7 * 60 * 1000) return true;
  return false;
}
export const ThreadPanel: React.FC = () => {
  const {
    currentThread,
    threadParentMessage,
    threadMessages,
    isThreadPanelOpen,
    closeThread,
    sendThreadMessage
  } = useChatStore();

  const user = useAuthStore((state) => state.user);
  const [content, setContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  if (!isThreadPanelOpen || !currentThread) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    const text = content;
    setContent('');
    await sendThreadMessage(text);
  };

  return (
    <div className="flex h-full w-[480px] flex-col bg-[#2b2d31] border-l border-[#1f2023] shrink-0 select-none z-10">
      {/* Thread Header */}
      <div className="flex h-12 items-center justify-between px-4 border-b border-[#1f2023] bg-[#313338] text-white">
        <div className="flex flex-col truncate">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[#949ba4]" />
            <span className="truncate text-sm font-bold">{currentThread.name}</span>
          </div>
          <span className="text-[10px] text-[#949ba4]">Thread • {threadMessages.length} {threadMessages.length === 1 ? 'resposta' : 'respostas'}</span>
        </div>
        <button
          onClick={closeThread}
          className="rounded p-1 text-[#949ba4] hover:bg-[#35373c] hover:text-white transition cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Parent Message Card */}
        {threadParentMessage && (
          <div className="rounded-lg bg-[#232428] p-3 border border-[#35373c] space-y-1">
            <div className="flex items-center gap-2">
              <img
                src={threadParentMessage.user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${threadParentMessage.user?.username}`}
                alt=""
                className="h-6 w-6 rounded-full"
              />
              <span className="text-xs font-bold text-white">
                {threadParentMessage.user?.username}
              </span>
              <span className="text-[10px] text-[#949ba4]">
                {new Date(threadParentMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-xs text-[#dbdee1] whitespace-pre-wrap pl-8">
              {threadParentMessage.content}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 my-2">
          <div className="flex-1 h-[1px] bg-[#3f4147]" />
          <span className="text-[10px] uppercase font-bold text-[#949ba4] tracking-wider">
            Respostas da Thread
          </span>
          <div className="flex-1 h-[1px] bg-[#3f4147]" />
        </div>

        {/* Thread replies list */}
        {threadMessages.map((msg, index) => {
          const showHeader = shouldShowHeader(threadMessages, index);

          return (
            <div
              key={msg.id}
              className={`group flex items-start gap-2.5 px-2 hover:bg-[#2e3035] transition-colors -mx-2 rounded ${
                showHeader ? 'mt-4 pt-1 pb-1.5' : 'py-0.5'
              }`}
            >
              {showHeader ? (
                <img
                  src={msg.user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.user?.username}`}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover shrink-0 mt-0.5"
                />
              ) : (
                <div className="w-7 shrink-0 text-right opacity-0 group-hover:opacity-100 mt-1">
                  <span className="text-[10px] text-[#949ba4] block pr-1">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                {showHeader && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      {msg.user?.username || 'Usuário'}
                    </span>
                    <span className="text-[10px] text-[#949ba4]">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                <div className="text-xs text-[#dbdee1] whitespace-pre-wrap mt-0.5">
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Thread Input */}
      <form onSubmit={handleSend} className="p-3 bg-[#313338] border-t border-[#1f2023] relative">
        {showEmojiPicker && (
          <EmojiPicker
            onSelectEmoji={(emoji) => setContent((prev) => prev + emoji)}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}
        <div className="flex items-center gap-2 rounded-lg bg-[#383a40] px-3 py-2 text-sm text-white">
          <input
            type="text"
            placeholder={`Responder na thread...`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 bg-transparent text-xs text-white placeholder-[#80848e] outline-none"
          />
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="text-[#b5bac1] hover:text-[#f0b232] transition cursor-pointer"
          >
            <Smile className="h-4 w-4" />
          </button>
          <button
            type="submit"
            disabled={!content.trim()}
            className="text-[#5865f2] hover:text-white disabled:opacity-40 transition cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
