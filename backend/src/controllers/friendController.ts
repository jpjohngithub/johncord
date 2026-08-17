import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db';
import { AuthRequest } from '../middlewares/auth';
import { enrichMessage } from './messageController';
import { DMConversation } from '../types';

export const friendController = {
  async getFriends(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const allFriendships = db.friendships.getByUser(userId);

      const friends = allFriendships.map(f => {
        const otherUserId = f.sender_id === userId ? f.receiver_id : f.sender_id;
        const otherUser = db.users.findById(otherUserId);
        return {
          id: f.id,
          status: f.status,
          isSender: f.sender_id === userId,
          createdAt: f.created_at,
          friend: otherUser ? {
            id: otherUser.id,
            username: otherUser.username,
            tag: otherUser.tag,
            avatar_url: otherUser.avatar_url,
            banner_url: otherUser.banner_url,
            bio: otherUser.bio,
            custom_status: otherUser.custom_status,
            presence: otherUser.presence
          } : undefined
        };
      });

      res.json({ friends });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao obter amigos.' });
    }
  },

  async sendFriendRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { userTag } = req.body; // e.g. "AnaGamer#4040" or username and tag

      if (!userTag || !userTag.includes('#')) {
        res.status(400).json({ error: 'Informe o nome de usuário e a tag no formato Nome#0000.' });
        return;
      }

      const [username, tag] = userTag.split('#');
      const targetUser = db.users.findByUsernameAndTag(username.trim(), tag.trim());

      if (!targetUser) {
        res.status(404).json({ error: 'Nenhum usuário encontrado com esta tag.' });
        return;
      }

      if (targetUser.id === userId) {
        res.status(400).json({ error: 'Você não pode adicionar a si mesmo.' });
        return;
      }

      const existing = db.friendships.findPair(userId, targetUser.id);
      if (existing) {
        if (existing.status === 'accepted') {
          res.status(400).json({ error: 'Vocês já são amigos.' });
          return;
        }
        if (existing.status === 'pending') {
          if (existing.sender_id === userId) {
            res.status(400).json({ error: 'Pedido de amizade já enviado.' });
            return;
          } else {
            // Auto accept if incoming
            db.friendships.update(existing.id, 'accepted');
            res.json({ success: true, message: 'Pedido de amizade aceito!' });
            return;
          }
        }
      }

      const newFriendship = {
        id: uuidv4(),
        sender_id: userId,
        receiver_id: targetUser.id,
        status: 'pending' as const,
        created_at: new Date().toISOString()
      };

      db.friendships.insert(newFriendship);
      res.status(201).json({ success: true, message: 'Pedido de amizade enviado com sucesso!' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao enviar pedido de amizade.' });
    }
  },

  async acceptFriendRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { friendshipId } = req.params;
      const friendship = db.friendships.update(friendshipId, 'accepted');
      if (!friendship) {
        res.status(404).json({ error: 'Pedido não encontrado.' });
        return;
      }
      res.json({ success: true, friendship });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao aceitar amizade.' });
    }
  },

  async rejectFriendRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { friendshipId } = req.params;
      db.friendships.delete(friendshipId);
      res.json({ success: true, message: 'Pedido removido/recusado.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao remover amizade.' });
    }
  },

  async getDMConversations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const conversations = db.dmConversations.getByUser(userId);

      const enriched = conversations.map(c => {
        const members = db.dmConversations.getMembers(c.id);
        const lastMsgRaw = db.messages.getByDM(c.id).pop();
        const last_message = lastMsgRaw ? enrichMessage(lastMsgRaw) : undefined;
        return {
          ...c,
          members: members.map(u => ({
            id: u.id,
            username: u.username,
            tag: u.tag,
            avatar_url: u.avatar_url,
            custom_status: u.custom_status,
            presence: u.presence
          })),
          last_message
        };
      });

      res.json({ conversations: enriched });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao carregar DMs.' });
    }
  },

  async getOrCreateDM(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { targetUserId } = req.body;

      if (!targetUserId) {
        res.status(400).json({ error: 'Usuário alvo obrigatório.' });
        return;
      }

      const existing = db.dmConversations.findDirectBetween(userId, targetUserId);
      if (existing) {
        const members = db.dmConversations.getMembers(existing.id);
        res.json({
          conversation: {
            ...existing,
            members: members.map(u => ({
              id: u.id,
              username: u.username,
              tag: u.tag,
              avatar_url: u.avatar_url,
              custom_status: u.custom_status,
              presence: u.presence
            }))
          }
        });
        return;
      }

      const targetUser = db.users.findById(targetUserId);
      if (!targetUser) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }

      const newConv: DMConversation = {
        id: uuidv4(),
        is_group: 0,
        name: '',
        icon_url: '',
        created_at: new Date().toISOString()
      };

      db.dmConversations.insert(newConv, [userId, targetUserId]);

      const members = db.dmConversations.getMembers(newConv.id);
      res.status(201).json({
        conversation: {
          ...newConv,
          members: members.map(u => ({
            id: u.id,
            username: u.username,
            tag: u.tag,
            avatar_url: u.avatar_url,
            custom_status: u.custom_status,
            presence: u.presence
          }))
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao criar conversa DM.' });
    }
  }
};
