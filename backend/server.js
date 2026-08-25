const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// ---------- Persistência ----------
let db = load();
function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { users: {}, servers: {}, dms: {}, dmIndex: {} };
  }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DB_FILE, JSON.stringify(db), () => {});
  }, 300);
}

function uid() { return crypto.randomBytes(8).toString('hex'); }
function hash(pass, salt) { return crypto.createHash('sha256').update(salt + pass).digest('hex'); }

// ---------- Servidor geral (todo mundo tem) ----------
const GENERAL_ID = 'geral';
if (!db.servers[GENERAL_ID]) {
  db.servers[GENERAL_ID] = {
    id: GENERAL_ID,
    name: 'JohnCord',
    icon: 'J',
    owner: null,
    permanent: true,
    inviteCode: null,
    members: [],
    channels: [
      { id: 'geral-chat', name: 'geral', type: 'text', messages: [] },
      { id: 'geral-voz', name: 'Geral', type: 'voice' }
    ]
  };
  save();
}

// ---------- Estado online ----------
const online = new Map();   // ws -> userId
const byUser = new Map();   // userId -> ws
const voice = new Map();    // userId -> {serverId, channelId, muted}
const typing = new Map();   // key `${serverId}:${channelId}:${userId}` -> timeout

// ---------- Helpers ----------
function getUserPublic(id) {
  const u = db.users[id];
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName || u.username,
    color: u.color || '#5865f2',
    bannerColor: u.bannerColor || '#5865f2',
    avatar: u.avatar || null,
    bio: u.bio || '',
    customStatus: u.customStatus || '',
    status: byUser.has(id) ? 'online' : 'offline'
  };
}
function hasServerPerm(serverId, userId, perm) {
  const srv = db.servers[serverId];
  if (!srv) return false;
  if (srv.owner === userId) return true;
  const uRoles = (srv.memberRoles && srv.memberRoles[userId]) || [];
  const roles = (srv.roles || []).filter(r => uRoles.includes(r.id));
  if (roles.some(r => r.isAdmin)) return true;
  if (perm && roles.some(r => r[perm])) return true;
  return false;
}

function serversOf(userId) {
  return Object.values(db.servers)
    .filter(s => s.members.includes(userId))
    .map(s => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      banner: s.banner || '#5865f2',
      owner: s.owner,
      permanent: !!s.permanent,
      inviteCode: s.inviteCode,
      channels: s.channels,
      roles: s.roles || [],
      memberRoles: s.memberRoles || {}
    }));
}
function dmKey(a, b) { return [a, b].sort().join('|'); }
function getDm(a, b) {
  const k = dmKey(a, b);
  if (!db.dmIndex[k]) {
    const id = uid();
    db.dmIndex[k] = id;
    db.dms[id] = { id, participants: [a, b], messages: [] };
    save();
  }
  return db.dms[db.dmIndex[k]];
}
function send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
function sendTo(userId, obj) { const ws = byUser.get(userId); if (ws) send(ws, obj); }
function broadcastUsers() {
  const list = [...byUser.keys()].map(getUserPublic);
  for (const ws of online.keys()) send(ws, { t: 'presence', users: list });
}
function broadcastVoiceStates(serverId) {
  const states = {};
  for (const [uid2, v] of voice) {
    if (!byUser.has(uid2)) continue;
    if (!states[v.serverId]) states[v.serverId] = {};
    if (!states[v.serverId][v.channelId]) states[v.serverId][v.channelId] = [];
    states[v.serverId][v.channelId].push({
      ...getUserPublic(uid2),
      muted: !!v.muted,
      deafened: !!v.deafened,
      screenSharing: !!v.screenSharing
    });
  }
  for (const ws of online.keys()) send(ws, { t: 'voiceState', states });
}
function pushServerToMembers(server) {
  for (const m of server.members) {
    sendTo(m, { t: 'servers', servers: serversOf(m) });
  }
}
function sysMsg(serverId, channelId, text) {
  const srv = db.servers[serverId];
  const ch = srv && srv.channels.find(c => c.id === channelId);
  if (!ch || ch.type !== 'text') return;
  if (!ch.messages) ch.messages = [];
  ch.messages.push({ id: uid(), system: true, content: text, ts: Date.now() });
  if (ch.messages.length > 500) ch.messages.splice(0, ch.messages.length - 500);
  save();
  for (const m of srv.members) sendTo(m, { t: 'msgNew', serverId, channelId, msg: ch.messages[ch.messages.length - 1] });
}

function makeFriends(a, b) {
  if (!a.friends) a.friends = [];
  if (!b.friends) b.friends = [];
  if (!a.friends.includes(b.id)) a.friends.push(b.id);
  if (!b.friends.includes(a.id)) b.friends.push(a.id);
  save();
  sendTo(a.id, { t: 'friends', friends: a.friends.map(getUserPublic).filter(Boolean), info: `${b.username} agora é seu amigo!` });
  sendTo(b.id, { t: 'friends', friends: b.friends.map(getUserPublic).filter(Boolean), info: `${a.username} agora é seu amigo!` });
}

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const httpServer = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-Filename');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let p = req.url.split('?')[0];

  // Rota de Health Check / Status
  if (p === '/api/status' || p === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, app: 'JohnCord Backend', version: '2.0', online: true, time: Date.now() }));
    return;
  }
  // Rota de Upload de Arquivos / Mídia
  if (req.method === 'POST' && p === '/api/upload') {
    const filenameHeader = req.headers['x-filename'] || 'arquivo_' + Date.now();
    let cleanFilename = 'arquivo';
    try {
      cleanFilename = decodeURIComponent(filenameHeader).replace(/[^a-zA-Z0-9._-]/g, '_');
    } catch (e) {
      cleanFilename = String(filenameHeader).replace(/[^a-zA-Z0-9._-]/g, '_');
    }
    const targetFilename = `${Date.now()}_${cleanFilename}`;
    const targetPath = path.join(UPLOADS_DIR, targetFilename);

    const writeStream = fs.createWriteStream(targetPath);
    req.pipe(writeStream);

    writeStream.on('finish', () => {
      const stats = fs.statSync(targetPath);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        url: `/uploads/${targetFilename}`,
        name: cleanFilename,
        size: stats.size
      }));
    });

    writeStream.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Erro ao salvar arquivo' }));
    });
    return;
  }

  // Rota para servir uploads com suporte a Range (streaming de vídeo e áudio)
  if (p.startsWith('/uploads/')) {
    const safePath = path.join(UPLOADS_DIR, path.basename(p));
    if (!fs.existsSync(safePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const stat = fs.statSync(safePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = path.extname(safePath).toLowerCase();
    const contentTypes = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.txt': 'text/plain'
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(safePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(safePath).pipe(res);
    }
    return;
  }

  // Servir arquivos estáticos
  if (p === '/') p = '/index.html';
  const file = path.join(FRONTEND_DIR, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!file.startsWith(FRONTEND_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({
  server: httpServer.listen(PORT, () => console.log(`JohnCord rodando em http://localhost:${PORT}`)),
  maxPayload: 100 * 1024 * 1024
});

wss.on('connection', (ws) => {
  let me = null;

  ws.on('message', (raw) => {
    let d;
    try { d = JSON.parse(raw); } catch (e) { return; }

    // ----- Auth -----
    if (d.t === 'register') {
      const name = String(d.username || '').trim();
      const pass = String(d.password || '');
      if (name.length < 2 || name.length > 20) return send(ws, { t: 'authErr', error: 'Nome deve ter entre 2 e 20 caracteres.' });
      if (Object.values(db.users).some(u => u.username.toLowerCase() === name.toLowerCase()))
        return send(ws, { t: 'authErr', error: 'Este nome de usuário já está em uso.' });
      if (!pass || pass.length < 4) return send(ws, { t: 'authErr', error: 'A senha deve ter pelo menos 4 caracteres.' });
      const salt = crypto.randomBytes(8).toString('hex');
      const colors = ['#5865f2','#eb459e','#3ba55c','#faa61a','#ed4245','#00a8fc','#9b59b6'];
      const user = {
        id: uid(), username: name,
        displayName: name,
        bio: '',
        bannerColor: '#5865f2',
        salt, passHash: hash(pass, salt),
        color: colors[Math.floor(Math.random() * colors.length)],
        friends: []
      };
      db.users[user.id] = user;
      if (!db.servers[GENERAL_ID].members.includes(user.id)) {
        db.servers[GENERAL_ID].members.push(user.id);
      }
      save();
      login(user);
      send(ws, { t: 'authOk', boot: bootPayload() });
      return;
    }
    if (d.t === 'login') {
      const name = String(d.username || '').trim();
      const pass = String(d.password || '');
      if (!name || !pass) return send(ws, { t: 'authErr', error: 'Preencha o nome de usuário e a senha.' });
      const user = Object.values(db.users).find(u => u.username.toLowerCase() === name.toLowerCase());
      if (!user) {
        return send(ws, { t: 'authErr', error: 'Conta não encontrada. Verifique o nome ou clique em "Criar conta".' });
      }
      if (hash(pass, user.salt) !== user.passHash) {
        return send(ws, { t: 'authErr', error: 'Senha incorreta para esta conta.' });
      }
      login(user);
      send(ws, { t: 'authOk', boot: bootPayload() });
      return;
    }

    if (!me) return;

    // ----- Perfil -----
    if (d.t === 'updateProfile') {
      const user = db.users[me.id];
      if (!user) return;
      if (d.displayName !== undefined) {
        const dn = String(d.displayName).trim();
        if (dn.length >= 1 && dn.length <= 32) user.displayName = dn;
      }
      if (d.bio !== undefined) user.bio = String(d.bio).slice(0, 200);
      if (d.bannerColor && typeof d.bannerColor === 'string') user.bannerColor = d.bannerColor.slice(0, 3000);
      if (d.color && typeof d.color === 'string') user.color = d.color.slice(0, 50);
      if (d.customStatus !== undefined) user.customStatus = String(d.customStatus).slice(0, 100);
      if (d.avatar !== undefined) user.avatar = String(d.avatar).slice(0, 3000);
      save();
      me = user;
      send(ws, { t: 'profileUpdated', user: getUserPublic(me.id) });
      broadcastUsers();
      return;
    }

    if (d.t === 'getProfile') {
      const u = getUserPublic(d.userId);
      if (u) send(ws, { t: 'userProfile', profile: u });
      return;
    }

    // ----- Mensagens -----
    if (d.t === 'msg') {
      const srv = db.servers[d.serverId];
      if (!srv || !srv.members.includes(me.id)) return;
      const ch = srv.channels.find(c => c.id === d.channelId);
      if (!ch || ch.type !== 'text') return;
      if (!ch.messages) ch.messages = [];
      const content = String(d.content || '').slice(0, 4000).trim();
      const attachment = d.attachment && typeof d.attachment === 'object' && d.attachment.url ? {
        type: ['image', 'video', 'audio', 'file'].includes(d.attachment.type) ? d.attachment.type : 'file',
        url: String(d.attachment.url),
        name: d.attachment.name ? String(d.attachment.name).slice(0, 150) : 'anexo',
        size: typeof d.attachment.size === 'number' ? d.attachment.size : 0,
        duration: typeof d.attachment.duration === 'number' ? d.attachment.duration : 0
      } : null;

      if (!content && !attachment) return;
      const msg = {
        id: uid(),
        userId: me.id,
        username: me.username,
        displayName: me.displayName || me.username,
        avatar: me.avatar || null,
        color: me.color,
        content,
        attachment,
        ts: Date.now()
      };
      ch.messages.push(msg);
      if (ch.messages.length > 500) ch.messages.splice(0, ch.messages.length - 500);
      save();
      for (const m of srv.members) sendTo(m, { t: 'msgNew', serverId: srv.id, channelId: ch.id, msg });
      return;
    }
    if (d.t === 'dm') {
      const target = db.users[d.userId];
      if (!target) return;
      const dm = getDm(me.id, target.id);
      const content = String(d.content || '').slice(0, 4000).trim();
      const attachment = d.attachment && typeof d.attachment === 'object' && d.attachment.url ? {
        type: ['image', 'video', 'audio', 'file'].includes(d.attachment.type) ? d.attachment.type : 'file',
        url: String(d.attachment.url),
        name: d.attachment.name ? String(d.attachment.name).slice(0, 150) : 'anexo',
        size: typeof d.attachment.size === 'number' ? d.attachment.size : 0,
        duration: typeof d.attachment.duration === 'number' ? d.attachment.duration : 0
      } : null;

      if (!content && !attachment) return;
      const msg = {
        id: uid(),
        userId: me.id,
        username: me.username,
        displayName: me.displayName || me.username,
        avatar: me.avatar || null,
        color: me.color,
        content,
        attachment,
        ts: Date.now()
      };
      dm.messages.push(msg);
      if (dm.messages.length > 500) dm.messages.splice(0, dm.messages.length - 500);
      save();
      [me.id, target.id].forEach(u => sendTo(u, { t: 'dmNew', dmId: dm.id, withUserId: u === me.id ? target.id : me.id, msg }));
      return;
    }
    if (d.t === 'typing') {
      const key = `${d.serverId}:${d.channelId}`;
      if (typing.has(`${key}:${me.id}`)) return;
      typing.set(`${key}:${me.id}`, setTimeout(() => typing.delete(`${key}:${me.id}`), 2500));
      const srv = db.servers[d.serverId];
      if (srv) for (const m of srv.members) if (m !== me.id) sendTo(m, { t: 'typing', serverId: d.serverId, channelId: d.channelId, username: me.username });
      return;
    }

    // ----- Servidores / grupos & Cargos -----
    if (d.t === 'createServer') {
      const name = String(d.name || '').trim().slice(0, 30);
      if (name.length < 2) return send(ws, { t: 'err', error: 'Nome muito curto.' });
      const icon = d.icon ? String(d.icon).slice(0, 3000) : name[0].toUpperCase();
      const banner = d.banner ? String(d.banner).slice(0, 3000) : '#5865f2';
      const isPublic = d.isPublic === true;
      const description = String(d.description || '').slice(0, 300).trim();
      
      const roleDono = {
        id: uid(),
        name: 'Dono 👑',
        color: '#faa61a',
        isAdmin: true,
        manageChannels: true,
        manageRoles: true,
        kickMembers: true,
        position: 1
      };
      const roleAdm = {
        id: uid(),
        name: 'Administrador 🛡️',
        color: '#ed4245',
        isAdmin: true,
        manageChannels: true,
        manageRoles: true,
        kickMembers: true,
        position: 2
      };
      const roleMember = {
        id: uid(),
        name: 'Membro ⭐',
        color: '#5865f2',
        isAdmin: false,
        manageChannels: false,
        manageRoles: false,
        kickMembers: false,
        position: 3
      };

      const srv = {
        id: uid(),
        name,
        icon,
        banner,
        isPublic,
        description,
        owner: me.id,
        inviteCode: uid().slice(0, 8),
        members: [me.id],
        channels: [
          { id: uid(), name: 'geral', type: 'text', messages: [] },
          { id: uid(), name: 'Geral', type: 'voice' }
        ],
        roles: [roleDono, roleAdm, roleMember],
        memberRoles: {
          [me.id]: [roleDono.id]
        }
      };
      db.servers[srv.id] = srv;
      save();
      sendTo(me.id, { t: 'servers', servers: serversOf(me.id), openServer: srv.id });
      return;
    }

    if (d.t === 'updateServer') {
      const srv = db.servers[d.serverId];
      if (!srv || !hasServerPerm(srv.id, me.id, 'manageServer')) return;
      if (d.name) srv.name = String(d.name).trim().slice(0, 30);
      if (d.icon) srv.icon = String(d.icon).slice(0, 3000);
      if (d.banner) srv.banner = String(d.banner).slice(0, 3000);
      if (d.isPublic !== undefined) srv.isPublic = !!d.isPublic;
      if (d.description !== undefined) srv.description = String(d.description).slice(0, 300).trim();
      save();
      pushServerToMembers(srv);
      return;
    }

    if (d.t === 'discoverServers') {
      const q = String(d.q || '').trim().toLowerCase();
      const publicServers = Object.values(db.servers).filter(s => {
        if (!s.isPublic && s.id !== 'geral') return false;
        if (!q) return true;
        const nameMatch = (s.name || '').toLowerCase().includes(q);
        const descMatch = (s.description || '').toLowerCase().includes(q);
        return nameMatch || descMatch;
      }).map(s => {
        const onlineCount = s.members.filter(mid => byUser.has(mid)).length;
        return {
          id: s.id,
          name: s.name,
          icon: s.icon,
          banner: s.banner || '#5865f2',
          description: s.description || (s.id === 'geral' ? 'Servidor comunitário oficial do JohnCord para conversar e fazer amigos!' : ''),
          isPublic: !!s.isPublic,
          memberCount: (s.members || []).length,
          onlineCount,
          isMember: (s.members || []).includes(me.id)
        };
      });
      send(ws, { t: 'discoverResults', servers: publicServers });
      return;
    }

    if (d.t === 'joinServerDirect') {
      const srv = db.servers[d.serverId];
      if (!srv || (!srv.isPublic && srv.id !== 'geral')) return send(ws, { t: 'err', error: 'Servidor não encontrado ou é privado.' });
      const isNewMember = !srv.members.includes(me.id);
      if (isNewMember) {
        srv.members.push(me.id);
        const memRole = (srv.roles || []).find(r => r.name.toLowerCase().includes('membro'));
        if (memRole) {
          if (!srv.memberRoles) srv.memberRoles = {};
          srv.memberRoles[me.id] = [memRole.id];
        }
        save();
      }
      sendTo(me.id, { t: 'servers', servers: serversOf(me.id), openServer: srv.id });
      for (const m of srv.members) {
        if (m !== me.id) sendTo(m, { t: 'servers', servers: serversOf(m) });
      }
      if (isNewMember && srv.channels && srv.channels[0]) {
        sysMsg(srv.id, srv.channels[0].id, `👋 **${me.username}** descobriu e entrou no servidor!`);
      }
      return;
    }

    if (d.t === 'deleteServer') {
      const srv = db.servers[d.serverId];
      if (!srv || srv.permanent || srv.owner !== me.id) return;
      const mems = [...srv.members];
      delete db.servers[srv.id];
      save();
      mems.forEach(m => sendTo(m, { t: 'servers', servers: serversOf(m) }));
      return;
    }

    // Cargos
    if (d.t === 'createRole') {
      const srv = db.servers[d.serverId];
      if (!srv || !hasServerPerm(srv.id, me.id, 'manageRoles')) return;
      const name = String(d.name || 'Novo Cargo').trim().slice(0, 25);
      const color = String(d.color || '#5865f2').slice(0, 20);
      if (!srv.roles) srv.roles = [];
      const newRole = {
        id: uid(),
        name,
        color,
        isAdmin: !!d.isAdmin,
        manageChannels: !!d.manageChannels,
        manageRoles: !!d.manageRoles,
        kickMembers: !!d.kickMembers,
        position: srv.roles.length + 1
      };
      srv.roles.push(newRole);
      save();
      pushServerToMembers(srv);
      return;
    }

    if (d.t === 'updateRole') {
      const srv = db.servers[d.serverId];
      if (!srv || !hasServerPerm(srv.id, me.id, 'manageRoles')) return;
      const role = (srv.roles || []).find(r => r.id === d.roleId);
      if (!role) return;
      if (d.name) role.name = String(d.name).trim().slice(0, 25);
      if (d.color) role.color = String(d.color).slice(0, 20);
      if (d.isAdmin !== undefined) role.isAdmin = !!d.isAdmin;
      if (d.manageChannels !== undefined) role.manageChannels = !!d.manageChannels;
      if (d.manageRoles !== undefined) role.manageRoles = !!d.manageRoles;
      if (d.kickMembers !== undefined) role.kickMembers = !!d.kickMembers;
      save();
      pushServerToMembers(srv);
      return;
    }

    if (d.t === 'deleteRole') {
      const srv = db.servers[d.serverId];
      if (!srv || !hasServerPerm(srv.id, me.id, 'manageRoles')) return;
      srv.roles = (srv.roles || []).filter(r => r.id !== d.roleId);
      if (srv.memberRoles) {
        for (const [uid2, rList] of Object.entries(srv.memberRoles)) {
          srv.memberRoles[uid2] = rList.filter(rid => rid !== d.roleId);
        }
      }
      save();
      pushServerToMembers(srv);
      return;
    }

    if (d.t === 'setMemberRoles') {
      const srv = db.servers[d.serverId];
      if (!srv || !hasServerPerm(srv.id, me.id, 'manageRoles')) return;
      if (!srv.memberRoles) srv.memberRoles = {};
      srv.memberRoles[d.targetUserId] = Array.isArray(d.roleIds) ? d.roleIds : [];
      save();
      pushServerToMembers(srv);
      return;
    }

    if (d.t === 'kickMember') {
      const srv = db.servers[d.serverId];
      if (!srv || !hasServerPerm(srv.id, me.id, 'kickMembers') || d.targetUserId === srv.owner) return;
      srv.members = srv.members.filter(m => m !== d.targetUserId);
      if (srv.memberRoles) delete srv.memberRoles[d.targetUserId];
      save();
      sendTo(d.targetUserId, { t: 'servers', servers: serversOf(d.targetUserId) });
      pushServerToMembers(srv);
      return;
    }

    if (d.t === 'createChannel') {
      const srv = db.servers[d.serverId];
      if (!srv || !hasServerPerm(srv.id, me.id, 'manageChannels')) return;
      const name = String(d.name || '').trim().toLowerCase().replace(/[^a-z0-9áàâãéêíóôõúç\- ]/gi, '').slice(0, 25);
      if (!name) return;
      const type = d.type === 'voice' ? 'voice' : 'text';
      const userLimit = type === 'voice' ? Math.max(0, parseInt(d.userLimit) || 0) : 0;
      const ch = {
        id: uid(),
        name: type === 'voice' ? String(d.name || name).slice(0, 25) : name,
        type,
        userLimit,
        messages: []
      };
      srv.channels.push(ch);
      save();
      pushServerToMembers(srv);
      return;
    }
    if (d.t === 'deleteChannel') {
      const srv = db.servers[d.serverId];
      if (!srv || !hasServerPerm(srv.id, me.id, 'manageChannels')) return;
      srv.channels = srv.channels.filter(c => c.id !== d.channelId || c.id.startsWith('geral'));
      save();
      pushServerToMembers(srv);
      return;
    }
    if (d.t === 'leaveServer') {
      const srv = db.servers[d.serverId];
      if (!srv || srv.permanent || srv.owner === me.id) return;
      srv.members = srv.members.filter(m => m !== me.id);
      if (srv.memberRoles) delete srv.memberRoles[me.id];
      save();
      sendTo(me.id, { t: 'servers', servers: serversOf(me.id) });
      pushServerToMembers(srv);
      return;
    }
    if (d.t === 'joinInvite') {
      const code = String(d.code || '').trim();
      const srv = Object.values(db.servers).find(s => s.inviteCode === code);
      if (!srv) return send(ws, { t: 'err', error: 'Convite inválido ou expirado.' });
      const isNewMember = !srv.members.includes(me.id);
      if (isNewMember) {
        srv.members.push(me.id);
        const memRole = (srv.roles || []).find(r => r.name.toLowerCase().includes('membro'));
        if (memRole) {
          if (!srv.memberRoles) srv.memberRoles = {};
          srv.memberRoles[me.id] = [memRole.id];
        }
        save();
      }
      sendTo(me.id, { t: 'servers', servers: serversOf(me.id), openServer: srv.id });
      for (const m of srv.members) {
        if (m !== me.id) sendTo(m, { t: 'servers', servers: serversOf(m) });
      }
      if (isNewMember && srv.channels && srv.channels[0]) {
        sysMsg(srv.id, srv.channels[0].id, `👋 **${me.username}** acabou de entrar no servidor!`);
      }
      return;
    }
    if (d.t === 'regenerateInvite') {
      const srv = db.servers[d.serverId];
      if (!srv || !hasServerPerm(srv.id, me.id, 'manageServer')) return;
      srv.inviteCode = uid().slice(0, 8);
      save();
      sendTo(me.id, { t: 'inviteUpdated', serverId: srv.id, inviteCode: srv.inviteCode });
      return;
    }

    // ----- Histórico / membros -----
    if (d.t === 'history') {
      const srv = db.servers[d.serverId];
      if (!srv || !srv.members.includes(me.id)) return;
      const ch = srv.channels.find(c => c.id === d.channelId);
      if (!ch || ch.type !== 'text') return;
      send(ws, { t: 'history', serverId: srv.id, channelId: ch.id, msgs: ch.messages.slice(-100) });
      return;
    }
    if (d.t === 'members') {
      const srv = db.servers[d.serverId];
      if (!srv || !srv.members.includes(me.id)) return;
      const mems = srv.members.map(mid => {
        const pub = getUserPublic(mid);
        if (!pub) return null;
        const rIds = (srv.memberRoles && srv.memberRoles[mid]) || [];
        const userRoles = (srv.roles || []).filter(r => rIds.includes(r.id));
        return {
          ...pub,
          roles: userRoles
        };
      }).filter(Boolean);
      send(ws, { t: 'members', serverId: srv.id, members: mems, roles: srv.roles || [], memberRoles: srv.memberRoles || {} });
      return;
    }
    if (d.t === 'dmHistory') {
      const dm = db.dms[d.dmId];
      if (!dm || !dm.participants.includes(me.id)) return;
      send(ws, { t: 'dmHistory', dmId: dm.id, msgs: dm.messages.slice(-100) });
      return;
    }

    if (d.t === 'openDm') {
      const target = db.users[d.userId];
      if (!target) return;
      const dm = getDm(me.id, target.id);
      send(ws, { t: 'dmOpened', dm: { id: dm.id, user: getUserPublic(target.id), msgs: dm.messages.slice(-100) } });
      return;
    }

    // ----- Amigos (com solicitacao) -----
    if (d.t === 'friendReq') {
      const cleanU = String(d.username || '').trim().toLowerCase().replace(/^@/, '');
      if (!cleanU) return send(ws, { t: 'err', error: 'Informe o nome do usuário.' });
      const target = Object.values(db.users).find(u => u.username.toLowerCase() === cleanU || (u.displayName && u.displayName.toLowerCase() === cleanU));
      if (!target) return send(ws, { t: 'err', error: 'Usuário não encontrado.' });
      if (target.id === me.id) return send(ws, { t: 'err', error: 'Você não pode adicionar a si mesmo.' });
      if ((me.friends || []).includes(target.id)) return send(ws, { t: 'err', error: `Vocês já são amigos.` });
      if (!target.friendRequests) target.friendRequests = [];
      if (target.friendRequests.includes(me.id)) return send(ws, { t: 'ok', info: 'Solicitação já enviada. Aguarde a pessoa aceitar.' });
      if ((target.friendRequests || []).length > 50) return send(ws, { t: 'err', error: 'Esta pessoa tem muitas solicitações pendentes.' });
      
      // se a outra pessoa ja me enviou pedido, aceita direto
      const reverseIdx = (me.friendRequests || []).indexOf(target.id);
      if (reverseIdx !== -1) {
        me.friendRequests.splice(reverseIdx, 1);
        makeFriends(me, target);
        sendTo(me.id, { t: 'requests', requests: (me.friendRequests || []).map(getUserPublic).filter(Boolean) });
        return;
      }
      target.friendRequests.push(me.id);
      save();
      sendTo(target.id, { t: 'friendRequest', from: getUserPublic(me.id), requests: target.friendRequests.map(getUserPublic).filter(Boolean) });
      send(ws, { t: 'ok', info: `Solicitação de amizade enviada para ${target.displayName || target.username}!` });
      return;
    }
    if (d.t === 'friendAccept') {
      if (!me.friendRequests) me.friendRequests = [];
      const idx = me.friendRequests.indexOf(d.userId);
      if (idx === -1) return send(ws, { t: 'err', error: 'Solicitação não encontrada.' });
      me.friendRequests.splice(idx, 1);
      const other = db.users[d.userId];
      if (!other) return;
      makeFriends(me, other);
      sendTo(me.id, { t: 'requests', requests: me.friendRequests.map(getUserPublic).filter(Boolean) });
      return;
    }
    if (d.t === 'friendReject') {
      if (!me.friendRequests) me.friendRequests = [];
      me.friendRequests = me.friendRequests.filter(id => id !== d.userId);
      save();
      sendTo(me.id, { t: 'requests', requests: me.friendRequests.map(getUserPublic).filter(Boolean) });
      return;
    }
    if (d.t === 'searchUsers') {
      const q = String(d.q || '').trim().toLowerCase().replace(/^@/, '');
      if (q.length < 1) return send(ws, { t: 'searchResults', results: [] });
      const results = Object.values(db.users)
        .filter(u => u.id !== me.id && (u.username.toLowerCase().includes(q) || (u.displayName && u.displayName.toLowerCase().includes(q))))
        .slice(0, 10)
        .map(u => {
          let relation = 'none';
          if ((me.friends || []).includes(u.id)) relation = 'friend';
          else if ((me.friendRequests || []).includes(u.id)) relation = 'incoming';
          else if ((u.friendRequests || []).includes(me.id)) relation = 'sent';
          return { ...getUserPublic(u.id), relation };
        });
      send(ws, { t: 'searchResults', results });
      return;
    }
    if (d.t === 'removeFriend') {
      me.friends = me.friends.filter(f => f !== d.userId);
      const other = db.users[d.userId];
      if (other) other.friends = other.friends.filter(f => f !== me.id);
      save();
      sendTo(me.id, { t: 'friends', friends: me.friends.map(getUserPublic).filter(Boolean) });
      return;
    }

    // ----- Relay para call privada (apenas entre amigos) -----
    if (d.t === 'relay') {
      const target = db.users[d.to];
      if (!target || !(me.friends || []).includes(target.id)) return;
      sendTo(d.to, { t: 'relayed', from: me.id, payload: d.payload });
      return;
    }

    // ----- Voz (WebRTC signaling) -----
    if (d.t === 'voiceJoin') {
      const srv = db.servers[d.serverId];
      if (srv && d.serverId !== 'dm') {
        const ch = (srv.channels || []).find(c => c.id === d.channelId);
        if (ch && ch.userLimit && ch.userLimit > 0) {
          const currentCount = [...voice.entries()].filter(([u, v]) => v.serverId === d.serverId && v.channelId === d.channelId && u !== me.id).length;
          if (currentCount >= ch.userLimit && srv.owner !== me.id) {
            return send(ws, { t: 'err', error: `Esta sala de voz está lotada (limite máximo de ${ch.userLimit} participantes).` });
          }
        }
      }

      const prev = voice.get(me.id);
      voice.set(me.id, { serverId: d.serverId, channelId: d.channelId, muted: false });
      if (prev && (prev.serverId !== d.serverId || prev.channelId !== d.channelId)) {
        const psrv = db.servers[prev.serverId];
        if (psrv) sysMsg(prev.serverId, prev.channelId, `**${me.username}** saiu da call.`);
      }
      if (srv) sysMsg(d.serverId, d.channelId, `**${me.username}** entrou na call.`);

      // Se for chamada privada de DM, avisa o outro participante se ele ainda não estiver na call
      if (d.serverId === 'dm') {
        const dm = db.dms[d.channelId];
        if (dm && dm.participants && dm.participants.includes(me.id)) {
          const otherId = dm.participants.find(p => p !== me.id);
          const otherVoice = voice.get(otherId);
          if (!otherVoice || otherVoice.serverId !== 'dm' || otherVoice.channelId !== d.channelId) {
            sendTo(otherId, {
              t: 'dmCallIncoming',
              dmId: dm.id,
              fromUser: getUserPublic(me.id)
            });
          }
        }
      }

      broadcastVoiceStates();
      // informar quem já está na call para o novo
      const others = [...voice.entries()].filter(([u, v]) => v.channelId === d.channelId && v.serverId === d.serverId && u !== me.id).map(([u]) => u);
      send(ws, { t: 'voicePeers', peers: others });
      return;
    }
    if (d.t === 'dmCallDecline') {
      const dm = db.dms[d.dmId];
      if (dm && dm.participants && dm.participants.includes(me.id)) {
        const otherId = dm.participants.find(p => p !== me.id);
        sendTo(otherId, {
          t: 'dmCallDeclined',
          dmId: dm.id,
          fromUser: getUserPublic(me.id)
        });
      }
      return;
    }
    if (d.t === 'voiceMute') {
      const v = voice.get(me.id);
      if (v) { v.muted = !!d.muted; broadcastVoiceStates(); }
      return;
    }
    if (d.t === 'voiceDeafen') {
      const v = voice.get(me.id);
      if (v) {
        v.deafened = !!d.deafened;
        if (v.deafened) v.muted = true;
        broadcastVoiceStates();
      }
      return;
    }
    if (d.t === 'voiceScreen') {
      const v = voice.get(me.id);
      if (v) { v.screenSharing = !!d.screenSharing; broadcastVoiceStates(); }
      return;
    }
    // Fallback de audio: retransmite o microfone pelo servidor quando o WebRTC
    // P2P nao conecta (NATs restritos / redes diferentes sem TURN)
    if (d.t === 'voiceRelay') {
      const mine = voice.get(me.id);
      if (!mine) return;
      const target = voice.get(d.to);
      if (!target || target.serverId !== mine.serverId || target.channelId !== mine.channelId) return;
      if (typeof d.audio !== 'string' || d.audio.length > 400000) return;
      sendTo(d.to, { t: 'voiceRelay', from: me.id, audio: d.audio });
      return;
    }
    if (d.t === 'voiceSpeaking') {
      const v = voice.get(me.id);
      if (v) {
        const roomPeers = [...voice.entries()]
          .filter(([u, vInfo]) => vInfo.channelId === v.channelId && vInfo.serverId === v.serverId && u !== me.id)
          .map(([u]) => u);
        roomPeers.forEach(pid => {
          sendTo(pid, { t: 'voiceSpeaking', userId: me.id, speaking: !!d.speaking });
        });
      }
      return;
    }
    if (d.t === 'voiceLeave') {
      leaveVoice();
      return;
    }
    if (d.t === 'signal') {
      sendTo(d.to, { t: 'signal', from: me.id, data: d.data });
      return;
    }
  });

  function login(user) {
    me = user;
    online.set(ws, user.id);
    if (byUser.has(user.id)) {
      const old = byUser.get(user.id);
      send(old, { t: 'sessionReplaced' });
      try { old.close(); } catch (e) {}
    }
    byUser.set(user.id, ws);
    broadcastUsers();
  }

  function leaveVoice() {
    const v = voice.get(me && me.id);
    if (!v) return;
    voice.delete(me.id);
    sysMsg(v.serverId, v.channelId, `**${me.username}** saiu da call.`);
    broadcastVoiceStates();
  }

  function bootPayload() {
    return {
      user: getUserPublic(me.id),
      servers: serversOf(me.id),
      friends: (me.friends || []).map(getUserPublic).filter(Boolean),
      requests: (me.friendRequests || []).map(getUserPublic).filter(Boolean),
      dmList: buildDmList(me.id)
    };
  }

  ws.on('close', () => {
    if (me) {
      leaveVoice();
      online.delete(ws);
      byUser.delete(me.id);
      setTimeout(() => { if (!byUser.has(me.id)) broadcastUsers(); }, 500);
      broadcastUsers();
    }
  });
});

function buildDmList(userId) {
  const u = db.users[userId];
  const keys = new Set();
  Object.values(db.dms).forEach(dm => {
    if (dm.participants.includes(userId)) keys.add(dmKey(dm.participants[0], dm.participants[1]));
  });
  u.friends.forEach(f => keys.add(dmKey(userId, f)));
  return [...keys].map(k => {
    const [a, b] = k.split('|');
    const other = a === userId ? b : a;
    const dm = getDm(userId, other);
    return { dmId: dm.id, user: getUserPublic(other) };
  }).filter(x => x.user);
}
