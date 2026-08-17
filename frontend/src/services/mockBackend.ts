import { User, Server, Channel, Category, Role, ServerMember, Message, DMConversation, FriendItem, Thread } from '../types';
import { publishGlobalEvent, subscribeGlobalTopic, initGlobalRealtime } from './globalRealtime';

interface LocalDB {
  users: User[];
  servers: Server[];
  categories: Category[];
  channels: Channel[];
  roles: Role[];
  server_members: ServerMember[];
  messages: Message[];
  threads: Thread[];
  friendships: { id: string; sender_id: string; receiver_id: string; status: 'pending' | 'accepted' | 'blocked'; created_at: string }[];
  dm_conversations: DMConversation[];
  dm_members: { id: string; dm_conversation_id: string; user_id: string }[];
}

const DB_KEY = 'johncord_global_db_v4';

function createInitialDB(): LocalDB {
  const botUser: User = {
    id: 'user_bot',
    username: 'JohnBot',
    tag: '0001',
    email: 'bot@johncord.gg',
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=JohnBot',
    banner_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
    bio: '🤖 Olá! Eu sou o JohnBot, assistente do Johncord.',
    custom_status: 'Online no Johncord 🚀',
    presence: 'online',
    created_at: new Date().toISOString()
  };

  return {
    users: [botUser],
    servers: [],
    categories: [],
    channels: [],
    roles: [],
    server_members: [],
    messages: [],
    threads: [],
    friendships: [],
    dm_conversations: [],
    dm_members: []
  };
}

function getDB(): LocalDB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  const initial = createInitialDB();
  saveDB(initial);
  return initial;
}

function saveDB(db: LocalDB) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {}
}

// Local and Global Real-time Bridge
let localBroadcast: BroadcastChannel | null = null;
try {
  localBroadcast = new BroadcastChannel('johncord_realtime_events');
} catch (e) {}

export function broadcastLocalEvent(event: string, data: any) {
  if (localBroadcast) {
    localBroadcast.postMessage({ event, data });
  }
}

export function subscribeLocalEvents(callback: (event: string, data: any) => void) {
  const cleanups: (() => void)[] = [];

  // 1. Same-browser broadcast channel
  if (localBroadcast) {
    const handler = (msg: MessageEvent) => {
      if (msg.data?.event) {
        callback(msg.data.event, msg.data.data);
      }
    };
    localBroadcast.addEventListener('message', handler);
    cleanups.push(() => localBroadcast?.removeEventListener('message', handler));
  }

  // 2. Global Internet Real-time pubsub for multi-device sync
  initGlobalRealtime();

  // Listen for global server & member events
  const unsubServers = subscribeGlobalTopic('johncord/global/servers', (payload) => {
    const db = getDB();
    if (payload.type === 'server_created' && payload.server) {
      if (!db.servers.some(s => s.id === payload.server.id)) {
        db.servers.push(payload.server);
        if (payload.categories) db.categories.push(...payload.categories);
        if (payload.channels) db.channels.push(...payload.channels);
        if (payload.roles) db.roles.push(...payload.roles);
        if (payload.member) db.server_members.push(payload.member);
        saveDB(db);
      }
    } else if (payload.type === 'member_joined' && payload.member) {
      if (!db.server_members.some(m => m.id === payload.member.id || (m.server_id === payload.member.server_id && m.user_id === payload.member.user_id))) {
        db.server_members.push(payload.member);
        if (payload.user && !db.users.some(u => u.id === payload.user.id)) {
          db.users.push(payload.user);
        }
        saveDB(db);
        callback('server:member_joined', { member: payload.member });
      }
    } else if (payload.type === 'channel_created' && payload.channel) {
      if (!db.channels.some(c => c.id === payload.channel.id)) {
        db.channels.push(payload.channel);
        saveDB(db);
        callback('server:channel_created', { channel: payload.channel });
      }
    }
  });
  cleanups.push(unsubServers);

  // Listen for global presence events (seeing other people online in real-time!)
  const unsubPresence = subscribeGlobalTopic('johncord/global/presence', (payload) => {
    const db = getDB();
    if (payload.user) {
      const idx = db.users.findIndex(u => u.id === payload.user.id);
      if (idx !== -1) {
        db.users[idx] = { ...db.users[idx], ...payload.user, presence: payload.user.presence || 'online' };
      } else {
        db.users.push(payload.user);
      }
      saveDB(db);
      callback('user:presence_changed', {
        userId: payload.user.id,
        presence: payload.user.presence || 'online',
        custom_status: payload.user.custom_status
      });
    }
  });
  cleanups.push(unsubPresence);

  // Listen for global chat messages
  const unsubChat = subscribeGlobalTopic('johncord/global/chat', (payload) => {
    const db = getDB();
    if (payload.type === 'new_message' && payload.message) {
      if (!db.messages.some(m => m.id === payload.message.id)) {
        db.messages.push(payload.message);
        saveDB(db);
        callback('chat:message_received', {
          roomId: payload.roomId,
          message: payload.message
        });
      }
    } else if (payload.type === 'reaction_changed') {
      const msg = db.messages.find(m => m.id === payload.messageId);
      if (msg) {
        msg.reactions = payload.reactions;
        saveDB(db);
        callback('chat:reaction_changed', payload);
      }
    } else if (payload.type === 'user_typing') {
      callback('chat:user_typing', payload);
    }
  });
  cleanups.push(unsubChat);

  return () => {
    cleanups.forEach(fn => fn());
  };
}

// Mock API request handler with instant global cloud sync
export async function handleMockAPI(endpoint: string, options: RequestInit = {}): Promise<any> {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : {};
  const db = getDB();

  const currentUserStr = localStorage.getItem('johncord_user');
  let currentUser: User = db.users[1] || db.users[0];
  if (currentUserStr) {
    try { currentUser = JSON.parse(currentUserStr); } catch (e) {}
  }

  // --- Auth Routes ---
  if (endpoint === '/auth/login' && method === 'POST') {
    const { email } = body;
    let user = db.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
    if (!user) {
      const name = (email || 'Usuario').split('@')[0];
      user = {
        id: 'usr_' + Date.now(),
        username: name.charAt(0).toUpperCase() + name.slice(1),
        tag: String(Math.floor(1000 + Math.random() * 9000)),
        email: email || `user_${Date.now()}@johncord.gg`,
        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
        presence: 'online',
        created_at: new Date().toISOString()
      };
      db.users.push(user);
      saveDB(db);
    }

    // Broadcast presence to all users worldwide
    publishGlobalEvent('johncord/global/presence', { type: 'user_online', user });

    return { token: 'mock_jwt_token_' + user.id, user };
  }

  if (endpoint === '/auth/register' && method === 'POST') {
    const { username, email } = body;
    const user: User = {
      id: 'usr_' + Date.now(),
      username: username || 'NovoUsuario',
      tag: String(Math.floor(1000 + Math.random() * 9000)),
      email: email || `user_${Date.now()}@johncord.gg`,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username || 'NewUser')}`,
      presence: 'online',
      created_at: new Date().toISOString()
    };
    db.users.push(user);
    saveDB(db);

    publishGlobalEvent('johncord/global/presence', { type: 'user_online', user });

    return { token: 'mock_jwt_token_' + user.id, user };
  }

  if (endpoint === '/auth/guest' && method === 'POST') {
    const guestNum = Math.floor(1000 + Math.random() * 9000);
    const user: User = {
      id: 'usr_guest_' + Date.now(),
      username: `Convidado#${guestNum}`,
      tag: String(guestNum),
      email: `convidado${guestNum}@johncord.gg`,
      avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=Guest${guestNum}`,
      presence: 'online',
      created_at: new Date().toISOString()
    };
    db.users.push(user);
    saveDB(db);

    publishGlobalEvent('johncord/global/presence', { type: 'user_online', user });

    return { token: 'mock_jwt_token_' + user.id, user };
  }

  if (endpoint === '/auth/me' && method === 'GET') {
    const found = db.users.find(u => u.id === currentUser.id) || currentUser;
    return { user: found };
  }

  if (endpoint === '/auth/profile' && method === 'PATCH') {
    const idx = db.users.findIndex(u => u.id === currentUser.id);
    if (idx !== -1) {
      db.users[idx] = { ...db.users[idx], ...body };
      saveDB(db);
      publishGlobalEvent('johncord/global/presence', { type: 'user_online', user: db.users[idx] });
      return { user: db.users[idx] };
    }
    return { user: currentUser };
  }

  // --- Servers ---
  if (endpoint === '/servers' && method === 'GET') {
    const myServerIds = db.server_members.filter(m => m.user_id === currentUser.id).map(m => m.server_id);
    const myServers = db.servers.filter(s => myServerIds.includes(s.id));
    return { servers: myServers };
  }

  if (endpoint === '/servers' && method === 'POST') {
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

    db.servers.push(server);
    db.categories.push(catText, catVoice);
    db.channels.push(chGeneralText, chGeneralVoice);
    db.roles.push(adminRole);
    db.server_members.push(memberEntry);

    saveDB(db);

    // Broadcast new server globally so anyone with invite code can join instantly!
    publishGlobalEvent('johncord/global/servers', {
      type: 'server_created',
      server,
      categories: [catText, catVoice],
      channels: [chGeneralText, chGeneralVoice],
      roles: [adminRole],
      member: memberEntry
    });

    return { server };
  }

  if (endpoint === '/servers/join' && method === 'POST') {
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

    let server = db.servers.find(s => s.invite_code.toUpperCase() === cleanCode);
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
      db.servers.push(server);
      db.categories.push(
        { id: catTextId, server_id: newServerId, name: 'CANAIS DE TEXTO', position: 0, created_at: new Date().toISOString() },
        { id: catVoiceId, server_id: newServerId, name: 'CANAIS DE VOZ', position: 1, created_at: new Date().toISOString() }
      );
      db.channels.push(
        { id: 'ch_' + Date.now() + '_1', server_id: newServerId, category_id: catTextId, name: 'geral', type: 'text', position: 0, created_at: new Date().toISOString() },
        { id: 'ch_' + Date.now() + '_2', server_id: newServerId, category_id: catVoiceId, name: 'Sala de Voz 🔊', type: 'voice', position: 1, created_at: new Date().toISOString() }
      );
    }

    const memberEntry: ServerMember = {
      id: 'sm_' + Date.now(),
      server_id: server.id,
      user_id: currentUser.id,
      joined_at: new Date().toISOString(),
      user: currentUser
    };

    if (!db.server_members.some(m => m.server_id === server!.id && m.user_id === currentUser.id)) {
      db.server_members.push(memberEntry);
      saveDB(db);

      // Announce member joined to all other users in this server
      publishGlobalEvent('johncord/global/servers', {
        type: 'member_joined',
        member: memberEntry,
        user: currentUser
      });
    }

    return { server };
  }

  if (endpoint.startsWith('/servers/') && method === 'GET') {
    const serverId = endpoint.replace('/servers/', '');
    const server = db.servers.find(s => s.id === serverId);
    if (!server) throw new Error('Servidor não encontrado.');

    const categories = db.categories.filter(c => c.server_id === serverId);
    const channels = db.channels.filter(c => c.server_id === serverId);
    const roles = db.roles.filter(r => r.server_id === serverId);
    const members = db.server_members
      .filter(m => m.server_id === serverId)
      .map(m => ({
        ...m,
        user: db.users.find(u => u.id === m.user_id) || m.user
      }));

    const categoriesWithChannels = categories.map(cat => ({
      ...cat,
      channels: channels.filter(ch => ch.category_id === cat.id)
    }));

    const unassigned = channels.filter(ch => !ch.category_id);

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

  // --- Channels Messages ---
  if (endpoint.includes('/channels/') && endpoint.endsWith('/messages') && method === 'GET') {
    const channelId = endpoint.split('/')[2];
    const msgs = db.messages
      .filter(m => m.channel_id === channelId)
      .map(m => ({
        ...m,
        user: db.users.find(u => u.id === m.user_id) || m.user
      }));
    return { messages: msgs };
  }

  // --- Post Message with Global Real-time Dispatch ---
  if (endpoint === '/messages' && method === 'POST') {
    const { channel_id, dm_conversation_id, content, attachments = [], reply_to_id, thread_parent_id } = body;
    let reply_to = null;
    if (reply_to_id) {
      const parent = db.messages.find(m => m.id === reply_to_id);
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

    db.messages.push(message);
    saveDB(db);

    const roomId = channel_id || dm_conversation_id || `thread:${thread_parent_id}`;

    // Publish to local browser
    broadcastLocalEvent('chat:message_received', { roomId, message });

    // Publish to global internet network so everyone receives it in <10ms!
    publishGlobalEvent('johncord/global/chat', {
      type: 'new_message',
      roomId,
      message
    });

    return { message };
  }

  // --- Message Reactions ---
  if (endpoint.includes('/messages/') && endpoint.endsWith('/reactions') && method === 'POST') {
    const parts = endpoint.split('/');
    const msgId = parts[2];
    const { emoji } = body;
    const msg = db.messages.find(m => m.id === msgId);
    if (msg) {
      if (!msg.reactions) msg.reactions = [];
      const existing = msg.reactions.find(r => r.emoji === emoji);
      if (existing) {
        if (existing.users.includes(currentUser.id)) {
          existing.users = existing.users.filter(uid => uid !== currentUser.id);
          existing.count -= 1;
          if (existing.count <= 0) {
            msg.reactions = msg.reactions.filter(r => r.emoji !== emoji);
          }
        } else {
          existing.users.push(currentUser.id);
          existing.count += 1;
        }
      } else {
        msg.reactions.push({ emoji, count: 1, users: [currentUser.id] });
      }
      saveDB(db);

      const reactionPayload = { messageId: msgId, reactions: msg.reactions };
      broadcastLocalEvent('chat:reaction_changed', reactionPayload);
      publishGlobalEvent('johncord/global/chat', { type: 'reaction_changed', ...reactionPayload });

      return { reactions: msg.reactions };
    }
    return { reactions: [] };
  }

  // --- Friends & DMs ---
  if (endpoint === '/friends' && method === 'GET') {
    const list: FriendItem[] = db.friendships
      .filter(f => f.sender_id === currentUser.id || f.receiver_id === currentUser.id)
      .map(f => {
        const otherId = f.sender_id === currentUser.id ? f.receiver_id : f.sender_id;
        const otherUser = db.users.find(u => u.id === otherId);
        return {
          id: f.id,
          status: f.status,
          isSender: f.sender_id === currentUser.id,
          createdAt: f.created_at,
          friend: otherUser
        };
      });
    return { friends: list };
  }

  if (endpoint === '/friends/request' && method === 'POST') {
    const { userTag } = body;
    const [name, tag] = (userTag || '').split('#');
    const target = db.users.find(u => u.username.toLowerCase() === (name || '').toLowerCase() && (!tag || u.tag === tag));
    if (!target) throw new Error('Usuário não encontrado.');

    const newFriendship = {
      id: 'f_' + Date.now(),
      sender_id: currentUser.id,
      receiver_id: target.id,
      status: 'pending' as const,
      created_at: new Date().toISOString()
    };
    db.friendships.push(newFriendship);
    saveDB(db);
    return { message: 'Pedido de amizade enviado!' };
  }

  if (endpoint === '/dms' && method === 'GET') {
    const convs = db.dm_conversations.map(c => {
      const memberIds = db.dm_members.filter(m => m.dm_conversation_id === c.id).map(m => m.user_id);
      const members = db.users.filter(u => memberIds.includes(u.id));
      return { ...c, members };
    });
    return { conversations: convs };
  }

  if (endpoint === '/dms' && method === 'POST') {
    const { targetUserId } = body;
    let conv = db.dm_conversations.find(c => !c.is_group && db.dm_members.some(m => m.dm_conversation_id === c.id && m.user_id === targetUserId));
    if (!conv) {
      conv = {
        id: 'dm_' + Date.now(),
        is_group: 0,
        created_at: new Date().toISOString(),
        members: [currentUser, db.users.find(u => u.id === targetUserId) || currentUser]
      };
      db.dm_conversations.push(conv);
      db.dm_members.push({ id: 'dmm_' + Date.now() + '1', dm_conversation_id: conv.id, user_id: currentUser.id });
      db.dm_members.push({ id: 'dmm_' + Date.now() + '2', dm_conversation_id: conv.id, user_id: targetUserId });
      saveDB(db);
    }
    return { conversation: conv };
  }

  return { success: true };
}
