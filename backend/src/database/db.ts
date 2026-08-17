import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  User,
  Server,
  ServerMember,
  Role,
  Category,
  Channel,
  Message,
  Thread,
  Friendship,
  DMConversation
} from '../types';

export interface DBReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface DBMemberRole {
  id: string;
  server_id: string;
  user_id: string;
  role_id: string;
}

export interface DBDMMember {
  id: string;
  dm_conversation_id: string;
  user_id: string;
}

export interface Schema {
  users: User[];
  servers: Server[];
  server_members: ServerMember[];
  roles: Role[];
  member_roles: DBMemberRole[];
  categories: Category[];
  channels: Channel[];
  messages: Message[];
  message_reactions: DBReaction[];
  threads: Thread[];
  friendships: Friendship[];
  dm_conversations: DMConversation[];
  dm_members: DBDMMember[];
}

const dbFilePath = path.resolve(__dirname, '../../johncord_db.json');
const uploadsDir = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

let data: Schema = {
  users: [],
  servers: [],
  server_members: [],
  roles: [],
  member_roles: [],
  categories: [],
  channels: [],
  messages: [],
  message_reactions: [],
  threads: [],
  friendships: [],
  dm_conversations: [],
  dm_members: []
};

let saveTimeout: NodeJS.Timeout | null = null;

export function saveDatabase() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const tempPath = `${dbFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, dbFilePath);
    } catch (err) {
      console.error('Error saving database:', err);
    }
  }, 100);
}

export function initDatabase() {
  if (fs.existsSync(dbFilePath)) {
    try {
      const raw = fs.readFileSync(dbFilePath, 'utf-8');
      data = JSON.parse(raw);
      console.log(`📦 Loaded existing Johncord database with ${data.users.length} users and ${data.servers.length} servers.`);
    } catch (e) {
      console.error('Failed to parse database file, re-initializing...', e);
      seedInitialData();
    }
  } else {
    seedInitialData();
  }
}

export const db = {
  get data() {
    return data;
  },
  save: saveDatabase,

  // Users
  users: {
    find: (predicate: (u: User) => boolean) => data.users.find(predicate),
    filter: (predicate: (u: User) => boolean) => data.users.filter(predicate),
    findById: (id: string) => data.users.find(u => u.id === id),
    findByEmail: (email: string) => data.users.find(u => u.email.toLowerCase() === email.toLowerCase()),
    findByUsernameAndTag: (username: string, tag: string) =>
      data.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.tag === tag),
    insert: (user: User) => {
      data.users.push(user);
      saveDatabase();
      return user;
    },
    update: (id: string, updates: Partial<User>) => {
      const idx = data.users.findIndex(u => u.id === id);
      if (idx !== -1) {
        data.users[idx] = { ...data.users[idx], ...updates };
        saveDatabase();
        return data.users[idx];
      }
      return null;
    }
  },

  // Servers
  servers: {
    find: (predicate: (s: Server) => boolean) => data.servers.find(predicate),
    filter: (predicate: (s: Server) => boolean) => data.servers.filter(predicate),
    findById: (id: string) => data.servers.find(s => s.id === id),
    findByInvite: (code: string) => data.servers.find(s => s.invite_code === code),
    insert: (server: Server) => {
      data.servers.push(server);
      saveDatabase();
      return server;
    },
    update: (id: string, updates: Partial<Server>) => {
      const idx = data.servers.findIndex(s => s.id === id);
      if (idx !== -1) {
        data.servers[idx] = { ...data.servers[idx], ...updates };
        saveDatabase();
        return data.servers[idx];
      }
      return null;
    },
    delete: (id: string) => {
      data.servers = data.servers.filter(s => s.id !== id);
      data.server_members = data.server_members.filter(m => m.server_id !== id);
      data.channels = data.channels.filter(c => c.server_id !== id);
      data.categories = data.categories.filter(c => c.server_id !== id);
      data.roles = data.roles.filter(r => r.server_id !== id);
      data.member_roles = data.member_roles.filter(mr => mr.server_id !== id);
      saveDatabase();
    }
  },

  // Server Members
  serverMembers: {
    find: (server_id: string, user_id: string) =>
      data.server_members.find(m => m.server_id === server_id && m.user_id === user_id),
    getByServer: (server_id: string) =>
      data.server_members.filter(m => m.server_id === server_id),
    getByUser: (user_id: string) =>
      data.server_members.filter(m => m.user_id === user_id),
    insert: (member: ServerMember) => {
      data.server_members.push(member);
      saveDatabase();
      return member;
    },
    update: (id: string, updates: Partial<ServerMember>) => {
      const idx = data.server_members.findIndex(m => m.id === id);
      if (idx !== -1) {
        data.server_members[idx] = { ...data.server_members[idx], ...updates };
        saveDatabase();
        return data.server_members[idx];
      }
      return null;
    },
    delete: (server_id: string, user_id: string) => {
      data.server_members = data.server_members.filter(m => !(m.server_id === server_id && m.user_id === user_id));
      data.member_roles = data.member_roles.filter(mr => !(mr.server_id === server_id && mr.user_id === user_id));
      saveDatabase();
    }
  },

  // Roles
  roles: {
    getByServer: (server_id: string) =>
      data.roles.filter(r => r.server_id === server_id).sort((a, b) => a.position - b.position),
    findById: (id: string) => data.roles.find(r => r.id === id),
    insert: (role: Role) => {
      data.roles.push(role);
      saveDatabase();
      return role;
    },
    update: (id: string, updates: Partial<Role>) => {
      const idx = data.roles.findIndex(r => r.id === id);
      if (idx !== -1) {
        data.roles[idx] = { ...data.roles[idx], ...updates };
        saveDatabase();
        return data.roles[idx];
      }
      return null;
    },
    delete: (id: string) => {
      data.roles = data.roles.filter(r => r.id !== id);
      data.member_roles = data.member_roles.filter(mr => mr.role_id !== id);
      saveDatabase();
    },
    getUserRoles: (server_id: string, user_id: string) => {
      const roleIds = data.member_roles
        .filter(mr => mr.server_id === server_id && mr.user_id === user_id)
        .map(mr => mr.role_id);
      return data.roles.filter(r => roleIds.includes(r.id));
    },
    assignRole: (server_id: string, user_id: string, role_id: string) => {
      const exists = data.member_roles.find(mr => mr.server_id === server_id && mr.user_id === user_id && mr.role_id === role_id);
      if (!exists) {
        data.member_roles.push({ id: uuidv4(), server_id, user_id, role_id });
        saveDatabase();
      }
    },
    removeRole: (server_id: string, user_id: string, role_id: string) => {
      data.member_roles = data.member_roles.filter(mr => !(mr.server_id === server_id && mr.user_id === user_id && mr.role_id === role_id));
      saveDatabase();
    }
  },

  // Categories & Channels
  categories: {
    getByServer: (server_id: string) =>
      data.categories.filter(c => c.server_id === server_id).sort((a, b) => a.position - b.position),
    findById: (id: string) => data.categories.find(c => c.id === id),
    insert: (cat: Category) => {
      data.categories.push(cat);
      saveDatabase();
      return cat;
    },
    update: (id: string, updates: Partial<Category>) => {
      const idx = data.categories.findIndex(c => c.id === id);
      if (idx !== -1) {
        data.categories[idx] = { ...data.categories[idx], ...updates };
        saveDatabase();
        return data.categories[idx];
      }
      return null;
    },
    delete: (id: string) => {
      data.categories = data.categories.filter(c => c.id !== id);
      data.channels.forEach(ch => {
        if (ch.category_id === id) ch.category_id = null;
      });
      saveDatabase();
    }
  },

  channels: {
    getByServer: (server_id: string) =>
      data.channels.filter(c => c.server_id === server_id).sort((a, b) => a.position - b.position),
    findById: (id: string) => data.channels.find(c => c.id === id),
    insert: (channel: Channel) => {
      data.channels.push(channel);
      saveDatabase();
      return channel;
    },
    update: (id: string, updates: Partial<Channel>) => {
      const idx = data.channels.findIndex(c => c.id === id);
      if (idx !== -1) {
        data.channels[idx] = { ...data.channels[idx], ...updates };
        saveDatabase();
        return data.channels[idx];
      }
      return null;
    },
    delete: (id: string) => {
      data.channels = data.channels.filter(c => c.id !== id);
      data.messages = data.messages.filter(m => m.channel_id !== id);
      saveDatabase();
    }
  },

  // Messages
  messages: {
    getByChannel: (channel_id: string) =>
      data.messages.filter(m => m.channel_id === channel_id && !m.thread_parent_id),
    getByDM: (dm_conversation_id: string) =>
      data.messages.filter(m => m.dm_conversation_id === dm_conversation_id && !m.thread_parent_id),
    getByThread: (thread_parent_id: string) =>
      data.messages.filter(m => m.thread_parent_id === thread_parent_id),
    findById: (id: string) => data.messages.find(m => m.id === id),
    insert: (msg: Message) => {
      data.messages.push(msg);
      saveDatabase();
      return msg;
    },
    update: (id: string, updates: Partial<Message>) => {
      const idx = data.messages.findIndex(m => m.id === id);
      if (idx !== -1) {
        data.messages[idx] = { ...data.messages[idx], ...updates };
        saveDatabase();
        return data.messages[idx];
      }
      return null;
    },
    delete: (id: string) => {
      data.messages = data.messages.filter(m => m.id !== id && m.thread_parent_id !== id);
      data.message_reactions = data.message_reactions.filter(r => r.message_id !== id);
      data.threads = data.threads.filter(t => t.parent_message_id !== id);
      saveDatabase();
    },
    getReactions: (message_id: string) => {
      const reactions = data.message_reactions.filter(r => r.message_id === message_id);
      const grouped: { [emoji: string]: string[] } = {};
      reactions.forEach(r => {
        if (!grouped[r.emoji]) grouped[r.emoji] = [];
        if (!grouped[r.emoji].includes(r.user_id)) grouped[r.emoji].push(r.user_id);
      });
      return Object.entries(grouped).map(([emoji, users]) => ({
        emoji,
        count: users.length,
        users
      }));
    },
    addReaction: (message_id: string, user_id: string, emoji: string) => {
      const exists = data.message_reactions.find(r => r.message_id === message_id && r.user_id === user_id && r.emoji === emoji);
      if (!exists) {
        data.message_reactions.push({
          id: uuidv4(),
          message_id,
          user_id,
          emoji,
          created_at: new Date().toISOString()
        });
        saveDatabase();
      }
    },
    removeReaction: (message_id: string, user_id: string, emoji: string) => {
      data.message_reactions = data.message_reactions.filter(r => !(r.message_id === message_id && r.user_id === user_id && r.emoji === emoji));
      saveDatabase();
    }
  },

  // Threads
  threads: {
    findByParent: (parent_message_id: string) =>
      data.threads.find(t => t.parent_message_id === parent_message_id),
    getByChannel: (channel_id: string) =>
      data.threads.filter(t => t.channel_id === channel_id),
    findById: (id: string) => data.threads.find(t => t.id === id),
    insert: (thread: Thread) => {
      data.threads.push(thread);
      saveDatabase();
      return thread;
    }
  },

  // Friendships & DMs
  friendships: {
    getByUser: (user_id: string) =>
      data.friendships.filter(f => f.sender_id === user_id || f.receiver_id === user_id),
    findPair: (u1: string, u2: string) =>
      data.friendships.find(f => (f.sender_id === u1 && f.receiver_id === u2) || (f.sender_id === u2 && f.receiver_id === u1)),
    insert: (friendship: Friendship) => {
      data.friendships.push(friendship);
      saveDatabase();
      return friendship;
    },
    update: (id: string, status: 'pending' | 'accepted' | 'blocked') => {
      const idx = data.friendships.findIndex(f => f.id === id);
      if (idx !== -1) {
        data.friendships[idx].status = status;
        saveDatabase();
        return data.friendships[idx];
      }
      return null;
    },
    delete: (id: string) => {
      data.friendships = data.friendships.filter(f => f.id !== id);
      saveDatabase();
    }
  },

  dmConversations: {
    getByUser: (user_id: string) => {
      const convIds = data.dm_members.filter(m => m.user_id === user_id).map(m => m.dm_conversation_id);
      return data.dm_conversations.filter(c => convIds.includes(c.id));
    },
    findById: (id: string) => data.dm_conversations.find(c => c.id === id),
    findDirectBetween: (u1: string, u2: string) => {
      const u1Convs = data.dm_members.filter(m => m.user_id === u1).map(m => m.dm_conversation_id);
      const sharedConvId = data.dm_members.find(m => m.user_id === u2 && u1Convs.includes(m.dm_conversation_id) && data.dm_conversations.find(c => c.id === m.dm_conversation_id && !c.is_group));
      if (sharedConvId) {
        return data.dm_conversations.find(c => c.id === sharedConvId.dm_conversation_id);
      }
      return null;
    },
    insert: (conv: DMConversation, memberIds: string[]) => {
      data.dm_conversations.push(conv);
      memberIds.forEach(uid => {
        data.dm_members.push({
          id: uuidv4(),
          dm_conversation_id: conv.id,
          user_id: uid
        });
      });
      saveDatabase();
      return conv;
    },
    getMembers: (dm_conversation_id: string) => {
      const memberUserIds = data.dm_members.filter(m => m.dm_conversation_id === dm_conversation_id).map(m => m.user_id);
      return data.users.filter(u => memberUserIds.includes(u.id));
    }
  }
};

function seedInitialData() {
  console.log('🌱 Seeding initial Johncord default data...');

  const passwordHash = bcrypt.hashSync('123456', 10);
  const botUser: User = {
    id: uuidv4(),
    username: 'JohnBot',
    tag: '0001',
    email: 'bot@johncord.gg',
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=JohnBot',
    banner_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
    bio: '🤖 Olá! Eu sou o JohnBot, o assistente oficial do Johncord.',
    custom_status: 'Codando o Johncord 🚀',
    presence: 'online',
    created_at: new Date().toISOString()
  };

  const demoUser: User = {
    id: uuidv4(),
    username: 'JohnDev',
    tag: '1337',
    email: 'dev@johncord.gg',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=JohnDev',
    banner_url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=600&auto=format&fit=crop&q=80',
    bio: 'Criador e desenvolvedor do Johncord! Apaixonado por tecnologia e comunicação em tempo real.',
    custom_status: 'Ouvindo música 🎧',
    presence: 'online',
    created_at: new Date().toISOString()
  };

  const anaUser: User = {
    id: uuidv4(),
    username: 'AnaGamer',
    tag: '4040',
    email: 'ana@johncord.gg',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AnaGamer',
    banner_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
    bio: 'Streamer e pro player 🎮 Sempre pronta pra uma jogatina no Johncord!',
    custom_status: 'Jogando Valorant 🎯',
    presence: 'idle',
    created_at: new Date().toISOString()
  };

  const lucasUser: User = {
    id: uuidv4(),
    username: 'LucasVFX',
    tag: '8888',
    email: 'lucas@johncord.gg',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=LucasVFX',
    banner_url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80',
    bio: 'Designer e Motion VFX 🎨',
    custom_status: 'Renderizando vídeo 🎬',
    presence: 'dnd',
    created_at: new Date().toISOString()
  };

  data.users.push(botUser, demoUser, anaUser, lucasUser);

  // Friendships
  data.friendships.push(
    { id: uuidv4(), sender_id: demoUser.id, receiver_id: botUser.id, status: 'accepted', created_at: new Date().toISOString() },
    { id: uuidv4(), sender_id: demoUser.id, receiver_id: anaUser.id, status: 'accepted', created_at: new Date().toISOString() },
    { id: uuidv4(), sender_id: demoUser.id, receiver_id: lucasUser.id, status: 'accepted', created_at: new Date().toISOString() }
  );

  // Create default Server "Johncord Oficial"
  const serverId = uuidv4();
  const server: Server = {
    id: serverId,
    name: 'Johncord Oficial',
    icon_url: 'https://api.dicebear.com/7.x/identicon/svg?seed=JohncordOficial',
    banner_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
    owner_id: demoUser.id,
    invite_code: 'johncord-oficial',
    created_at: new Date().toISOString()
  };
  data.servers.push(server);

  // Add members
  data.server_members.push(
    { id: uuidv4(), server_id: serverId, user_id: demoUser.id, nickname: 'Fundador John', joined_at: new Date().toISOString() },
    { id: uuidv4(), server_id: serverId, user_id: botUser.id, nickname: 'JohnBot [BOT]', joined_at: new Date().toISOString() },
    { id: uuidv4(), server_id: serverId, user_id: anaUser.id, nickname: 'Ana 🎮', joined_at: new Date().toISOString() },
    { id: uuidv4(), server_id: serverId, user_id: lucasUser.id, nickname: 'Lucas VFX', joined_at: new Date().toISOString() }
  );

  // Roles
  const adminRoleId = uuidv4();
  const vipRoleId = uuidv4();
  const modRoleId = uuidv4();
  const memberRoleId = uuidv4();

  data.roles.push(
    {
      id: adminRoleId,
      server_id: serverId,
      name: '👑 Dono & Admin',
      color: '#5865F2',
      position: 1,
      permissions: ['admin', 'manage_server', 'manage_channels', 'manage_roles', 'kick_members', 'ban_members', 'send_messages', 'connect_voice', 'mute_members'],
      created_at: new Date().toISOString()
    },
    {
      id: modRoleId,
      server_id: serverId,
      name: '🛡️ Moderador',
      color: '#2ECC71',
      position: 2,
      permissions: ['manage_channels', 'kick_members', 'send_messages', 'connect_voice', 'mute_members'],
      created_at: new Date().toISOString()
    },
    {
      id: vipRoleId,
      server_id: serverId,
      name: '✨ VIP Johncord',
      color: '#FEE75C',
      position: 3,
      permissions: ['send_messages', 'connect_voice'],
      created_at: new Date().toISOString()
    },
    {
      id: memberRoleId,
      server_id: serverId,
      name: '👥 Membros',
      color: '#99AAB5',
      position: 4,
      permissions: ['send_messages', 'connect_voice'],
      created_at: new Date().toISOString()
    }
  );

  // Member Roles
  data.member_roles.push(
    { id: uuidv4(), server_id: serverId, user_id: demoUser.id, role_id: adminRoleId },
    { id: uuidv4(), server_id: serverId, user_id: botUser.id, role_id: vipRoleId },
    { id: uuidv4(), server_id: serverId, user_id: anaUser.id, role_id: modRoleId },
    { id: uuidv4(), server_id: serverId, user_id: lucasUser.id, role_id: memberRoleId }
  );

  // Categories
  const catTextId = uuidv4();
  const catVoiceId = uuidv4();
  const catMediaId = uuidv4();

  data.categories.push(
    { id: catTextId, server_id: serverId, name: 'BOAS-VINDAS & TEXTO', position: 1, created_at: new Date().toISOString() },
    { id: catVoiceId, server_id: serverId, name: 'SALAS DE VOZ & VÍDEO', position: 2, created_at: new Date().toISOString() },
    { id: catMediaId, server_id: serverId, name: 'MULTIMÍDIA & GAMING', position: 3, created_at: new Date().toISOString() }
  );

  // Channels
  const chGeralId = uuidv4();
  const chAvisosId = uuidv4();
  const chMemesId = uuidv4();
  const chDevId = uuidv4();
  const chVoiceGeralId = uuidv4();
  const chVoiceGamesId = uuidv4();
  const chVoiceCinemaId = uuidv4();

  data.channels.push(
    { id: chGeralId, server_id: serverId, category_id: catTextId, name: 'geral', type: 'text', topic: 'Canal principal para conversar com a comunidade!', position: 1, created_at: new Date().toISOString() },
    { id: chAvisosId, server_id: serverId, category_id: catTextId, name: 'avisos-e-regras', type: 'text', topic: 'Regras e novidades da plataforma', position: 2, created_at: new Date().toISOString() },
    { id: chMemesId, server_id: serverId, category_id: catMediaId, name: 'memes-e-artes', type: 'text', topic: 'Envie seus memes, fotos e artes incríveis', position: 3, created_at: new Date().toISOString() },
    { id: chDevId, server_id: serverId, category_id: catMediaId, name: 'dev-chat', type: 'text', topic: 'Discussões sobre código, bugs e melhorias', position: 4, created_at: new Date().toISOString() },
    { id: chVoiceGeralId, server_id: serverId, category_id: catVoiceId, name: 'Geral - Bate Papo', type: 'voice', topic: '', position: 1, created_at: new Date().toISOString() },
    { id: chVoiceGamesId, server_id: serverId, category_id: catVoiceId, name: 'Jogos & Streams 🎮', type: 'voice', topic: '', position: 2, created_at: new Date().toISOString() },
    { id: chVoiceCinemaId, server_id: serverId, category_id: catVoiceId, name: 'Sala de Cinema 🍿', type: 'voice', topic: '', position: 3, created_at: new Date().toISOString() }
  );

  // Welcome Messages in #geral
  const welcomeMsgId = uuidv4();
  const secondMsgId = uuidv4();

  data.messages.push(
    {
      id: welcomeMsgId,
      channel_id: chGeralId,
      user_id: botUser.id,
      content: '🚀 **Seja muito bem-vindo ao Johncord!**\n\nEste é o canal oficial de boas-vindas. Você pode testar:\n• 💬 **Chat em tempo real** com formatação Markdown, menções `@`, respostas e reações com emojis.\n• 🧵 **Threads**: clique no botão de thread para criar uma subconversa organizada!\n• 📁 **Upload de Arquivos**: envie imagens, gifs e áudios diretamente.\n• 🔊 **Canais de Voz**: clique em um canal de voz à esquerda para entrar na sala, ligar câmera ou compartilhar tela!',
      attachments: [],
      is_pinned: 1,
      created_at: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: secondMsgId,
      channel_id: chGeralId,
      user_id: anaUser.id,
      content: 'E aí pessoal! Quem tá pronto pra jogar hoje à noite? Tô no canal de voz *Jogos & Streams*! 🎮🔥',
      attachments: [],
      is_pinned: 0,
      created_at: new Date(Date.now() - 1800000).toISOString()
    }
  );

  // Reactions
  data.message_reactions.push(
    { id: uuidv4(), message_id: welcomeMsgId, user_id: demoUser.id, emoji: '🎉', created_at: new Date().toISOString() },
    { id: uuidv4(), message_id: welcomeMsgId, user_id: anaUser.id, emoji: '🚀', created_at: new Date().toISOString() },
    { id: uuidv4(), message_id: secondMsgId, user_id: demoUser.id, emoji: '🔥', created_at: new Date().toISOString() },
    { id: uuidv4(), message_id: secondMsgId, user_id: lucasUser.id, emoji: '👀', created_at: new Date().toISOString() }
  );

  // DM conversation between demoUser and botUser
  const dmConvId = uuidv4();
  data.dm_conversations.push({
    id: dmConvId,
    is_group: 0,
    created_at: new Date().toISOString()
  });
  data.dm_members.push(
    { id: uuidv4(), dm_conversation_id: dmConvId, user_id: demoUser.id },
    { id: uuidv4(), dm_conversation_id: dmConvId, user_id: botUser.id }
  );
  data.messages.push({
    id: uuidv4(),
    dm_conversation_id: dmConvId,
    user_id: botUser.id,
    content: 'Olá John! Se precisar de qualquer ajuda com os canais ou permissões, pode me chamar por aqui. Tenha um ótimo dia! 👋',
    attachments: [],
    is_pinned: 0,
    created_at: new Date(Date.now() - 7200000).toISOString()
  });

  saveDatabase();
  console.log('✅ Johncord default database initialized with servers, channels, roles, and users!');
}
