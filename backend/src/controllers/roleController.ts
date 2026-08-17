import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db';
import { AuthRequest } from '../middlewares/auth';
import { Role } from '../types';

export const roleController = {
  async getRoles(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { serverId } = req.params;
      const roles = db.roles.getByServer(serverId);
      res.json({ roles });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao obter cargos.' });
    }
  },

  async createRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { serverId } = req.params;
      const { name, color, permissions } = req.body;

      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Nome do cargo é obrigatório.' });
        return;
      }

      const existingRoles = db.roles.getByServer(serverId);
      const newRole: Role = {
        id: uuidv4(),
        server_id: serverId,
        name: name.trim(),
        color: color || '#99AAB5',
        position: existingRoles.length + 1,
        permissions: Array.isArray(permissions) ? permissions : ['send_messages', 'connect_voice'],
        created_at: new Date().toISOString()
      };

      db.roles.insert(newRole);
      res.status(201).json({ role: newRole });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao criar cargo.' });
    }
  },

  async updateRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roleId } = req.params;
      const { name, color, permissions, position } = req.body;

      const role = db.roles.findById(roleId);
      if (!role) {
        res.status(404).json({ error: 'Cargo não encontrado.' });
        return;
      }

      const updates: Partial<Role> = {};
      if (name) updates.name = name.trim();
      if (color) updates.color = color;
      if (permissions) updates.permissions = permissions;
      if (position !== undefined) updates.position = position;

      const updated = db.roles.update(roleId, updates);
      res.json({ role: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao atualizar cargo.' });
    }
  },

  async deleteRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { roleId } = req.params;
      const role = db.roles.findById(roleId);
      if (!role) {
        res.status(404).json({ error: 'Cargo não encontrado.' });
        return;
      }

      db.roles.delete(roleId);
      res.json({ success: true, message: 'Cargo excluído com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao deletar cargo.' });
    }
  },

  async assignRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { serverId, userId, roleId } = req.body;
      if (!serverId || !userId || !roleId) {
        res.status(400).json({ error: 'Dados incompletos para atribuição de cargo.' });
        return;
      }

      db.roles.assignRole(serverId, userId, roleId);
      res.json({ success: true, message: 'Cargo atribuído com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao atribuir cargo.' });
    }
  },

  async removeRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { serverId, userId, roleId } = req.body;
      if (!serverId || !userId || !roleId) {
        res.status(400).json({ error: 'Dados incompletos para remoção de cargo.' });
        return;
      }

      db.roles.removeRole(serverId, userId, roleId);
      res.json({ success: true, message: 'Cargo removido com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao remover cargo.' });
    }
  }
};
