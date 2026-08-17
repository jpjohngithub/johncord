import React, { useState, useRef, useEffect } from 'react';
import { useFriendStore } from '../../stores/useFriendStore';
import { useChatStore } from '../../stores/useChatStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import {
  Phone,
  Video,
  PlusCircle,
  Smile,
  Send,
  Reply,
  Trash2,
  Edit2,
  FileText,
  X,
  PhoneOff,
  Mic,
  MicOff,
  Headphones,
  VolumeX,
  Monitor
} from 'lucide-react';
import { EmojiPicker } from '../chat/EmojiPicker';
import { User, Message } from '../../types';

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

interface DMChatAreaProps {
  onSelectUser: (user: User) => void;
}

export const DMChatArea: React.FC<DMChatAreaProps> = ({ onSelectUser }) => {
  const { currentDM, currentDMId, startCall, isCallActive, endCall, callWithVideo } = useFriendStore();
  const {
    messages,
    loadDMMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    replyTo,
    setReplyTo,
    typingUsers,
    emitTyping
  } = useChatStore();

  const currentUser = useAuthStore((state) => state.user);
  const {
    localStream,
    screenStream,
    isMuted,
    isDeafened,
    isVideoOn,
    isScreenSharing,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenShare
  } = useVoiceStore();

  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const otherUser = currentDM?.members?.find((m) => m.id !== currentUser?.id) || currentDM?.members?.[0];

  useEffect(() => {
    if (currentDMId) {
      loadDMMessages(currentDMId);
    }
  }, [currentDMId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!currentDM || !otherUser) return null;

  const handleSend = async (e: React.FormEvent) => {
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
        headers: { Authorization: `Bearer ${token}` },
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

  return (
    <div className="flex h-full flex-1 flex-col bg-[#313338] select-text relative overflow-hidden">
      {/* DM Header */}
      <div className="flex h-12 items-center justify-between px-4 border-b border-[#1f2023] bg-[#313338] z-10 shrink-0 select-none">
        {/* User Info */}
        <button
          onClick={() => onSelectUser(otherUser)}
          className="flex items-center gap-2.5 cursor-pointer text-left"
        >
          <div className="relative">
            <img
              src={otherUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUser.username}`}
              alt=""
              className="h-8 w-8 rounded-full object-cover bg-[#1e1f22]"
            />
            <div
              className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#313338] ${
                otherUser.presence === 'online'
                  ? 'bg-[#23a55a]'
                  : otherUser.presence === 'idle'
                  ? 'bg-[#f0b232]'
                  : otherUser.presence === 'dnd'
                  ? 'bg-[#f23f43]'
                  : 'bg-[#80848e]'
              }`}
            />
          </div>

          <div>
            <div className="text-sm font-bold text-white leading-tight">
              @{otherUser.username}
            </div>
            {otherUser.custom_status && (
              <div className="text-[10px] text-[#949ba4] leading-tight">
                {otherUser.custom_status}
              </div>
            )}
          </div>
        </button>

        {/* Voice & Video Call Action Buttons */}
        <div className="flex items-center gap-2 text-[#b5bac1]">
          {!isCallActive ? (
            <>
              <button
                onClick={() => startCall(otherUser, false)}
                title="Iniciar Chamada de Voz"
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#35373c] hover:text-[#23a55a] transition cursor-pointer"
              >
                <Phone className="h-5 w-5" />
              </button>

              <button
                onClick={() => startCall(otherUser, true)}
                title="Iniciar Chamada de Vídeo"
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#35373c] hover:text-[#5865f2] transition cursor-pointer"
              >
                <Video className="h-5 w-5" />
              </button>
            </>
          ) : (
            /* Active Call Top Status */
            <div className="flex items-center gap-2 bg-[#232428] rounded-full px-3 py-1 border border-[#23a55a]/40">
              <div className="h-2 w-2 rounded-full bg-[#23a55a] animate-ping" />
              <span className="text-xs font-bold text-[#23a55a]">Em Chamada Privada</span>
              <button
                onClick={endCall}
                title="Desligar"
                className="rounded-full bg-[#f23f43] p-1 text-white hover:bg-[#d83539] transition cursor-pointer"
              >
                <PhoneOff className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Active Call Stage View if Call is Active */}
      {isCallActive && (
        <div className="flex flex-col items-center justify-center bg-[#1e1f22] p-4 border-b border-[#1f2023] relative min-h-[220px]">
          <div className="flex items-center gap-8">
            {/* Local participant card */}
            <div className="flex flex-col items-center gap-2">
              <img
                src={currentUser?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.username}`}
                alt=""
                className="h-20 w-20 rounded-full border-4 border-[#23a55a] object-cover"
              />
              <span className="text-xs font-bold text-white">{currentUser?.username} (Você)</span>
            </div>

            {/* Calling wave animation */}
            <div className="flex items-center gap-1">
              <div className="h-3 w-1 bg-[#5865f2] rounded-full animate-bounce" />
              <div className="h-6 w-1 bg-[#5865f2] rounded-full animate-bounce delay-100" />
              <div className="h-4 w-1 bg-[#5865f2] rounded-full animate-bounce delay-200" />
            </div>

            {/* Remote friend card */}
            <div className="flex flex-col items-center gap-2">
              <img
                src={otherUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUser.username}`}
                alt=""
                className="h-20 w-20 rounded-full border-4 border-[#5865f2] object-cover"
              />
              <span className="text-xs font-bold text-white">{otherUser.username}</span>
            </div>
          </div>

          {/* Quick Call controls bar */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={toggleMute}
              className={`rounded-full p-2.5 transition cursor-pointer ${
                isMuted ? 'bg-[#f23f43] text-white' : 'bg-[#2b2d31] text-[#dbdee1] hover:bg-[#35373c]'
              }`}
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>

            <button
              onClick={toggleDeafen}
              className={`rounded-full p-2.5 transition cursor-pointer ${
                isDeafened ? 'bg-[#f23f43] text-white' : 'bg-[#2b2d31] text-[#dbdee1] hover:bg-[#35373c]'
              }`}
            >
              {isDeafened ? <VolumeX className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
            </button>

            <button
              onClick={toggleVideo}
              className={`rounded-full p-2.5 transition cursor-pointer ${
                isVideoOn ? 'bg-[#23a55a] text-white' : 'bg-[#2b2d31] text-[#dbdee1] hover:bg-[#35373c]'
              }`}
            >
              <Video className="h-4 w-4" />
            </button>

            <button
              onClick={toggleScreenShare}
              className={`rounded-full p-2.5 transition cursor-pointer ${
                isScreenSharing ? 'bg-[#5865f2] text-white' : 'bg-[#2b2d31] text-[#dbdee1] hover:bg-[#35373c]'
              }`}
            >
              <Monitor className="h-4 w-4" />
            </button>

            <button
              onClick={endCall}
              className="rounded-full bg-[#f23f43] px-4 py-2 text-xs font-bold text-white hover:bg-[#d83539] transition flex items-center gap-1.5 cursor-pointer"
            >
              <PhoneOff className="h-4 w-4" />
              Desconectar
            </button>
          </div>
        </div>
      )}

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* DM Start Greeting */}
        <div className="pt-12 pb-4">
          <img
            src={otherUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUser.username}`}
            alt=""
            className="h-16 w-16 rounded-full object-cover mb-3"
          />
          <h2 className="text-2xl font-bold text-white">@{otherUser.username}</h2>
          <p className="text-sm text-[#949ba4] mt-1">
            Este é o início da sua história de mensagens diretas com <strong className="text-white">@{otherUser.username}</strong>.
          </p>
          <div className="h-[1px] w-full bg-[#3f4147] mt-4" />
        </div>

        {/* Message Items */}
        {messages.map((msg, index) => {
          const isMe = msg.user_id === currentUser?.id;
          const isEditing = editingMessageId === msg.id;
          const showHeader = shouldShowHeader(messages, index);
          const showDate = shouldShowDateSeparator(messages, index);

          return (
            <React.Fragment key={msg.id}>
              {showDate && (
                <div className="flex items-center gap-2 my-4">
                  <div className="flex-1 h-[1px] bg-[#3f4147]" />
                  <span className="text-[10px] font-bold text-[#949ba4] tracking-wider">
                    {formatDateSeparator(msg.created_at)}
                  </span>
                  <div className="flex-1 h-[1px] bg-[#3f4147]" />
                </div>
              )}
              <div
                className={`group relative -mx-4 flex gap-4 px-4 hover:bg-[#2e3035] transition-colors ${
                  showHeader ? 'mt-4 pt-1 pb-1.5' : 'py-0.5'
                }`}
              >
                {/* User Avatar or Timestamp */}
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
                      alt=""
                      className="h-10 w-10 rounded-full object-cover bg-[#1e1f22]"
                    />
                  </button>
                ) : (
                  <div className="w-10 shrink-0 text-right opacity-0 group-hover:opacity-100 mt-1">
                    <span className="text-[10px] text-[#949ba4] block pr-1 leading-[22px]">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                <div className="flex-1 overflow-hidden">
                  {showHeader && (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">
                        {msg.user?.username || 'Usuário'}
                      </span>
                      <span className="text-[11px] text-[#949ba4]">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}

                  {isEditing ? (
                    <div className="mt-1 space-y-1">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            editMessage(msg.id, editText);
                            setEditingMessageId(null);
                          }
                          if (e.key === 'Escape') setEditingMessageId(null);
                        }}
                        className="w-full rounded bg-[#383a40] p-2 text-sm text-white outline-none border border-[#5865f2]"
                      />
                      <div className="text-[11px] text-[#949ba4]">
                        Enter para salvar • Esc para cancelar
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-[#dbdee1] whitespace-pre-wrap break-words leading-relaxed mt-0.5">
                      {msg.content}
                    </div>
                  )}

                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {msg.attachments.map((att) => {
                        const isImage = att.type.startsWith('image/') || att.url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                        if (isImage) {
                          return (
                            <div key={att.id} className="max-w-md overflow-hidden rounded-lg border border-[#3f4147]">
                              <img src={att.url} alt="" className="max-h-80 w-auto rounded-lg object-contain bg-[#1e1f22]" />
                            </div>
                          );
                        }
                        return (
                          <div
                            key={att.id}
                            className="flex items-center gap-3 max-w-sm rounded-lg bg-[#2b2d31] p-3 border border-[#3f4147]"
                          >
                            <FileText className="h-8 w-8 text-[#5865f2] shrink-0" />
                            <div className="truncate flex-1">
                              <div className="text-xs font-semibold text-white truncate">{att.name}</div>
                              <div className="text-[10px] text-[#949ba4]">{(att.size / 1024).toFixed(1)} KB</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Reactions */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {msg.reactions.map((reaction) => (
                        <button
                          key={reaction.emoji}
                          onClick={() => toggleReaction(msg.id, reaction.emoji)}
                          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-[#2b2d31] border border-[#3f4147] text-[#b5bac1] hover:bg-[#35373c] cursor-pointer"
                        >
                          <span>{reaction.emoji}</span>
                          <span>{reaction.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Hover actions */}
                <div className="absolute right-4 -top-3 hidden group-hover:flex items-center rounded-md bg-[#313338] border border-[#232428] shadow-md text-[#b5bac1] overflow-hidden z-10">
                  <button
                    onClick={() => toggleReaction(msg.id, '❤️')}
                    title="Reagir com Coração"
                    className="p-1.5 hover:bg-[#35373c] hover:text-white transition cursor-pointer"
                  >
                    <Smile className="h-4 w-4" />
                  </button>

                  {isMe && (
                    <>
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
                      <button
                        onClick={() => deleteMessage(msg.id)}
                        title="Deletar"
                        className="p-1.5 hover:bg-[#f23f43]/20 hover:text-[#f23f43] transition cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-0.5 text-[11px] text-[#949ba4] animate-pulse">
          <span className="font-bold text-white">@{otherUser.username}</span> está digitando...
        </div>
      )}

      {/* Chat Input */}
      <div className="p-4 pt-1 bg-[#313338] relative">
        {showEmojiPicker && (
          <EmojiPicker
            onSelectEmoji={(emoji) => setText((prev) => prev + emoji)}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}

        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 rounded-lg bg-[#383a40] px-4 py-2.5 shadow-inner"
        >
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

          <input
            type="text"
            placeholder={`Conversar com @${otherUser.username}`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              emitTyping();
            }}
            className="flex-1 bg-transparent text-sm text-white placeholder-[#80848e] outline-none"
          />

          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="text-[#b5bac1] hover:text-[#f0b232] transition cursor-pointer"
          >
            <Smile className="h-5 w-5" />
          </button>

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
