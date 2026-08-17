export interface User {
  id: string;
  username: string;
  tag: string;
  email: string;
  avatar_url: string;
  banner_url?: string;
  bio?: string;
  custom_status?: string;
  presence: 'online' | 'idle' | 'dnd' | 'offline';
  created_at?: string;
}

export interface Role {
  id: string;
  server_id: string;
  name: string;
  color: string;
  position: number;
  permissions: string[];
  created_at?: string;
}

export interface ServerMember {
  id: string;
  server_id: string;
  user_id: string;
  nickname?: string;
  joined_at: string;
  user?: User;
  roles?: Role[];
}

export interface Category {
  id: string;
  server_id: string;
  name: string;
  position: number;
  created_at?: string;
  channels?: Channel[];
}

export interface Channel {
  id: string;
  server_id: string;
  category_id?: string | null;
  name: string;
  type: 'text' | 'voice';
  topic?: string;
  position: number;
  created_at?: string;
}

export interface Server {
  id: string;
  name: string;
  icon_url?: string;
  banner_url?: string;
  owner_id: string;
  invite_code: string;
  created_at?: string;
  categories?: Category[];
  channels?: Channel[];
  unassignedChannels?: Channel[];
  roles?: Role[];
  members?: ServerMember[];
}

export interface Attachment {
  id: string;
  url: string;
  name: string;
  type: string;
  size: number;
}

export interface Reaction {
  emoji: string;
  count: number;
  users: string[];
}

export interface Message {
  id: string;
  channel_id?: string | null;
  dm_conversation_id?: string | null;
  thread_parent_id?: string | null;
  user_id: string;
  content: string;
  attachments: Attachment[];
  reply_to_id?: string | null;
  reply_to?: {
    id: string;
    username: string;
    content: string;
  } | null;
  is_pinned: number;
  created_at: string;
  updated_at?: string;
  user?: User;
  reactions?: Reaction[];
  thread_count?: number;
}

export interface Thread {
  id: string;
  parent_message_id: string;
  channel_id: string;
  name: string;
  creator_id: string;
  created_at: string;
  message_count?: number;
}

export interface FriendItem {
  id: string;
  status: 'pending' | 'accepted' | 'blocked';
  isSender: boolean;
  createdAt: string;
  friend?: User;
}

export interface DMConversation {
  id: string;
  is_group: number;
  name?: string;
  icon_url?: string;
  created_at: string;
  members?: User[];
  last_message?: Message;
}

export interface VoiceParticipant {
  userId: string;
  socketId: string;
  username: string;
  avatar_url: string;
  channelId: string;
  serverId?: string;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screenShare: boolean;
  speaking?: boolean;
}
