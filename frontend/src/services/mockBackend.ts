import { User, Server, Channel, Category, Role, ServerMember, Message, DMConversation, FriendItem } from '../types';
import { cloudEngine } from './cloudEngine';

export function subscribeLocalEvents(callback: (event: string, data: any) => void) {
  cloudEngine.init();

  const cleanups: (() => void)[] = [];

  cleanups.push(
    cloudEngine.on('message_received', ({ roomId, message }) => {
      callback('chat:message_received', { roomId, message });
    })
  );

  cleanups.push(
    cloudEngine.on('reaction_updated', (data) => {
      callback('chat:reaction_changed', data);
    })
  );

  cleanups.push(
    cloudEngine.on('user_typing', (data) => {
      callback('chat:user_typing', data);
    })
  );

  cleanups.push(
    cloudEngine.on('presence_changed', ({ userId, presence, user }) => {
      callback('user:presence_changed', {
        userId,
        presence,
        custom_status: user?.custom_status
      });
    })
  );

  cleanups.push(
    cloudEngine.on('member_joined', ({ serverId, member, user }) => {
      callback('server:member_joined', { serverId, member, user });
    })
  );

  cleanups.push(
    cloudEngine.on('channel_created', ({ serverId, channel }) => {
      callback('server:channel_created', { serverId, channel });
    })
  );

  cleanups.push(
    cloudEngine.on('category_created', ({ serverId, category }) => {
      callback('server:category_created', { serverId, category });
    })
  );

  cleanups.push(
    cloudEngine.on('server_updated', (server) => {
      callback('server:updated', { server });
    })
  );

  return () => {
    cleanups.forEach(fn => fn());
  };
}

export function broadcastLocalEvent(event: string, data: any) {
  if (event === 'chat:message_received') {
    cloudEngine.publish(`johncord/events/messages/${data.roomId}`, data);
  } else if (event === 'chat:reaction_changed') {
    cloudEngine.publish(`johncord/events/reactions/${data.channelId || data.messageId}`, data);
  } else if (event === 'chat:user_typing') {
    cloudEngine.publish(`johncord/events/typing/${data.channelId}`, data);
  }
}

// Full Cloud API Mock Handler
export async function handleMockAPI(endpoint: string, options: RequestInit = {}): Promise<any> {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : {};
  const db = cloudEngine.db;

  cloudEngine.init();

  const currentUserStr = localStorage.getItem('johncord_user');
  let currentUser: User | null = null;
  if (currentUserStr) {
    try { currentUser = JSON.parse(currentUserStr); } catch (e) {}
  }

  // --- Auth ---
  if (endpoint === '/auth/login' && method === 'POST') {
    const { email } = body;
    const cleanEmail = (email || '').trim().toLowerCase();
    
    let userId = db.usersByEmail[cleanEmail];
    let user = userId ? db.users[userId] : Object.values(db.users).find(u => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      const name = (email || 'Usuario').split('@')[0];
      const newUserId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      user = {
        id: newUserId,
        username: name.charAt(0).toUpperCase() + name.slice(1),
        tag: String(Math.floor(1000 + Math.random() * 9000)),
        email: cleanEmail || `user_${Date.now()}@johncord.gg`,
        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
        presence: 'online',
        created_at: new Date().toISOString()
      };
      db.users[user.id] = user;
      db.usersByEmail[user.email.toLowerCase()] = user.id;
    } else {
      user.presence = 'online';
    }

    cloudEngine.saveCache();
    cloudEngine.publish('johncord/sync/state/user', { user });
    cloudEngine.publish('johncord/events/presence', { user, timestamp: Date.now() });

    return { token: 'jwt_' + user.id, user };
  }

  if (endpoint === '/auth/register' && method === 'POST') {
    const { username, email } = body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanUsername = (username || 'Usuario').trim();
    const newUserId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    const user: User = {
      id: newUserId,
      username: cleanUsername,
      tag: String(Math.floor(1000 + Math.random() * 9000)),
      email: cleanEmail || `user_${Date.now()}@johncord.gg`,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanUsername)}`,
      presence: 'online',
      created_at: new Date().toISOString()
    };

    db.users[user.id] = user;
    db.usersByEmail[user.email.toLowerCase()] = user.id;

    cloudEngine.saveCache();
    cloudEngine.publish('johncord/sync/state/user', { user });
    cloudEngine.publish('johncord/events/presence', { user, timestamp: Date.now() });

    return { token: 'jwt_' + user.id, user };
  }

  if (endpoint === '/auth/guest' && method === 'POST') {
    const guestNum = Math.floor(1000 + Math.random() * 9000);
    const newUserId = 'usr_guest_' + Date.now();

    const user: User = {
      id: newUserId,
      username: `Convidado#${guestNum}`,
      tag: String(guestNum),
      email: `convidado${guestNum}@johncord.gg`,
      avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=Guest${guestNum}`,
      presence: 'online',
      created_at: new Date().toISOString()
    };

    db.users[user.id] = user;
    db.usersByEmail[user.email.toLowerCase()] = user.id;

    cloudEngine.saveCache();
    cloudEngine.publish('johncord/sync/state/user', { user });
    cloudEngine.publish('johncord/events/presence', { user, timestamp: Date.now() });

    return { token: 'jwt_' + user.id, user };
  }

  if (endpoint === '/auth/me' && method === 'GET') {
    if (currentUser && db.users[currentUser.id]) {
      return { user: db.users[currentUser.id] };
    }
    return { user: currentUser };
  }

  if (endpoint === '/auth/profile' && method === 'PATCH') {
    if (currentUser) {
      db.users[currentUser.id] = { ...db.users[currentUser.id], ...body };
      cloudEngine.saveCache();
      cloudEngine.publish('johncord/sync/state/user', { user: db.users[currentUser.id] });
      cloudEngine.publish('johncord/events/presence', { user: db.users[currentUser.id], timestamp: Date.now() });
      return { user: db.users[currentUser.id] };
    }
    return { user: currentUser };
  }

  // --- Servers ---
  if (endpoint === '/servers' && method === 'GET') {
    if (!currentUser) return { servers: [] };
    const myServers: Server[] = [];

    Object.keys(db.serverMembers).forEach((sId) => {
      const members = db.serverMembers[sId] || [];
      if (members.some(m => m.user_id === currentUser!.id)) {
        if (db.servers[sId]) {
          myServers.push(db.servers[sId]);
        }
      }
    });

    return { servers: myServers };
  }

  // Create Server
  if (endpoint === '/servers' && method === 'POST') {
    if (!currentUser) throw new Error('Não autenticado.');

    const { name, icon_url } = body;
    const newServerId = 'srv_' + Date.now();
    const newCatTextId = 'cat_text_' + Date.now();
    const newCatVoiceId = 'cat_voice_' + Date.now();
    const inviteCode = 'JC-' + Math.random().toString(36).substring(2, 7).toUpperCase();

    const server: Server = {
      id: newServerId,
      name: name || 'Meu Servidor',
      icon_url: icon_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name || 'Server')}`,
      owner_id: currentUser.id,
      invite_code: inviteCode,
      created_at: new Date().toISOString()
    };

    const catText: Category = {
      id: newCatTextId,
      server_id: newServerId,
      name: 'CANAIS DE TEXTO',
      position: 0,
      created_at: new Date().toISOString()
    };

    const catVoice: Category = {
      id: newCatVoiceId,
      server_id: newServerId,
      name: 'CANAIS DE VOZ',
      position: 1,
      created_at: new Date().toISOString()
    };

    const chGeneralText: Channel = {
      id: 'ch_text_' + Date.now(),
      server_id: newServerId,
      category_id: newCatTextId,
      name: 'geral',
      type: 'text',
      topic: 'Canal de texto principal para conversar com amigos.',
      position: 0,
      created_at: new Date().toISOString()
    };

    const chGeneralVoice: Channel = {
      id: 'ch_voice_' + Date.now(),
      server_id: newServerId,
      category_id: newCatVoiceId,
      name: 'Sala de Voz 🔊',
      type: 'voice',
      position: 0,
      created_at: new Date().toISOString()
    };

    const adminRole: Role = {
      id: 'role_admin_' + Date.now(),
      server_id: newServerId,
      name: 'Dono / Admin',
      color: '#5865f2',
      position: 0,
      permissions: ['ADMINISTRATOR'],
      created_at: new Date().toISOString()
    };

    const memberEntry: ServerMember = {
      id: 'sm_' + Date.now(),
      server_id: newServerId,
      user_id: currentUser.id,
      joined_at: new Date().toISOString(),
      user: currentUser,
      roles: [adminRole]
    };

    db.servers[newServerId] = server;
    db.serversByInvite[inviteCode.toUpperCase()] = newServerId;
    db.categories[newServerId] = [catText, catVoice];
    db.channels[newServerId] = [chGeneralText, chGeneralVoice];
    db.roles[newServerId] = [adminRole];
    db.serverMembers[newServerId] = [memberEntry];
    db.channelMessages[chGeneralText.id] = [
      {
        id: 'msg_init_' + Date.now(),
        channel_id: chGeneralText.id,
        user_id: currentUser.id,
        content: `🎉 Servidor **${server.name}** criado com sucesso! Convide amigos com o link: \`${inviteCode}\``,
        attachments: [],
        is_pinned: 1,
        created_at: new Date().toISOString(),
        user: currentUser,
        reactions: []
      }
    ];

    cloudEngine.saveCache();

    // Broadcast globally to all connected clients on Earth
    cloudEngine.publish('johncord/sync/state/server', {
      server,
      categories: [catText, catVoice],
      channels: [chGeneralText, chGeneralVoice],
      roles: [adminRole],
      member: memberEntry
    });

    return { server };
  }

  // Join Server by Invite Code / URL
  if (endpoint === '/servers/join' && method === 'POST') {
    if (!currentUser) throw new Error('Não autenticado.');

    const { inviteCode } = body;
    let cleanCode = (inviteCode || '').trim();
    if (cleanCode.includes('invite=')) {
      cleanCode = cleanCode.split('invite=')[1].split('&')[0];
    } else if (cleanCode.includes('join=')) {
      cleanCode = cleanCode.split('join=')[1].split('&')[0];
    } else if (cleanCode.includes('/')) {
      const parts = cleanCode.split('/').filter(Boolean);
      cleanCode = parts[parts.length - 1];
    }
    cleanCode = cleanCode.toUpperCase();

    let serverId = db.serversByInvite[cleanCode];
    let server = serverId ? db.servers[serverId] : Object.values(db.servers).find(s => s.invite_code.toUpperCase() === cleanCode);

    if (!server) {
      const newServerId = 'srv_' + cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '_');
      server = {
        id: newServerId,
        name: `Comunidade ${cleanCode}`,
        icon_url: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(cleanCode)}`,
        owner_id: currentUser.id,
        invite_code: cleanCode,
        created_at: new Date().toISOString()
      };
      const catTextId = 'cat_text_' + Date.now();
      const catVoiceId = 'cat_voice_' + Date.now();
      const catText = { id: catTextId, server_id: newServerId, name: 'CANAIS DE TEXTO', position: 0, created_at: new Date().toISOString() };
      const catVoice = { id: catVoiceId, server_id: newServerId, name: 'CANAIS DE VOZ', position: 1, created_at: new Date().toISOString() };
      const ch1 = { id: 'ch_' + Date.now() + '_1', server_id: newServerId, category_id: catTextId, name: 'geral', type: 'text' as const, position: 0, created_at: new Date().toISOString() };
      const ch2 = { id: 'ch_' + Date.now() + '_2', server_id: newServerId, category_id: catVoiceId, name: 'Sala de Voz 🔊', type: 'voice' as const, position: 1, created_at: new Date().toISOString() };

      db.servers[newServerId] = server;
      db.serversByInvite[cleanCode] = newServerId;
      db.categories[newServerId] = [catText, catVoice];
      db.channels[newServerId] = [ch1, ch2];
      db.roles[newServerId] = [];
      db.serverMembers[newServerId] = [];

      cloudEngine.publish('johncord/sync/state/server', {
        server,
        categories: [catText, catVoice],
        channels: [ch1, ch2],
        roles: [],
        member: null
      });
    }

    if (!db.serverMembers[server.id]) db.serverMembers[server.id] = [];

    let existingMember = db.serverMembers[server.id].find(m => m.user_id === currentUser!.id);
    if (!existingMember) {
      existingMember = {
        id: 'sm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
        server_id: server.id,
        user_id: currentUser.id,
        joined_at: new Date().toISOString(),
        user: currentUser
      };
      db.serverMembers[server.id].push(existingMember);
      cloudEngine.saveCache();

      // Announce member joined to all other clients globally
      cloudEngine.publish('johncord/sync/state/member', {
        serverId: server.id,
        member: existingMember,
        user: currentUser
      });
    }

    return { server };
  }

  // Get Server Details
  if (endpoint.startsWith('/servers/') && method === 'GET') {
    const serverId = endpoint.replace('/servers/', '');
    const server = db.servers[serverId];
    if (!server) throw new Error('Servidor não encontrado.');

    const categories = db.categories[serverId] || [];
    const channels = db.channels[serverId] || [];
    const roles = db.roles[serverId] || [];
    const rawMembers = db.serverMembers[serverId] || [];

    const members = rawMembers.map((m) => {
      const u: User = db.users[m.user_id] || m.user || {
        id: m.user_id,
        username: m.nickname || 'Usuário',
        tag: '0000',
        email: '',
        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.user_id}`,
        custom_status: '',
        presence: 'online',
        created_at: new Date().toISOString()
      };
      const onlineInfo = db.onlineUsers[m.user_id];
      return {
        ...m,
        user: {
          ...u,
          presence: onlineInfo ? (onlineInfo.presence as any) : (u.presence || 'online'),
          custom_status: onlineInfo?.custom_status ?? u.custom_status
        }
      };
    });

    const categoriesWithChannels = categories.map((cat) => ({
      ...cat,
      channels: channels.filter((ch) => ch.category_id === cat.id)
    }));

    const unassigned = channels.filter((ch) => !ch.category_id);

    return {
      server: {
        ...server,
        categories: categoriesWithChannels,
        channels,
        unassignedChannels: unassigned,
        roles,
        members
      }
    };
  }

  // Get Messages
  if (endpoint.includes('/channels/') && endpoint.endsWith('/messages') && method === 'GET') {
    const channelId = endpoint.split('/')[2];
    const rawMsgs = db.channelMessages[channelId] || [];
    const messages = rawMsgs.map((m) => ({
      ...m,
      user: db.users[m.user_id] || m.user
    }));
    return { messages };
  }

  // Send Message
  if (endpoint === '/messages' && method === 'POST') {
    if (!currentUser) throw new Error('Não autenticado.');

    const { channel_id, dm_conversation_id, content, attachments = [], reply_to_id, thread_parent_id } = body;
    let reply_to = null;
    if (reply_to_id && channel_id && db.channelMessages[channel_id]) {
      const parent = db.channelMessages[channel_id].find(m => m.id === reply_to_id);
      if (parent) {
        reply_to = {
          id: parent.id,
          username: parent.user?.username || 'Usuário',
          content: parent.content
        };
      }
    }

    const message: Message = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      channel_id: channel_id || null,
      dm_conversation_id: dm_conversation_id || null,
      thread_parent_id: thread_parent_id || null,
      user_id: currentUser.id,
      content,
      attachments,
      reply_to_id: reply_to_id || null,
      reply_to,
      is_pinned: 0,
      created_at: new Date().toISOString(),
      user: currentUser,
      reactions: []
    };

    const roomId = channel_id || dm_conversation_id || `thread:${thread_parent_id}`;

    if (channel_id) {
      if (!db.channelMessages[channel_id]) db.channelMessages[channel_id] = [];
      db.channelMessages[channel_id].push(message);
    }
    if (dm_conversation_id) {
      if (!db.dmMessages[dm_conversation_id]) db.dmMessages[dm_conversation_id] = [];
      db.dmMessages[dm_conversation_id].push(message);
    }

    cloudEngine.saveCache();

    // Instant real-time publish
    cloudEngine.publish(`johncord/events/messages/${roomId}`, {
      roomId,
      message
    });

    return { message };
  }

  // Toggle Reactions
  if (endpoint.includes('/messages/') && endpoint.endsWith('/reactions') && method === 'POST') {
    if (!currentUser) throw new Error('Não autenticado.');

    const parts = endpoint.split('/');
    const msgId = parts[2];
    const { emoji, channelId } = body;

    let targetMsg: Message | undefined;
    if (channelId && db.channelMessages[channelId]) {
      targetMsg = db.channelMessages[channelId].find(m => m.id === msgId);
    }
    if (!targetMsg) {
      Object.values(db.channelMessages).forEach(list => {
        const found = list.find(m => m.id === msgId);
        if (found) targetMsg = found;
      });
    }

    if (targetMsg) {
      if (!targetMsg.reactions) targetMsg.reactions = [];
      const existing = targetMsg.reactions.find(r => r.emoji === emoji);
      if (existing) {
        if (existing.users.includes(currentUser.id)) {
          existing.users = existing.users.filter(uid => uid !== currentUser!.id);
          existing.count -= 1;
          if (existing.count <= 0) {
            targetMsg.reactions = targetMsg.reactions.filter(r => r.emoji !== emoji);
          }
        } else {
          existing.users.push(currentUser.id);
          existing.count += 1;
        }
      } else {
        targetMsg.reactions.push({ emoji, count: 1, users: [currentUser.id] });
      }

      cloudEngine.saveCache();

      const payload = { messageId: msgId, reactions: targetMsg.reactions, channelId: targetMsg.channel_id };
      cloudEngine.publish(`johncord/events/reactions/${targetMsg.channel_id || msgId}`, payload);

      return { reactions: targetMsg.reactions };
    }
    return { reactions: [] };
  }

  // Friends & DMs
  if (endpoint === '/friends' && method === 'GET') {
    if (!currentUser) return { friends: [] };
    const list: FriendItem[] = Object.values(db.friendships)
      .filter(f => f.sender_id === currentUser!.id || f.receiver_id === currentUser!.id)
      .map(f => {
        const otherId = f.sender_id === currentUser!.id ? f.receiver_id : f.sender_id;
        const otherUser: User = db.users[otherId] || {
          id: otherId,
          username: 'Amigo',
          tag: '0000',
          email: '',
          avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherId}`,
          custom_status: '',
          presence: 'online',
          created_at: f.created_at
        };
        const onlineInfo = db.onlineUsers[otherId];
        return {
          id: f.id,
          status: f.status,
          isSender: f.sender_id === currentUser!.id,
          createdAt: f.created_at,
          friend: {
            ...otherUser,
            presence: onlineInfo ? (onlineInfo.presence as any) : (otherUser.presence || 'online')
          }
        };
      });
    return { friends: list };
  }

  if (endpoint === '/friends/request' && method === 'POST') {
    if (!currentUser) throw new Error('Não autenticado.');
    const { userTag } = body;
    const [name, tag] = (userTag || '').split('#');
    const target = Object.values(db.users).find(u => u.username.toLowerCase() === (name || '').toLowerCase() && (!tag || u.tag === tag));
    if (!target) throw new Error('Usuário não encontrado.');

    const newFriendship = {
      id: 'f_' + Date.now(),
      sender_id: currentUser.id,
      receiver_id: target.id,
      status: 'pending' as const,
      created_at: new Date().toISOString()
    };
    db.friendships[newFriendship.id] = newFriendship;
    cloudEngine.saveCache();
    return { message: 'Pedido de amizade enviado!' };
  }

  if (endpoint === '/dms' && method === 'GET') {
    return { conversations: Object.values(db.dmConversations) };
  }

  return { success: true };
}
