import { User, Server, Channel, Category, Role, ServerMember, Message, DMConversation, FriendItem, Thread } from '../types';

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

const DB_KEY = 'johncord_clean_db_v3';

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

  const devUser: User = {
    id: 'user_dev',
    username: 'JohnDev',
    tag: '1337',
    email: 'dev@johncord.gg',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=JohnDev',
    banner_url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=600&auto=format&fit=crop&q=80',
    bio: 'Criador do Johncord!',
    custom_status: 'Codando 🎧',
    presence: 'online',
    created_at: new Date().toISOString()
  };

  return {
    users: [botUser, devUser],
    servers: [],
    categories: [],
    channels: [],
    roles: [],
    server_members: [],
    messages: [],
    threads: [],
    friendships: [
      { id: 'f_1', sender_id: devUser.id, receiver_id: botUser.id, status: 'accepted', created_at: new Date().toISOString() }
    ],
    dm_conversations: [
      {
        id: 'dm_dev_bot',
        is_group: 0,
        created_at: new Date().toISOString(),
        members: [devUser, botUser],
        last_message: {
          id: 'dm_msg_1',
          dm_conversation_id: 'dm_dev_bot',
          user_id: botUser.id,
          content: '👋 Olá! Crie seu próprio servidor clicando no botão **"+"** à esquerda ou convide amigos para uma chamada de voz!',
          attachments: [],
          is_pinned: 0,
          created_at: new Date().toISOString(),
          user: botUser
        }
      }
    ],
    dm_members: [
      { id: 'dmm_1', dm_conversation_id: 'dm_dev_bot', user_id: devUser.id },
      { id: 'dmm_2', dm_conversation_id: 'dm_dev_bot', user_id: botUser.id }
    ]
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

let channel: BroadcastChannel | null = null;
try {
  channel = new BroadcastChannel('johncord_realtime_events');
} catch (e) {}

export function broadcastLocalEvent(event: string, data: any) {
  if (channel) {
    channel.postMessage({ event, data });
  }
}

export function subscribeLocalEvents(callback: (event: string, data: any) => void) {
  if (!channel) return () => {};
  const handler = (msg: MessageEvent) => {
    if (msg.data?.event) {
      callback(msg.data.event, msg.data.data);
    }
  };
  channel.addEventListener('message', handler);
  return () => channel?.removeEventListener('message', handler);
}

// Mock API request handler
export async function handleMockAPI(endpoint: string, options: RequestInit = {}): Promise<any> {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : {};
  const db = getDB();

  const currentUserStr = localStorage.getItem('johncord_user');
  let currentUser: User = db.users[1] || db.users[0];
  if (currentUserStr) {
    try { currentUser = JSON.parse(currentUserStr); } catch (e) {}
  }

  await new Promise(r => setTimeout(r, 40));

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
    return { token: 'mock_jwt_token_' + user.id, user };
  }

  if (endpoint === '/auth/register' && method === 'POST') {
    const { username, email } = body;
    const user: User = {
      id: 'usr_' + Date.now(),
      username: username || 'NovoUsuario',
      tag: String(Math.floor(1000 + Math.random() * 9000)),
      email: email || `user_${Date.now()}@johncord.gg`,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username || 'NewUser'}`,
      presence: 'online',
      created_at: new Date().toISOString()
    };
    db.users.push(user);
    saveDB(db);
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

    db.servers.push(server);
    db.categories.push(catText, catVoice);
    db.channels.push(chGeneralText, chGeneralVoice);
    db.roles.push(adminRole);
    db.server_members.push({
      id: 'sm_' + Date.now(),
      server_id: newServerId,
      user_id: currentUser.id,
      joined_at: new Date().toISOString(),
      user: currentUser,
      roles: [adminRole]
    });

    saveDB(db);
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
      const newServerId = 'srv_' + Math.random().toString(36).substring(2, 7);
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

    if (!db.server_members.some(m => m.server_id === server!.id && m.user_id === currentUser.id)) {
      db.server_members.push({
        id: 'sm_' + Date.now(),
        server_id: server.id,
        user_id: currentUser.id,
        joined_at: new Date().toISOString(),
        user: currentUser
      });
      saveDB(db);
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

  if (endpoint.startsWith('/servers/') && method === 'PATCH') {
    const serverId = endpoint.replace('/servers/', '');
    const idx = db.servers.findIndex(s => s.id === serverId);
    if (idx !== -1) {
      db.servers[idx] = { ...db.servers[idx], ...body };
      saveDB(db);
      return { server: db.servers[idx] };
    }
  }

  if (endpoint.startsWith('/servers/') && method === 'DELETE') {
    const serverId = endpoint.replace('/servers/', '');
    db.servers = db.servers.filter(s => s.id !== serverId);
    db.categories = db.categories.filter(c => c.server_id !== serverId);
    db.channels = db.channels.filter(c => c.server_id !== serverId);
    db.server_members = db.server_members.filter(m => m.server_id !== serverId);
    saveDB(db);
    return { success: true };
  }

  if (endpoint.startsWith('/servers/') && endpoint.endsWith('/leave') && method === 'POST') {
    const serverId = endpoint.split('/')[2];
    db.server_members = db.server_members.filter(m => !(m.server_id === serverId && m.user_id === currentUser.id));
    saveDB(db);
    return { success: true };
  }

  // --- Categories & Channels ---
  if (endpoint.startsWith('/servers/') && endpoint.endsWith('/categories') && method === 'POST') {
    const serverId = endpoint.split('/')[2];
    const category: Category = {
      id: 'cat_' + Date.now(),
      server_id: serverId,
      name: body.name || 'NOVA CATEGORIA',
      position: db.categories.filter(c => c.server_id === serverId).length,
      created_at: new Date().toISOString()
    };
    db.categories.push(category);
    saveDB(db);
    return { category };
  }

  if (endpoint.startsWith('/categories/') && method === 'PATCH') {
    const categoryId = endpoint.replace('/categories/', '');
    const idx = db.categories.findIndex(c => c.id === categoryId);
    if (idx !== -1) {
      db.categories[idx] = { ...db.categories[idx], ...body };
      saveDB(db);
      return { category: db.categories[idx] };
    }
  }

  if (endpoint.startsWith('/categories/') && method === 'DELETE') {
    const categoryId = endpoint.replace('/categories/', '');
    db.categories = db.categories.filter(c => c.id !== categoryId);
    db.channels = db.channels.filter(c => c.category_id !== categoryId);
    saveDB(db);
    return { success: true };
  }

  if (endpoint.startsWith('/servers/') && endpoint.endsWith('/channels') && method === 'POST') {
    const serverId = endpoint.split('/')[2];
    const channel: Channel = {
      id: 'ch_' + Date.now(),
      server_id: serverId,
      category_id: body.category_id || null,
      name: (body.name || 'canal').toLowerCase().replace(/\s+/g, '-'),
      type: body.type || 'text',
      topic: body.topic || '',
      position: db.channels.filter(c => c.server_id === serverId).length,
      created_at: new Date().toISOString()
    };
    db.channels.push(channel);
    saveDB(db);
    return { channel };
  }

  if (endpoint.startsWith('/channels/') && method === 'PATCH') {
    const channelId = endpoint.replace('/channels/', '');
    const idx = db.channels.findIndex(c => c.id === channelId);
    if (idx !== -1) {
      db.channels[idx] = { ...db.channels[idx], ...body };
      saveDB(db);
      return { channel: db.channels[idx] };
    }
  }

  if (endpoint.startsWith('/channels/') && method === 'DELETE') {
    const channelId = endpoint.replace('/channels/', '');
    db.channels = db.channels.filter(c => c.id !== channelId);
    db.messages = db.messages.filter(m => m.channel_id !== channelId);
    saveDB(db);
    return { success: true };
  }

  // --- Roles ---
  if (endpoint.startsWith('/servers/') && endpoint.endsWith('/roles') && method === 'POST') {
    const serverId = endpoint.split('/')[2];
    const role: Role = {
      id: 'role_' + Date.now(),
      server_id: serverId,
      name: body.name || 'Novo Cargo',
      color: body.color || '#5865f2',
      position: db.roles.filter(r => r.server_id === serverId).length,
      permissions: body.permissions || ['SEND_MESSAGES'],
      created_at: new Date().toISOString()
    };
    db.roles.push(role);
    saveDB(db);
    return { role };
  }

  if (endpoint.startsWith('/roles/') && method === 'PATCH') {
    const roleId = endpoint.replace('/roles/', '');
    const idx = db.roles.findIndex(r => r.id === roleId);
    if (idx !== -1) {
      db.roles[idx] = { ...db.roles[idx], ...body };
      saveDB(db);
      return { role: db.roles[idx] };
    }
  }

  if (endpoint.startsWith('/roles/') && method === 'DELETE') {
    const roleId = endpoint.replace('/roles/', '');
    db.roles = db.roles.filter(r => r.id !== roleId);
    saveDB(db);
    return { success: true };
  }

  // --- Messages & Chat ---
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

  if (endpoint.includes('/dms/') && endpoint.endsWith('/messages') && method === 'GET') {
    const dmId = endpoint.split('/')[2];
    const msgs = db.messages
      .filter(m => m.dm_conversation_id === dmId)
      .map(m => ({
        ...m,
        user: db.users.find(u => u.id === m.user_id) || m.user
      }));
    return { messages: msgs };
  }

  if (endpoint.includes('/threads/') && endpoint.endsWith('/messages') && method === 'GET') {
    const threadParentId = endpoint.split('/')[2];
    const parent = db.messages.find(m => m.id === threadParentId);
    const msgs = db.messages.filter(m => m.thread_parent_id === threadParentId);
    const thread = db.threads.find(t => t.parent_message_id === threadParentId);
    return { parentMessage: parent, thread, messages: msgs };
  }

  if (endpoint.includes('/messages/') && endpoint.endsWith('/threads') && method === 'POST') {
    const parentMessageId = endpoint.split('/')[2];
    const thread: Thread = {
      id: 'thread_' + Date.now(),
      parent_message_id: parentMessageId,
      channel_id: '',
      name: body.name || 'Tópico de Conversa',
      creator_id: currentUser.id,
      created_at: new Date().toISOString()
    };
    db.threads.push(thread);
    saveDB(db);
    return { thread };
  }

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
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
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

    broadcastLocalEvent('chat:message_received', {
      roomId: channel_id || dm_conversation_id || `thread:${thread_parent_id}`,
      message
    });

    return { message };
  }

  if (endpoint.startsWith('/messages/') && method === 'PATCH') {
    const msgId = endpoint.replace('/messages/', '');
    const idx = db.messages.findIndex(m => m.id === msgId);
    if (idx !== -1) {
      db.messages[idx] = { ...db.messages[idx], content: body.content };
      saveDB(db);
      broadcastLocalEvent('chat:message_updated', { message: db.messages[idx] });
      return { message: db.messages[idx] };
    }
  }

  if (endpoint.startsWith('/messages/') && method === 'DELETE') {
    const msgId = endpoint.replace('/messages/', '');
    db.messages = db.messages.filter(m => m.id !== msgId);
    saveDB(db);
    broadcastLocalEvent('chat:message_deleted', { messageId: msgId });
    return { success: true };
  }

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
      broadcastLocalEvent('chat:reaction_changed', { messageId: msgId, reactions: msg.reactions });
      return { reactions: msg.reactions };
    }
    return { reactions: [] };
  }

  if (endpoint.includes('/messages/') && endpoint.endsWith('/pin') && method === 'POST') {
    const parts = endpoint.split('/');
    const msgId = parts[2];
    const msg = db.messages.find(m => m.id === msgId);
    if (msg) {
      msg.is_pinned = msg.is_pinned ? 0 : 1;
      saveDB(db);
      broadcastLocalEvent('chat:message_updated', { message: msg });
      return { message: msg };
    }
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

  if (endpoint.startsWith('/friends/') && endpoint.endsWith('/accept') && method === 'POST') {
    const fId = endpoint.split('/')[2];
    const idx = db.friendships.findIndex(f => f.id === fId);
    if (idx !== -1) {
      db.friendships[idx].status = 'accepted';
      saveDB(db);
    }
    return { success: true };
  }

  if (endpoint.startsWith('/friends/') && method === 'DELETE') {
    const fId = endpoint.replace('/friends/', '');
    db.friendships = db.friendships.filter(f => f.id !== fId);
    saveDB(db);
    return { success: true };
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
