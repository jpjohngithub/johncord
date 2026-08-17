import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db';
import { AuthRequest } from '../middlewares/auth';
import { Server, Category, Channel, Role, ServerMember } from '../types';

export const serverController = {
  async getMyServers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const memberRecords = db.serverMembers.getByUser(userId);
      const serverIds = memberRecords.map(m => m.server_id);
      const servers = db.servers.filter(s => serverIds.includes(s.id));
      res.json({ servers });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao carregar servidores.' });
    }
  },

  async getServerDetails(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { serverId } = req.params;
      const userId = req.user!.id;

      const server = db.servers.findById(serverId);
      if (!server) {
        res.status(404).json({ error: 'Servidor não encontrado.' });
        return;
      }

      // Check if user is a member
      const membership = db.serverMembers.find(serverId, userId);
      if (!membership) {
        res.status(403).json({ error: 'Você não é membro deste servidor.' });
        return;
      }

      const categories = db.categories.getByServer(serverId);
      const channels = db.channels.getByServer(serverId);
      const roles = db.roles.getByServer(serverId);
      const memberRecords = db.serverMembers.getByServer(serverId);

      const members = memberRecords.map(m => {
        const user = db.users.findById(m.user_id);
        const userRoles = db.roles.getUserRoles(serverId, m.user_id);
        return {
          ...m,
          user: user ? {
            id: user.id,
            username: user.username,
            tag: user.tag,
            avatar_url: user.avatar_url,
            custom_status: user.custom_status,
            presence: user.presence
          } : undefined,
          roles: userRoles
        };
      });

      // Nest channels inside categories
      const categoriesWithChannels = categories.map(cat => ({
        ...cat,
        channels: channels.filter(ch => ch.category_id === cat.id)
      }));

      const unassignedChannels = channels.filter(ch => !ch.category_id);

      res.json({
        server: {
          ...server,
          categories: categoriesWithChannels,
          channels,
          unassignedChannels,
          roles,
          members
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao obter detalhes do servidor.' });
    }
  },

  async createServer(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { name, icon_url, banner_url } = req.body;

      if (!name || !name.trim()) {
        res.status(400).json({ error: 'O nome do servidor é obrigatório.' });
        return;
      }

      const serverId = uuidv4();
      const invite_code = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 6);

      const newServer: Server = {
        id: serverId,
        name: name.trim(),
        icon_url: icon_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`,
        banner_url: banner_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
        owner_id: userId,
        invite_code,
        created_at: new Date().toISOString()
      };

      db.servers.insert(newServer);

      // Add owner as member
      db.serverMembers.insert({
        id: uuidv4(),
        server_id: serverId,
        user_id: userId,
        nickname: req.user!.username,
        joined_at: new Date().toISOString()
      });

      // Default Admin role
      const adminRole: Role = {
        id: uuidv4(),
        server_id: serverId,
        name: '👑 Dono & Admin',
        color: '#5865F2',
        position: 1,
        permissions: ['admin', 'manage_server', 'manage_channels', 'manage_roles', 'kick_members', 'ban_members', 'send_messages', 'connect_voice', 'mute_members'],
        created_at: new Date().toISOString()
      };
      const memberRole: Role = {
        id: uuidv4(),
        server_id: serverId,
        name: '👥 Membros',
        color: '#99AAB5',
        position: 2,
        permissions: ['send_messages', 'connect_voice'],
        created_at: new Date().toISOString()
      };
      db.roles.insert(adminRole);
      db.roles.insert(memberRole);
      db.roles.assignRole(serverId, userId, adminRole.id);

      // Default Category & Channels
      const catText: Category = {
        id: uuidv4(),
        server_id: serverId,
        name: 'CANAIS DE TEXTO',
        position: 1,
        created_at: new Date().toISOString()
      };
      const catVoice: Category = {
        id: uuidv4(),
        server_id: serverId,
        name: 'CANAIS DE VOZ',
        position: 2,
        created_at: new Date().toISOString()
      };
      db.categories.insert(catText);
      db.categories.insert(catVoice);

      const chGeneral: Channel = {
        id: uuidv4(),
        server_id: serverId,
        category_id: catText.id,
        name: 'geral',
        type: 'text',
        topic: 'Canal principal do servidor!',
        position: 1,
        created_at: new Date().toISOString()
      };
      const chVoice: Channel = {
        id: uuidv4(),
        server_id: serverId,
        category_id: catVoice.id,
        name: 'Geral (Voz)',
        type: 'voice',
        topic: '',
        position: 1,
        created_at: new Date().toISOString()
      };
      db.channels.insert(chGeneral);
      db.channels.insert(chVoice);

      // Initial welcome message
      db.messages.insert({
        id: uuidv4(),
        channel_id: chGeneral.id,
        user_id: userId,
        content: `🎉 Bem-vindo ao servidor **${newServer.name}**! Convide seus amigos com o link ou código: \`${newServer.invite_code}\``,
        attachments: [],
        is_pinned: 1,
        created_at: new Date().toISOString()
      });

      res.status(201).json({ server: newServer, defaultChannelId: chGeneral.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao criar servidor.' });
    }
  },

  async updateServer(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { serverId } = req.params;
      const userId = req.user!.id;
      const { name, icon_url, banner_url } = req.body;

      const server = db.servers.findById(serverId);
      if (!server) {
        res.status(404).json({ error: 'Servidor não encontrado.' });
        return;
      }

      if (server.owner_id !== userId) {
        const roles = db.roles.getUserRoles(serverId, userId);
        const canManage = roles.some(r => r.permissions.includes('admin') || r.permissions.includes('manage_server'));
        if (!canManage) {
          res.status(403).json({ error: 'Permissão insuficiente para editar o servidor.' });
          return;
        }
      }

      const updates: Partial<Server> = {};
      if (name) updates.name = name.trim();
      if (icon_url !== undefined) updates.icon_url = icon_url;
      if (banner_url !== undefined) updates.banner_url = banner_url;

      const updated = db.servers.update(serverId, updates);
      res.json({ server: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao atualizar servidor.' });
    }
  },

  async deleteServer(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { serverId } = req.params;
      const userId = req.user!.id;

      const server = db.servers.findById(serverId);
      if (!server) {
        res.status(404).json({ error: 'Servidor não encontrado.' });
        return;
      }

      if (server.owner_id !== userId) {
        res.status(403).json({ error: 'Apenas o dono pode deletar o servidor.' });
        return;
      }

      db.servers.delete(serverId);
      res.json({ success: true, message: 'Servidor excluído com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao deletar servidor.' });
    }
  },

  async joinByInvite(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { inviteCode } = req.body;
      const userId = req.user!.id;

      let cleanCode = (inviteCode || '').trim();
      if (cleanCode.includes('invite=')) {
        cleanCode = cleanCode.split('invite=')[1].split('&')[0];
      } else if (cleanCode.includes('join=')) {
        cleanCode = cleanCode.split('join=')[1].split('&')[0];
      } else if (cleanCode.includes('/')) {
        const parts = cleanCode.split('/').filter(Boolean);
        cleanCode = parts[parts.length - 1];
      }

      const server = db.servers.find(s => s.invite_code.toLowerCase() === cleanCode.toLowerCase());
      if (!server) {
        res.status(404).json({ error: 'Convite inválido ou expirado.' });
        return;
      }

      const existingMember = db.serverMembers.find(server.id, userId);
      if (!existingMember) {
        db.serverMembers.insert({
          id: uuidv4(),
          server_id: server.id,
          user_id: userId,
          nickname: req.user!.username,
          joined_at: new Date().toISOString()
        });

        // Assign default member role
        const memberRole = db.roles.getByServer(server.id).find(r => r.name.includes('Membros') || r.name.includes('Member'));
        if (memberRole) {
          db.roles.assignRole(server.id, userId, memberRole.id);
        }
      }

      res.json({ server });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao entrar no servidor.' });
    }
  },

  async leaveServer(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { serverId } = req.params;
      const userId = req.user!.id;

      const server = db.servers.findById(serverId);
      if (!server) {
        res.status(404).json({ error: 'Servidor não encontrado.' });
        return;
      }

      if (server.owner_id === userId) {
        res.status(400).json({ error: 'O dono não pode sair do próprio servidor. Transfira a posse ou delete-o.' });
        return;
      }

      db.serverMembers.delete(serverId, userId);
      res.json({ success: true, message: 'Você saiu do servidor.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao sair do servidor.' });
    }
  }
};
