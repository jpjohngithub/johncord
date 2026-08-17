import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db';
import { AuthRequest } from '../middlewares/auth';
import { Category, Channel } from '../types';

export const channelController = {
  // Categories
  async createCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { serverId } = req.params;
      const { name } = req.body;

      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Nome da categoria é obrigatório.' });
        return;
      }

      const existingCats = db.categories.getByServer(serverId);
      const newCategory: Category = {
        id: uuidv4(),
        server_id: serverId,
        name: name.trim().toUpperCase(),
        position: existingCats.length + 1,
        created_at: new Date().toISOString()
      };

      db.categories.insert(newCategory);
      res.status(201).json({ category: newCategory });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao criar categoria.' });
    }
  },

  async updateCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { categoryId } = req.params;
      const { name, position } = req.body;

      const cat = db.categories.findById(categoryId);
      if (!cat) {
        res.status(404).json({ error: 'Categoria não encontrada.' });
        return;
      }

      const updates: Partial<Category> = {};
      if (name) updates.name = name.trim().toUpperCase();
      if (position !== undefined) updates.position = position;

      const updated = db.categories.update(categoryId, updates);
      res.json({ category: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao atualizar categoria.' });
    }
  },

  async deleteCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { categoryId } = req.params;
      const cat = db.categories.findById(categoryId);
      if (!cat) {
        res.status(404).json({ error: 'Categoria não encontrada.' });
        return;
      }

      db.categories.delete(categoryId);
      res.json({ success: true, message: 'Categoria excluída com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao deletar categoria.' });
    }
  },

  // Channels
  async createChannel(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { serverId } = req.params;
      const { name, type, category_id, topic } = req.body;

      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Nome do canal é obrigatório.' });
        return;
      }

      const channelType = type === 'voice' ? 'voice' : 'text';
      const formattedName = channelType === 'text'
        ? name.trim().toLowerCase().replace(/\s+/g, '-')
        : name.trim();

      const existingChannels = db.channels.getByServer(serverId);
      const newChannel: Channel = {
        id: uuidv4(),
        server_id: serverId,
        category_id: category_id || null,
        name: formattedName,
        type: channelType,
        topic: topic || '',
        position: existingChannels.length + 1,
        created_at: new Date().toISOString()
      };

      db.channels.insert(newChannel);
      res.status(201).json({ channel: newChannel });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao criar canal.' });
    }
  },

  async updateChannel(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;
      const { name, topic, category_id, position } = req.body;

      const channel = db.channels.findById(channelId);
      if (!channel) {
        res.status(404).json({ error: 'Canal não encontrado.' });
        return;
      }

      const updates: Partial<Channel> = {};
      if (name) {
        updates.name = channel.type === 'text'
          ? name.trim().toLowerCase().replace(/\s+/g, '-')
          : name.trim();
      }
      if (topic !== undefined) updates.topic = topic;
      if (category_id !== undefined) updates.category_id = category_id;
      if (position !== undefined) updates.position = position;

      const updated = db.channels.update(channelId, updates);
      res.json({ channel: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao atualizar canal.' });
    }
  },

  async deleteChannel(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;
      const channel = db.channels.findById(channelId);
      if (!channel) {
        res.status(404).json({ error: 'Canal não encontrado.' });
        return;
      }

      db.channels.delete(channelId);
      res.json({ success: true, message: 'Canal excluído com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao deletar canal.' });
    }
  }
};
