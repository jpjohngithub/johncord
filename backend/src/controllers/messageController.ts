import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db';
import { AuthRequest } from '../middlewares/auth';
import { Message, Thread, Attachment } from '../types';

export function enrichMessage(m: Message): Message {
  const user = db.users.findById(m.user_id);
  const reactions = db.messages.getReactions(m.id);
  let reply_to = null;

  if (m.reply_to_id) {
    const parentMsg = db.messages.findById(m.reply_to_id);
    if (parentMsg) {
      const parentUser = db.users.findById(parentMsg.user_id);
      reply_to = {
        id: parentMsg.id,
        username: parentUser ? parentUser.username : 'Usuário',
        content: parentMsg.content.slice(0, 100)
      };
    }
  }

  const thread = db.threads.findByParent(m.id);
  const threadCount = thread ? db.messages.getByThread(m.id).length : 0;

  return {
    ...m,
    user: user ? {
      id: user.id,
      username: user.username,
      tag: user.tag,
      avatar_url: user.avatar_url,
      custom_status: user.custom_status,
      presence: user.presence
    } as any : undefined,
    reactions,
    reply_to,
    thread_count: threadCount
  };
}

export const messageController = {
  async getChannelMessages(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;
      const rawMessages = db.messages.getByChannel(channelId);
      const messages = rawMessages.map(enrichMessage);
      res.json({ messages });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao carregar mensagens do canal.' });
    }
  },

  async getDMMessages(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { dmId } = req.params;
      const rawMessages = db.messages.getByDM(dmId);
      const messages = rawMessages.map(enrichMessage);
      res.json({ messages });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao carregar mensagens da DM.' });
    }
  },

  async getThreadMessages(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { threadParentId } = req.params;
      const thread = db.threads.findByParent(threadParentId);
      const rawMessages = db.messages.getByThread(threadParentId);
      const messages = rawMessages.map(enrichMessage);
      const parentMessage = db.messages.findById(threadParentId);

      res.json({
        thread,
        parentMessage: parentMessage ? enrichMessage(parentMessage) : null,
        messages
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao carregar mensagens da thread.' });
    }
  },

  async createThread(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const { name } = req.body;
      const userId = req.user!.id;

      const parentMsg = db.messages.findById(messageId);
      if (!parentMsg) {
        res.status(404).json({ error: 'Mensagem original não encontrada.' });
        return;
      }

      const existing = db.threads.findByParent(messageId);
      if (existing) {
        res.json({ thread: existing });
        return;
      }

      const threadName = name?.trim() || `Thread: ${parentMsg.content.slice(0, 30)}...`;
      const newThread: Thread = {
        id: uuidv4(),
        parent_message_id: messageId,
        channel_id: parentMsg.channel_id || '',
        name: threadName,
        creator_id: userId,
        created_at: new Date().toISOString()
      };

      db.threads.insert(newThread);
      res.status(201).json({ thread: newThread });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao criar thread.' });
    }
  },

  async sendMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { channel_id, dm_conversation_id, thread_parent_id, content, attachments, reply_to_id } = req.body;

      if ((!content || !content.trim()) && (!attachments || attachments.length === 0)) {
        res.status(400).json({ error: 'Mensagem não pode estar vazia.' });
        return;
      }

      const newMessage: Message = {
        id: uuidv4(),
        channel_id: channel_id || null,
        dm_conversation_id: dm_conversation_id || null,
        thread_parent_id: thread_parent_id || null,
        user_id: userId,
        content: content ? content.trim() : '',
        attachments: Array.isArray(attachments) ? attachments : [],
        reply_to_id: reply_to_id || null,
        is_pinned: 0,
        created_at: new Date().toISOString()
      };

      db.messages.insert(newMessage);
      const enriched = enrichMessage(newMessage);

      res.status(201).json({ message: enriched });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao enviar mensagem.' });
    }
  },

  async editMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const { content } = req.body;
      const userId = req.user!.id;

      const msg = db.messages.findById(messageId);
      if (!msg) {
        res.status(404).json({ error: 'Mensagem não encontrada.' });
        return;
      }

      if (msg.user_id !== userId) {
        res.status(403).json({ error: 'Você só pode editar suas próprias mensagens.' });
        return;
      }

      const updated = db.messages.update(messageId, {
        content: content.trim(),
        updated_at: new Date().toISOString()
      });

      res.json({ message: updated ? enrichMessage(updated) : null });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao editar mensagem.' });
    }
  },

  async deleteMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const userId = req.user!.id;

      const msg = db.messages.findById(messageId);
      if (!msg) {
        res.status(404).json({ error: 'Mensagem não encontrada.' });
        return;
      }

      let canDelete = msg.user_id === userId;
      if (!canDelete && msg.channel_id) {
        const channel = db.channels.findById(msg.channel_id);
        if (channel) {
          const server = db.servers.findById(channel.server_id);
          if (server && server.owner_id === userId) {
            canDelete = true;
          } else if (server) {
            const roles = db.roles.getUserRoles(server.id, userId);
            canDelete = roles.some(r => r.permissions.includes('admin') || r.permissions.includes('manage_server'));
          }
        }
      }

      if (!canDelete) {
        res.status(403).json({ error: 'Você não tem permissão para deletar esta mensagem.' });
        return;
      }

      db.messages.delete(messageId);
      res.json({ success: true, messageId });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao deletar mensagem.' });
    }
  },

  async toggleReaction(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const { emoji } = req.body;
      const userId = req.user!.id;

      if (!emoji) {
        res.status(400).json({ error: 'Emoji obrigatório.' });
        return;
      }

      const reactions = db.messages.getReactions(messageId);
      const existing = reactions.find(r => r.emoji === emoji && r.users.includes(userId));

      if (existing) {
        db.messages.removeReaction(messageId, userId, emoji);
      } else {
        db.messages.addReaction(messageId, userId, emoji);
      }

      const updatedReactions = db.messages.getReactions(messageId);
      res.json({ messageId, reactions: updatedReactions });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao reagir à mensagem.' });
    }
  },

  async togglePin(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const msg = db.messages.findById(messageId);
      if (!msg) {
        res.status(404).json({ error: 'Mensagem não encontrada.' });
        return;
      }

      const updated = db.messages.update(messageId, {
        is_pinned: msg.is_pinned ? 0 : 1
      });

      res.json({ message: updated ? enrichMessage(updated) : null });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao fixar mensagem.' });
    }
  },

  async uploadFile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        return;
      }

      const fileUrl = `/uploads/${req.file.filename}`;
      const attachment: Attachment = {
        id: uuidv4(),
        url: fileUrl,
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size
      };

      res.status(201).json({ attachment });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao fazer upload do arquivo.' });
    }
  }
};
