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
  return { id: u.id, username: u.username, color: u.color, status: byUser.has(id) ? 'online' : 'offline' };
}
function serversOf(userId) {
  return Object.values(db.servers)
    .filter(s => s.members.includes(userId))
    .map(s => ({
      id: s.id, name: s.name, icon: s.icon, owner: s.owner,
      permanent: !!s.permanent, inviteCode: s.inviteCode,
      channels: s.channels
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
    states[v.serverId][v.channelId].push({ ...getUserPublic(uid2), muted: !!v.muted });
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

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server: http.createServer((req, res) => {
  // Servir arquivos estáticos
  let p = req.url.split('?')[0];
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
}).listen(PORT, () => console.log(`JohnCord rodando em http://localhost:${PORT}`)) });

wss.on('connection', (ws) => {
  let me = null;

  ws.on('message', (raw) => {
    let d;
    try { d = JSON.parse(raw); } catch (e) { return; }

    // ----- Auth -----
    if (d.t === 'register') {
      const name = String(d.username || '').trim();
      if (name.length < 2 || name.length > 20) return send(ws, { t: 'authErr', error: 'Nome deve ter entre 2 e 20 caracteres.' });
      if (Object.values(db.users).some(u => u.username.toLowerCase() === name.toLowerCase()))
        return send(ws, { t: 'authErr', error: 'Este nome já está em uso.' });
      if (!d.password || String(d.password).length < 4) return send(ws, { t: 'authErr', error: 'Senha deve ter pelo menos 4 caracteres.' });
      const salt = crypto.randomBytes(8).toString('hex');
      const colors = ['#5865f2','#eb459e','#3ba55c','#faa61a','#ed4245','#00a8fc','#9b59b6'];
      const user = {
        id: uid(), username: name,
        salt, passHash: hash(d.password, salt),
        color: colors[Math.floor(Math.random() * colors.length)],
        friends: []
      };
      db.users[user.id] = user;
      db.servers[GENERAL_ID].members.push(user.id);
      save();
      login(user);
      send(ws, { t: 'authOk', boot: bootPayload() });
      return;
    }
    if (d.t === 'login') {
      const user = Object.values(db.users).find(u => u.username.toLowerCase() === String(d.username || '').toLowerCase());
      if (!user || hash(d.password, user.salt) !== user.passHash)
        return send(ws, { t: 'authErr', error: 'Usuário ou senha incorretos.' });
      login(user);
      send(ws, { t: 'authOk', boot: bootPayload() });
      return;
    }

    if (!me) return;

    // ----- Mensagens -----
    if (d.t === 'msg') {
      const srv = db.servers[d.serverId];
      if (!srv || !srv.members.includes(me.id)) return;
      const ch = srv.channels.find(c => c.id === d.channelId);
      if (!ch || ch.type !== 'text') return;
      if (!ch.messages) ch.messages = [];
      const content = String(d.content || '').slice(0, 2000).trim();
      if (!content) return;
      const msg = { id: uid(), userId: me.id, username: me.username, color: me.color, content, ts: Date.now() };
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
      const content = String(d.content || '').slice(0, 2000).trim();
      if (!content) return;
      const msg = { id: uid(), userId: me.id, username: me.username, color: me.color, content, ts: Date.now() };
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

    // ----- Servidores / grupos -----
    if (d.t === 'createServer') {
      const name = String(d.name || '').trim().slice(0, 30);
      if (name.length < 2) return send(ws, { t: 'err', error: 'Nome muito curto.' });
      const srv = {
        id: uid(), name, icon: name[0].toUpperCase(),
        owner: me.id, inviteCode: uid().slice(0, 8),
        members: [me.id],
        channels: [{ id: uid(), name: 'geral', type: 'text', messages: [] }, { id: uid(), name: 'Geral', type: 'voice' }]
      };
      db.servers[srv.id] = srv;
      save();
      sendTo(me.id, { t: 'servers', servers: serversOf(me.id), openServer: srv.id });
      return;
    }
    if (d.t === 'createChannel') {
      const srv = db.servers[d.serverId];
      if (!srv || srv.owner !== me.id) return;
      const name = String(d.name || '').trim().toLowerCase().replace(/[^a-z0-9áàâãéêíóôõúç\- ]/gi, '').slice(0, 25);
      if (!name) return;
      const type = d.type === 'voice' ? 'voice' : 'text';
      const ch = { id: uid(), name: type === 'voice' ? String(d.name || name).slice(0, 25) : name, type, messages: [] };
      srv.channels.push(ch);
      save();
      pushServerToMembers(srv);
      return;
    }
    if (d.t === 'deleteChannel') {
      const srv = db.servers[d.serverId];
      if (!srv || srv.owner !== me.id) return;
      srv.channels = srv.channels.filter(c => c.id !== d.channelId || c.id.startsWith('geral'));
      save();
      pushServerToMembers(srv);
      return;
    }
    if (d.t === 'leaveServer') {
      const srv = db.servers[d.serverId];
      if (!srv || srv.permanent || srv.owner === me.id) return;
      srv.members = srv.members.filter(m => m !== me.id);
      save();
      sendTo(me.id, { t: 'servers', servers: serversOf(me.id) });
      return;
    }
    if (d.t === 'joinInvite') {
      const code = String(d.code || '').trim();
      const srv = Object.values(db.servers).find(s => s.inviteCode === code);
      if (!srv) return send(ws, { t: 'err', error: 'Convite inválido ou expirado.' });
      if (!srv.members.includes(me.id)) { srv.members.push(me.id); save(); }
      pushServerToMembers(srv);
      sendTo(me.id, { t: 'servers', servers: serversOf(me.id), openServer: srv.id });
      return;
    }
    if (d.t === 'regenerateInvite') {
      const srv = db.servers[d.serverId];
      if (!srv || srv.owner !== me.id) return;
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
      send(ws, { t: 'members', serverId: srv.id, members: srv.members.map(getUserPublic).filter(Boolean) });
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

    // ----- Amigos -----
    if (d.t === 'addFriend') {
      const target = Object.values(db.users).find(u => u.username.toLowerCase() === String(d.username || '').trim().toLowerCase());
      if (!target) return send(ws, { t: 'err', error: 'Usuário não encontrado.' });
      if (target.id === me.id) return send(ws, { t: 'err', error: 'Você não pode se adicionar.' });
      if (!me.friends.includes(target.id)) me.friends.push(target.id);
      if (!target.friends.includes(me.id)) target.friends.push(me.id);
      save();
      sendTo(me.id, { t: 'friends', friends: me.friends.map(getUserPublic).filter(Boolean) });
      sendTo(target.id, { t: 'friends', friends: target.friends.map(getUserPublic).filter(Boolean) });
      send(ws, { t: 'ok', info: `${target.username} agora é seu amigo!` });
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

    // ----- Voz (WebRTC signaling) -----
    if (d.t === 'voiceJoin') {
      const prev = voice.get(me.id);
      voice.set(me.id, { serverId: d.serverId, channelId: d.channelId, muted: false });
      const srv = db.servers[d.serverId];
      if (prev && (prev.serverId !== d.serverId || prev.channelId !== d.channelId)) {
        const psrv = db.servers[prev.serverId];
        if (psrv) sysMsg(prev.serverId, prev.channelId, `**${me.username}** saiu da call.`);
      }
      if (srv) sysMsg(d.serverId, d.channelId, `**${me.username}** entrou na call.`);
      broadcastVoiceStates();
      // informar quem já está na call para o novo
      const others = [...voice.entries()].filter(([u, v]) => v.channelId === d.channelId && v.serverId === d.serverId && u !== me.id).map(([u]) => u);
      send(ws, { t: 'voicePeers', peers: others });
      return;
    }
    if (d.t === 'voiceMute') {
      const v = voice.get(me.id);
      if (v) { v.muted = !!d.muted; broadcastVoiceStates(); }
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
    if (byUser.has(user.id)) { try { byUser.get(user.id).close(); } catch (e) {} }
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
      friends: me.friends.map(getUserPublic).filter(Boolean),
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
