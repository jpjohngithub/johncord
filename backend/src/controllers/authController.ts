import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db';
import { generateToken, AuthRequest } from '../middlewares/auth';
import { User } from '../types';

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
        return;
      }

      const existingUser = db.users.findByEmail(email);
      if (existingUser) {
        res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
        return;
      }

      const tag = Math.floor(1000 + Math.random() * 9000).toString();
      const password_hash = bcrypt.hashSync(password, 10);
      const avatar_url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`;

      const newUser: User = {
        id: uuidv4(),
        username: username.trim(),
        tag,
        email: email.trim().toLowerCase(),
        avatar_url,
        banner_url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=600&auto=format&fit=crop&q=80',
        bio: 'Novo membro do Johncord! 🎉',
        custom_status: '',
        presence: 'online',
        created_at: new Date().toISOString()
      };

      db.users.insert(newUser);

      // Auto-join Johncord Oficial server if exists
      const officialServer = db.servers.find(s => s.invite_code === 'johncord-oficial');
      if (officialServer) {
        db.serverMembers.insert({
          id: uuidv4(),
          server_id: officialServer.id,
          user_id: newUser.id,
          nickname: newUser.username,
          joined_at: new Date().toISOString()
        });
        const memberRole = db.roles.getByServer(officialServer.id).find(r => r.name.includes('Membros'));
        if (memberRole) {
          db.roles.assignRole(officialServer.id, newUser.id, memberRole.id);
        }
      }

      const token = generateToken(newUser);
      res.status(201).json({ user: newUser, token });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao registrar usuário.' });
    }
  },

  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: 'Informe e-mail e senha.' });
        return;
      }

      const user = db.users.findByEmail(email);
      if (!user) {
        res.status(400).json({ error: 'Credenciais inválidas.' });
        return;
      }

      // Demo users check or normal password compare
      const isMatch = (user.email === 'dev@johncord.gg' && password === '123456') ||
                      (user.email === 'bot@johncord.gg' && password === '123456') ||
                      (user.email === 'ana@johncord.gg' && password === '123456') ||
                      (user.email === 'lucas@johncord.gg' && password === '123456') ||
                      bcrypt.compareSync(password, (user as any).password_hash || bcrypt.hashSync('123456', 10));

      if (!isMatch) {
        res.status(400).json({ error: 'Credenciais inválidas.' });
        return;
      }

      const token = generateToken(user);
      res.json({ user, token });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao realizar login.' });
    }
  },

  async quickGuest(req: Request, res: Response): Promise<void> {
    try {
      const randomNames = ['CyberGamer', 'ShadowDev', 'PixelQueen', 'StarWalker', 'VortexPilot', 'SonicWave', 'NeonRider'];
      const chosenName = randomNames[Math.floor(Math.random() * randomNames.length)] + Math.floor(Math.random() * 100);
      const tag = Math.floor(1000 + Math.random() * 9000).toString();
      const email = `guest_${Date.now()}@johncord.local`;
      const avatar_url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(chosenName)}`;

      const guestUser: User = {
        id: uuidv4(),
        username: chosenName,
        tag,
        email,
        avatar_url,
        banner_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
        bio: 'Entrou como convidado rápido no Johncord!',
        custom_status: 'Explorando o Johncord 🚀',
        presence: 'online',
        created_at: new Date().toISOString()
      };

      db.users.insert(guestUser);

      // Auto-join Johncord Oficial
      const officialServer = db.servers.find(s => s.invite_code === 'johncord-oficial');
      if (officialServer) {
        db.serverMembers.insert({
          id: uuidv4(),
          server_id: officialServer.id,
          user_id: guestUser.id,
          nickname: guestUser.username,
          joined_at: new Date().toISOString()
        });
        const memberRole = db.roles.getByServer(officialServer.id).find(r => r.name.includes('Membros'));
        if (memberRole) {
          db.roles.assignRole(officialServer.id, guestUser.id, memberRole.id);
        }
      }

      const token = generateToken(guestUser);
      res.status(201).json({ user: guestUser, token });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao criar convidado.' });
    }
  },

  async getMe(req: AuthRequest, res: Response): Promise<void> {
    try {
      const user = req.user!;
      res.json({ user });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao carregar usuário.' });
    }
  },

  async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { username, avatar_url, banner_url, bio, custom_status, presence } = req.body;

      const updates: Partial<User> = {};
      if (username) updates.username = username.trim();
      if (avatar_url !== undefined) updates.avatar_url = avatar_url;
      if (banner_url !== undefined) updates.banner_url = banner_url;
      if (bio !== undefined) updates.bio = bio;
      if (custom_status !== undefined) updates.custom_status = custom_status;
      if (presence !== undefined) updates.presence = presence;

      const updatedUser = db.users.update(user.id, updates);
      res.json({ user: updatedUser });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao atualizar perfil.' });
    }
  }
};
