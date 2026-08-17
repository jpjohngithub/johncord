import React, { useState } from 'react';
import { useServerStore } from '../../stores/useServerStore';
import { useFriendStore } from '../../stores/useFriendStore';
import { MessageSquare, Plus, Compass } from 'lucide-react';

export const ServerSidebar: React.FC = () => {
  const {
    servers,
    currentServerId,
    selectServer,
    setCreateServerModalOpen,
    setJoinServerModalOpen
  } = useServerStore();

  const { friends } = useFriendStore();
  const pendingRequestsCount = friends.filter(f => f.status === 'pending' && !f.isSender).length;

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <aside className="flex h-full w-[72px] flex-col items-center py-3 bg-[#1e1f22] select-none shrink-0 z-20">
      {/* Home / Direct Messages Button */}
      <div 
        className="relative group flex items-center justify-center w-full mb-2"
        onMouseEnter={() => setHoveredId('home')}
        onMouseLeave={() => setHoveredId(null)}
      >
        {/* Active / Hover Pill Indicator */}
        <div
          className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
            currentServerId === null
              ? 'h-10'
              : 'h-0 group-hover:h-5'
          }`}
        />

        <button
          onClick={() => selectServer(null)}
          className={`relative flex h-12 w-12 items-center justify-center transition-all duration-200 cursor-pointer ${
            currentServerId === null
              ? 'rounded-2xl bg-[#5865f2] text-white shadow-md'
              : 'rounded-3xl group-hover:rounded-2xl bg-[#313338] text-[#dbdee1] group-hover:bg-[#5865f2] group-hover:text-white'
          }`}
        >
          <MessageSquare className="h-6 w-6" />

          {/* Pending friend requests badge */}
          {pendingRequestsCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#f23f43] text-[11px] font-bold text-white border-2 border-[#1e1f22]">
              {pendingRequestsCount}
            </span>
          )}
        </button>

        {hoveredId === 'home' && (
          <div className="absolute left-[72px] px-3 py-2 bg-[#111214] text-[#dbdee1] text-sm font-semibold rounded shadow-md z-50 whitespace-nowrap">
            Mensagens Diretas
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="h-[2px] w-8 rounded-full bg-[#35363c] mb-2" />

      {/* Server Icons List */}
      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden space-y-2 no-scrollbar px-3">
        {servers.map((server) => {
          const isActive = currentServerId === server.id;
          const initials = server.name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .substring(0, 3)
            .toUpperCase();

          return (
            <div 
              key={server.id} 
              className="relative group flex items-center justify-center w-full"
              onMouseEnter={() => setHoveredId(server.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Active Pill Indicator */}
              <div
                className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
                  isActive ? 'h-10' : 'h-0 group-hover:h-5'
                }`}
              />

              <button
                onClick={() => selectServer(server.id)}
                className={`relative flex h-12 w-12 items-center justify-center overflow-hidden transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'rounded-2xl bg-[#5865f2] text-white shadow-md'
                    : 'rounded-3xl group-hover:rounded-2xl bg-[#313338] text-[#dbdee1] group-hover:bg-[#5865f2] group-hover:text-white'
                }`}
              >
                {server.icon_url ? (
                  <img
                    src={server.icon_url}
                    alt={server.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="font-bold text-sm tracking-wider">{initials}</span>
                )}
              </button>

              {hoveredId === server.id && (
                <div className="absolute left-[72px] px-3 py-2 bg-[#111214] text-[#dbdee1] text-sm font-semibold rounded shadow-md z-50 whitespace-nowrap">
                  {server.name}
                </div>
              )}
            </div>
          );
        })}

        {/* Add Server Button */}
        <div 
          className="relative group flex items-center justify-center w-full pt-1"
          onMouseEnter={() => setHoveredId('add_server')}
          onMouseLeave={() => setHoveredId(null)}
        >
          <div className="absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 h-0 group-hover:h-5" />
          <button
            onClick={() => setCreateServerModalOpen(true)}
            className="flex h-12 w-12 items-center justify-center rounded-3xl group-hover:rounded-2xl bg-[#313338] text-[#23a55a] group-hover:bg-[#23a55a] group-hover:text-white transition-all duration-200 cursor-pointer shadow-sm"
          >
            <Plus className="h-6 w-6" />
          </button>
          
          {hoveredId === 'add_server' && (
            <div className="absolute left-[72px] px-3 py-2 bg-[#111214] text-[#dbdee1] text-sm font-semibold rounded shadow-md z-50 whitespace-nowrap">
              Adicionar um Servidor
            </div>
          )}
        </div>

        {/* Join Server by Invite Button */}
        <div 
          className="relative group flex items-center justify-center w-full"
          onMouseEnter={() => setHoveredId('join_server')}
          onMouseLeave={() => setHoveredId(null)}
        >
          <div className="absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 h-0 group-hover:h-5" />
          <button
            onClick={() => setJoinServerModalOpen(true)}
            className="flex h-12 w-12 items-center justify-center rounded-3xl group-hover:rounded-2xl bg-[#313338] text-[#5865f2] group-hover:bg-[#5865f2] group-hover:text-white transition-all duration-200 cursor-pointer shadow-sm"
          >
            <Compass className="h-6 w-6" />
          </button>
          
          {hoveredId === 'join_server' && (
            <div className="absolute left-[72px] px-3 py-2 bg-[#111214] text-[#dbdee1] text-sm font-semibold rounded shadow-md z-50 whitespace-nowrap">
              Entrar em um Servidor
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
