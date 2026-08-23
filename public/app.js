/* ============ JohnCord - Cliente ============ */
'use strict';

const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
let ws;
let lastAuth = null;

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
  lastAuthor: null,
  lastTs: 0,
};

const $ = id => document.getElementById(id);

/* ---------- WebSocket ---------- */
function connect() {
  ws = new WebSocket(wsUrl);
  ws.onopen = () => { if (lastAuth) send(lastAuth); };
  ws.onmessage = e => handle(JSON.parse(e.data));
  ws.onclose = () => { if (S.user) { toast('Conexão perdida. Reconectando...'); setTimeout(connect, 1500); } };
}
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

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

function auth(mode) {
  hideAuthError();
  lastAuth = { t: mode, username: $('authUser').value.trim(), password: $('authPass').value };
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
  renderRail();
  renderSidebar();
  renderHeader();
  requestHistory();
  send({ t: 'members', serverId: id });
}

function openChannel(chId) {
  S.channelId = chId;
  S.lastAuthor = null;
  renderSidebar();
  renderHeader();
  requestHistory();
}

function openHome() {
  S.view = 'home';
  S.dmId = null;
  renderRail();
  renderSidebar();
  renderHeader();
  renderHomeMain();
}

function openDm(dmId) {
  S.view = 'home';
  S.dmId = dmId;
  S.lastAuthor = null;
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
        vu.className = 'voice-user' + (u.muted ? ' muted' : '');
        vu.innerHTML = `<span class="dot"></span><span>${esc(u.username)}</span>`;
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
$('btnDisconnectVoice').onclick = leaveVoice;

/* ---------- Voz / WebRTC ---------- */
let localStream = null;
const peers = {};   // userId -> RTCPeerConnection

async function joinVoice(serverId, channelId) {
  try {
    if (!localStream) localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    S.voice = { serverId, channelId };
    S.muted = false;
    updateVoiceBar(serverId, channelId);
    send({ t: 'voiceJoin', serverId, channelId });
  } catch (e) {
    toast('⚠ Microfone bloqueado! Permita o acesso ao microfone no navegador.');
  }
}

function leaveVoice() {
  Object.values(peers).forEach(pc => pc.close());
  for (const k of Object.keys(peers)) delete peers[k];
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (S.voice) { send({ t: 'voiceLeave' }); S.voice = null; }
  updateVoiceBar(null);
}

function toggleMute() {
  S.muted = !S.muted;
  if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !S.muted);
  send({ t: 'voiceMute', muted: S.muted });
  $('btnMute').textContent = S.muted ? '🔇' : '🎤';
  updateVoiceBar(S.voice ? S.voice.serverId : null, S.voice ? S.voice.channelId : null);
}

function updateVoiceBar(serverId, channelId) {
  const old = document.querySelector('.call-bar');
  if (old) old.remove();
  $('btnDisconnectVoice').style.display = S.voice ? '' : 'none';
  if (!S.voice) return;
  const srv = S.servers.find(s => s.id === serverId);
  const bar = document.createElement('div');
  bar.className = 'call-bar';
  bar.innerHTML = `
    <div class="call-info">🔊 Conectado — ${esc(srv ? srv.name : '')} / ${esc(channelId || '')}</div>
    <div class="call-btns">
      <button class="call-btn${S.muted ? ' on' : ''}" id="cbMute">${S.muted ? '🔇 Mudo' : '🎙 Falando'}</button>
      <button class="call-btn danger" id="cbLeave">📞 Desconectar</button>
    </div>`;
  $('userPanel').parentNode.insertBefore(bar, $('userPanel'));
  $('cbMute').onclick = toggleMute;
  $('cbLeave').onclick = leaveVoice;
}

function getPeer(peerId, initiator) {
  if (peers[peerId]) return peers[peerId];
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  peers[peerId] = pc;
  if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.onicecandidate = e => {
    if (e.candidate) send({ t: 'signal', to: peerId, data: { type: 'candidate', candidate: e.candidate } });
  };
  pc.ontrack = e => {
    let audio = document.getElementById('audio-' + peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'audio-' + peerId;
      audio.autoplay = true;
      audio.className = 'remote-audio';
      document.body.appendChild(audio);
    }
    audio.srcObject = e.streams[0];
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
    .map(u => u.id).filter(id => id !== S.user.id);
  // remover peers que saíram
  for (const pid of Object.keys(peers)) {
    if (!inChan.includes(pid)) { peers[pid].close(); delete peers[pid]; const a = document.getElementById('audio-' + pid); if (a) a.remove(); }
  }
  // criar conexões determinísticas (maior id inicia)
  inChan.forEach(pid => {
    if (!peers[pid] && S.user.id > pid) getPeer(pid, true);
  });
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
