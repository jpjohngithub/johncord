import React, { useState, useRef, useEffect } from 'react';
import { useServerStore } from '../../stores/useServerStore';
import { useChatStore } from '../../stores/useChatStore';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  Hash,
  Search,
  Users,
  PlusCircle,
  Smile,
  Send,
  Reply,
  MessageSquare,
  Pin,
  Trash2,
  Edit2,
  FileText,
  X,
  Check,
  Download
} from 'lucide-react';
import { Message, Attachment } from '../../types';
import { EmojiPicker } from './EmojiPicker';
import { apiRequest } from '../../services/api';

interface ChatAreaProps {
  onSelectUser: (user: any) => void;
}

function shouldShowHeader(messages: Message[], index: number): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const curr = messages[index];
  if (prev.user_id !== curr.user_id) return true;
  const prevTime = new Date(prev.created_at).getTime();
  const currTime = new Date(curr.created_at).getTime();
  if (currTime - prevTime > 7 * 60 * 1000) return true; // 7 min gap
  if (curr.reply_to) return true; // replies always show header
  return false;
}

function shouldShowDateSeparator(messages: Message[], index: number): boolean {
  if (index === 0) return true;
  const prevDate = new Date(messages[index - 1].created_at).toDateString();
  const currDate = new Date(messages[index].created_at).toDateString();
  return prevDate !== currDate;
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) return 'Hoje';
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export const ChatArea: React.FC<ChatAreaProps> = ({ onSelectUser }) => {
  const { currentChannel, toggleMemberList, isMemberListOpen, currentServer } = useServerStore();
  const {
    messages,
    loadChannelMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    togglePin,
    replyTo,
    setReplyTo,
    openThread,
    typingUsers,
    emitTyping
  } = useChatStore();

  const currentUser = useAuthStore((state) => state.user);

  const [text, setText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiTargetMessageId, setEmojiTargetMessageId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentChannel && currentChannel.type === 'text') {
      loadChannelMessages(currentChannel.id);
    }
  }, [currentChannel?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!currentChannel || currentChannel.type !== 'text') return null;

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !isUploading) return;
    const content = text;
    setText('');
    await sendMessage(content);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('johncord_token');
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      if (data.attachment) {
        await sendMessage('', [data.attachment]);
      }
    } catch (err) {
      console.error('File upload failed:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveEdit = async (messageId: string) => {
    if (!editText.trim()) return;
    await editMessage(messageId, editText);
    setEditingMessageId(null);
    setEditText('');
  };

  const filteredMessages = searchTerm.trim()
    ? messages.filter(
        (m) =>
          m.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.user?.username.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : messages;

  return (
    <div className="flex h-full flex-1 flex-col bg-[#313338] select-text relative overflow-hidden">
      {/* Channel Header Bar */}
      <div className="flex h-12 items-center justify-between px-4 border-b border-[#1f2023] bg-[#313338] z-10 shrink-0 select-none">
        <div className="flex items-center gap-2 truncate">
          <Hash className="h-6 w-6 text-[#80848e] shrink-0" />
          <span className="font-bold text-white text-sm truncate">{currentChannel.name}</span>
          {currentChannel.topic && (
            <>
              <div className="h-4 w-[1px] bg-[#3f4147] mx-1" />
              <span className="text-xs text-[#949ba4] truncate max-w-md hidden md:inline">
                {currentChannel.topic}
              </span>
            </>
          )}
        </div>

        {/* Action icons on header */}
        <div className="flex items-center gap-3 text-[#b5bac1]">
          {/* Search bar */}
          <div className="flex items-center gap-1.5 rounded bg-[#1e1f22] px-2 py-1 text-xs text-white">
            <Search className="h-3.5 w-3.5 text-[#80848e]" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-xs text-white placeholder-[#80848e] outline-none w-24 focus:w-40 transition-all"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="cursor-pointer hover:text-white">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Toggle Member List */}
          <button
            onClick={toggleMemberList}
            title="Lista de Membros"
            className={`rounded p-1 transition cursor-pointer ${
              isMemberListOpen ? 'text-white bg-[#35373c]' : 'hover:bg-[#35373c] hover:text-white'
            }`}
          >
            <Users className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-0">
        {/* Welcome channel banner */}
        <div className="pt-8 pb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#3f4147] text-white mb-2">
            <Hash className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">
            Bem-vindo a #{currentChannel.name}!
          </h2>
          <p className="text-sm text-[#949ba4] mt-1">
            Este é o início do canal #{currentChannel.name}.
          </p>
        </div>

        {/* Message Items */}
        {filteredMessages.map((msg, index) => {
          const isMe = msg.user_id === currentUser?.id;
          const isEditing = editingMessageId === msg.id;
          const showHeader = shouldShowHeader(filteredMessages, index);
          const showDateSeparator = shouldShowDateSeparator(filteredMessages, index);

          return (
            <React.Fragment key={msg.id}>
              {showDateSeparator && (
                <div className="relative flex items-center py-4 -mx-4 px-4">
                  <div className="flex-1 h-[1px] bg-[#3f4147]" />
                  <span className="px-2 text-[11px] font-semibold text-[#949ba4] bg-[#313338]">
                    {formatDateSeparator(msg.created_at)}
                  </span>
                  <div className="flex-1 h-[1px] bg-[#3f4147]" />
                </div>
              )}

              <div
                className={`group relative -mx-4 flex gap-4 px-4 hover:bg-[#2e3035] transition-colors ${
                  showHeader ? 'py-1.5 mt-[17px]' : 'py-0.5'
                }`}
              >
                {/* Replied Message Header Citation */}
                {msg.reply_to && showHeader && (
                  <div className="absolute -top-3.5 left-12 flex items-center gap-1.5 text-[11px] text-[#b5bac1]">
                    <div className="h-2.5 w-6 rounded-tl border-t-2 border-l-2 border-[#4e5058]" />
                    <span className="font-semibold text-[#5865f2]">@{msg.reply_to.username}</span>
                    <span className="truncate max-w-xs text-[#949ba4]">{msg.reply_to.content}</span>
                  </div>
                )}

                {showHeader ? (
                  <button
                    onClick={() => msg.user && onSelectUser(msg.user)}
                    className="mt-0.5 shrink-0 cursor-pointer self-start"
                  >
                    <img
                      src={
                        msg.user?.avatar_url ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.user?.username || 'User'}`
                      }
                      alt={msg.user?.username}
                      className="h-10 w-10 rounded-full object-cover bg-[#1e1f22] hover:opacity-80 transition"
                    />
                  </button>
                ) : (
                  <div className="w-10 shrink-0 flex items-center justify-end">
                    <span className="hidden group-hover:inline text-[10px] text-[#949ba4] select-none">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                {/* Message Content & Info */}
                <div className="flex-1 overflow-hidden">
                  {showHeader && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => msg.user && onSelectUser(msg.user)}
                        className="font-bold text-sm text-white hover:underline cursor-pointer"
                      >
                        {msg.user?.username || 'Usuário'}
                      </button>

                      {msg.user?.username.toLowerCase().includes('bot') && (
                        <span className="rounded bg-[#5865f2] px-1 py-0.5 text-[9px] font-bold uppercase text-white">
                          BOT
                        </span>
                      )}

                      <span className="text-[11px] text-[#949ba4]">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>

                      {msg.is_pinned === 1 && (
                        <span title="Mensagem Fixada" className="text-[#f0b232]">
                          <Pin className="h-3 w-3 inline" />
                        </span>
                      )}
                    </div>
                  )}

                  {/* Message Body or Edit Form */}
                  {isEditing ? (
                    <div className="mt-1 space-y-1">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(msg.id);
                          if (e.key === 'Escape') setEditingMessageId(null);
                        }}
                        className="w-full rounded bg-[#383a40] p-2 text-sm text-white outline-none border border-[#5865f2]"
                      />
                      <div className="text-[11px] text-[#949ba4]">
                        Enter para salvar • Esc para cancelar
                      </div>
                    </div>
                  ) : (
                    <div className={`text-sm text-[#dbdee1] whitespace-pre-wrap break-words leading-relaxed ${showHeader ? 'mt-0.5' : ''}`}>
                      {renderFormattedMessage(msg.content)}
                    </div>
                  )}

                  {/* Attachments rendering */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {msg.attachments.map((att) => {
                        const isImage = att.type.startsWith('image/') || att.url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                        const isVideo = att.type.startsWith('video/') || att.url.match(/\.(mp4|webm|mov)$/i);

                        if (isImage) {
                          return (
                            <div key={att.id} className="max-w-md overflow-hidden rounded-lg border border-[#3f4147]">
                              <img
                                src={att.url}
                                alt={att.name}
                                className="max-h-80 w-auto rounded-lg object-contain bg-[#1e1f22]"
                              />
                            </div>
                          );
                        }

                        if (isVideo) {
                          return (
                            <div key={att.id} className="max-w-lg rounded-lg overflow-hidden">
                              <video controls src={att.url} className="max-h-80 w-full rounded-lg bg-black" />
                            </div>
                          );
                        }

                        return (
                          <div
                            key={att.id}
                            className="flex items-center justify-between gap-3 max-w-sm rounded-lg bg-[#2b2d31] p-3 border border-[#3f4147]"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <FileText className="h-8 w-8 text-[#5865f2] shrink-0" />
                              <div className="truncate">
                                <div className="text-xs font-semibold text-white truncate">{att.name}</div>
                                <div className="text-[10px] text-[#949ba4]">
                                  {(att.size / 1024).toFixed(1)} KB
                                </div>
                              </div>
                            </div>
                            <a
                              href={att.url}
                              download={att.name}
                              className="rounded p-1.5 bg-[#383a40] text-white hover:bg-[#5865f2] transition"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Reactions Pill Badges */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {msg.reactions.map((reaction) => {
                        const hasReacted = reaction.users.includes(currentUser?.id || '');
                        return (
                          <button
                            key={reaction.emoji}
                            onClick={() => toggleReaction(msg.id, reaction.emoji)}
                            className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition cursor-pointer border ${
                              hasReacted
                                ? 'bg-[#5865f2]/20 border-[#5865f2] text-white'
                                : 'bg-[#2b2d31] border-[#3f4147] text-[#b5bac1] hover:bg-[#35373c]'
                            }`}
                          >
                            <span>{reaction.emoji}</span>
                            <span>{reaction.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Thread badge if exists */}
                  {msg.thread_count !== undefined && msg.thread_count > 0 && (
                    <button
                      onClick={() => openThread(msg.id)}
                      className="flex items-center gap-1.5 rounded-md bg-[#2b2d31] px-2 py-1 mt-2 text-xs font-semibold text-[#5865f2] hover:bg-[#35373c] transition cursor-pointer"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>{msg.thread_count} {msg.thread_count === 1 ? 'resposta' : 'respostas'} na thread</span>
                    </button>
                  )}
                </div>

                {/* Hover Floating Action Bar */}
                <div className="absolute right-4 -top-3 hidden group-hover:flex items-center rounded-md bg-[#313338] border border-[#232428] shadow-md text-[#b5bac1] overflow-hidden z-10">
                  <button
                    onClick={() => {
                      setEmojiTargetMessageId(msg.id);
                      setShowEmojiPicker(true);
                    }}
                    title="Adicionar Reação"
                    className="p-1.5 hover:bg-[#35373c] hover:text-white transition cursor-pointer"
                  >
                    <Smile className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => setReplyTo(msg)}
                    title="Responder"
                    className="p-1.5 hover:bg-[#35373c] hover:text-white transition cursor-pointer"
                  >
                    <Reply className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => openThread(msg.id)}
                    title="Criar ou Abrir Thread"
                    className="p-1.5 hover:bg-[#35373c] hover:text-white transition cursor-pointer"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => togglePin(msg.id)}
                    title={msg.is_pinned ? 'Desafixar Mensagem' : 'Fixar Mensagem'}
                    className="p-1.5 hover:bg-[#35373c] hover:text-white transition cursor-pointer"
                  >
                    <Pin className="h-4 w-4" />
                  </button>

                  {isMe && (
                    <button
                      onClick={() => {
                        setEditingMessageId(msg.id);
                        setEditText(msg.content);
                      }}
                      title="Editar"
                      className="p-1.5 hover:bg-[#35373c] hover:text-white transition cursor-pointer"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  )}

                  <button
                    onClick={() => deleteMessage(msg.id)}
                    title="Deletar"
                    className="p-1.5 hover:bg-[#f23f43]/20 hover:text-[#f23f43] transition cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </React.Fragment>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator Bar */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-0.5 flex items-center gap-1.5 text-[11px] text-[#949ba4]">
          <div className="typing-dots"><span/><span/><span/></div>
          <span>
            <span className="font-bold text-white">
              {typingUsers.map((u) => u.username).join(', ')}
            </span>{' '}
            {typingUsers.length === 1 ? 'está digitando...' : 'estão digitando...'}
          </span>
        </div>
      )}

      {/* Reply To Preview Bar */}
      {replyTo && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#2b2d31] border-t border-[#1f2023] text-xs text-[#b5bac1]">
          <div className="flex items-center gap-2 truncate">
            <Reply className="h-3.5 w-3.5 text-[#5865f2]" />
            <span>Respondendo a <strong className="text-white">@{replyTo.user?.username}</strong></span>
            <span className="truncate text-[#949ba4]">{replyTo.content}</span>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="rounded p-0.5 hover:bg-[#35373c] hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Chat Input Box */}
      <div className="p-4 pt-1 bg-[#313338] relative">
        {showEmojiPicker && (
          <EmojiPicker
            onSelectEmoji={(emoji) => {
              if (emojiTargetMessageId) {
                toggleReaction(emojiTargetMessageId, emoji);
                setEmojiTargetMessageId(null);
              } else {
                setText((prev) => prev + emoji);
              }
            }}
            onClose={() => {
              setShowEmojiPicker(false);
              setEmojiTargetMessageId(null);
            }}
          />
        )}

        <form
          onSubmit={handleSendMessage}
          className="flex items-center gap-2 rounded-lg bg-[#383a40] px-4 py-2.5 shadow-inner"
        >
          {/* File Upload Trigger */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Enviar Arquivo ou Imagem"
            className="rounded-full p-1 text-[#b5bac1] hover:bg-[#4e5058] hover:text-white transition cursor-pointer"
          >
            <PlusCircle className="h-5 w-5" />
          </button>

          {/* Text input */}
          <input
            type="text"
            placeholder={`Conversar em #${currentChannel.name}`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              emitTyping();
            }}
            className="flex-1 bg-transparent text-sm text-white placeholder-[#80848e] outline-none"
          />

          {/* Emoji button */}
          <button
            type="button"
            onClick={() => {
              setEmojiTargetMessageId(null);
              setShowEmojiPicker(!showEmojiPicker);
            }}
            title="Selecionar Emoji"
            className="text-[#b5bac1] hover:text-[#f0b232] transition cursor-pointer"
          >
            <Smile className="h-5 w-5" />
          </button>

          {/* Send button */}
          <button
            type="submit"
            disabled={!text.trim()}
            className="text-[#5865f2] hover:text-white disabled:opacity-40 transition cursor-pointer"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
};

// Simple Markdown formatting helper for messages
function renderFormattedMessage(content: string) {
  if (!content) return null;

  // Split by code blocks ```
  const codeBlockParts = content.split(/(```[\s\S]*?```)/g);

  return codeBlockParts.map((part, index) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^.*\n/, '');
      return (
        <pre
          key={index}
          className="my-1.5 rounded bg-[#1e1f22] p-3 font-mono text-xs text-[#00a8fc] border border-[#2b2d31] overflow-x-auto"
        >
          <code>{code}</code>
        </pre>
      );
    }

    // Bold **text**
    const boldParts = part.split(/(\*\*.*?\*\*)/g);
    return (
      <span key={index}>
        {boldParts.map((bPart, bIdx) => {
          if (bPart.startsWith('**') && bPart.endsWith('**')) {
            return <strong key={bIdx} className="font-bold text-white">{bPart.slice(2, -2)}</strong>;
          }
          // Italic *text*
          const italicParts = bPart.split(/(\*.*?\*)/g);
          return (
            <span key={bIdx}>
              {italicParts.map((iPart, iIdx) => {
                if (iPart.startsWith('*') && iPart.endsWith('*')) {
                  return <em key={iIdx} className="italic text-gray-200">{iPart.slice(1, -1)}</em>;
                }
                // Inline code `code`
                const inlineCode = iPart.split(/(`.*?`)/g);
                return (
                  <span key={iIdx}>
                    {inlineCode.map((cPart, cIdx) => {
                      if (cPart.startsWith('`') && cPart.endsWith('`')) {
                        return (
                          <code
                            key={cIdx}
                            className="rounded bg-[#1e1f22] px-1.5 py-0.5 font-mono text-xs text-[#f23f43]"
                          >
                            {cPart.slice(1, -1)}
                          </code>
                        );
                      }
                      return cPart;
                    })}
                  </span>
                );
              })}
            </span>
          );
        })}
      </span>
    );
  });
}
