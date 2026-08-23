/* ============ JohnCord - Cliente ============ */
'use strict';

const DEFAULT_SERVERS = [
  'https://johncord-backend.onrender.com',
  'https://johncord.onrender.com',
  'https://johncord-2-0.onrender.com'
];

let candidateIndex = 0;

function getCandidateUrls() {
  const custom = localStorage.getItem('johncord_backend');
  const fromConfig = window.JOHNCORD_BACKEND;
  const list = [];
  if (custom && custom.trim()) list.push(custom.trim().replace(/\/+$/, ''));
  if (fromConfig && fromConfig.trim()) list.push(fromConfig.trim().replace(/\/+$/, ''));
  
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    if (location.port && location.port !== '3000') {
      list.push(`${location.protocol}//${location.hostname}:3000`);
    } else {
      list.push(location.origin);
    }
  }

  DEFAULT_SERVERS.forEach(url => {
    if (!list.includes(url)) list.push(url);
  });

  return list;
}

function getBackendUrl() {
  const candidates = getCandidateUrls();
  return candidates[candidateIndex % candidates.length] || '';
}

function getWsUrl() {
  const backend = getBackendUrl();
  if (backend) {
    return backend.replace(/^http/, 'ws');
  }
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
}

let ws = null;
let lastAuth = null;
let reconnectTimer = null;

const S = {
  user: null,
  servers: [],
  friends: [],
  dmList: [],
  view: 'home',            // 'home' | serverId
  channelId: 'geral-chat',
  dmId: null,
  homeTab: 'friends',
  dms: {},                 // dmId -> {messages:[]}
  channelCache: {},        // `${serverId}:${channelId}` -> msgs
  members: [],
  voice: null,             // {serverId, channelId}
  voiceStates: {},
  muted: false,
  deafened: false,
  screenSharing: false,
  userVolumes: {},
  lastAuthor: null,
  lastTs: 0,
};

const $ = id => document.getElementById(id);

function updateServerBadge(status, text) {
  const dot = $('statusDot');
  const txt = $('statusText');
  if (dot) dot.className = 'dot-indicator ' + status;
  if (txt) txt.textContent = text;
}

function triggerWakeUp(httpUrl) {
  if (!httpUrl || !httpUrl.startsWith('http')) return;
  try {
    fetch(httpUrl, { mode: 'no-cors' }).catch(() => {});
  } catch (e) {}
}

/* ---------- WebSocket ---------- */
function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  clearTimeout(reconnectTimer);
  const targetWs = getWsUrl();
  const backendUrl = getBackendUrl();
  const displayHost = backendUrl ? backendUrl.replace(/^https?:\/\//, '') : location.host;
  
  updateServerBadge('connecting', `Conectando em ${displayHost}...`);
  triggerWakeUp(backendUrl);

  try {
    ws = new WebSocket(targetWs);
  } catch (err) {
    updateServerBadge('connecting', 'Tentando conectar ao servidor...');
    rotateCandidateAndRetry();
    return;
  }

  const connTimeout = setTimeout(() => {
    if (ws && ws.readyState === WebSocket.CONNECTING) {
      updateServerBadge('connecting', 'Acordando servidor na nuvem (Render)...');
    }
  }, 2500);

  ws.onopen = () => {
    clearTimeout(connTimeout);
    updateServerBadge('connected', `Conectado: ${displayHost}`);
    if (lastAuth) send(lastAuth);
  };

  ws.onmessage = e => {
    try {
      handle(JSON.parse(e.data));
    } catch (err) {
      console.error('Erro ao processar mensagem:', err);
    }
  };

  ws.onerror = () => {
    clearTimeout(connTimeout);
    updateServerBadge('connecting', 'Tentando reconectar...');
  };

  ws.onclose = () => {
    clearTimeout(connTimeout);
    updateServerBadge('connecting', 'Reconectando ao servidor...');
    if (S.user) toast('Conexão perdida. Reconectando...');
    rotateCandidateAndRetry();
  };
}

function rotateCandidateAndRetry() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    candidateIndex++;
    connect();
  }, 2500);
}

function send(o) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); }

function handle(d) {
  switch (d.t) {
    case 'authOk': onAuthOk(d.boot); break;
    case 'authErr': showAuthError(d.error); break;
    case 'err': toast('⚠ ' + d.error); break;
    case 'ok': toast('✓ ' + d.info); break;
    case 'servers':
      S.servers = d.servers;
      renderRail();
      renderSidebar();
      if (d.openServer) openServer(d.openServer);
      break;
    case 'presence':
      S.presence = d.users;
      (S.friends || []).forEach(f => {
        const u = d.users.find(x => x.id === f.id);
        if (u) f.status = u.status;
      });
      S.dmList.forEach(dm => {
        const u = d.users.find(x => x.id === dm.user.id);
        if (u) dm.user.status = u.status;
      });
      refreshMembersIfOpen();
      if (S.view === 'home' && !S.dmId && S.homeTab === 'friends') { $('messages').innerHTML = ''; renderFriendsView(); }
      break;
    case 'msgNew':
      cacheMsg(`${d.serverId}:${d.channelId}`, d.msg);
      if (S.view === d.serverId && S.channelId === d.channelId) appendMsg(d.msg);
      break;
    case 'dmNew':
      if (!S.dms[d.dmId]) S.dms[d.dmId] = { messages: [] };
      S.dms[d.dmId].messages.push(d.msg);
      if (S.view === 'home' && (S.dmId === d.dmId || S.dmId === 'user:' + d.msg.userId)) {
        if (S.dmId !== d.dmId) { ensureDmInList(d.withUserId, d.dmId); S.dmId = d.dmId; renderSidebar(); renderHeader(); }
        renderDmMessages();
      } else {
        toast(`💬 Nova mensagem de ${d.msg.username}`);
      }
      ensureDmInList(d.withUserId, d.dmId);
      break;
    case 'dmOpened':
      S.dms[d.dm.id] = { messages: d.dm.msgs };
      const idx = S.dmList.findIndex(x => x.dmId === 'user:' + d.dm.user.id);
      if (idx >= 0) S.dmList.splice(idx, 1, { dmId: d.dm.id, user: d.dm.user });
      else ensureDmInList(d.dm.user.id, d.dm.id);
      S.view = 'home';
      S.dmId = d.dm.id;
      S.lastAuthor = null;
      renderSidebar(); renderHeader();
      $('memberList').innerHTML = '';
      renderDmMessages();
      break;
    case 'history':
      S.channelCache[`${d.serverId}:${d.channelId}`] = d.msgs;
      if (S.view === d.serverId && S.channelId === d.channelId) renderMessages();
      break;
    case 'dmHistory':
      if (!S.dms[d.dmId]) S.dms[d.dmId] = {};
      S.dms[d.dmId].messages = d.msgs;
      if (S.view === 'home' && S.dmId === d.dmId) renderDmMessages();
      break;
    case 'members':
      if (S.view === d.serverId) { S.members = d.members; renderMemberList(); }
      break;
    case 'typing':
      if (S.view === d.serverId && S.channelId === d.channelId)
        $('typingIndicator').textContent = `✍ ${d.username} está digitando...`;
      clearTimeout(handle._t);
      handle._t = setTimeout(() => $('typingIndicator').textContent = '', 2500);
      break;
    case 'friends':
      S.friends = d.friends; renderSidebar();
      break;
    case 'inviteUpdated': {
      const srv = S.servers.find(s => s.id === d.serverId);
      if (srv) srv.inviteCode = d.inviteCode;
      break;
    }
    case 'voiceState':
      S.voiceStates = d.states;
      renderSidebar();
      renderVoiceRoom();
      syncVoicePeers();
      break;
    case 'voicePeers':
      d.peers.forEach(pid => getPeer(pid, true));
      break;
    case 'signal': handleSignal(d.from, d.data); break;
  }
}

/* ---------- Auth ---------- */
$('btnLogin').onclick = () => auth('login');
$('btnRegister').onclick = () => auth('register');
$('authUser').onkeydown = e => { if (e.key === 'Enter') $('authPass').focus(); };
$('authPass').onkeydown = e => { if (e.key === 'Enter') auth('login'); };
if ($('btnConfigServer')) $('btnConfigServer').onclick = modalServerSettings;

function auth(mode) {
  hideAuthError();
  const user = $('authUser').value.trim();
  const pass = $('authPass').value;
  if (!user || !pass) {
    showAuthError('Informe o nome de usuário e a senha.');
    return;
  }
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    const isRemote = !location.hostname.includes('localhost') && !location.hostname.includes('127.0.0.1');
    if (isRemote && !getBackendUrl()) {
      showAuthError('Servidor não conectado! Configure a URL do backend nas configurações.');
      modalServerSettings();
      return;
    }
    showAuthError('Conectando ao servidor... Aguarde alguns instantes e tente novamente.');
    connect();
    return;
  }
  lastAuth = { t: mode, username: user, password: pass };
  send(lastAuth);
}
function showAuthError(m) { $('authError').textContent = m; $('authError').style.display = 'block'; }
function hideAuthError() { $('authError').style.display = 'none'; }

const pendingJoin = new URLSearchParams(location.search).get('join');

function onAuthOk(boot) {
  S.user = boot.user;
  S.servers = boot.servers;
  S.friends = boot.friends;
  S.dmList = boot.dmList;
  $('authScreen').style.display = 'none';
  $('app').style.display = 'flex';
  $('myName').textContent = S.user.username;
  $('myStatus').textContent = 'Online';
  setAvatar($('myAvatar'), S.user);
  renderRail();
  renderSidebar();
  if (pendingJoin) {
    history.replaceState(null, '', '/');
    send({ t: 'joinInvite', code: pendingJoin });
  } else {
    openServer('geral');
  }
}

/* ---------- Navegação ---------- */
function openServer(id) {
  S.view = id;
  const srv = S.servers.find(s => s.id === id);
  if (!srv) return;
  const firstText = srv.channels.find(c => c.type === 'text');
  S.channelId = id === 'geral' ? 'geral-chat' : (firstText ? firstText.id : null);
  S.dmId = null;
  
  if ($('chatView')) $('chatView').style.display = 'flex';
  if ($('voiceRoomView')) $('voiceRoomView').style.display = 'none';

  renderRail();
  renderSidebar();
  renderHeader();
  requestHistory();
  send({ t: 'members', serverId: id });
}

function openChannel(chId) {
  S.channelId = chId;
  S.lastAuthor = null;
  const srv = currentServer();
  const ch = srv && srv.channels.find(c => c.id === chId);

  if (ch && ch.type === 'voice') {
    // ABA DEDICADA DA CALL / TRANSMISSÃO
    if ($('chatView')) $('chatView').style.display = 'none';
    if ($('voiceRoomView')) $('voiceRoomView').style.display = 'flex';
    if (!S.voice || S.voice.channelId !== chId || S.voice.serverId !== srv.id) {
      joinVoice(srv.id, chId);
    }
    renderVoiceRoom();
  } else {
    // ABA DE CHAT DE TEXTO
    if ($('chatView')) $('chatView').style.display = 'flex';
    if ($('voiceRoomView')) $('voiceRoomView').style.display = 'none';
    requestHistory();
  }

  renderSidebar();
  renderHeader();
}

function openVoiceRoomView() {
  if (!S.voice) return;
  S.view = S.voice.serverId;
  S.channelId = S.voice.channelId;
  if ($('chatView')) $('chatView').style.display = 'none';
  if ($('voiceRoomView')) $('voiceRoomView').style.display = 'flex';
  renderSidebar();
  renderHeader();
  renderVoiceRoom();
}

function openHome() {
  S.view = 'home';
  S.dmId = null;
  if ($('chatView')) $('chatView').style.display = 'flex';
  if ($('voiceRoomView')) $('voiceRoomView').style.display = 'none';
  renderRail();
  renderSidebar();
  renderHeader();
  renderHomeMain();
}

function openDm(dmId) {
  S.view = 'home';
  S.dmId = dmId;
  S.lastAuthor = null;
  if ($('chatView')) $('chatView').style.display = 'flex';
  if ($('voiceRoomView')) $('voiceRoomView').style.display = 'none';
  renderSidebar(); renderHeader(); renderHomeMain();
  if (!S.dms[dmId] || !S.dms[dmId].messages) {
    S.dms[dmId] = S.dms[dmId] || {};
    send({ t: 'dmHistory', dmId });
  } else renderDmMessages();
}

function currentServer() { return S.servers.find(s => s.id === S.view); }

/* ---------- Render ---------- */
function setAvatar(el, user) {
  el.textContent = (user.username || '?')[0].toUpperCase();
  el.style.background = user.color || '#5865f2';
}

function renderRail() {
  const list = $('serverList');
  list.innerHTML = '';
  $('btnHome').classList.toggle('active', S.view === 'home');
  S.servers.forEach(srv => {
    const div = document.createElement('div');
    div.className = 'server-icon' + (srv.permanent ? ' permanent' : '') + (S.view === srv.id ? ' active' : '');
    div.title = srv.name;
    div.innerHTML = `<span class="pill"></span>${srv.icon}`;
    div.onclick = () => openServer(srv.id);
    list.appendChild(div);
  });
}

function renderSidebar() {
  const body = $('channelView');
  const header = $('sidebarHeader');
  body.innerHTML = '';

  if (S.view === 'home') {
    header.textContent = 'Mensagens diretas';
    const tabs = document.createElement('div');
    tabs.className = 'home-tabs';
    [['friends', '👥 Amigos'], ['add', '➕ Adicionar']].forEach(([k, label]) => {
      const b = document.createElement('button');
      b.className = 'home-tab' + (S.homeTab === k ? ' active' : '');
      b.textContent = label;
      b.onclick = () => { S.homeTab = k; renderSidebar(); renderHomeMain(); };
      tabs.appendChild(b);
    });
    body.appendChild(tabs);

    if (S.homeTab === 'friends') {
      const sec = document.createElement('div');
      sec.className = 'sidebar-section';
      sec.innerHTML = `<span>Mensagens diretas</span>`;
      body.appendChild(sec);
      S.dmList.forEach(dm => {
        const item = document.createElement('div');
        item.className = 'chan-item' + (S.dmId === dm.dmId ? ' active' : '');
        item.innerHTML = `<span>@</span><span>${esc(dm.user.username)}</span>`;
        item.onclick = () => openDm(dm.dmId);
        body.appendChild(item);
      });
    }
    return;
  }

  const srv = currentServer();
  if (!srv) return;
  header.textContent = srv.name;

  let sec = document.createElement('div');
  sec.className = 'sidebar-section';
  sec.innerHTML = `<span>Canais de texto</span>` +
    (srv.owner === S.user.id ? `<button title="Criar canal de texto">＋</button>` : '');
  if (sec.querySelector('button')) sec.querySelector('button').onclick = () => modalCreateChannel('text');
  body.appendChild(sec);
  srv.channels.filter(c => c.type === 'text').forEach(ch => {
    const item = document.createElement('div');
    item.className = 'chan-item' + (S.channelId === ch.id ? ' active' : '');
    const del = srv.owner === S.user.id && !ch.id.startsWith('geral')
      ? `<span class="chan-del" title="Excluir">✕</span>` : '';
    item.innerHTML = `<span class="chan-hash">#</span><span>${esc(ch.name)}</span>${del}`;
    item.onclick = e => {
      if (e.target.classList.contains('chan-del')) {
        if (confirm(`Excluir #${ch.name}?`)) send({ t: 'deleteChannel', serverId: srv.id, channelId: ch.id });
        return;
      }
      openChannel(ch.id);
    };
    body.appendChild(item);
  });

  sec = document.createElement('div');
  sec.className = 'sidebar-section';
  sec.innerHTML = `<span>Canais de voz</span>` +
    (srv.owner === S.user.id ? `<button title="Criar canal de voz">＋</button>` : '');
  if (sec.querySelector('button')) sec.querySelector('button').onclick = () => modalCreateChannel('voice');
  body.appendChild(sec);
  srv.channels.filter(c => c.type === 'voice').forEach(ch => {
    const inThis = S.voice && S.voice.serverId === srv.id && S.voice.channelId === ch.id;
    const item = document.createElement('div');
    item.className = 'chan-item' + (inThis ? ' active' : '');
    item.innerHTML = `🔊 <span>${esc(ch.name)}</span>`;
    item.onclick = () => joinVoice(srv.id, ch.id);
    body.appendChild(item);

    const users = ((S.voiceStates[srv.id] || {})[ch.id]) || [];
    if (users.length) {
      const wrap = document.createElement('div');
      wrap.className = 'voice-users';
      users.forEach(u => {
        const vu = document.createElement('div');
        const isMuted = u.muted;
        const isDeaf = u.deafened;
        const isLive = u.screenSharing;
        vu.className = 'voice-user' + (isMuted ? ' muted' : '') + (isDeaf ? ' deafened' : '');
        const liveBadge = isLive ? `<span class="badge-live">AO VIVO</span>` : '';
        const stateIcon = isDeaf ? '🎧' : (isMuted ? '🔇' : '');
        const isMe = S.user && u.id === S.user.id;
        const volBtn = !isMe ? `<button class="vu-btn" title="Ajustar Volume">🔊</button>` : '';

        vu.innerHTML = `<span class="dot"></span><span class="vu-name">${esc(u.username)}</span><span class="vu-actions">${liveBadge}${stateIcon}${volBtn}</span>`;
        const b = vu.querySelector('.vu-btn');
        if (b) b.onclick = e => { e.stopPropagation(); openVolumeModal(u.id, u.username); };
        wrap.appendChild(vu);
      });
      body.appendChild(wrap);
    }
  });
}

function renderHeader() {
  if (S.view === 'home') {
    if (S.dmId) {
      const dm = S.dmList.find(x => x.dmId === S.dmId);
      $('chanIcon').textContent = '@';
      $('chanName').textContent = dm ? dm.user.username : 'DM';
      $('btnInvite').style.display = 'none';
      $('btnMembers').style.display = 'none';
    } else {
      $('chanIcon').textContent = '👥';
      $('chanName').textContent = 'Amigos';
      $('btnInvite').style.display = 'none';
      $('btnMembers').style.display = 'none';
    }
    return;
  }
  const srv = currentServer();
  const ch = srv && srv.channels.find(c => c.id === S.channelId);
  $('chanIcon').textContent = ch && ch.type === 'voice' ? '🔊' : '#';
  $('chanName').textContent = ch ? ch.name : srv ? srv.name : '';
  $('btnInvite').style.display = srv && !srv.permanent ? '' : 'none';
  $('btnMembers').style.display = '';
}

function requestHistory() {
  if (S.view !== 'home' && S.channelId) send({ t: 'history', serverId: S.view, channelId: S.channelId });
}

function renderMessages() {
  const box = $('messages');
  box.innerHTML = '';
  S.lastAuthor = null;
  const key = `${S.view}:${S.channelId}`;
  (S.channelCache[key] || []).forEach(m => appendMsg(m));
  scrollBottom();
}

function renderDmMessages() {
  const box = $('messages');
  box.innerHTML = '';
  S.lastAuthor = null;
  const dm = S.dms[S.dmId];
  (dm && dm.messages || []).forEach(appendMsg);
  scrollBottom();
}

function fmtTime(ts) {
  const dt = new Date(ts);
  return `Hoje às ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function appendMsg(m) {
  const box = $('messages');
  if (m.system) {
    const div = document.createElement('div');
    div.className = 'msg-system';
    div.innerHTML = mdLite(m.content);
    box.appendChild(div);
    scrollBottom();
    return;
  }
  const grouped = m.userId === S.lastAuthor && (m.ts - S.lastTs) < 5 * 60 * 1000;
  S.lastAuthor = m.userId; S.lastTs = m.ts;
  if (!grouped) {
    const g = document.createElement('div');
    g.className = 'msg-group';
    const av = document.createElement('div');
    av.className = 'm-avatar';
    av.style.background = m.color;
    av.textContent = (m.username || '?')[0].toUpperCase();
    const content = document.createElement('div');
    content.className = 'msg-content';
    content.innerHTML = `
      <div class="msg-header">
        <span class="msg-author" style="color:${m.color}">${esc(m.username)}</span>
        <span class="msg-time">${fmtTime(m.ts)}</span>
      </div>
      <div class="msg-text">${mdLite(m.content)}</div>`;
    g.appendChild(av); g.appendChild(content);
    box.appendChild(g);
  } else {
    const last = box.querySelector('.msg-group:last-child .msg-content');
    if (last) {
      const t = document.createElement('div');
      t.className = 'msg-text';
      t.innerHTML = mdLite(m.content);
      last.appendChild(t);
    }
  }
  scrollBottom();
}

function scrollBottom() {
  const box = $('messages');
  box.scrollTop = box.scrollHeight;
}

function cacheMsg(key, msg) {
  if (!S.channelCache[key]) S.channelCache[key] = [];
  S.channelCache[key].push(msg);
  if (S.channelCache[key].length > 200) S.channelCache[key].shift();
}

function refreshMembersIfOpen() {
  if (S.view !== 'home') send({ t: 'members', serverId: S.view });
}

function renderMemberList() {
  const ml = $('memberList');
  ml.innerHTML = '';
  const onlineU = S.members.filter(m => m.status === 'online');
  const offlineU = S.members.filter(m => m.status === 'offline');
  if (onlineU.length) {
    const c = document.createElement('div');
    c.className = 'member-cat'; c.textContent = `Online — ${onlineU.length}`;
    ml.appendChild(c);
    onlineU.forEach(m => ml.appendChild(memberItem(m)));
  }
  if (offlineU.length) {
    const c = document.createElement('div');
    c.className = 'member-cat'; c.textContent = `Offline — ${offlineU.length}`;
    ml.appendChild(c);
    offlineU.forEach(m => ml.appendChild(memberItem(m)));
  }
}
function memberItem(m) {
  const div = document.createElement('div');
  div.className = 'member-item' + (m.status === 'offline' ? ' offline' : '') + (m.id !== S.user.id ? ' clickable' : '');
  const av = document.createElement('div');
  av.className = 'user-avatar'; av.style.width = av.style.height = '32px';
  setAvatar(av, m);
  const nm = document.createElement('span');
  nm.className = 'name'; nm.textContent = m.username; nm.style.color = m.color;
  div.appendChild(av); div.appendChild(nm);
  if (m.id !== S.user.id) div.onclick = () => startDmWith(m.id);
  return div;
}

function ensureDmInList(userId, dmId) {
  if (!S.dmList.find(x => x.dmId === dmId)) {
    const u = (S.presence || []).find(u => u.id === userId) ||
              S.friends.find(f => f.id === userId) || { id: userId, username: userId, color: '#5865f2' };
    S.dmList.push({ dmId, user: u });
    renderSidebar();
  }
}

function startDmWith(userId) {
  send({ t: 'openDm', userId });
}

function renderHomeMain() {
  $('memberList').innerHTML = '';
  if (S.dmId) {
    renderDmMessages();
    return;
  }
  const box = $('messages');
  box.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-dim)">Selecione uma conversa ou adicione amigos!</div>';
  if (S.homeTab === 'add') renderAddFriendView();
  else renderFriendsView();
}

function renderFriendsView() {
  const box = $('messages');
  const wrap = document.createElement('div');
  wrap.style.padding = '20px';
  if (!S.friends.length) {
    wrap.innerHTML = '<p style="color:var(--text-dim)">Nenhum amigo ainda. Use "Adicionar" para encontrar pessoas pelo nome!</p>';
  }
  S.friends.forEach(f => {
    const div = document.createElement('div');
    div.className = 'friend-item';
    const av = document.createElement('div'); av.className = 'user-avatar'; setAvatar(av, f);
    const info = document.createElement('div'); info.className = 'fname';
    info.innerHTML = `${esc(f.username)}<span class="fst">${f.status === 'online' ? '🟢 Online' : '⚫ Offline'}</span>`;
    const acts = document.createElement('div'); acts.className = 'friend-actions';
    const msgBtn = document.createElement('button');
    msgBtn.className = 'btn btn-small btn-primary'; msgBtn.textContent = '💬 Mensagem';
    msgBtn.onclick = () => startDmWith(f.id);
    const rmBtn = document.createElement('button');
    rmBtn.className = 'btn btn-small btn-danger'; rmBtn.textContent = 'Remover';
    rmBtn.onclick = () => { if (confirm(`Remover ${f.username}?`)) send({ t: 'removeFriend', userId: f.id }); };
    acts.appendChild(msgBtn); acts.appendChild(rmBtn);
    div.appendChild(av); div.appendChild(info); div.appendChild(acts);
    wrap.appendChild(div);
  });
  box.appendChild(wrap);
}

function renderAddFriendView() {
  const box = $('messages');
  const wrap = document.createElement('div');
  wrap.style.padding = '20px'; wrap.style.maxWidth = '500px';
  wrap.innerHTML = `
    <h3 style="color:var(--header)">Adicionar amigo</h3>
    <p style="color:var(--text-dim);margin:8px 0 14px">Digite o nome exato do usuário.</p>`;
  const input = document.createElement('input');
  input.className = 'input'; input.placeholder = 'Nome do usuário';
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary'; btn.textContent = 'Enviar solicitação';
  btn.style.marginTop = '10px';
  btn.onclick = () => {
    if (!input.value.trim()) return;
    send({ t: 'addFriend', username: input.value.trim() });
    input.value = '';
  };
  input.onkeydown = e => { if (e.key === 'Enter') btn.click(); };
  wrap.appendChild(input); wrap.appendChild(document.createElement('br')); wrap.appendChild(btn);
  box.appendChild(wrap);
}

/* ---------- Envio ---------- */
$('btnSend').onclick = sendCurrent;
$('msgInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrent(); }
});
$('msgInput').addEventListener('input', () => {
  if (S.view !== 'home' && S.channelId) send({ t: 'typing', serverId: S.view, channelId: S.channelId });
});

function sendCurrent() {
  const val = $('msgInput').value.trim();
  if (!val) return;
  $('msgInput').value = '';
  if (S.view === 'home' && S.dmId) {
    const entry = S.dmList.find(x => x.dmId === S.dmId);
    if (!entry) return;
    send({ t: 'dm', userId: entry.user.id, content: val });
  } else if (S.channelId) {
    send({ t: 'msg', serverId: S.view, channelId: S.channelId, content: val });
  }
}

/* ---------- Modais ---------- */
function openModal(html) {
  $('modalBox').innerHTML = html;
  $('modalOverlay').style.display = 'flex';
}
function closeModal() { $('modalOverlay').style.display = 'none'; }
$('modalOverlay').onclick = e => { if (e.target === $('modalOverlay')) closeModal(); };

$('btnAddServer').onclick = () => {
  openModal(`
    <h2>Crie seu servidor</h2>
    <p>Seu servidor é onde você conversa com seus amigos. Crie um e convide quem quiser com um link!</p>
    <input class="input" id="mSrvName" placeholder="Nome do servidor" maxlength="30">
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="joinByCodeModal()">Já tenho um convite</button>
      <button class="btn btn-primary" id="mCreate">Criar</button>
    </div>`);
  $('mCreate').onclick = () => {
    const name = $('mSrvName').value.trim();
    if (name.length >= 2) { send({ t: 'createServer', name }); closeModal(); }
  };
  $('mSrvName').focus();
};

window.joinByCodeModal = function () {
  openModal(`
    <h2>Entrar em um servidor</h2>
    <p>Digite o código do convite que você recebeu.</p>
    <input class="input" id="mCode" placeholder="Ex: ab12cd34">
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('btnAddServer').click()">Voltar</button>
      <button class="btn btn-primary" id="mJoin">Entrar</button>
    </div>`);
  $('mJoin').onclick = () => {
    const code = $('mCode').value.trim();
    if (code) { send({ t: 'joinInvite', code }); closeModal(); }
  };
};

$('btnInvite').onclick = () => {
  const srv = currentServer();
  if (!srv || srv.permanent) return;
  const url = `${location.origin}/?join=${srv.inviteCode}`;
  openModal(`
    <h2>Convidar pessoas para ${esc(srv.name)}</h2>
    <p>Envie este link para qualquer pessoa. Quem clicar entra automaticamente!</p>
    <div class="invite-link">${url}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="mRegen">🔄 Gerar novo link</button>
      <button class="btn btn-primary" id="mCopy">📋 Copiar link</button>
    </div>`);
  $('mCopy').onclick = () => {
    navigator.clipboard.writeText(url).then(() => toast('Link copiado!')).catch(() => {});
  };
  $('mRegen').onclick = () => {
    send({ t: 'regenerateInvite', serverId: srv.id });
    closeModal();
  };
};

function modalCreateChannel(type) {
  const isVoice = type === 'voice';
  openModal(`
    <h2>Criar canal de ${isVoice ? 'voz' : 'texto'}</h2>
    <input class="input" id="mChName" placeholder="${isVoice ? 'Nome do canal (ex: Call 2)' : 'nome-do-canal'}" maxlength="25">
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="mChGo">Criar canal</button>
    </div>`);
  $('mChGo').onclick = () => {
    const name = $('mChName').value.trim();
    if (name) { send({ t: 'createChannel', serverId: S.view, name, type }); closeModal(); }
  };
}

/* ---------- Botões do usuário ---------- */
$('btnHome').onclick = openHome;
$('btnMembers').onclick = () => {
  const ml = $('memberList');
  ml.style.display = ml.style.display === 'none' ? '' : 'none';
};
$('btnMute').onclick = toggleMute;
if ($('btnDeafen')) $('btnDeafen').onclick = toggleDeafen;
$('btnDisconnectVoice').onclick = leaveVoice;
if ($('btnSettings')) $('btnSettings').onclick = modalServerSettings;

function modalServerSettings() {
  const current = getBackendUrl() || '';
  openModal(`
    <h2>⚙️ Configuração do Servidor</h2>
    <p>Para o site funcionar hospedado na <strong>Netlify</strong>, informe a URL do backend hospedado no <strong>Render</strong> (ou outro servidor Node.js).</p>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:6px;font-weight:600">URL DO BACKEND (HTTP / HTTPS):</label>
      <input class="input" id="mBackendUrl" placeholder="https://johncord-backend.onrender.com" value="${esc(current)}">
    </div>
    <div style="font-size:12px;color:var(--text-dim);margin-bottom:14px;line-height:1.4">
      💡 <em>Dica:</em> Se estiver rodando o servidor e o site juntos (localmente), deixe o campo vazio.
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="mSaveBackend">Salvar e Conectar</button>
    </div>`);

  $('mSaveBackend').onclick = () => {
    const val = $('mBackendUrl').value.trim();
    if (val) {
      localStorage.setItem('johncord_backend', val);
    } else {
      localStorage.removeItem('johncord_backend');
    }
    closeModal();
    toast('Configuração salva! Reconectando...');
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    connect();
  };
  $('mBackendUrl').focus();
}

/* ---------- Controle de Volume Individual ---------- */
function getUserVolume(userId) {
  if (S.userVolumes[userId] !== undefined) return S.userVolumes[userId];
  const saved = localStorage.getItem('jc_vol_' + userId);
  const val = saved !== null ? Number(saved) : 100;
  S.userVolumes[userId] = val;
  return val;
}

function setUserVolume(userId, vol) {
  const val = Math.max(0, Math.min(200, Number(vol)));
  S.userVolumes[userId] = val;
  localStorage.setItem('jc_vol_' + userId, String(val));
  const audio = document.getElementById('audio-' + userId);
  if (audio) audio.volume = S.deafened ? 0 : Math.min(1, val / 100);
  const video = document.getElementById('video-' + userId);
  if (video) video.volume = S.deafened ? 0 : Math.min(1, val / 100);
  renderVoiceRoom();
}

function openVolumeModal(userId, username) {
  const current = getUserVolume(userId);
  openModal(`
    <h2>🔊 Volume do Usuário</h2>
    <p>Ajuste o volume individual de <strong>${esc(username)}</strong> na call:</p>
    <div class="volume-slider-box">
      <div class="volume-slider-header">
        <span>Volume de Usuário</span>
        <span id="volValText" style="color:var(--blurple)">${current}%</span>
      </div>
      <input type="range" class="volume-slider" id="volRange" min="0" max="200" value="${current}">
    </div>
    <div class="modal-actions" style="margin-top:16px">
      <button class="btn btn-ghost" id="mResetVol">Resetar (100%)</button>
      <button class="btn btn-primary" onclick="closeModal()">Pronto</button>
    </div>
  `);
  $('volRange').oninput = e => {
    const val = e.target.value;
    $('volValText').textContent = val + '%';
    setUserVolume(userId, val);
  };
  $('mResetVol').onclick = () => {
    $('volRange').value = 100;
    $('volValText').textContent = '100%';
    setUserVolume(userId, 100);
  };
}

/* ---------- Voz / WebRTC / Compartilhamento de Tela ---------- */
let localStream = null;
let screenStream = null;
const peers = {};   // userId -> RTCPeerConnection

async function joinVoice(serverId, channelId) {
  try {
    if (!localStream) localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    S.voice = { serverId, channelId };
    S.muted = false;
    S.deafened = false;
    S.screenSharing = false;
    updateVoiceButtons();
    updateVoiceBar(serverId, channelId);
    renderVoiceRoom();
    send({ t: 'voiceJoin', serverId, channelId });
  } catch (e) {
    toast('⚠ Microfone bloqueado! Permita o acesso ao microfone no navegador.');
  }
}

function leaveVoice() {
  stopScreenShare(false);
  Object.values(peers).forEach(pc => pc.close());
  for (const k of Object.keys(peers)) delete peers[k];
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (S.voice) { send({ t: 'voiceLeave' }); S.voice = null; }
  S.muted = false;
  S.deafened = false;
  S.screenSharing = false;
  updateVoiceButtons();
  updateVoiceBar(null);
  renderVoiceRoom();
}

function toggleMute() {
  if (S.deafened) {
    toggleDeafen();
    return;
  }
  S.muted = !S.muted;
  if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !S.muted);
  send({ t: 'voiceMute', muted: S.muted });
  updateVoiceButtons();
  updateVoiceBar(S.voice ? S.voice.serverId : null, S.voice ? S.voice.channelId : null);
  renderVoiceRoom();
}

function toggleDeafen() {
  S.deafened = !S.deafened;
  if (S.deafened) {
    S.muted = true;
    if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = false);
    document.querySelectorAll('audio.remote-audio, video.remote-video').forEach(el => el.muted = true);
    toast('🔇 Ensurdecido: áudio geral silenciado.');
  } else {
    document.querySelectorAll('audio.remote-audio, video.remote-video').forEach(el => {
      el.muted = false;
      const uid = el.id.replace(/^(audio|video)-/, '');
      const vol = getUserVolume(uid);
      el.volume = Math.min(1, vol / 100);
    });
    toast('🎧 Áudio ativado.');
  }
  send({ t: 'voiceDeafen', deafened: S.deafened });
  send({ t: 'voiceMute', muted: S.muted });
  updateVoiceButtons();
  updateVoiceBar(S.voice ? S.voice.serverId : null, S.voice ? S.voice.channelId : null);
  renderVoiceRoom();
}

function updateVoiceButtons() {
  const btnMute = $('btnMute');
  const btnDeafen = $('btnDeafen');
  if (btnMute) {
    btnMute.textContent = S.muted ? '🔇' : '🎤';
    btnMute.classList.toggle('active-red', S.muted);
  }
  if (btnDeafen) {
    btnDeafen.textContent = S.deafened ? '🔇🎧' : '🎧';
    btnDeafen.classList.toggle('active-red', S.deafened);
  }
}

async function toggleScreenShare() {
  if (!S.voice) {
    toast('Entre em um canal de voz para compartilhar sua tela!');
    return;
  }
  if (S.screenSharing) {
    stopScreenShare(true);
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: true
    });
    S.screenSharing = true;
    send({ t: 'voiceScreen', screenSharing: true });

    for (const [pid, pc] of Object.entries(peers)) {
      screenStream.getTracks().forEach(t => pc.addTrack(t, screenStream));
      createOffer(pc, pid);
    }

    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare(true);
    };

    updateVoiceBar(S.voice.serverId, S.voice.channelId);
    renderVoiceRoom();
    toast('🖥️ Compartilhamento de tela iniciado!');
  } catch (err) {
    if (err.name !== 'NotAllowedError') {
      toast('⚠ Não foi possível iniciar o compartilhamento de tela.');
    }
  }
}

function stopScreenShare(notify = true) {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  if (S.screenSharing) {
    S.screenSharing = false;
    if (notify) send({ t: 'voiceScreen', screenSharing: false });
    for (const [pid, pc] of Object.entries(peers)) {
      createOffer(pc, pid);
    }
    if (S.voice) updateVoiceBar(S.voice.serverId, S.voice.channelId);
    renderVoiceRoom();
    toast('🛑 Compartilhamento de tela finalizado.');
  }
}

function toggleFullscreen(element) {
  if (!element) return;
  if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement) {
    if (element.requestFullscreen) {
      element.requestFullscreen().catch(() => {});
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}

function updateVoiceBar(serverId, channelId) {
  const old = document.querySelector('.call-bar');
  if (old) old.remove();
  $('btnDisconnectVoice').style.display = S.voice ? '' : 'none';
  if (!S.voice) return;
  const srv = S.servers.find(s => s.id === serverId);
  const ch = srv && srv.channels.find(c => c.id === channelId);
  const bar = document.createElement('div');
  bar.className = 'call-bar';
  bar.innerHTML = `
    <div class="call-info" style="cursor:pointer" id="cbInfo" title="Clique para abrir a tela da call">🔊 Conectado — ${esc(srv ? srv.name : '')} / ${esc(ch ? ch.name : channelId || '')}</div>
    <div class="call-btns">
      <button class="call-btn${S.muted ? ' on' : ''}" id="cbMute">${S.muted ? '🔇 Mudo' : '🎙️ Falando'}</button>
      <button class="call-btn${S.deafened ? ' on' : ''}" id="cbDeafen">${S.deafened ? '🔇🎧 Ensurdecido' : '🎧 Ouvindo'}</button>
      <button class="call-btn${S.screenSharing ? ' live' : ''}" id="cbScreen">${S.screenSharing ? '🛑 Parar Tela' : '🖥️ Tela'}</button>
      <button class="call-btn danger" id="cbLeave">📞 Sair</button>
    </div>`;
  $('userPanel').parentNode.insertBefore(bar, $('userPanel'));
  $('cbInfo').onclick = openVoiceRoomView;
  $('cbMute').onclick = toggleMute;
  $('cbDeafen').onclick = toggleDeafen;
  $('cbScreen').onclick = toggleScreenShare;
  $('cbLeave').onclick = leaveVoice;
}

function updateVoiceControls() {
  const btnM = $('vrBtnMute');
  const btnD = $('vrBtnDeafen');
  const btnS = $('vrBtnScreen');
  if (btnM) {
    btnM.textContent = S.muted ? '🔇 Microfone Mutado' : '🎤 Microfone Ativo';
    btnM.classList.toggle('on', S.muted);
  }
  if (btnD) {
    btnD.textContent = S.deafened ? '🔇🎧 Ensurdecido' : '🎧 Áudio Ativo';
    btnD.classList.toggle('on', S.deafened);
  }
  if (btnS) {
    btnS.textContent = S.screenSharing ? '🛑 Parar Transmissão' : '🖥️ Compartilhar Tela';
    btnS.classList.toggle('live', S.screenSharing);
  }
}

if ($('vrBtnMute')) $('vrBtnMute').onclick = toggleMute;
if ($('vrBtnDeafen')) $('vrBtnDeafen').onclick = toggleDeafen;
if ($('vrBtnScreen')) $('vrBtnScreen').onclick = toggleScreenShare;
if ($('vrBtnChat')) {
  $('vrBtnChat').onclick = () => {
    const srv = currentServer();
    const firstText = srv ? srv.channels.find(c => c.type === 'text') : null;
    if (firstText) openChannel(firstText.id);
    else {
      if ($('chatView')) $('chatView').style.display = 'flex';
      if ($('voiceRoomView')) $('voiceRoomView').style.display = 'none';
    }
  };
}
if ($('vrBtnLeave')) $('vrBtnLeave').onclick = leaveVoice;

function renderVoiceRoom() {
  const stage = $('voiceRoomStage');
  if (!stage) return;
  
  const currentCh = currentServer()?.channels?.find(c => c.id === S.channelId);
  const isVoiceTab = currentCh && currentCh.type === 'voice';

  if (!isVoiceTab && !S.voice) {
    stage.innerHTML = '';
    return;
  }

  const srvId = S.voice ? S.voice.serverId : S.view;
  const chId = S.voice ? S.voice.channelId : S.channelId;
  const users = ((S.voiceStates[srvId] || {})[chId]) || [];

  const hasAnyScreen = S.screenSharing || users.some(u => u.screenSharing);

  const grid = document.createElement('div');
  grid.className = 'vr-grid' + (hasAnyScreen ? ' has-screen' : '');

  // Card do Usuário Local
  const myTile = document.createElement('div');
  myTile.className = 'vr-tile' + (S.screenSharing ? ' is-screen' : '');
  
  if (S.screenSharing && screenStream) {
    const v = document.createElement('video');
    v.autoplay = true;
    v.muted = true;
    v.playsInline = true;
    v.srcObject = screenStream;
    v.title = "Clique duplo para Tela Cheia";
    v.ondblclick = () => toggleFullscreen(v);
    myTile.appendChild(v);
    const hint = document.createElement('div');
    hint.className = 'fullscreen-hint';
    hint.textContent = '⛶ Duplo clique para Tela Cheia';
    myTile.appendChild(hint);
  } else {
    myTile.innerHTML = `
      <div class="vr-tile-avatar">
        <div class="user-avatar" style="background:${S.user?.color || '#5865f2'}">${(S.user?.username || '?')[0].toUpperCase()}</div>
        <span style="font-weight:600;font-size:15px;color:var(--header)">${esc(S.user?.username || 'Você')}</span>
      </div>
    `;
  }

  const myOverlay = document.createElement('div');
  myOverlay.className = 'vr-tile-overlay';
  myOverlay.innerHTML = `
    <span>${esc(S.user?.username || 'Você')} (Você)${S.screenSharing ? ' <span class="badge-live">AO VIVO</span>' : ''}</span>
    <div class="vr-actions">
      <span>${S.deafened ? '🎧🔇' : (S.muted ? '🔇' : '🎙️')}</span>
      ${S.screenSharing ? `<button class="vr-action-btn" id="myFsBtn" title="Tela Cheia">⛶ Tela Cheia</button>` : ''}
    </div>
  `;
  const myFs = myOverlay.querySelector('#myFsBtn');
  if (myFs) {
    myFs.onclick = (e) => {
      e.stopPropagation();
      const vid = myTile.querySelector('video');
      if (vid) toggleFullscreen(vid);
    };
  }
  myTile.appendChild(myOverlay);
  grid.appendChild(myTile);

  // Cards dos Outros Usuários na Call
  users.filter(u => u.id !== S.user?.id).forEach(u => {
    const tile = document.createElement('div');
    tile.className = 'vr-tile' + (u.screenSharing ? ' is-screen' : '');
    const remoteVid = document.getElementById('video-' + u.id);

    if (u.screenSharing && remoteVid && remoteVid.srcObject) {
      const v = document.createElement('video');
      v.autoplay = true;
      v.playsInline = true;
      v.srcObject = remoteVid.srcObject;
      v.title = "Clique duplo para Tela Cheia";
      v.ondblclick = () => toggleFullscreen(v);
      tile.appendChild(v);
      const hint = document.createElement('div');
      hint.className = 'fullscreen-hint';
      hint.textContent = '⛶ Duplo clique para Tela Cheia';
      tile.appendChild(hint);
    } else {
      tile.innerHTML = `
        <div class="vr-tile-avatar">
          <div class="user-avatar" style="background:${u.color || '#5865f2'}">${(u.username || '?')[0].toUpperCase()}</div>
          <span style="font-weight:600;font-size:15px;color:var(--header)">${esc(u.username)}</span>
        </div>
      `;
    }

    const overlay = document.createElement('div');
    overlay.className = 'vr-tile-overlay';
    overlay.innerHTML = `
      <span>${esc(u.username)}${u.screenSharing ? ' <span class="badge-live">AO VIVO</span>' : ''}</span>
      <div class="vr-actions">
        <span>${u.deafened ? '🎧🔇' : (u.muted ? '🔇' : '🎙️')}</span>
        <button class="vr-action-btn vr-vol-btn" title="Ajustar Volume">🔊 ${getUserVolume(u.id)}%</button>
        ${u.screenSharing ? `<button class="vr-action-btn vr-fs-btn" title="Tela Cheia">⛶ Tela Cheia</button>` : ''}
      </div>
    `;

    const volBtn = overlay.querySelector('.vr-vol-btn');
    if (volBtn) volBtn.onclick = (e) => { e.stopPropagation(); openVolumeModal(u.id, u.username); };

    const fsBtn = overlay.querySelector('.vr-fs-btn');
    if (fsBtn) {
      fsBtn.onclick = (e) => {
        e.stopPropagation();
        const vid = tile.querySelector('video');
        if (vid) toggleFullscreen(vid);
      };
    }

    tile.appendChild(overlay);
    grid.appendChild(tile);
  });

  stage.innerHTML = '';
  stage.appendChild(grid);
  updateVoiceControls();
}

function getPeer(peerId, initiator) {
  if (peers[peerId]) return peers[peerId];
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  peers[peerId] = pc;
  if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  if (screenStream) screenStream.getTracks().forEach(t => pc.addTrack(t, screenStream));
  
  pc.onicecandidate = e => {
    if (e.candidate) send({ t: 'signal', to: peerId, data: { type: 'candidate', candidate: e.candidate } });
  };
  
  pc.ontrack = e => {
    if (e.track.kind === 'video') {
      let video = document.getElementById('video-' + peerId);
      if (!video) {
        video = document.createElement('video');
        video.id = 'video-' + peerId;
        video.autoplay = true;
        video.playsInline = true;
        video.className = 'remote-video';
        video.style.display = 'none';
        document.body.appendChild(video);
      }
      video.srcObject = e.streams[0];
      renderVoiceRoom();
    } else {
      let audio = document.getElementById('audio-' + peerId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'audio-' + peerId;
        audio.autoplay = true;
        audio.className = 'remote-audio';
        document.body.appendChild(audio);
      }
      audio.srcObject = e.streams[0];
      audio.muted = S.deafened;
      audio.volume = S.deafened ? 0 : Math.min(1, getUserVolume(peerId) / 100);
    }
  };
  
  if (initiator) createOffer(pc, peerId);
  return pc;
}

async function createOffer(pc, peerId) {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ t: 'signal', to: peerId, data: { type: 'offer', sdp: pc.localDescription } });
  } catch (e) {}
}

function syncVoicePeers() {
  if (!S.voice) return;
  const inChan = (((S.voiceStates[S.voice.serverId] || {})[S.voice.channelId]) || [])
    .map(u => u.id).filter(id => id !== S.user?.id);
  
  for (const pid of Object.keys(peers)) {
    if (!inChan.includes(pid)) {
      peers[pid].close();
      delete peers[pid];
      const a = document.getElementById('audio-' + pid);
      if (a) a.remove();
      const v = document.getElementById('video-' + pid);
      if (v) v.remove();
    }
  }
  inChan.forEach(pid => {
    if (!peers[pid] && S.user?.id > pid) getPeer(pid, true);
  });
  renderVoiceRoom();
}

async function handleSignal(from, data) {
  const pc = getPeer(from, false);
  try {
    if (data.type === 'offer') {
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ t: 'signal', to: from, data: { type: 'answer', sdp: pc.localDescription } });
    } else if (data.type === 'answer') {
      await pc.setRemoteDescription(data.sdp);
    } else if (data.type === 'candidate') {
      await pc.addIceCandidate(data.candidate);
    }
  } catch (e) {}
}

/* ---------- Utilidades ---------- */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function mdLite(s) {
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
       .replace(/__(.+?)__/g, '<u>$1</u>').replace(/`(.+?)`/g, '<code style="background:#1e1f22;padding:1px 4px;border-radius:3px">$1</code>');
  return s.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#00a8fc">$1</a>');
}
let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 3000);
}

// auto-resize textarea
$('msgInput').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 160) + 'px';
});

connect();
