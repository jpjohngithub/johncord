import React from 'react';
import { useServerStore } from '../../stores/useServerStore';
import { useFriendStore } from '../../stores/useFriendStore';
import { ServerMember, Role, User } from '../../types';

interface MemberListProps {
  onSelectUser: (user: User) => void;
}

export const MemberList: React.FC<MemberListProps> = ({ onSelectUser }) => {
  const { currentServer, isMemberListOpen } = useServerStore();

  if (!isMemberListOpen || !currentServer || !currentServer.members) return null;

  const roles = currentServer.roles || [];
  const members = currentServer.members || [];

  // Group members by highest role
  const sortedRoles = [...roles].sort((a, b) => a.position - b.position);

  // Helper to find highest role for a member
  const getMemberGroup = (member: ServerMember): Role | null => {
    if (!member.roles || member.roles.length === 0) return null;
    const memberRoleIds = member.roles.map((r) => r.id);
    for (const r of sortedRoles) {
      if (memberRoleIds.includes(r.id)) return r;
    }
    return null;
  };

  const grouped: { role: Role | null; members: ServerMember[] }[] = [];

  sortedRoles.forEach((role) => {
    const roleMembers = members.filter((m) => getMemberGroup(m)?.id === role.id);
    if (roleMembers.length > 0) {
      grouped.push({ role, members: roleMembers });
    }
  });

  // Members with no specific role or unassigned
  const unassigned = members.filter((m) => !getMemberGroup(m));
  if (unassigned.length > 0) {
    grouped.push({ role: null, members: unassigned });
  }

  return (
    <aside className="hidden lg:flex h-full w-60 flex-col bg-[#2b2d31] p-3 pt-6 select-none shrink-0 overflow-y-auto border-l border-[#1f2023]">
      <div className="space-y-4">
        {grouped.map((group, idx) => (
          <div key={group.role?.id || `unassigned-${idx}`} className="space-y-1">
            {/* Role Header */}
            <h3 className="px-2 text-[11px] font-bold uppercase tracking-wider text-[#949ba4]">
              {group.role ? group.role.name : 'ONLINE'} — {group.members.length}
            </h3>

            {/* Members in Role */}
            <div className="space-y-0.5">
              {group.members.map((m) => {
                const u = m.user;
                if (!u) return null;
                const isBot = u.username.toLowerCase().includes('bot');
                const roleColor = group.role?.color || '#dbdee1';

                return (
                  <button
                    key={m.id}
                    onClick={() => onSelectUser(u)}
                    className={`group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-[#35373c] transition-colors cursor-pointer text-left ${u.presence === 'offline' ? 'opacity-30' : ''}`}
                  >
                    {/* Avatar with Presence Dot */}
                    <div className="relative shrink-0">
                      <img
                        src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`}
                        alt={u.username}
                        className="h-8 w-8 rounded-full object-cover bg-[#1e1f22]"
                      />
                      <div
                        className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#2b2d31] ${
                          u.presence === 'online'
                            ? 'bg-[#23a55a]'
                            : u.presence === 'idle'
                            ? 'bg-[#f0b232]'
                            : u.presence === 'dnd'
                            ? 'bg-[#f23f43]'
                            : 'bg-[#80848e]'
                        }`}
                      />
                    </div>

                    <div className="truncate flex-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className="truncate text-xs font-semibold"
                          style={{ color: roleColor }}
                        >
                          {m.nickname || u.username}
                        </span>

                        {isBot && (
                          <span className="rounded bg-[#5865f2] px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                            BOT
                          </span>
                        )}
                      </div>

                      {u.custom_status && (
                        <div className="truncate text-[10px] text-[#949ba4]">
                          {u.custom_status}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};
