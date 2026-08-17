import React from 'react';
import { useFriendStore } from '../../stores/useFriendStore';
import { Phone, PhoneOff, Video } from 'lucide-react';

export const IncomingCallModal: React.FC = () => {
  const { incomingCall, answerCall, declineCall } = useFriendStore();

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 animate-fade-in select-none">
      <div className="flex w-80 flex-col items-center rounded bg-[#2b2d31] p-6 shadow-2xl border border-[#3f4147] animate-scale-up">
        {/* Calling User Avatar with Pulsing Ring */}
        <div className="relative mb-4">
          <img
            src={
              incomingCall.caller.avatar_url ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${incomingCall.caller.username}`
            }
            alt=""
            className="h-24 w-24 rounded-full border-4 border-[#5865f2] object-cover shadow-lg"
          />
          <div className="absolute inset-0 rounded-full border-4 border-[#23a55a] animate-ping opacity-60 pointer-events-none" />
        </div>

        <h3 className="text-base font-bold text-white text-center">
          {incomingCall.caller.username}
        </h3>
        <p className="text-xs text-[#949ba4] mt-1 flex items-center gap-1.5">
          {incomingCall.withVideo ? <Video className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
          Chamada de {incomingCall.withVideo ? 'Vídeo' : 'Voz'} recebida...
        </p>

        {/* Accept and Decline Buttons */}
        <div className="flex items-center gap-6 mt-6">
          <button
            onClick={declineCall}
            title="Recusar Chamada"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f23f43] text-white hover:bg-[#d83539] transition-transform hover:scale-110 shadow-lg shadow-[#f23f43]/40 cursor-pointer"
          >
            <PhoneOff className="h-6 w-6" />
          </button>

          <button
            onClick={answerCall}
            title="Atender Chamada"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#23a55a] text-white hover:bg-[#1f914f] transition-transform hover:scale-110 shadow-lg shadow-[#23a55a]/40 cursor-pointer"
          >
            <Phone className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
