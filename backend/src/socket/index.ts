import { Server as SocketIOServer, Socket } from 'socket.io';
import { db } from '../database/db';
import { VoiceParticipant, User } from '../types';

// Map of channelId -> Map<userId, VoiceParticipant>
const voiceChannels = new Map<string, Map<string, VoiceParticipant>>();

// Map of userId -> Set of socketIds (for multi-tab presence)
const userSockets = new Map<string, Set<string>>();
// Map of socketId -> userId
const socketUsers = new Map<string, string>();

export function setupSocket(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    // 1. User identification on connect
    socket.on('user:authenticate', ({ userId }: { userId: string }) => {
      if (!userId) return;
      socketUsers.set(socket.id, userId);

      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId)!.add(socket.id);

      // Set user presence online
      db.users.update(userId, { presence: 'online' });
      io.emit('user:presence_changed', { userId, presence: 'online' });
    });

    // 2. Presence Update
    socket.on('user:update_status', ({ userId, presence, custom_status }: { userId: string; presence?: any; custom_status?: string }) => {
      const updates: Partial<User> = {};
      if (presence) updates.presence = presence;
      if (custom_status !== undefined) updates.custom_status = custom_status;
      const updated = db.users.update(userId, updates);
      if (updated) {
        io.emit('user:presence_changed', {
          userId,
          presence: updated.presence,
          custom_status: updated.custom_status
        });
      }
    });

    // 3. Room Management for Chat (Channels & DMs)
    socket.on('chat:join', ({ roomId }: { roomId: string }) => {
      if (roomId) socket.join(roomId);
    });

    socket.on('chat:leave', ({ roomId }: { roomId: string }) => {
      if (roomId) socket.leave(roomId);
    });

    // 4. Typing Indicator
    socket.on('chat:typing', ({ roomId, user }: { roomId: string; user: { id: string; username: string } }) => {
      socket.to(roomId).emit('chat:user_typing', { roomId, user });
    });

    // 5. Message Broadcasts
    socket.on('chat:new_message', ({ roomId, message }: { roomId: string; message: any }) => {
      io.to(roomId).emit('chat:message_received', { roomId, message });
    });

    socket.on('chat:edit_message', ({ roomId, message }: { roomId: string; message: any }) => {
      io.to(roomId).emit('chat:message_updated', { roomId, message });
    });

    socket.on('chat:delete_message', ({ roomId, messageId }: { roomId: string; messageId: string }) => {
      io.to(roomId).emit('chat:message_deleted', { roomId, messageId });
    });

    socket.on('chat:reaction_updated', ({ roomId, messageId, reactions }: { roomId: string; messageId: string; reactions: any }) => {
      io.to(roomId).emit('chat:reaction_changed', { roomId, messageId, reactions });
    });

    // 6. WebRTC Voice & Video & Screen Share Channels
    socket.on('voice:join', ({ channelId, user, serverId }: { channelId: string; user: any; serverId?: string }) => {
      if (!channelId || !user) return;

      // Leave any existing voice channel first
      leaveCurrentVoice(socket, io);

      if (!voiceChannels.has(channelId)) {
        voiceChannels.set(channelId, new Map());
      }

      const participant: VoiceParticipant = {
        userId: user.id,
        socketId: socket.id,
        username: user.username,
        avatar_url: user.avatar_url,
        channelId,
        serverId,
        muted: false,
        deafened: false,
        video: false,
        screenShare: false,
        speaking: false
      };

      const room = voiceChannels.get(channelId)!;
      const existingParticipants = Array.from(room.values());

      room.set(user.id, participant);
      socket.join(`voice:${channelId}`);

      // Send to the newcomer the list of existing participants
      socket.emit('voice:all_participants', {
        channelId,
        participants: existingParticipants
      });

      // Broadcast to existing members that new user joined
      socket.to(`voice:${channelId}`).emit('voice:user_joined', {
        participant
      });

      // Broadcast overall voice state to everyone on the server for UI channel badge
      io.emit('voice:state_sync', {
        channelId,
        participants: Array.from(room.values())
      });
    });

    socket.on('voice:leave', () => {
      leaveCurrentVoice(socket, io);
    });

    // WebRTC P2P Signaling: send offer / answer / ICE candidate
    socket.on('voice:signal', ({ targetSocketId, signal, fromUserId }: { targetSocketId: string; signal: any; fromUserId: string }) => {
      io.to(targetSocketId).emit('voice:signal_received', {
        fromSocketId: socket.id,
        fromUserId,
        signal
      });
    });

    // Voice Participant state updates (mute, deafen, speaking, screenShare, video)
    socket.on('voice:state_change', ({ channelId, updates }: { channelId: string; updates: Partial<VoiceParticipant> }) => {
      const room = voiceChannels.get(channelId);
      const userId = socketUsers.get(socket.id);
      if (room && userId && room.has(userId)) {
        const current = room.get(userId)!;
        const updated = { ...current, ...updates };
        room.set(userId, updated);

        io.to(`voice:${channelId}`).emit('voice:user_state_updated', {
          userId,
          updates
        });
      }
    });

    socket.on('voice:speaking_status', ({ channelId, speaking }: { channelId: string; speaking: boolean }) => {
      const userId = socketUsers.get(socket.id);
      if (channelId && userId) {
        socket.to(`voice:${channelId}`).emit('voice:user_speaking', {
          userId,
          speaking
        });
      }
    });

    // 7. Direct 1-on-1 Call Signaling (DMs)
    socket.on('dm:call_start', ({ dmId, caller, receiverId, withVideo }: { dmId: string; caller: any; receiverId: string; withVideo: boolean }) => {
      const receiverSocketSet = userSockets.get(receiverId);
      if (receiverSocketSet && receiverSocketSet.size > 0) {
        receiverSocketSet.forEach(sId => {
          io.to(sId).emit('dm:incoming_call', {
            dmId,
            caller,
            withVideo
          });
        });
      }
    });

    socket.on('dm:call_accepted', ({ dmId, callerId }: { dmId: string; callerId: string }) => {
      const callerSockets = userSockets.get(callerId);
      if (callerSockets) {
        callerSockets.forEach(sId => {
          io.to(sId).emit('dm:call_answered', { dmId });
        });
      }
    });

    socket.on('dm:call_rejected', ({ dmId, callerId }: { dmId: string; callerId: string }) => {
      const callerSockets = userSockets.get(callerId);
      if (callerSockets) {
        callerSockets.forEach(sId => {
          io.to(sId).emit('dm:call_declined', { dmId });
        });
      }
    });

    socket.on('dm:call_end', ({ dmId, targetUserId }: { dmId: string; targetUserId?: string }) => {
      if (targetUserId) {
        const targetSockets = userSockets.get(targetUserId);
        if (targetSockets) {
          targetSockets.forEach(sId => {
            io.to(sId).emit('dm:call_terminated', { dmId });
          });
        }
      }
    });

    // Disconnect handling
    socket.on('disconnect', () => {
      leaveCurrentVoice(socket, io);

      const userId = socketUsers.get(socket.id);
      if (userId) {
        socketUsers.delete(socket.id);
        const userSocketSet = userSockets.get(userId);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);
          if (userSocketSet.size === 0) {
            userSockets.delete(userId);
            // Mark user offline if no active connections
            db.users.update(userId, { presence: 'offline' });
            io.emit('user:presence_changed', { userId, presence: 'offline' });
          }
        }
      }
    });
  });
}

function leaveCurrentVoice(socket: Socket, io: SocketIOServer) {
  const userId = socketUsers.get(socket.id);
  if (!userId) return;

  voiceChannels.forEach((room, channelId) => {
    if (room.has(userId)) {
      room.delete(userId);
      socket.leave(`voice:${channelId}`);

      socket.to(`voice:${channelId}`).emit('voice:user_left', {
        userId,
        socketId: socket.id
      });

      io.emit('voice:state_sync', {
        channelId,
        participants: Array.from(room.values())
      });

      if (room.size === 0) {
        voiceChannels.delete(channelId);
      }
    }
  });
}
