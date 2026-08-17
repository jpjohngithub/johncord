import mqtt, { MqttClient } from 'mqtt';
import { User, Server, Channel, Category, Role, ServerMember, Message, DMConversation, FriendItem, Thread } from '../types';

export interface CloudDatabase {
  users: Record<string, User>; // userId -> User
  usersByEmail: Record<string, string>; // email.toLowerCase() -> userId
  servers: Record<string, Server>; // serverId -> Server
  serversByInvite: Record<string, string>; // inviteCode.toUpperCase() -> serverId
  categories: Record<string, Category[]>; // serverId -> Category[]
  channels: Record<string, Channel[]>; // serverId -> Channel[]
  roles: Record<string, Role[]>; // serverId -> Role[]
  serverMembers: Record<string, ServerMember[]>; // serverId -> ServerMember[]
  channelMessages: Record<string, Message[]>; // channelId -> Message[]
  dmConversations: Record<string, DMConversation>; // dmId -> DMConversation
  dmMembers: Record<string, string[]>; // dmId -> userId[]
  dmMessages: Record<string, Message[]>; // dmId -> Message[]
  friendships: Record<string, { id: string; sender_id: string; receiver_id: string; status: 'pending' | 'accepted' | 'blocked'; created_at: string }>;
  onlineUsers: Record<string, { lastSeen: number; presence: string; custom_status?: string }>;
}

const LOCAL_STORAGE_KEY = 'johncord_global_cloud_cache_v5';

// Free high-performance global MQTT WebSocket clusters
const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081'
];

class CloudEngine {
  public db: CloudDatabase;
  private client: MqttClient | null = null;
  private eventHandlers: Map<string, Set<(data: any) => void>> = new Map();
  private isInitialized = false;
  private brokerIndex = 0;

  constructor() {
    this.db = this.loadLocalCache();
  }

  private loadLocalCache(): CloudDatabase {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {}

    return {
      users: {},
      usersByEmail: {},
      servers: {},
      serversByInvite: {},
      categories: {},
      channels: {},
      roles: {},
      serverMembers: {},
      channelMessages: {},
      dmConversations: {},
      dmMembers: {},
      dmMessages: {},
      friendships: {},
      onlineUsers: {}
    };
  }

  public saveCache() {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.db));
    } catch (e) {}
  }

  public init() {
    if (this.isInitialized && this.client?.connected) return;
    this.isInitialized = true;

    const brokerUrl = MQTT_BROKERS[this.brokerIndex];
    const clientId = `jc_client_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;

    console.log(`🌐 [Johncord Cloud] Connecting to global realtime broker: ${brokerUrl}`);

    try {
      this.client = mqtt.connect(brokerUrl, {
        clientId,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 2000,
        keepalive: 30
      });

      this.client.on('connect', () => {
        console.log('⚡ [Johncord Cloud] Connected to Global Realtime Cloud Network!');

        // Subscribe to global sync topics
        this.client?.subscribe('johncord/sync/state/#', { qos: 0 });
        this.client?.subscribe('johncord/events/#', { qos: 0 });

        // Announce current user
        this.sendPresenceHeartbeat();
      });

      this.client.on('message', (topic, payloadBuffer) => {
        try {
          const payload = JSON.parse(payloadBuffer.toString());
          this.handleIncomingMessage(topic, payload);
        } catch (e) {}
      });

      this.client.on('error', (err) => {
        console.warn('⚠️ [Johncord Cloud] Broker error:', err);
        this.brokerIndex = (this.brokerIndex + 1) % MQTT_BROKERS.length;
      });
    } catch (err) {
      console.warn('Failed to connect to MQTT:', err);
    }

    // Heartbeat every 10 seconds to maintain online presence
    setInterval(() => {
      this.sendPresenceHeartbeat();
    }, 10000);
  }

  private sendPresenceHeartbeat() {
    const userStr = localStorage.getItem('johncord_user');
    if (userStr && this.client?.connected) {
      try {
        const user: User = JSON.parse(userStr);
        this.publish('johncord/events/presence', {
          type: 'heartbeat',
          user: {
            ...user,
            presence: user.presence || 'online'
          },
          timestamp: Date.now()
        });
      } catch (e) {}
    }
  }

  private handleIncomingMessage(topic: string, payload: any) {
    // 1. State Sync Handlers
    if (topic === 'johncord/sync/state/user') {
      const user: User = payload.user;
      if (user?.id) {
        this.db.users[user.id] = user;
        if (user.email) this.db.usersByEmail[user.email.toLowerCase()] = user.id;
        this.saveCache();
        this.emit('user_updated', user);
      }
    } else if (topic === 'johncord/sync/state/server') {
      const { server, categories, channels, roles, member } = payload;
      if (server?.id) {
        this.db.servers[server.id] = server;
        if (server.invite_code) {
          this.db.serversByInvite[server.invite_code.toUpperCase()] = server.id;
        }
        if (categories) this.db.categories[server.id] = categories;
        if (channels) this.db.channels[server.id] = channels;
        if (roles) this.db.roles[server.id] = roles;
        if (member) {
          if (!this.db.serverMembers[server.id]) this.db.serverMembers[server.id] = [];
          if (!this.db.serverMembers[server.id].some(m => m.id === member.id)) {
            this.db.serverMembers[server.id].push(member);
          }
        }
        this.saveCache();
        this.emit('server_updated', server);
      }
    } else if (topic === 'johncord/sync/state/member') {
      const { serverId, member, user } = payload;
      if (serverId && member) {
        if (!this.db.serverMembers[serverId]) this.db.serverMembers[serverId] = [];
        if (!this.db.serverMembers[serverId].some(m => m.user_id === member.user_id)) {
          this.db.serverMembers[serverId].push(member);
        }
        if (user) this.db.users[user.id] = user;
        this.saveCache();
        this.emit('member_joined', { serverId, member, user });
      }
    } else if (topic === 'johncord/sync/state/channel') {
      const { serverId, channel } = payload;
      if (serverId && channel) {
        if (!this.db.channels[serverId]) this.db.channels[serverId] = [];
        if (!this.db.channels[serverId].some(c => c.id === channel.id)) {
          this.db.channels[serverId].push(channel);
        }
        this.saveCache();
        this.emit('channel_created', { serverId, channel });
      }
    } else if (topic === 'johncord/sync/state/category') {
      const { serverId, category } = payload;
      if (serverId && category) {
        if (!this.db.categories[serverId]) this.db.categories[serverId] = [];
        if (!this.db.categories[serverId].some(c => c.id === category.id)) {
          this.db.categories[serverId].push(category);
        }
        this.saveCache();
        this.emit('category_created', { serverId, category });
      }
    }

    // 2. Real-time Chat Messages
    if (topic.startsWith('johncord/events/messages/')) {
      const { message, roomId } = payload;
      if (message?.id) {
        const channelId = message.channel_id;
        const dmId = message.dm_conversation_id;

        if (channelId) {
          if (!this.db.channelMessages[channelId]) this.db.channelMessages[channelId] = [];
          if (!this.db.channelMessages[channelId].some(m => m.id === message.id)) {
            this.db.channelMessages[channelId].push(message);
          }
        }
        if (dmId) {
          if (!this.db.dmMessages[dmId]) this.db.dmMessages[dmId] = [];
          if (!this.db.dmMessages[dmId].some(m => m.id === message.id)) {
            this.db.dmMessages[dmId].push(message);
          }
        }

        this.saveCache();
        this.emit('message_received', { roomId: roomId || channelId || dmId, message });
      }
    } else if (topic.startsWith('johncord/events/reactions/')) {
      const { messageId, reactions, channelId } = payload;
      if (channelId && this.db.channelMessages[channelId]) {
        const msg = this.db.channelMessages[channelId].find(m => m.id === messageId);
        if (msg) msg.reactions = reactions;
      }
      this.saveCache();
      this.emit('reaction_updated', payload);
    } else if (topic.startsWith('johncord/events/typing/')) {
      this.emit('user_typing', payload);
    }

    // 3. Presence & Online Status
    if (topic === 'johncord/events/presence') {
      const { user } = payload;
      if (user?.id) {
        this.db.onlineUsers[user.id] = {
          lastSeen: Date.now(),
          presence: user.presence || 'online',
          custom_status: user.custom_status
        };

        if (this.db.users[user.id]) {
          this.db.users[user.id] = { ...this.db.users[user.id], ...user, presence: user.presence || 'online' };
        } else {
          this.db.users[user.id] = user;
        }

        // Update presence on server members
        Object.keys(this.db.serverMembers).forEach((sId) => {
          this.db.serverMembers[sId].forEach((m) => {
            if (m.user_id === user.id && m.user) {
              m.user.presence = user.presence || 'online';
              m.user.custom_status = user.custom_status;
            }
          });
        });

        this.saveCache();
        this.emit('presence_changed', { userId: user.id, user, presence: user.presence || 'online' });
      }
    }
  }

  public publish(topic: string, data: any) {
    if (!this.client || !this.client.connected) {
      this.init();
    }
    const payload = JSON.stringify(data);
    this.client?.publish(topic, payload, { qos: 0 });
  }

  public on(event: string, callback: (data: any) => void) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(callback);
    return () => {
      this.eventHandlers.get(event)?.delete(callback);
    };
  }

  private emit(event: string, data: any) {
    this.eventHandlers.get(event)?.forEach((cb) => {
      try { cb(data); } catch (e) { console.error('Event error:', e); }
    });
  }
}

export const cloudEngine = new CloudEngine();
