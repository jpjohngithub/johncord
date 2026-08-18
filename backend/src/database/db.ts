import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
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

let prismaClient: PrismaClient | null = null;
let isPrismaConnected = false;

export function getPrismaClient(): PrismaClient | null {
  if (prismaClient) return prismaClient;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;

  try {
    const pool = new Pool({ connectionString: dbUrl, ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false } });
    const adapter = new PrismaPg(pool);
    prismaClient = new PrismaClient({ adapter });
    return prismaClient;
  } catch (e) {
    console.error('⚠️ Could not initialize Prisma adapter:', e);
    return null;
  }
}

// Background sync helpers
async function syncPrismaUser(user: User, action: 'insert' | 'update' = 'insert') {
  if (!prismaClient || !isPrismaConnected) return;
  try {
    if (action === 'insert') {
      await prismaClient.user.upsert({
        where: { email: user.email },
        update: {
          username: user.username,
          tag: user.tag,
          avatar_url: user.avatar_url || '',
          banner_url: user.banner_url || '',
          bio: user.bio || '',
          custom_status: user.custom_status || '',
          presence: user.presence || 'online'
        },
        create: {
          id: user.id,
          username: user.username,
          tag: user.tag,
          email: user.email,
          avatar_url: user.avatar_url || '',
          banner_url: user.banner_url || '',
          bio: user.bio || '',
          custom_status: user.custom_status || '',
          presence: user.presence || 'online'
        }
      });
    } else {
      await prismaClient.user.update({
        where: { id: user.id },
        data: {
          username: user.username,
          tag: user.tag,
          avatar_url: user.avatar_url,
          banner_url: user.banner_url,
          bio: user.bio,
          custom_status: user.custom_status,
          presence: user.presence
        }
      });
    }
  } catch (e) {
    console.error('Error syncing user with cloud database:', e);
  }
}

async function syncPrismaServer(server: Server, action: 'insert' | 'update' | 'delete' = 'insert') {
  if (!prismaClient || !isPrismaConnected) return;
  try {
    if (action === 'insert') {
      await prismaClient.server.upsert({
        where: { invite_code: server.invite_code },
        update: { name: server.name, icon_url: server.icon_url, banner_url: server.banner_url, owner_id: server.owner_id },
        create: {
          id: server.id,
          name: server.name,
          icon_url: server.icon_url,
          banner_url: server.banner_url,
          owner_id: server.owner_id,
          invite_code: server.invite_code
        }
      });
    } else if (action === 'update') {
      await prismaClient.server.update({
        where: { id: server.id },
        data: { name: server.name, icon_url: server.icon_url, banner_url: server.banner_url, owner_id: server.owner_id }
      });
    } else if (action === 'delete') {
      await prismaClient.server.delete({ where: { id: server.id } });
    }
  } catch (e) {
    console.error('Error syncing server with cloud database:', e);
  }
}

async function syncPrismaMessage(msg: Message, action: 'insert' | 'update' | 'delete' = 'insert') {
  if (!prismaClient || !isPrismaConnected) return;
  try {
    if (action === 'insert') {
      await prismaClient.message.create({
        data: {
          id: msg.id,
          channel_id: msg.channel_id,
          dm_conversation_id: msg.dm_conversation_id,
          thread_parent_id: msg.thread_parent_id,
          user_id: msg.user_id,
          content: msg.content,
          attachments: JSON.stringify(msg.attachments || []),
          reply_to_id: msg.reply_to_id,
          is_pinned: msg.is_pinned || 0
        }
      });
    } else if (action === 'update') {
      await prismaClient.message.update({
        where: { id: msg.id },
        data: {
          content: msg.content,
          is_pinned: msg.is_pinned,
          updated_at: msg.updated_at ? new Date(msg.updated_at) : new Date()
        }
      });
    } else if (action === 'delete') {
      await prismaClient.message.delete({ where: { id: msg.id } });
    }
  } catch (e) {
    console.error('Error syncing message with cloud database:', e);
  }
}

let saveTimeout: NodeJS.Timeout | null = null;

export function saveDatabase() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const tempPath = `${dbFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, dbFilePath);
    } catch (err) {
      console.error('Error saving local database cache:', err);
    }
  }, 100);
}

export async function initDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    console.log('🌐 Connecting to Cloud PostgreSQL database via Prisma...');
    const prisma = getPrismaClient();
    if (prisma) {
      try {
        await prisma.$connect();
        isPrismaConnected = true;
        console.log('✅ Connected to Cloud PostgreSQL database!');

        // Try to load existing data from Cloud PostgreSQL
        const cloudUsers = await prisma.user.findMany();
        const cloudServers = await prisma.server.findMany();

        if (cloudUsers.length > 0) {
          console.log(`📦 Loaded ${cloudUsers.length} users and ${cloudServers.length} servers from Cloud PostgreSQL.`);
          // Populate memory data from cloud
          const cloudChannels = await prisma.channel.findMany();
          const cloudCategories = await prisma.category.findMany();
          const cloudRoles = await prisma.role.findMany();
          const cloudMembers = await prisma.serverMember.findMany();
          const cloudMemberRoles = await prisma.memberRole.findMany();
          const cloudMessages = await prisma.message.findMany({ take: 2000, orderBy: { created_at: 'asc' } });
          const cloudReactions = await prisma.messageReaction.findMany();
          const cloudThreads = await prisma.thread.findMany();
          const cloudFriendships = await prisma.friendship.findMany();
          const cloudDms = await prisma.dMConversation.findMany();
          const cloudDmMembers = await prisma.dMMember.findMany();

          data = {
            users: cloudUsers.map(u => ({
              id: u.id,
              username: u.username,
              tag: u.tag,
              email: u.email,
              avatar_url: u.avatar_url,
              banner_url: u.banner_url,
              bio: u.bio,
              custom_status: u.custom_status,
              presence: u.presence as any,
              created_at: u.created_at.toISOString()
            })),
            servers: cloudServers.map(s => ({
              id: s.id,
              name: s.name,
              icon_url: s.icon_url || undefined,
              banner_url: s.banner_url || undefined,
              owner_id: s.owner_id,
              invite_code: s.invite_code,
              created_at: s.created_at.toISOString()
            })),
            server_members: cloudMembers.map(m => ({
              id: m.id,
              server_id: m.server_id,
              user_id: m.user_id,
              nickname: m.nickname || undefined,
              joined_at: m.joined_at.toISOString()
            })),
            roles: cloudRoles.map(r => ({
              id: r.id,
              server_id: r.server_id,
              name: r.name,
              color: r.color,
              position: r.position,
              permissions: (() => { try { return JSON.parse(r.permissions); } catch { return []; } })(),
              created_at: r.created_at.toISOString()
            })),
            member_roles: cloudMemberRoles.map(mr => ({
              id: mr.id,
              server_id: mr.server_id,
              user_id: mr.user_id,
              role_id: mr.role_id
            })),
            categories: cloudCategories.map(c => ({
              id: c.id,
              server_id: c.server_id,
              name: c.name,
              position: c.position,
              created_at: c.created_at.toISOString()
            })),
            channels: cloudChannels.map(c => ({
              id: c.id,
              server_id: c.server_id,
              category_id: c.category_id,
              name: c.name,
              type: c.type as any,
              topic: c.topic || undefined,
              position: c.position,
              created_at: c.created_at.toISOString()
            })),
            messages: cloudMessages.map(m => ({
              id: m.id,
              channel_id: m.channel_id,
              dm_conversation_id: m.dm_conversation_id,
              thread_parent_id: m.thread_parent_id,
              user_id: m.user_id,
              content: m.content,
              attachments: (() => { try { return JSON.parse(m.attachments); } catch { return []; } })(),
              reply_to_id: m.reply_to_id,
              is_pinned: m.is_pinned,
              created_at: m.created_at.toISOString(),
              updated_at: m.updated_at ? m.updated_at.toISOString() : undefined
            })),
            message_reactions: cloudReactions.map(r => ({
              id: r.id,
              message_id: r.message_id,
              user_id: r.user_id,
              emoji: r.emoji,
              created_at: r.created_at.toISOString()
            })),
            threads: cloudThreads.map(t => ({
              id: t.id,
              parent_message_id: t.parent_message_id,
              channel_id: t.channel_id,
              name: t.name,
              creator_id: t.creator_id,
              created_at: t.created_at.toISOString()
            })),
            friendships: cloudFriendships.map(f => ({
              id: f.id,
              sender_id: f.sender_id,
              receiver_id: f.receiver_id,
              status: f.status as any,
              created_at: f.created_at.toISOString()
            })),
            dm_conversations: cloudDms.map(d => ({
              id: d.id,
              is_group: d.is_group,
              name: d.name || undefined,
              icon_url: d.icon_url || undefined,
              created_at: d.created_at.toISOString()
            })),
            dm_members: cloudDmMembers.map(dm => ({
              id: dm.id,
              dm_conversation_id: dm.dm_conversation_id,
              user_id: dm.user_id
            }))
          };
          saveDatabase();
          return;
        } else {
          console.log('🌱 Cloud database is empty. Seeding initial data to Cloud PostgreSQL...');
          seedInitialData();
          await pushAllToCloud(prisma);
          return;
        }
      } catch (err) {
        console.error('⚠️ Could not connect to Cloud PostgreSQL, falling back to local storage cache:', err);
      }
    }
  }

  // Local fallback
  if (fs.existsSync(dbFilePath)) {
    try {
      const raw = fs.readFileSync(dbFilePath, 'utf-8');
      data = JSON.parse(raw);
      console.log(`📦 Loaded local Johncord database with ${data.users.length} users and ${data.servers.length} servers.`);
    } catch (e) {
      console.error('Failed to parse local database file, re-initializing...', e);
      seedInitialData();
    }
  } else {
    seedInitialData();
  }
}

async function pushAllToCloud(prisma: PrismaClient) {
  try {
    for (const u of data.users) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: {
          id: u.id,
          username: u.username,
          tag: u.tag,
          email: u.email,
          avatar_url: u.avatar_url || '',
          banner_url: u.banner_url || '',
          bio: u.bio || '',
          custom_status: u.custom_status || '',
          presence: u.presence || 'online'
        }
      });
    }

    for (const s of data.servers) {
      await prisma.server.upsert({
        where: { invite_code: s.invite_code },
        update: {},
        create: {
          id: s.id,
          name: s.name,
          icon_url: s.icon_url,
          banner_url: s.banner_url,
          owner_id: s.owner_id,
          invite_code: s.invite_code
        }
      });
    }

    for (const cat of data.categories) {
      await prisma.category.upsert({
        where: { id: cat.id },
        update: {},
        create: { id: cat.id, server_id: cat.server_id, name: cat.name, position: cat.position }
      });
    }

    for (const ch of data.channels) {
      await prisma.channel.upsert({
        where: { id: ch.id },
        update: {},
        create: { id: ch.id, server_id: ch.server_id, category_id: ch.category_id, name: ch.name, type: ch.type, topic: ch.topic, position: ch.position }
      });
    }

    for (const m of data.server_members) {
      await prisma.serverMember.upsert({
        where: { server_id_user_id: { server_id: m.server_id, user_id: m.user_id } },
        update: {},
        create: { id: m.id, server_id: m.server_id, user_id: m.user_id, nickname: m.nickname }
      });
    }

    for (const r of data.roles) {
      await prisma.role.upsert({
        where: { id: r.id },
        update: {},
        create: { id: r.id, server_id: r.server_id, name: r.name, color: r.color, position: r.position, permissions: JSON.stringify(r.permissions) }
      });
    }

    console.log('🚀 Successfully pushed initial schema & data to Cloud PostgreSQL!');
  } catch (err) {
    console.error('Error pushing data to cloud:', err);
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
      syncPrismaUser(user, 'insert');
      return user;
    },
    update: (id: string, updates: Partial<User>) => {
      const idx = data.users.findIndex(u => u.id === id);
      if (idx !== -1) {
        data.users[idx] = { ...data.users[idx], ...updates };
        saveDatabase();
        syncPrismaUser(data.users[idx], 'update');
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
      syncPrismaServer(server, 'insert');
      return server;
    },
    update: (id: string, updates: Partial<Server>) => {
      const idx = data.servers.findIndex(s => s.id === id);
      if (idx !== -1) {
        data.servers[idx] = { ...data.servers[idx], ...updates };
        saveDatabase();
        syncPrismaServer(data.servers[idx], 'update');
        return data.servers[idx];
      }
      return null;
    },
    delete: (id: string) => {
      const s = data.servers.find(srv => srv.id === id);
      data.servers = data.servers.filter(srv => srv.id !== id);
      data.server_members = data.server_members.filter(m => m.server_id !== id);
      data.channels = data.channels.filter(c => c.server_id !== id);
      data.categories = data.categories.filter(c => c.server_id !== id);
      data.roles = data.roles.filter(r => r.server_id !== id);
      data.member_roles = data.member_roles.filter(mr => mr.server_id !== id);
      saveDatabase();
      if (s) syncPrismaServer(s, 'delete');
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
      if (prismaClient && isPrismaConnected) {
        prismaClient.serverMember.upsert({
          where: { server_id_user_id: { server_id: member.server_id, user_id: member.user_id } },
          update: { nickname: member.nickname },
          create: { id: member.id, server_id: member.server_id, user_id: member.user_id, nickname: member.nickname }
        }).catch(console.error);
      }
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
      if (prismaClient && isPrismaConnected) {
        prismaClient.serverMember.deleteMany({ where: { server_id, user_id } }).catch(console.error);
      }
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
      if (prismaClient && isPrismaConnected) {
        prismaClient.role.create({
          data: { id: role.id, server_id: role.server_id, name: role.name, color: role.color, position: role.position, permissions: JSON.stringify(role.permissions) }
        }).catch(console.error);
      }
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
      if (prismaClient && isPrismaConnected) {
        prismaClient.role.delete({ where: { id } }).catch(console.error);
      }
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
        if (prismaClient && isPrismaConnected) {
          prismaClient.memberRole.create({ data: { id: uuidv4(), server_id, user_id, role_id } }).catch(console.error);
        }
      }
    },
    removeRole: (server_id: string, user_id: string, role_id: string) => {
      data.member_roles = data.member_roles.filter(mr => !(mr.server_id === server_id && mr.user_id === user_id && mr.role_id === role_id));
      saveDatabase();
      if (prismaClient && isPrismaConnected) {
        prismaClient.memberRole.deleteMany({ where: { server_id, user_id, role_id } }).catch(console.error);
      }
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
      if (prismaClient && isPrismaConnected) {
        prismaClient.category.create({ data: { id: cat.id, server_id: cat.server_id, name: cat.name, position: cat.position } }).catch(console.error);
      }
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
      if (prismaClient && isPrismaConnected) {
        prismaClient.category.delete({ where: { id } }).catch(console.error);
      }
    }
  },

  channels: {
    getByServer: (server_id: string) =>
      data.channels.filter(c => c.server_id === server_id).sort((a, b) => a.position - b.position),
    findById: (id: string) => data.channels.find(c => c.id === id),
    insert: (channel: Channel) => {
      data.channels.push(channel);
      saveDatabase();
      if (prismaClient && isPrismaConnected) {
        prismaClient.channel.create({
          data: { id: channel.id, server_id: channel.server_id, category_id: channel.category_id, name: channel.name, type: channel.type, topic: channel.topic, position: channel.position }
        }).catch(console.error);
      }
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
      if (prismaClient && isPrismaConnected) {
        prismaClient.channel.delete({ where: { id } }).catch(console.error);
      }
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
      syncPrismaMessage(msg, 'insert');
      return msg;
    },
    update: (id: string, updates: Partial<Message>) => {
      const idx = data.messages.findIndex(m => m.id === id);
      if (idx !== -1) {
        data.messages[idx] = { ...data.messages[idx], ...updates };
        saveDatabase();
        syncPrismaMessage(data.messages[idx], 'update');
        return data.messages[idx];
      }
      return null;
    },
    delete: (id: string) => {
      const m = data.messages.find(msg => msg.id === id);
      data.messages = data.messages.filter(msg => msg.id !== id && msg.thread_parent_id !== id);
      data.message_reactions = data.message_reactions.filter(r => r.message_id !== id);
      data.threads = data.threads.filter(t => t.parent_message_id !== id);
      saveDatabase();
      if (m) syncPrismaMessage(m, 'delete');
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
        const nr: DBReaction = {
          id: uuidv4(),
          message_id,
          user_id,
          emoji,
          created_at: new Date().toISOString()
        };
        data.message_reactions.push(nr);
        saveDatabase();
        if (prismaClient && isPrismaConnected) {
          prismaClient.messageReaction.create({ data: nr }).catch(console.error);
        }
      }
    },
    removeReaction: (message_id: string, user_id: string, emoji: string) => {
      data.message_reactions = data.message_reactions.filter(r => !(r.message_id === message_id && r.user_id === user_id && r.emoji === emoji));
      saveDatabase();
      if (prismaClient && isPrismaConnected) {
        prismaClient.messageReaction.deleteMany({ where: { message_id, user_id, emoji } }).catch(console.error);
      }
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
      if (prismaClient && isPrismaConnected) {
        prismaClient.thread.create({ data: { id: thread.id, parent_message_id: thread.parent_message_id, channel_id: thread.channel_id, name: thread.name, creator_id: thread.creator_id } }).catch(console.error);
      }
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
      if (prismaClient && isPrismaConnected) {
        prismaClient.friendship.create({ data: { id: friendship.id, sender_id: friendship.sender_id, receiver_id: friendship.receiver_id, status: friendship.status } }).catch(console.error);
      }
      return friendship;
    },
    update: (id: string, status: 'pending' | 'accepted' | 'blocked') => {
      const idx = data.friendships.findIndex(f => f.id === id);
      if (idx !== -1) {
        data.friendships[idx].status = status;
        saveDatabase();
        if (prismaClient && isPrismaConnected) {
          prismaClient.friendship.update({ where: { id }, data: { status } }).catch(console.error);
        }
        return data.friendships[idx];
      }
      return null;
    },
    delete: (id: string) => {
      data.friendships = data.friendships.filter(f => f.id !== id);
      saveDatabase();
      if (prismaClient && isPrismaConnected) {
        prismaClient.friendship.delete({ where: { id } }).catch(console.error);
      }
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
      if (prismaClient && isPrismaConnected) {
        prismaClient.dMConversation.create({ data: { id: conv.id, is_group: conv.is_group, name: conv.name, icon_url: conv.icon_url } }).catch(console.error);
        memberIds.forEach(uid => {
          prismaClient?.dMMember.create({ data: { id: uuidv4(), dm_conversation_id: conv.id, user_id: uid } }).catch(console.error);
        });
      }
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
