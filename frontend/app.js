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
  requests: [],            // solicitacoes de amizade recebidas
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
  dmCall: null,            // {peerId, state:'ringing'|'active'|'calling', pc, startedAt}
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
      if (S.view === 'home' && !S.dmId) { renderHeader(); renderHomeMain(); }
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
      S.friends = d.friends;
      renderSidebar();
      if (S.view === 'home' && !S.dmId) { renderHeader(); renderHomeMain(); }
      if (d.info) toast('✓ ' + d.info);
      break;
    case 'friendRequest':
      S.requests = d.requests || [...S.requests, d.from];
      toast(`📨 ${d.from.displayName || d.from.username} quer ser seu amigo!`);
      renderSidebar();
      if (S.view === 'home' && !S.dmId) { renderHeader(); renderHomeMain(); }
      break;
    case 'requests':
      S.requests = d.requests;
      renderSidebar();
      break;
    case 'searchResults':
      renderSearchResults(d.results);
      break;
    case 'dmCallIncoming':
      onIncomingDmCall(d.dmId, d.fromUser);
      break;
    case 'dmCallDeclined':
      toast(`📵 ${d.fromUser ? (d.fromUser.displayName || d.fromUser.username) : 'O amigo'} recusou a chamada.`);
      break;
    case 'relayed': handleDmRelay(d.from, d.payload); break;
    case 'inviteUpdated': {
      const srv = S.servers.find(s => s.id === d.serverId);
      if (srv) srv.inviteCode = d.inviteCode;
      break;
    }
    case 'voiceState':
      S.voiceStates = d.states;
      renderSidebar();
      renderHeader();
      renderVoiceRoom();
      syncVoicePeers();
      break;
    case 'voicePeers':
      // Iniciacao e feita deterministicamente em syncVoicePeers (evita conflito de oferta)
      break;
    case 'voiceSpeaking':
      updateSpeakingUI(d.userId, d.speaking);
      break;
    case 'profileUpdated':
      S.user = d.user;
      $('myName').textContent = S.user.username;
      $('myStatus').textContent = S.user.customStatus || 'Online';
      setAvatar($('myAvatar'), S.user);
      renderRail();
      renderSidebar();
      break;
    case 'signal': handleSignal(d.from, d.data); break;
    case 'voiceRelay': playRelayAudio(d.from, d.audio); break;
    case 'sessionReplaced':
      S.user = null;
      lastAuth = null;
      try { localStorage.removeItem('jc_auth'); } catch (e) {}
      $('app').style.display = 'none';
      $('authScreen').style.display = 'flex';
      showAuthError('Sua conta foi aberta em outro lugar. Se não foi você, troque sua senha!');
      break;
  }
}

/* ---------- Auth ---------- */
$('btnLogin').onclick = () => auth('login');
$('btnRegister').onclick = () => auth('register');
$('authUser').onkeydown = e => { if (e.key === 'Enter') $('authPass').focus(); };
$('authPass').onkeydown = e => { if (e.key === 'Enter') auth('login'); };
if ($('btnConfigServer')) $('btnConfigServer').onclick = modalServerSettings;

// Carregar credenciais salvas no navegador
try {
  const savedAuth = JSON.parse(localStorage.getItem('jc_auth') || 'null');
  if (savedAuth && savedAuth.username && savedAuth.password) {
    $('authUser').value = savedAuth.username;
    $('authPass').value = savedAuth.password;
    lastAuth = savedAuth;
  }
} catch (e) {}

function auth(mode) {
  hideAuthError();
  const user = $('authUser').value.trim();
  const pass = $('authPass').value;
  if (!user || !pass) {
    showAuthError('Informe o nome de usuário e a senha.');
    return;
  }
  lastAuth = { t: mode, username: user, password: pass };
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
  send(lastAuth);
}

function showAuthError(m) {
  const box = $('authError');
  box.innerHTML = esc(m);
  if (m.includes('Conta não encontrada')) {
    box.innerHTML += `<br><button class="link-btn" style="color:#00a8fc;margin-top:4px;background:none;border:none;cursor:pointer;text-decoration:underline" onclick="auth('register')">➕ Criar conta com este nome agora</button>`;
  }
  box.style.display = 'block';
}

function hideAuthError() { $('authError').style.display = 'none'; }

function logout() {
  localStorage.removeItem('jc_auth');
  lastAuth = null;
  S.user = null;
  leaveVoice();
  closeModal();
  $('app').style.display = 'none';
  $('authScreen').style.display = 'flex';
  toast('Você saiu da sua conta.');
}

const pendingJoin = new URLSearchParams(location.search).get('join');

function onAuthOk(boot) {
  S.user = boot.user;
  S.servers = boot.servers;
  S.friends = boot.friends || [];
  S.requests = boot.requests || [];
  S.dmList = boot.dmList;
  if (lastAuth) {
    try { localStorage.setItem('jc_auth', JSON.stringify(lastAuth)); } catch (e) {}
  }
  $('authScreen').style.display = 'none';
  $('app').style.display = 'flex';
  $('myName').textContent = S.user.displayName || S.user.username;
  $('myStatus').textContent = S.user.customStatus || 'Online';
  setAvatar($('myAvatar'), S.user);
  renderRail();
  renderSidebar();
  if (pendingJoin) {
    history.replaceState(null, '', '/');
    send({ t: 'joinInvite', code: pendingJoin });
  } else {
    openServer('geral');
  }
  toast(`👋 Bem-vindo, ${S.user.username}!`);
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
function isImgUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/');
}

function setAvatar(el, user) {
  if (!el || !user) return;
  const av = user.avatar;
  const disp = user.displayName || user.username || '?';
  if (isImgUrl(av)) {
    el.innerHTML = `<img src="${esc(av)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;pointer-events:none">`;
    el.style.background = 'transparent';
  } else if (av) {
    el.textContent = av;
    el.style.background = user.color || '#5865f2';
  } else {
    el.textContent = disp[0].toUpperCase();
    el.style.background = user.color || '#5865f2';
  }
}

function setBanner(el, bannerVal) {
  if (!el) return;
  const val = (bannerVal || '#5865f2').trim();
  if (isImgUrl(val)) {
    el.style.background = `url("${esc(val)}") center/cover no-repeat`;
  } else {
    el.style.background = val;
  }
}

function modalEditProfile() {
  if (!S.user) return;
  const avatarColors = ['#5865f2', '#eb459e', '#3ba55c', '#faa61a', '#ed4245', '#00a8fc', '#9b59b6', '#2ecc71', '#e67e22', '#1abc9c'];
  const bannerColors = ['#5865f2', '#eb459e', '#3ba55c', '#faa61a', '#ed4245', '#202225', '#00a8fc', '#9b59b6', '#111214', '#e67e22'];
  const emojis = ['🎮', '👑', '⚡', '🎧', '🚀', '🔥', '🐱', '💀', '💎', '⭐', '👾', '🎯', '☕', '🌟', '🛡️', '⚔️'];
  
  let selectedDisplayName = S.user.displayName || S.user.username;
  let selectedBio = S.user.bio || '';
  let selectedBannerColor = S.user.bannerColor || '#5865f2';
  let selectedColor = S.user.color || '#5865f2';
  let selectedAvatar = S.user.avatar || '';
  let selectedStatus = S.user.customStatus || '';

  openModal(`
    <h2>🎨 Personalizar Perfil</h2>
    <p>Edite sua foto (URL ou emoji), banner, nome de exibição, sobre mim e status:</p>

    <!-- PREVIEW AO VIVO DO CARD -->
    <div class="profile-card-box" style="margin-bottom:16px;border:1px solid rgba(255,255,255,.1)">
      <div class="profile-card-banner" id="pPrevBanner"></div>
      <div class="profile-card-body">
        <div class="profile-avatar-row">
          <div class="profile-avatar-large" id="pPrevAvatar"></div>
        </div>
        <div class="profile-card-names">
          <div class="profile-display-title" id="pPrevDisplay">${esc(selectedDisplayName)}</div>
          <div class="profile-handle-title">@${esc(S.user.username)}</div>
        </div>
        <div class="profile-status-badge" id="pPrevStatusBadge">
          <span id="pPrevStatusText">${esc(selectedStatus || 'Online')}</span>
        </div>
        <div class="profile-card-divider"></div>
        <div class="profile-section-label">Sobre Mim</div>
        <div class="profile-bio-text" id="pPrevBio">${esc(selectedBio || 'Nenhuma bio informada ainda.')}</div>
      </div>
    </div>

    <!-- CAMPOS DE EDIÇÃO -->
    <div style="display:flex;flex-direction:column;gap:12px;max-height:360px;overflow-y:auto;padding-right:4px">
      <div>
        <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:4px">NOME DE EXIBIÇÃO (APELIDO):</label>
        <input class="input" id="mDisplayName" placeholder="Seu nome no chat e na call" maxlength="32" value="${esc(selectedDisplayName)}">
        <span style="font-size:11px;color:var(--text-dim)">Seu nome de login continua sendo @${esc(S.user.username)}</span>
      </div>

      <div>
        <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:4px">FOTO DE PERFIL (LINK / URL DA IMAGEM):</label>
        <input class="input" id="mAvatarUrl" placeholder="Cole aqui o link da imagem (ex: https://...)" value="${isImgUrl(selectedAvatar) ? esc(selectedAvatar) : ''}">
        <span style="font-size:11px;color:var(--text-dim)">Você pode colar qualquer link de imagem ou escolher um emoji abaixo.</span>
      </div>

      <div>
        <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:4px">BANNER DO PERFIL (COR OU LINK / URL DA IMAGEM):</label>
        <input class="input" id="mBannerUrl" placeholder="Cole aqui a cor (#5865f2) ou link de imagem (https://...)" value="${esc(selectedBannerColor)}">
      </div>

      <div>
        <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:4px">SOBRE MIM (BIO):</label>
        <textarea class="input" id="mBio" rows="2" placeholder="Escreva um pouco sobre você..." maxlength="200" style="resize:vertical">${esc(selectedBio)}</textarea>
      </div>

      <div>
        <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:4px">STATUS PERSONALIZADO / ATIVIDADE:</label>
        <input class="input" id="mCustomStatus" placeholder="Ex: Jogando JohnCord 🎮" maxlength="80" value="${esc(selectedStatus)}">
      </div>

      <div>
        <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:6px">COR RÁPIDA DO BANNER:</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px" id="bannerPickerBox">
          ${bannerColors.map(c => `<div class="color-dot${c === selectedBannerColor ? ' active' : ''}" data-bcolor="${c}" style="width:26px;height:26px;border-radius:6px;background:${c};cursor:pointer;border:2px solid ${c === selectedBannerColor ? '#fff' : 'transparent'};transition:.15s"></div>`).join('')}
        </div>
      </div>

      <div>
        <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:6px">COR DO AVATAR (SE NÃO USAR FOTO):</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px" id="colorPickerBox">
          ${avatarColors.map(c => `<div class="color-dot${c === selectedColor ? ' active' : ''}" data-color="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${c === selectedColor ? '#fff' : 'transparent'};transition:.15s"></div>`).join('')}
        </div>
      </div>

      <div>
        <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:6px">ÍCONE / EMOJI DO AVATAR:</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px" id="emojiPickerBox">
          <button class="btn btn-small btn-ghost" id="btnDefaultLetter" style="font-size:11px">Letra Inicial</button>
          ${emojis.map(em => `<button class="emoji-opt-btn" data-emoji="${em}" style="font-size:16px;background:#2b2d31;border:none;border-radius:6px;padding:3px 7px;cursor:pointer">${em}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="modal-actions" style="margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="mSaveProfile">Salvar Alterações</button>
    </div>
  `);

  const prevBanner = $('pPrevBanner');
  const prevAv = $('pPrevAvatar');
  const prevDisp = $('pPrevDisplay');
  const prevBio = $('pPrevBio');
  const prevSt = $('pPrevStatusText');

  function updatePreview() {
    setBanner(prevBanner, selectedBannerColor);
    setAvatar(prevAv, { avatar: selectedAvatar, color: selectedColor, displayName: selectedDisplayName, username: S.user.username });
  }
  updatePreview();

  $('mDisplayName').oninput = e => {
    selectedDisplayName = e.target.value.trim() || S.user.username;
    prevDisp.textContent = selectedDisplayName;
    updatePreview();
  };

  $('mAvatarUrl').oninput = e => {
    selectedAvatar = e.target.value.trim();
    updatePreview();
  };

  $('mBannerUrl').oninput = e => {
    selectedBannerColor = e.target.value.trim() || '#5865f2';
    updatePreview();
  };

  $('mBio').oninput = e => {
    selectedBio = e.target.value;
    prevBio.textContent = selectedBio || 'Nenhuma bio informada ainda.';
  };

  $('mCustomStatus').oninput = e => {
    selectedStatus = e.target.value;
    prevSt.textContent = selectedStatus || 'Online';
  };

  document.querySelectorAll('#bannerPickerBox .color-dot').forEach(dot => {
    dot.onclick = () => {
      selectedBannerColor = dot.dataset.bcolor;
      $('mBannerUrl').value = selectedBannerColor;
      document.querySelectorAll('#bannerPickerBox .color-dot').forEach(d => d.style.borderColor = 'transparent');
      dot.style.borderColor = '#fff';
      updatePreview();
    };
  });

  document.querySelectorAll('#colorPickerBox .color-dot').forEach(dot => {
    dot.onclick = () => {
      selectedColor = dot.dataset.color;
      document.querySelectorAll('#colorPickerBox .color-dot').forEach(d => d.style.borderColor = 'transparent');
      dot.style.borderColor = '#fff';
      updatePreview();
    };
  });

  document.querySelectorAll('#emojiPickerBox .emoji-opt-btn').forEach(btn => {
    btn.onclick = () => {
      selectedAvatar = btn.dataset.emoji;
      $('mAvatarUrl').value = '';
      updatePreview();
    };
  });

  $('btnDefaultLetter').onclick = () => {
    selectedAvatar = '';
    $('mAvatarUrl').value = '';
    updatePreview();
  };

  $('mSaveProfile').onclick = () => {
    const disp = $('mDisplayName').value.trim() || S.user.username;
    const bioVal = $('mBio').value;
    const statusVal = $('mCustomStatus').value.trim();
    const finalAvatar = $('mAvatarUrl').value.trim() || selectedAvatar;
    const finalBanner = $('mBannerUrl').value.trim() || selectedBannerColor;

    send({
      t: 'updateProfile',
      displayName: disp,
      bio: bioVal,
      bannerColor: finalBanner,
      color: selectedColor,
      avatar: finalAvatar,
      customStatus: statusVal
    });
    closeModal();
    toast('Perfil atualizado com sucesso!');
  };
}

function openUserProfileModal(userId) {
  if (userId === S.user?.id) {
    modalEditProfile();
    return;
  }
  const u = (S.presence || []).find(x => x.id === userId) || (S.members || []).find(x => x.id === userId) || { id: userId, username: 'Usuário' };
  const isFriend = (S.friends || []).some(f => f.id === userId);
  const dispName = u.displayName || u.username;
  const bannerColor = u.bannerColor || '#5865f2';
  const bioText = u.bio || 'Este usuário ainda não escreveu nada sobre ele.';
  const statusText = u.customStatus || (u.status === 'online' ? '🟢 Online' : '⚪ Offline');

  const srv = currentServer();
  let rolesHtml = '';
  if (srv && S.view !== 'home') {
    const mRoleIds = (srv.memberRoles && srv.memberRoles[userId]) || (u.roles ? u.roles.map(r => r.id) : []);
    const userRoles = (srv.roles || []).filter(r => mRoleIds.includes(r.id));
    if (userRoles.length) {
      rolesHtml = `
        <div class="profile-card-divider"></div>
        <div class="profile-section-label">Cargos em ${esc(srv.name)}</div>
        <div class="member-roles-chips" style="margin-top:4px">
          ${userRoles.map(r => `<span class="role-chip" style="background:${r.color}">${esc(r.name)}</span>`).join('')}
        </div>
      `;
    }
  }

  openModal(`
    <div class="profile-card-box">
      <div class="profile-card-banner" id="pUserModalBanner"></div>
      <div class="profile-card-body">
        <div class="profile-avatar-row">
          <div class="profile-avatar-large" id="pUserModalAvatar"></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary btn-small" id="pmBtnDm">💬 Mensagem</button>
            ${!isFriend ? `<button class="btn btn-ghost btn-small" id="pmBtnAdd">👥 Adicionar</button>` : ''}
          </div>
        </div>
        <div class="profile-card-names">
          <div class="profile-display-title">${esc(dispName)}</div>
          <div class="profile-handle-title">@${esc(u.username)}</div>
        </div>
        <div class="profile-status-badge">
          <span>${esc(statusText)}</span>
        </div>
        ${rolesHtml}
        <div class="profile-card-divider"></div>
        <div class="profile-section-label">Sobre Mim</div>
        <div class="profile-bio-text">${esc(bioText)}</div>
        <div class="profile-card-divider"></div>
        <div class="modal-actions" style="margin-top:16px">
          <button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
        </div>
      </div>
    </div>
  `);

  setBanner($('pUserModalBanner'), bannerColor);
  setAvatar($('pUserModalAvatar'), u);

  const dmBtn = $('pmBtnDm');
  if (dmBtn) {
    dmBtn.onclick = () => {
      closeModal();
      openDirectMessage(userId);
    };
  }
  const addBtn = $('pmBtnAdd');
  if (addBtn) {
    addBtn.onclick = () => {
      send({ t: 'friendReq', username: u.username });
      addBtn.textContent = '⏳ Enviada';
      addBtn.disabled = true;
    };
  }
}

if ($('myAvatar')) $('myAvatar').onclick = modalEditProfile;
if ($('myName')) $('myName').onclick = modalEditProfile;
if ($('myInfoWrap')) $('myInfoWrap').onclick = modalEditProfile;

function renderRail() {
  const list = $('serverList');
  list.innerHTML = '';
  $('btnHome').classList.toggle('active', S.view === 'home');
  S.servers.forEach(srv => {
    const div = document.createElement('div');
    div.className = 'server-icon' + (srv.permanent ? ' permanent' : '') + (S.view === srv.id ? ' active' : '');
    div.title = srv.name;
    const iconContent = isImgUrl(srv.icon)
      ? `<img src="${esc(srv.icon)}" alt="Icon" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`
      : (srv.icon || srv.name[0].toUpperCase());
    div.innerHTML = `<span class="pill"></span>${iconContent}`;
    div.onclick = () => openServer(srv.id);
    list.appendChild(div);
  });
}

function renderSidebar() {
  const body = $('channelView');
  const header = $('sidebarHeader');
  body.innerHTML = '';

  if (S.view === 'home') {
    header.textContent = 'Início';
    
    // Botão Principal de Amigos
    const friendsBtn = document.createElement('div');
    friendsBtn.className = 'chan-item' + (!S.dmId ? ' active' : '');
    friendsBtn.style.padding = '8px 10px';
    friendsBtn.style.marginBottom = '8px';
    const pendingCount = S.requests.length;
    const pendingBadge = pendingCount > 0 ? `<span style="background:var(--red,#f23f43);color:#fff;font-size:11px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:auto">${pendingCount}</span>` : '';
    friendsBtn.innerHTML = `<span>👥</span><span style="font-weight:600">Amigos</span>${pendingBadge}`;
    friendsBtn.onclick = () => {
      S.dmId = null;
      renderSidebar();
      renderHeader();
      renderHomeMain();
    };
    body.appendChild(friendsBtn);

    // Seção Mensagens Diretas
    const sec = document.createElement('div');
    sec.className = 'sidebar-section';
    sec.innerHTML = `<span>Mensagens diretas</span>`;
    body.appendChild(sec);

    if (S.dmList.length === 0 && S.friends.length === 0) {
      const emptyNote = document.createElement('div');
      emptyNote.style.cssText = 'padding:10px 12px;font-size:12.5px;color:var(--text-dim,#949ba4);line-height:1.4';
      emptyNote.textContent = 'Suas conversas diretas aparecerão aqui.';
      body.appendChild(emptyNote);
    }

    // Lista de DMs ativas
    S.dmList.forEach(dm => {
      const item = document.createElement('div');
      const inThisCall = (S.voiceStates['dm'] && S.voiceStates['dm'][dm.dmId] && S.voiceStates['dm'][dm.dmId].length > 0);
      item.className = 'chan-item' + (S.dmId === dm.dmId ? ' active' : '');
      const badgeCall = inThisCall ? `<span class="badge-live-pulse" style="margin-left:auto;font-size:10px;padding:2px 6px">🔊 CALL</span>` : '';
      const av = document.createElement('div');
      av.className = 'user-avatar';
      av.style.cssText = 'width:24px;height:24px;font-size:11px;margin-right:2px;flex-shrink:0';
      setAvatar(av, dm.user);
      
      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1';
      nameSpan.textContent = dm.user.displayName || dm.user.username;

      item.appendChild(av);
      item.appendChild(nameSpan);
      if (inThisCall) item.innerHTML += badgeCall;
      
      item.onclick = () => openDm(dm.dmId);
      body.appendChild(item);
    });
    return;
  }

  const srv = currentServer();
  if (!srv) return;

  header.className = 'sidebar-header' + (!srv.permanent ? ' has-menu' : '');
  header.innerHTML = `<span>${esc(srv.name)}</span>` + (!srv.permanent ? `<span class="sidebar-header-arrow">⚙️ ▼</span>` : '');
  if (!srv.permanent) {
    header.onclick = () => modalServerManage(srv.id);
    header.title = "Configurações do Servidor";
  } else {
    header.onclick = null;
    header.title = "";
  }

  const canManageChans = userHasPerm(srv, S.user?.id, 'manageChannels');

  let sec = document.createElement('div');
  sec.className = 'sidebar-section';
  sec.innerHTML = `<span>Canais de texto</span>` +
    (canManageChans ? `<button title="Criar canal de texto">＋</button>` : '');
  if (sec.querySelector('button')) sec.querySelector('button').onclick = () => modalCreateChannel('text');
  body.appendChild(sec);
  srv.channels.filter(c => c.type === 'text').forEach(ch => {
    const item = document.createElement('div');
    item.className = 'chan-item' + (S.channelId === ch.id ? ' active' : '');
    const del = canManageChans && !ch.id.startsWith('geral')
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
    (canManageChans ? `<button title="Criar canal de voz">＋</button>` : '');
  if (sec.querySelector('button')) sec.querySelector('button').onclick = () => modalCreateChannel('voice');
  body.appendChild(sec);

  srv.channels.filter(c => c.type === 'voice').forEach(ch => {
    const inThis = S.voice && S.voice.serverId === srv.id && S.voice.channelId === ch.id;
    const item = document.createElement('div');
    item.className = 'chan-item' + (inThis ? ' active' : '');
    item.style.cursor = 'pointer';
    item.innerHTML = `🔊 <span style="font-weight:600">${esc(ch.name)}</span>`;
    item.onclick = () => joinVoice(srv.id, ch.id);
    body.appendChild(item);

    const users = ((S.voiceStates[srv.id] || {})[ch.id]) || [];
    if (users.length) {
      const wrap = document.createElement('div');
      wrap.className = 'voice-users';
      wrap.style.cssText = 'padding-left:22px;margin-top:3px;margin-bottom:6px;display:flex;flex-direction:column;gap:3px';

      users.forEach(u => {
        const vu = document.createElement('div');
        const isMuted = u.muted;
        const isDeaf = u.deafened;
        const isLive = u.screenSharing;
        vu.className = 'voice-user vu-item' + (isMuted ? ' muted' : '') + (isDeaf ? ' deafened' : '');
        vu.dataset.uid = u.id;
        vu.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:4px;font-size:13px;color:var(--header,#f2f3f5);cursor:pointer';
        
        const av = document.createElement('div');
        av.className = 'user-avatar';
        av.style.cssText = 'width:22px;height:22px;font-size:10px;flex-shrink:0';
        setAvatar(av, u);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'vu-name';
        nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-weight:500';
        nameSpan.textContent = u.displayName || u.username;

        const liveBadge = isLive ? `<span class="badge-live" style="font-size:9px;padding:1px 4px;margin-right:2px">AO VIVO</span>` : '';
        const stateIcon = isDeaf ? '🎧' : (isMuted ? '🔇' : '');
        const isMe = S.user && u.id === S.user.id;
        const volBtn = !isMe ? `<button class="vu-btn" title="Ajustar Volume" style="font-size:11px;padding:2px 4px;border-radius:3px;background:rgba(255,255,255,0.08);margin-left:4px">🔊</button>` : '';

        vu.appendChild(av);
        vu.appendChild(nameSpan);
        vu.innerHTML += `<span class="vu-actions" style="margin-left:auto;display:flex;align-items:center">${liveBadge}${stateIcon}${volBtn}</span>`;
        
        const b = vu.querySelector('.vu-btn');
        if (b) b.onclick = e => { e.stopPropagation(); openVolumeModal(u.id, u.displayName || u.username); };

        vu.onclick = () => {
          if (S.voice && S.voice.serverId === srv.id && S.voice.channelId === ch.id) {
            openVoiceRoomView();
          } else {
            joinVoice(srv.id, ch.id);
          }
        };

        wrap.appendChild(vu);
      });
      body.appendChild(wrap);
    }
  });
}

function renderHeader() {
  const btnCall = $('btnCallDm');
  const composerWrap = document.querySelector('.composer-wrap');

  if (S.view === 'home') {
    if (S.dmId) {
      if (composerWrap) composerWrap.style.display = '';
      const dm = S.dmList.find(x => x.dmId === S.dmId);
      $('chanIcon').textContent = '@';
      $('chanName').textContent = dm ? (dm.user.displayName || dm.user.username) : 'Conversa';
      $('btnInvite').style.display = 'none';
      $('btnMembers').style.display = 'none';
      // Botao de ligar na chamada privada
      if (btnCall) {
        btnCall.style.display = '';
        const inThisDmVoice = S.voice && S.voice.serverId === 'dm' && S.voice.channelId === S.dmId;
        const dmUsersInVoice = (S.voiceStates['dm'] && S.voiceStates['dm'][S.dmId]) || [];
        if (inThisDmVoice) {
          btnCall.innerHTML = '📞 Abrir Tela da Call';
          btnCall.className = 'header-btn active-green';
          btnCall.onclick = openVoiceRoomView;
        } else if (dmUsersInVoice.length > 0) {
          btnCall.innerHTML = '🟢 Entrar na Call';
          btnCall.className = 'header-btn active-green';
          btnCall.onclick = () => {
            joinVoice('dm', S.dmId);
            openVoiceRoomView();
          };
        } else {
          btnCall.innerHTML = '📞 Iniciar Chamada';
          btnCall.className = 'header-btn';
          btnCall.onclick = () => {
            joinVoice('dm', S.dmId);
            openVoiceRoomView();
          };
        }
      }
    } else {
      // Hub de Amigos: esconde composer de mensagens pois nao esta em um chat
      if (composerWrap) composerWrap.style.display = 'none';
      $('chanIcon').textContent = '👥';
      $('chanName').textContent = 'Amigos';
      $('btnInvite').style.display = 'none';
      $('btnMembers').style.display = 'none';
      if (btnCall) btnCall.style.display = 'none';

      // Abas da Hub no Header
      const headerActions = document.querySelector('.header-actions');
      if (headerActions) {
        const onlineCount = S.friends.filter(f => f.status === 'online').length;
        const pendingCount = S.requests.length;
        
        headerActions.innerHTML = `
          <div class="home-tabs" style="display:flex;gap:6px;align-items:center">
            <button class="home-tab${S.homeTab === 'online' ? ' active' : ''}" id="tabOnline">Disponível (${onlineCount})</button>
            <button class="home-tab${S.homeTab === 'all' ? ' active' : ''}" id="tabAll">Todos (${S.friends.length})</button>
            <button class="home-tab${S.homeTab === 'pending' ? ' active' : ''}" id="tabPending">Pendentes${pendingCount ? ` <span style="background:var(--red,#f23f43);color:#fff;padding:1px 5px;border-radius:8px;font-size:10px">${pendingCount}</span>` : ''}</button>
            <button class="home-tab btn-primary${S.homeTab === 'add' ? ' active' : ''}" id="tabAdd" style="${S.homeTab === 'add' ? 'background:var(--green,#23a55a);color:#fff;' : 'color:var(--green,#23a55a);background:rgba(35,165,90,0.12)'}">➕ Adicionar amigo</button>
          </div>
        `;

        headerActions.querySelector('#tabOnline').onclick = () => { S.homeTab = 'online'; renderHeader(); renderHomeMain(); };
        headerActions.querySelector('#tabAll').onclick = () => { S.homeTab = 'all'; renderHeader(); renderHomeMain(); };
        headerActions.querySelector('#tabPending').onclick = () => { S.homeTab = 'pending'; renderHeader(); renderHomeMain(); };
        headerActions.querySelector('#tabAdd').onclick = () => { S.homeTab = 'add'; renderHeader(); renderHomeMain(); };
      }
    }
    return;
  }

  // Em Servidor: restaura composer
  if (composerWrap) composerWrap.style.display = '';
  const srv = currentServer();
  const ch = srv && srv.channels.find(c => c.id === S.channelId);
  $('chanIcon').textContent = ch && ch.type === 'voice' ? '🔊' : '#';
  $('chanName').textContent = ch ? ch.name : srv ? srv.name : '';
  
  const headerActions = document.querySelector('.header-actions');
  if (headerActions) {
    headerActions.innerHTML = `
      <button id="btnInvite" class="btn btn-small btn-primary" title="Convidar pessoas" style="${srv && !srv.permanent ? '' : 'display:none'}">👥 Convidar</button>
      <button id="btnMembers" class="btn btn-small btn-ghost" title="Membros">Membros</button>
    `;
    const bInv = headerActions.querySelector('#btnInvite');
    if (bInv) bInv.onclick = () => srv && modalInvite(srv.id);
    const bMem = headerActions.querySelector('#btnMembers');
    if (bMem) bMem.onclick = toggleMemberList;
  }
}

function requestHistory() {
  if (S.view !== 'home' && S.channelId) send({ t: 'history', serverId: S.view, channelId: S.channelId });
}

function renderMessages() {
  const box = $('messages');
  box.innerHTML = '';
  S.lastAuthor = null;
  const key = `${S.view}:${S.channelId}`;
  const msgs = S.channelCache[key] || [];
  // Renderizacao em lote com DocumentFragment (1 unico reflow - muito mais rapido)
  const frag = document.createDocumentFragment();
  msgTarget = frag;
  for (const m of msgs) appendMsg(m, { noScroll: true });
  msgTarget = null;
  box.appendChild(frag);
  scrollToBottomForce();
}

function renderDmMessages() {
  const box = $('messages');
  box.innerHTML = '';
  S.lastAuthor = null;

  const dmVoiceUsers = (S.voiceStates['dm'] && S.voiceStates['dm'][S.dmId]) || [];
  if (dmVoiceUsers.length > 0) {
    const inCall = S.voice && S.voice.serverId === 'dm' && S.voice.channelId === S.dmId;
    const banner = document.createElement('div');
    banner.className = 'dm-voice-banner';
    banner.style.cssText = 'background:rgba(35,165,90,0.15);border:1px solid #23a55a;border-radius:8px;padding:12px 16px;margin:8px 16px 16px;display:flex;align-items:center;justify-content:space-between;color:var(--header)';
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span class="badge-live-pulse" style="font-size:12px;padding:3px 8px">📞 CALL ATIVA</span>
        <span style="font-weight:600;font-size:14px">${dmVoiceUsers.length} ${dmVoiceUsers.length === 1 ? 'pessoa' : 'pessoas'} na chamada privada</span>
      </div>
      <div>
        ${inCall ? '<button class="btn btn-primary" id="dmOpenCallBtn" style="background:#23a55a;padding:6px 14px">👁️ Abrir Tela da Call</button>' : '<button class="btn btn-primary" id="dmJoinCallBtn" style="background:#23a55a;padding:6px 14px">📞 Entrar na Call</button>'}
      </div>
    `;
    const openBtn = banner.querySelector('#dmOpenCallBtn');
    if (openBtn) openBtn.onclick = openVoiceRoomView;
    const joinBtn = banner.querySelector('#dmJoinCallBtn');
    if (joinBtn) joinBtn.onclick = () => { joinVoice('dm', S.dmId); openVoiceRoomView(); };
    box.appendChild(banner);
  }

  const dm = S.dms[S.dmId];
  const msgs = (dm && dm.messages) || [];
  const frag = document.createDocumentFragment();
  msgTarget = frag;
  for (const m of msgs) appendMsg(m, { noScroll: true });
  msgTarget = null;
  box.appendChild(frag);
  scrollToBottomForce();
}

function fmtTime(ts) {
  const dt = new Date(ts);
  return `Hoje às ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

let msgTarget = null; // alvo de renderizacao em lote (fragment)

function appendMsg(m, opts = {}) {
  const box = msgTarget || $('messages');
  // So rola automaticamente se o usuario ja estiver perto do fim (nao interrompe a leitura)
  const nearBottom = isNearBottom();
  if (m.system) {
    const div = document.createElement('div');
    div.className = 'msg-system';
    div.innerHTML = mdLite(m.content);
    box.appendChild(div);
    if (!opts.noScroll && nearBottom) queueScroll();
    return;
  }
  const grouped = m.userId === S.lastAuthor && (m.ts - S.lastTs) < 5 * 60 * 1000;
  S.lastAuthor = m.userId; S.lastTs = m.ts;
  const disp = m.displayName || m.username;
  const tagHtml = m.username && m.displayName && m.displayName !== m.username ? `<span style="font-size:11px;color:var(--text-dim);margin-left:4px;font-weight:normal">@${esc(m.username)}</span>` : '';
  const avContent = m.avatar || (disp || m.username || '?')[0].toUpperCase();

  const srv = currentServer();
  let authorColor = m.color || '#5865f2';
  let roleBadge = '';
  if (srv && S.view !== 'home') {
    const mRoleIds = (srv.memberRoles && srv.memberRoles[m.userId]) || [];
    const roles = (srv.roles || []).filter(r => mRoleIds.includes(r.id));
    if (roles.length > 0) {
      authorColor = roles[0].color;
      roleBadge = `<span class="role-badge" style="background:${roles[0].color}">${esc(roles[0].name)}</span>`;
    }
  }

  if (!grouped) {
    const g = document.createElement('div');
    g.className = 'msg-group';
    const av = document.createElement('div');
    av.className = 'm-avatar';
    setAvatar(av, { avatar: m.avatar, color: m.color, displayName: disp, username: m.username });
    av.style.cursor = 'pointer';
    av.title = 'Ver perfil';
    av.onclick = () => openUserProfileModal(m.userId);

    const content = document.createElement('div');
    content.className = 'msg-content';
    content.innerHTML = `
      <div class="msg-header">
        <span class="msg-author" style="color:${authorColor};cursor:pointer" title="Ver perfil">${esc(disp)}</span>${tagHtml}${roleBadge}
        <span class="msg-time">${fmtTime(m.ts)}</span>
      </div>
      <div class="msg-text">${mdLite(m.content)}</div>`;
    content.querySelector('.msg-author').onclick = () => openUserProfileModal(m.userId);
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
  if (!opts.noScroll && nearBottom) queueScroll();
}

let scrollQueued = false;
function isNearBottom() {
  const box = $('messages');
  return box.scrollHeight - box.scrollTop - box.clientHeight < 220;
}
function queueScroll() {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    $('messages').scrollTop = $('messages').scrollHeight;
  });
}
function scrollToBottomForce() {
  requestAnimationFrame(() => {
    const box = $('messages');
    box.scrollTop = box.scrollHeight;
  });
}
// Compat: rolagem forcada
function scrollBottom() { scrollToBottomForce(); }

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
  const srv = currentServer();
  if (!srv || S.view === 'home') return;

  const roles = srv.roles || [];
  const memberRoles = srv.memberRoles || {};

  if (roles.length > 0) {
    const assignedMembers = new Set();

    roles.forEach(role => {
      const membersInRole = S.members.filter(m => {
        const uRoles = memberRoles[m.id] || (m.roles ? m.roles.map(r => r.id) : []);
        return uRoles.includes(role.id) && m.status === 'online' && !assignedMembers.has(m.id);
      });

      if (membersInRole.length) {
        const c = document.createElement('div');
        c.className = 'member-cat';
        c.style.color = role.color;
        c.textContent = `${role.name.toUpperCase()} — ${membersInRole.length}`;
        ml.appendChild(c);
        membersInRole.forEach(m => {
          assignedMembers.add(m.id);
          ml.appendChild(memberItem(m, role));
        });
      }
    });

    const otherOnline = S.members.filter(m => m.status === 'online' && !assignedMembers.has(m.id));
    if (otherOnline.length) {
      const c = document.createElement('div');
      c.className = 'member-cat';
      c.textContent = `ONLINE — ${otherOnline.length}`;
      ml.appendChild(c);
      otherOnline.forEach(m => ml.appendChild(memberItem(m)));
    }

    const offlineU = S.members.filter(m => m.status === 'offline');
    if (offlineU.length) {
      const c = document.createElement('div');
      c.className = 'member-cat';
      c.textContent = `OFFLINE — ${offlineU.length}`;
      ml.appendChild(c);
      offlineU.forEach(m => ml.appendChild(memberItem(m)));
    }
  } else {
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
}

function memberItem(m, topRole) {
  const div = document.createElement('div');
  div.className = 'member-item' + (m.status === 'offline' ? ' offline' : '') + ' clickable';
  div.dataset.uid = m.id;
  const av = document.createElement('div');
  av.className = 'user-avatar'; av.style.width = av.style.height = '32px';
  setAvatar(av, m);
  const dot = document.createElement('span');
  dot.className = 'dot ' + (m.status || 'offline');
  av.appendChild(dot);
  const info = document.createElement('div');
  info.className = 'member-info';
  const disp = m.displayName || m.username;
  const nameColor = topRole ? topRole.color : (m.color || 'var(--text)');
  const custom = m.customStatus ? `<small style="color:#00a8fc;font-size:10px;display:block">${esc(m.customStatus)}</small>` : '';
  const roleBadgeHtml = topRole ? `<span class="role-badge" style="background:${topRole.color}">${esc(topRole.name)}</span>` : '';
  info.innerHTML = `<div><span style="font-weight:600;color:${nameColor}">${esc(disp)}</span>${roleBadgeHtml}</div>${custom}`;
  div.appendChild(av); div.appendChild(info);
  div.onclick = () => openUserProfileModal(m.id);
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
  box.innerHTML = '';
  if (S.homeTab === 'add') renderAddFriendView();
  else renderFriendsView();
}

function renderFriendsView() {
  const box = $('messages');
  box.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:24px 30px;max-width:960px;width:100%';

  if (S.homeTab === 'pending') {
    // ABA PENDENTES
    const secTitle = document.createElement('div');
    secTitle.className = 'member-cat';
    secTitle.style.cssText = 'padding:0 0 12px;font-size:12px;color:var(--text-dim,#949ba4)';
    secTitle.textContent = `SOLICITAÇÕES PENDENTES — ${S.requests.length}`;
    wrap.appendChild(secTitle);

    if (S.requests.length === 0) {
      wrap.innerHTML += '<div style="padding:40px 0;text-align:center;color:var(--text-dim,#949ba4);font-size:14px">Você não tem solicitações de amizade pendentes.</div>';
    } else {
      S.requests.forEach(u => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 14px;background:#2b2d31;border-radius:8px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.06)';
        const av = document.createElement('div');
        av.className = 'user-avatar';
        av.style.cssText = 'width:40px;height:40px;font-size:18px';
        setAvatar(av, u);
        
        const info = document.createElement('div');
        info.className = 'fname';
        info.innerHTML = `<span style="font-weight:700;color:var(--header,#f23f43);font-size:15px">${esc(u.displayName || u.username)}</span><span class="fst" style="display:block;font-size:12px;color:var(--text-dim,#949ba4)">@${esc(u.username)} enviou um pedido de amizade</span>`;
        
        const acts = document.createElement('div');
        acts.className = 'friend-actions';
        acts.style.cssText = 'margin-left:auto;display:flex;gap:8px';
        
        const okBtn = document.createElement('button');
        okBtn.className = 'btn btn-small btn-primary';
        okBtn.style.cssText = 'background:var(--green,#23a55a);padding:6px 14px;font-size:13px;border-radius:4px';
        okBtn.textContent = '✓ Aceitar';
        okBtn.onclick = () => {
          send({ t: 'friendAccept', userId: u.id });
          S.requests = S.requests.filter(r => r.id !== u.id);
          renderHeader();
          renderFriendsView();
        };

        const noBtn = document.createElement('button');
        noBtn.className = 'btn btn-small btn-danger';
        noBtn.style.cssText = 'background:var(--red,#f23f43);padding:6px 14px;font-size:13px;border-radius:4px';
        noBtn.textContent = '✕ Recusar';
        noBtn.onclick = () => {
          send({ t: 'friendReject', userId: u.id });
          S.requests = S.requests.filter(r => r.id !== u.id);
          renderHeader();
          renderFriendsView();
        };

        acts.appendChild(okBtn);
        acts.appendChild(noBtn);
        div.appendChild(av);
        div.appendChild(info);
        div.appendChild(acts);
        wrap.appendChild(div);
      });
    }
    box.appendChild(wrap);
    return;
  }

  // ABA ONLINE OU TODOS
  const list = S.homeTab === 'online'
    ? S.friends.filter(f => f.status === 'online')
    : [...S.friends].sort((a, b) => (b.status === 'online' ? 1 : 0) - (a.status === 'online' ? 1 : 0));

  const countLabel = S.homeTab === 'online'
    ? `AMIGOS DISPONÍVEIS — ${list.length}`
    : `TODOS OS AMIGOS — ${list.length}`;

  const secTitle = document.createElement('div');
  secTitle.className = 'member-cat';
  secTitle.style.cssText = 'padding:0 0 12px;font-size:12px;color:var(--text-dim,#949ba4)';
  secTitle.textContent = countLabel;
  wrap.appendChild(secTitle);

  if (list.length === 0) {
    const emptyMsg = S.homeTab === 'online'
      ? 'Nenhum amigo online no momento. Que tal jogar algo ou adicionar novos amigos?'
      : 'Você ainda não tem amigos adicionados. Use a aba "Adicionar amigo" acima!';
    wrap.innerHTML += `<div style="padding:40px 0;text-align:center;color:var(--text-dim,#949ba4);font-size:14px;line-height:1.6">${emptyMsg}</div>`;
  } else {
    list.forEach(f => {
      const div = document.createElement('div');
      div.className = 'friend-item';
      div.style.cssText = 'display:flex;align-items:center;gap:14px;padding:10px 14px;background:#2b2d31;border-radius:8px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.06);transition:background 0.15s ease';
      
      const av = document.createElement('div');
      av.className = 'user-avatar';
      av.style.cssText = 'width:40px;height:40px;font-size:18px';
      setAvatar(av, f);

      const info = document.createElement('div');
      info.className = 'fname';
      const dispName = f.displayName || f.username;
      const stColor = f.status === 'online' ? '#23a55a' : '#747f8d';
      const stText = f.status === 'online' ? 'Disponível' : 'Offline';
      info.innerHTML = `
        <div style="font-weight:700;color:var(--header,#f23f43);font-size:15px">${esc(dispName)} ${f.displayName ? `<span style="color:var(--text-dim,#949ba4);font-weight:400;font-size:13px">@${esc(f.username)}</span>` : ''}</div>
        <div class="fst" style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-dim,#949ba4)">
          <span style="width:8px;height:8px;border-radius:50%;background:${stColor};display:inline-block"></span> ${stText}
        </div>
      `;

      const acts = document.createElement('div');
      acts.className = 'friend-actions';
      acts.style.cssText = 'margin-left:auto;display:flex;gap:8px';

      const msgBtn = document.createElement('button');
      msgBtn.className = 'btn btn-small btn-primary';
      msgBtn.style.cssText = 'background:var(--blurple,#5865f2);padding:6px 12px;font-size:13px;border-radius:4px';
      msgBtn.textContent = '💬 Conversar';
      msgBtn.onclick = () => startDmWith(f.id);

      const callBtn = document.createElement('button');
      callBtn.className = 'btn btn-small btn-ghost';
      callBtn.style.cssText = 'background:#1e1f22;color:var(--header,#f2f3f5);padding:6px 12px;font-size:13px;border-radius:4px;border:1px solid rgba(255,255,255,0.08)';
      callBtn.textContent = '📞 Ligar';
      callBtn.onclick = () => startDmCall(f.id);

      const rmBtn = document.createElement('button');
      rmBtn.className = 'btn btn-small btn-danger';
      rmBtn.style.cssText = 'background:transparent;color:var(--red,#f23f43);padding:6px 8px;font-size:12px';
      rmBtn.textContent = 'Remover';
      rmBtn.onclick = () => {
        if (confirm(`Remover ${f.username} da sua lista de amigos?`)) {
          send({ t: 'removeFriend', userId: f.id });
        }
      };

      acts.appendChild(msgBtn);
      acts.appendChild(callBtn);
      acts.appendChild(rmBtn);

      div.appendChild(av);
      div.appendChild(info);
      div.appendChild(acts);
      wrap.appendChild(div);
    });
  }

  box.appendChild(wrap);
}

let searchTimer = null;
function renderAddFriendView() {
  const box = $('messages');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:24px 30px;max-width:680px;width:100%';
  wrap.innerHTML = `
    <h2 style="color:var(--header,#f2f3f5);font-size:20px;font-weight:700;margin-bottom:6px">ADICIONAR AMIGO</h2>
    <p style="color:var(--text-dim,#949ba4);font-size:14px;margin-bottom:16px;line-height:1.5">Você pode adicionar amigos usando o nome de usuário do JohnCord.</p>
    <div style="display:flex;align-items:center;background:#1e1f22;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:4px 8px">
      <input id="addFriendInput" class="input" style="background:transparent;border:none;flex:1;padding:10px 12px;font-size:15px;color:#fff;outline:none" placeholder="Digite o nome de usuário..." autocomplete="off">
      <button id="addFriendBtn" class="btn btn-primary" style="background:var(--blurple,#5865f2);padding:8px 16px;font-size:13px;border-radius:4px">Enviar pedido</button>
    </div>
    <div id="searchResultsBox" style="margin-top:20px"></div>
  `;
  
  box.appendChild(wrap);

  const input = wrap.querySelector('#addFriendInput');
  const btn = wrap.querySelector('#addFriendBtn');
  const resultsBox = wrap.querySelector('#searchResultsBox');

  const doSearch = () => {
    const q = input.value.trim();
    if (!q) { resultsBox.innerHTML = ''; return; }
    send({ t: 'searchUsers', q });
  };

  input.oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(doSearch, 250);
  };
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } };
  btn.onclick = doSearch;

  setTimeout(() => input.focus(), 50);
}

function renderSearchResults(results) {
  const box = $('searchResultsBox');
  if (!box) return;
  box.innerHTML = '';
  if (!results.length) {
    box.innerHTML = '<p style="color:var(--text-dim);font-size:13px">Nenhum usuário encontrado.</p>';
    return;
  }
  const labels = { friend: ['✓ Amigos', ''], incoming: ['✓ Aceitar pedido', 'btn-primary'], sent: ['⏳ Aguardando', ''] };
  results.forEach(u => {
    const div = document.createElement('div');
    div.className = 'friend-item';
    const av = document.createElement('div'); av.className = 'user-avatar'; setAvatar(av, u);
    const info = document.createElement('div'); info.className = 'fname';
    info.innerHTML = `${esc(u.displayName || u.username)}<span class="fst">@${esc(u.username)} · ${u.status === 'online' ? '🟢 Online' : '⚫ Offline'}</span>`;
    const acts = document.createElement('div'); acts.className = 'friend-actions';
    if (u.relation === 'none') {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-small btn-primary'; addBtn.textContent = '➕ Adicionar';
      addBtn.onclick = () => {
        send({ t: 'friendReq', username: u.username });
        addBtn.textContent = '⏳ Enviada';
        addBtn.disabled = true;
        addBtn.classList.remove('btn-primary');
      };
      acts.appendChild(addBtn);
    } else {
      const span = document.createElement('span');
      span.style.cssText = 'font-size:13px;color:var(--text-dim)';
      span.textContent = labels[u.relation][0];
      acts.appendChild(span);
    }
    div.appendChild(av); div.appendChild(info); div.appendChild(acts);
    box.appendChild(div);
  });
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

function userHasPerm(srv, userId, perm) {
  if (!srv || !userId) return false;
  if (srv.owner === userId) return true;
  const uRoles = (srv.memberRoles && srv.memberRoles[userId]) || [];
  const roles = (srv.roles || []).filter(r => uRoles.includes(r.id));
  if (roles.some(r => r.isAdmin)) return true;
  if (perm && roles.some(r => r[perm])) return true;
  return false;
}

$('btnAddServer').onclick = () => {
  const emojis = ['🎮', '🏰', '🚀', '💎', '👑', '🔥', '⚡', '⚔️', '👾', '🎯', '🎧', '☕', '🌟', '🛡️'];
  const colors = ['#5865f2', '#eb459e', '#3ba55c', '#faa61a', '#ed4245', '#00a8fc', '#9b59b6', '#202225', '#111214'];
  let selectedIcon = '🎮';
  let selectedBanner = '#5865f2';

  openModal(`
    <h2>🏰 Criar Servidor</h2>
    <p>Crie um espaço personalizado para você e seus amigos conversarem, transmitirem e jogarem juntos!</p>
    
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;background:#1e1f22;padding:12px;border-radius:10px">
      <div id="mPrevSrvIcon" style="width:52px;height:52px;border-radius:14px;background:#2b2d31;font-size:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.3);overflow:hidden">
        🎮
      </div>
      <div>
        <div id="mPrevSrvName" style="font-weight:800;font-size:17px;color:var(--header)">Meu Servidor</div>
        <div style="font-size:12px;color:var(--text-dim)">Comunidade Personalizada</div>
      </div>
    </div>

    <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:4px">NOME DO SERVIDOR:</label>
    <input class="input" id="mSrvName" placeholder="Ex: Clube dos Gamers" maxlength="30" value="Meu Servidor">

    <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:4px">FOTO / ÍCONE DO SERVIDOR (LINK / URL):</label>
    <input class="input" id="mSrvIconUrl" placeholder="Cole aqui o link da imagem (ex: https://...)">
    <span style="font-size:11px;color:var(--text-dim);display:block;margin-top:-6px;margin-bottom:10px">Você pode colar uma URL de imagem ou escolher um emoji abaixo:</span>

    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px" id="srvEmojiPicker">
      ${emojis.map(em => `<button class="emoji-opt-btn" data-emoji="${em}" style="font-size:18px;background:#2b2d31;border:none;border-radius:6px;padding:4px 8px;cursor:pointer">${em}</button>`).join('')}
    </div>

    <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:6px">COR DO BANNER DO SERVIDOR:</label>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px" id="srvBannerPicker">
      ${colors.map(c => `<div class="color-dot${c === selectedBanner ? ' active' : ''}" data-color="${c}" style="width:26px;height:26px;border-radius:6px;background:${c};cursor:pointer;border:2px solid ${c === selectedBanner ? '#fff' : 'transparent'};transition:.15s"></div>`).join('')}
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="joinByCodeModal()">Entrar com Convite</button>
      <button class="btn btn-primary" id="mCreate">Criar Servidor</button>
    </div>
  `);

  const prevIcon = $('mPrevSrvIcon');
  const prevName = $('mPrevSrvName');

  function updateIconPreview() {
    if (isImgUrl(selectedIcon)) {
      prevIcon.innerHTML = `<img src="${esc(selectedIcon)}" alt="Icon" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
    } else {
      prevIcon.textContent = selectedIcon;
    }
  }

  $('mSrvName').oninput = e => {
    prevName.textContent = e.target.value || 'Meu Servidor';
  };

  $('mSrvIconUrl').oninput = e => {
    selectedIcon = e.target.value.trim() || '🎮';
    updateIconPreview();
  };

  document.querySelectorAll('#srvEmojiPicker .emoji-opt-btn').forEach(btn => {
    btn.onclick = () => {
      selectedIcon = btn.dataset.emoji;
      $('mSrvIconUrl').value = '';
      updateIconPreview();
    };
  });

  document.querySelectorAll('#srvBannerPicker .color-dot').forEach(dot => {
    dot.onclick = () => {
      selectedBanner = dot.dataset.color;
      document.querySelectorAll('#srvBannerPicker .color-dot').forEach(d => d.style.borderColor = 'transparent');
      dot.style.borderColor = '#fff';
    };
  });

  $('mCreate').onclick = () => {
    const name = $('mSrvName').value.trim();
    if (name.length >= 2) {
      send({ t: 'createServer', name, icon: selectedIcon, banner: selectedBanner });
      closeModal();
      toast('Servidor criado com sucesso!');
    }
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

function modalServerManage(serverId, initialTab = 'overview') {
  const srv = S.servers.find(s => s.id === serverId);
  if (!srv) return;
  const isOwner = srv.owner === S.user?.id;
  const canManageServer = userHasPerm(srv, S.user?.id, 'manageServer');
  const canManageRoles = userHasPerm(srv, S.user?.id, 'manageRoles');
  const canKick = userHasPerm(srv, S.user?.id, 'kickMembers');

  const bannerColor = srv.banner || '#5865f2';
  const icon = srv.icon || '🎮';
  const roles = srv.roles || [];
  const memberRoles = srv.memberRoles || {};
  const inviteUrl = `${location.origin}/?join=${srv.inviteCode || ''}`;

  let activeTab = initialTab;

  function renderContent() {
    let tabHtml = `
      <div class="srv-tabs">
        <button class="srv-tab-btn${activeTab === 'overview' ? ' active' : ''}" data-tab="overview">📁 Visão Geral</button>
        <button class="srv-tab-btn${activeTab === 'roles' ? ' active' : ''}" data-tab="roles">🛡️ Cargos (${roles.length})</button>
        <button class="srv-tab-btn${activeTab === 'members' ? ' active' : ''}" data-tab="members">👥 Membros (${srv.members ? srv.members.length : 0})</button>
        <button class="srv-tab-btn${activeTab === 'invite' ? ' active' : ''}" data-tab="invite">🔗 Convite</button>
      </div>
    `;

    let bodyHtml = '';

    if (activeTab === 'overview') {
      const srvIconPreview = isImgUrl(icon)
        ? `<img src="${esc(icon)}" alt="Icon" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`
        : icon;

      bodyHtml = `
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;background:#1e1f22;padding:12px;border-radius:10px">
          <div style="width:50px;height:50px;border-radius:12px;background:#2b2d31;font-size:26px;display:flex;align-items:center;justify-content:center;overflow:hidden">
            ${srvIconPreview}
          </div>
          <div>
            <div style="font-weight:800;font-size:17px;color:var(--header)">${esc(srv.name)}</div>
            <div style="font-size:12px;color:var(--text-dim)">Dono: ${isOwner ? 'Você 👑' : 'Outro Membro'}</div>
          </div>
        </div>

        ${canManageServer ? `
          <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:4px">NOME DO SERVIDOR:</label>
          <input class="input" id="smSrvName" value="${esc(srv.name)}" maxlength="30">

          <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:4px">ÍCONE / FOTO DO SERVIDOR (EMOJI OU LINK / URL):</label>
          <input class="input" id="smSrvIcon" value="${esc(icon)}" placeholder="Emoji ou link https://...">

          <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:4px">COR OU URL DO BANNER:</label>
          <input class="input" id="smSrvBanner" value="${esc(bannerColor)}" placeholder="Cor #5865f2 ou link https://...">

          <div class="modal-actions" style="margin-top:14px">
            ${isOwner ? `<button class="btn btn-danger" id="smBtnDeleteSrv">🗑️ Excluir Servidor</button>` : ''}
            <button class="btn btn-primary" id="smBtnSaveOverview">Salvar Alterações</button>
          </div>
        ` : `
          <p style="color:var(--text-dim)">Você está visualizando as informações deste servidor.</p>
          <div class="modal-actions">
            <button class="btn btn-danger" id="smBtnLeaveSrv">🚪 Sair do Servidor</button>
            <button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
          </div>
        `}
      `;
    } else if (activeTab === 'roles') {
      bodyHtml = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:13px;color:var(--text-dim)">Use cargos para organizar membros e definir administradores.</span>
          ${canManageRoles ? `<button class="btn btn-primary btn-small" id="smBtnNewRole">+ Criar Cargo</button>` : ''}
        </div>

        <div style="max-height:280px;overflow-y:auto">
          ${roles.map(r => `
            <div class="role-item-card" style="border-left-color:${r.color}">
              <div>
                <span style="font-weight:700;font-size:14px;color:${r.color}">${esc(r.name)}</span>
                <div style="font-size:11px;color:var(--text-dim)">${r.isAdmin ? '👑 Administrador Completo' : (r.manageChannels ? '📁 Gerencia Canais' : 'Membro Regular')}</div>
              </div>
              ${canManageRoles ? `
                <div style="display:flex;gap:6px">
                  <button class="btn btn-ghost btn-small sm-edit-role" data-rid="${r.id}">✏️ Editar</button>
                  <button class="btn btn-danger btn-small sm-del-role" data-rid="${r.id}">🗑️</button>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `;
    } else if (activeTab === 'members') {
      bodyHtml = `
        <div style="margin-bottom:12px;font-size:13px;color:var(--text-dim)">Gerencie os membros do servidor e seus respectivos cargos.</div>
        <div style="max-height:300px;overflow-y:auto">
          ${(S.members || []).map(m => {
            const mRoleIds = memberRoles[m.id] || (m.roles ? m.roles.map(r => r.id) : []);
            const userRoles = roles.filter(r => mRoleIds.includes(r.id));
            const isTargetOwner = srv.owner === m.id;

            return `
              <div class="member-admin-row">
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="user-avatar" style="width:32px;height:32px;background:${m.color || '#5865f2'}">${m.avatar || (m.displayName || m.username || '?')[0].toUpperCase()}</div>
                  <div>
                    <div style="font-weight:700;font-size:13.5px;color:var(--header)">${esc(m.displayName || m.username)} ${isTargetOwner ? '👑' : ''}</div>
                    <div class="member-roles-chips">
                      ${userRoles.map(r => `<span class="role-chip" style="background:${r.color}">${esc(r.name)}</span>`).join('')}
                      ${!userRoles.length ? `<span style="font-size:11px;color:var(--text-dim)">Sem cargo</span>` : ''}
                    </div>
                  </div>
                </div>
                <div style="display:flex;gap:6px">
                  ${canManageRoles ? `<button class="btn btn-ghost btn-small sm-assign-role" data-uid="${m.id}">+ Cargo</button>` : ''}
                  ${canKick && !isTargetOwner && m.id !== S.user?.id ? `<button class="btn btn-danger btn-small sm-kick-user" data-uid="${m.id}" title="Expulsar">👢</button>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (activeTab === 'invite') {
      bodyHtml = `
        <p>Compartilhe este convite para chamar amigos para <strong>${esc(srv.name)}</strong>:</p>
        <div class="invite-link" id="smInviteBox">${inviteUrl}</div>
        <div class="modal-actions">
          ${canManageServer ? `<button class="btn btn-ghost" id="smBtnRegen">🔄 Gerar Novo Convite</button>` : ''}
          <button class="btn btn-primary" id="smBtnCopy">📋 Copiar Link</button>
        </div>
      `;
    }

    openModal(`
      <h2>⚙️ Configurações de ${esc(srv.name)}</h2>
      ${tabHtml}
      ${bodyHtml}
    `);

    // Tab switcher
    document.querySelectorAll('.srv-tab-btn').forEach(btn => {
      btn.onclick = () => {
        activeTab = btn.dataset.tab;
        renderContent();
      };
    });

    // Overview actions
    if ($('smBtnSaveOverview')) {
      $('smBtnSaveOverview').onclick = () => {
        const newName = $('smSrvName').value.trim();
        const newIcon = $('smSrvIcon').value.trim() || srv.name[0].toUpperCase();
        send({ t: 'updateServer', serverId: srv.id, name: newName, icon: newIcon });
        closeModal();
        toast('Servidor atualizado!');
      };
    }
    if ($('smBtnDeleteSrv')) {
      $('smBtnDeleteSrv').onclick = () => {
        if (confirm(`Tem certeza absoluta que deseja excluir o servidor "${srv.name}"? Esta ação não pode ser desfeita!`)) {
          send({ t: 'deleteServer', serverId: srv.id });
          closeModal();
          openHome();
          toast('Servidor excluído.');
        }
      };
    }
    if ($('smBtnLeaveSrv')) {
      $('smBtnLeaveSrv').onclick = () => {
        if (confirm(`Deseja sair de ${srv.name}?`)) {
          send({ t: 'leaveServer', serverId: srv.id });
          closeModal();
          openHome();
          toast('Você saiu do servidor.');
        }
      };
    }

    // Role actions
    if ($('smBtnNewRole')) {
      $('smBtnNewRole').onclick = () => modalCreateRole(srv.id);
    }
    document.querySelectorAll('.sm-edit-role').forEach(b => {
      b.onclick = () => modalEditRole(srv.id, b.dataset.rid);
    });
    document.querySelectorAll('.sm-del-role').forEach(b => {
      b.onclick = () => {
        if (confirm('Excluir este cargo?')) {
          send({ t: 'deleteRole', serverId: srv.id, roleId: b.dataset.rid });
          setTimeout(() => modalServerManage(srv.id, 'roles'), 200);
        }
      };
    });

    // Member actions
    document.querySelectorAll('.sm-assign-role').forEach(b => {
      b.onclick = () => modalAssignRoles(srv.id, b.dataset.uid);
    });
    document.querySelectorAll('.sm-kick-user').forEach(b => {
      b.onclick = () => {
        if (confirm('Expulsar este membro do servidor?')) {
          send({ t: 'kickMember', serverId: srv.id, targetUserId: b.dataset.uid });
          setTimeout(() => modalServerManage(srv.id, 'members'), 200);
          toast('Membro expulso.');
        }
      };
    });

    // Invite actions
    if ($('smBtnCopy')) {
      $('smBtnCopy').onclick = () => {
        navigator.clipboard.writeText(inviteUrl).then(() => toast('Link copiado!')).catch(() => {});
      };
    }
    if ($('smBtnRegen')) {
      $('smBtnRegen').onclick = () => {
        send({ t: 'regenerateInvite', serverId: srv.id });
        setTimeout(() => modalServerManage(srv.id, 'invite'), 200);
        toast('Novo convite gerado!');
      };
    }
  }

  renderContent();
}

function modalCreateRole(serverId) {
  const roleColors = ['#ed4245', '#faa61a', '#3ba55c', '#5865f2', '#eb459e', '#00a8fc', '#9b59b6', '#2ecc71', '#e67e22'];
  let selectedColor = '#5865f2';

  openModal(`
    <h2>🛡️ Criar Novo Cargo</h2>
    <p>Configure o nome, cor e permissões do cargo:</p>

    <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:4px">NOME DO CARGO:</label>
    <input class="input" id="rcName" placeholder="Ex: Moderador 🛡️" maxlength="25">

    <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:6px">COR DO CARGO:</label>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px" id="roleColorPicker">
      ${roleColors.map(c => `<div class="color-dot${c === selectedColor ? ' active' : ''}" data-color="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${c === selectedColor ? '#fff' : 'transparent'};transition:.15s"></div>`).join('')}
    </div>

    <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:8px">PERMISSÕES DO CARGO:</label>
    <div style="background:#1e1f22;padding:8px 12px;border-radius:8px;margin-bottom:16px">
      <div class="perm-row">
        <label><input type="checkbox" id="permAdmin"> 👑 <strong>Administrador</strong> (Acesso Total)</label>
      </div>
      <div class="perm-row">
        <label><input type="checkbox" id="permManageChans"> 📁 <strong>Gerenciar Canais</strong> (Criar/Excluir)</label>
      </div>
      <div class="perm-row">
        <label><input type="checkbox" id="permManageRoles"> 🛡️ <strong>Gerenciar Cargos</strong> (Dar cargos)</label>
      </div>
      <div class="perm-row">
        <label><input type="checkbox" id="permKick"> 👢 <strong>Expulsar Membros</strong></label>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="modalServerManage('${serverId}', 'roles')">Voltar</button>
      <button class="btn btn-primary" id="rcBtnSave">Salvar Cargo</button>
    </div>
  `);

  document.querySelectorAll('#roleColorPicker .color-dot').forEach(dot => {
    dot.onclick = () => {
      selectedColor = dot.dataset.color;
      document.querySelectorAll('#roleColorPicker .color-dot').forEach(d => d.style.borderColor = 'transparent');
      dot.style.borderColor = '#fff';
    };
  });

  $('rcBtnSave').onclick = () => {
    const name = $('rcName').value.trim();
    if (!name) return;
    send({
      t: 'createRole',
      serverId,
      name,
      color: selectedColor,
      isAdmin: $('permAdmin').checked,
      manageChannels: $('permManageChans').checked,
      manageRoles: $('permManageRoles').checked,
      kickMembers: $('permKick').checked
    });
    setTimeout(() => modalServerManage(serverId, 'roles'), 200);
    toast('Cargo criado!');
  };
}

function modalEditRole(serverId, roleId) {
  const srv = S.servers.find(s => s.id === serverId);
  const role = srv?.roles?.find(r => r.id === roleId);
  if (!role) return;
  const roleColors = ['#ed4245', '#faa61a', '#3ba55c', '#5865f2', '#eb459e', '#00a8fc', '#9b59b6', '#2ecc71', '#e67e22'];
  let selectedColor = role.color || '#5865f2';

  openModal(`
    <h2>✏️ Editar Cargo: ${esc(role.name)}</h2>
    
    <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:4px">NOME DO CARGO:</label>
    <input class="input" id="reName" value="${esc(role.name)}" maxlength="25">

    <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:6px">COR DO CARGO:</label>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px" id="roleColorPicker">
      ${roleColors.map(c => `<div class="color-dot${c === selectedColor ? ' active' : ''}" data-color="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${c === selectedColor ? '#fff' : 'transparent'};transition:.15s"></div>`).join('')}
    </div>

    <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:8px">PERMISSÕES DO CARGO:</label>
    <div style="background:#1e1f22;padding:8px 12px;border-radius:8px;margin-bottom:16px">
      <div class="perm-row">
        <label><input type="checkbox" id="reAdmin" ${role.isAdmin ? 'checked' : ''}> 👑 <strong>Administrador</strong></label>
      </div>
      <div class="perm-row">
        <label><input type="checkbox" id="reManageChans" ${role.manageChannels ? 'checked' : ''}> 📁 <strong>Gerenciar Canais</strong></label>
      </div>
      <div class="perm-row">
        <label><input type="checkbox" id="reManageRoles" ${role.manageRoles ? 'checked' : ''}> 🛡️ <strong>Gerenciar Cargos</strong></label>
      </div>
      <div class="perm-row">
        <label><input type="checkbox" id="reKick" ${role.kickMembers ? 'checked' : ''}> 👢 <strong>Expulsar Membros</strong></label>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="modalServerManage('${serverId}', 'roles')">Voltar</button>
      <button class="btn btn-primary" id="reBtnSave">Salvar Alterações</button>
    </div>
  `);

  document.querySelectorAll('#roleColorPicker .color-dot').forEach(dot => {
    dot.onclick = () => {
      selectedColor = dot.dataset.color;
      document.querySelectorAll('#roleColorPicker .color-dot').forEach(d => d.style.borderColor = 'transparent');
      dot.style.borderColor = '#fff';
    };
  });

  $('reBtnSave').onclick = () => {
    const name = $('reName').value.trim();
    if (!name) return;
    send({
      t: 'updateRole',
      serverId,
      roleId: role.id,
      name,
      color: selectedColor,
      isAdmin: $('reAdmin').checked,
      manageChannels: $('reManageChans').checked,
      manageRoles: $('reManageRoles').checked,
      kickMembers: $('reKick').checked
    });
    setTimeout(() => modalServerManage(serverId, 'roles'), 200);
    toast('Cargo atualizado!');
  };
}

function modalAssignRoles(serverId, targetUserId) {
  const srv = S.servers.find(s => s.id === serverId);
  const roles = srv?.roles || [];
  const memberRoles = (srv?.memberRoles && srv.memberRoles[targetUserId]) || [];
  const member = (S.members || []).find(m => m.id === targetUserId) || { username: 'Membro' };

  openModal(`
    <h2>🛡️ Atribuir Cargos para ${esc(member.displayName || member.username)}</h2>
    <p>Selecione os cargos para este usuário:</p>
    
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;max-height:260px;overflow-y:auto">
      ${roles.map(r => `
        <label style="display:flex;align-items:center;gap:10px;background:#1e1f22;padding:10px 12px;border-radius:8px;cursor:pointer">
          <input type="checkbox" class="mar-cb" data-rid="${r.id}" ${memberRoles.includes(r.id) ? 'checked' : ''}>
          <span style="font-weight:700;color:${r.color}">${esc(r.name)}</span>
        </label>
      `).join('')}
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="modalServerManage('${serverId}', 'members')">Voltar</button>
      <button class="btn btn-primary" id="marBtnSave">Salvar Cargos</button>
    </div>
  `);

  $('marBtnSave').onclick = () => {
    const selected = [];
    document.querySelectorAll('.mar-cb:checked').forEach(cb => selected.push(cb.dataset.rid));
    send({ t: 'setMemberRoles', serverId, targetUserId, roleIds: selected });
    setTimeout(() => modalServerManage(serverId, 'members'), 200);
    toast('Cargos atribuídos com sucesso!');
  };
}

$('btnInvite').onclick = () => {
  const srv = currentServer();
  if (!srv || srv.permanent) return;
  modalServerManage(srv.id, 'invite');
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
      ${S.user ? `<button class="btn btn-danger" onclick="logout()">🚪 Sair da Conta</button>` : `<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>`}
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

/* ---------- Voz / WebRTC / Compartilhamento de Tela & Call Timer ---------- */
let localStream = null;
let screenStream = null;
const peers = {};               // userId -> RTCPeerConnection
const peerAudioStreams = {};    // userId -> MediaStream com todas as faixas de audio recebidas
const peerVideoStreams = {};    // userId -> MediaStream (video da tela remota)
const pendingCandidates = {};   // userId -> Array of RTCIceCandidateInit
let voiceStartTime = null;
let voiceTimerInterval = null;
let globalAudioCtx = null;

// Voice Activity Detection (VAD)
let vadInterval = null;
let vadSource = null;
let vadAnalyser = null;
let isSpeaking = false;
let speakingTimeout = null;

function unlockAudioContext() {
  try {
    if (!globalAudioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) globalAudioCtx = new AudioContextClass();
    }
    if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume();
    }
  } catch (e) {}
}

function setupLocalVAD(stream) {
  cleanupLocalVAD();
  if (!stream) return;
  unlockAudioContext();
  if (!globalAudioCtx) return;

  try {
    vadSource = globalAudioCtx.createMediaStreamSource(stream);
    vadAnalyser = globalAudioCtx.createAnalyser();
    vadAnalyser.fftSize = 256;
    vadAnalyser.smoothingTimeConstant = 0.3;
    vadSource.connect(vadAnalyser);

    const dataArray = new Uint8Array(vadAnalyser.frequencyBinCount);
    
    const checkAudioLevel = () => {
      if (!vadAnalyser || !S.voice) return;
      if (S.muted || S.deafened) {
        if (isSpeaking) setLocalSpeaking(false);
        return;
      }
      vadAnalyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      
      // Limiar de detecção de fala
      if (average > 12) {
        if (!isSpeaking) setLocalSpeaking(true);
        if (speakingTimeout) clearTimeout(speakingTimeout);
        speakingTimeout = setTimeout(() => {
          setLocalSpeaking(false);
        }, 400);
      }
    };

    vadInterval = setInterval(checkAudioLevel, 80);
  } catch (e) {}
}

function cleanupLocalVAD() {
  if (vadInterval) { clearInterval(vadInterval); vadInterval = null; }
  if (speakingTimeout) { clearTimeout(speakingTimeout); speakingTimeout = null; }
  if (vadSource) { try { vadSource.disconnect(); } catch (e) {} vadSource = null; }
  if (vadAnalyser) { try { vadAnalyser.disconnect(); } catch (e) {} vadAnalyser = null; }
  setLocalSpeaking(false);
}

function setLocalSpeaking(speaking) {
  if (isSpeaking === speaking) return;
  isSpeaking = speaking;
  updateSpeakingUI(S.user?.id, isSpeaking);
  send({ t: 'voiceSpeaking', speaking: isSpeaking });
}

function updateSpeakingUI(userId, speaking) {
  if (!userId) return;
  // 1. Meu Avatar no painel inferior
  if (userId === S.user?.id) {
    const myAv = $('myAvatar');
    if (myAv) myAv.classList.toggle('speaking', speaking);
  }

  // 2. Cards da chamada de voz (mosaico e palco)
  const tiles = document.querySelectorAll(`.vr-tile[data-uid="${userId}"], .vr-strip-tile[data-uid="${userId}"]`);
  tiles.forEach(tile => {
    tile.classList.toggle('speaking', speaking);
    const av = tile.querySelector('.user-avatar');
    if (av) av.classList.toggle('speaking', speaking);
  });

  // 3. Usuário no canal de voz na barra lateral
  const vu = document.querySelector(`.vu-item[data-uid="${userId}"]`);
  if (vu) {
    vu.classList.toggle('speaking', speaking);
    const av = vu.querySelector('.user-avatar');
    if (av) av.classList.toggle('speaking', speaking);
  }

  // 4. Usuário na lista de membros do servidor
  const mem = document.querySelector(`.member-item[data-uid="${userId}"]`);
  if (mem) {
    const av = mem.querySelector('.user-avatar');
    if (av) av.classList.toggle('speaking', speaking);
  }
}

/* WebRTC puro de alta fidelidade e baixa latência */
function startRelaySender() {}
function stopRelaySender() {}
function playRelayAudio(uid, audioB64) {}

function startVoiceTimer() {
  if (voiceTimerInterval) clearInterval(voiceTimerInterval);
  voiceStartTime = Date.now();
  updateVoiceTimerDisplay();
  voiceTimerInterval = setInterval(updateVoiceTimerDisplay, 1000);
}

function stopVoiceTimer() {
  if (voiceTimerInterval) {
    clearInterval(voiceTimerInterval);
    voiceTimerInterval = null;
  }
  voiceStartTime = null;
  const vt = $('vrTimer');
  if (vt) vt.textContent = '00:00';
  const ctb = document.querySelector('.call-time-badge');
  if (ctb) ctb.textContent = '00:00';
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = n => String(n).padStart(2, '0');
  if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
}

function updateVoiceTimerDisplay() {
  if (!voiceStartTime) return;
  const elapsed = (Date.now() - voiceStartTime) / 1000;
  const text = formatDuration(elapsed);
  const vrTimer = $('vrTimer');
  if (vrTimer) vrTimer.textContent = text;
  const callTimeBadge = document.querySelector('.call-time-badge');
  if (callTimeBadge) callTimeBadge.textContent = text;
}

async function joinVoice(serverId, channelId) {
  unlockAudioContext();
  try {
    if (!localStream) {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
    }
    localStream.getAudioTracks().forEach(t => t.enabled = !S.muted);
    setupLocalVAD(localStream);
    S.voice = { serverId, channelId };
    S.muted = false;
    S.deafened = false;
    S.screenSharing = false;

    // Atualização otimista de participantes na sidebar
    if (!S.voiceStates[serverId]) S.voiceStates[serverId] = {};
    if (!S.voiceStates[serverId][channelId]) S.voiceStates[serverId][channelId] = [];
    if (S.user && !S.voiceStates[serverId][channelId].some(u => u.id === S.user.id)) {
      S.voiceStates[serverId][channelId].push({
        id: S.user.id,
        username: S.user.username,
        displayName: S.user.displayName || S.user.username,
        avatar: S.user.avatar,
        color: S.user.color,
        muted: false,
        deafened: false,
        screenSharing: false
      });
    }

    startVoiceTimer();
    updateVoiceButtons();
    updateVoiceBar(serverId, channelId);

    // Navega diretamente para a aba da call
    if ($('chatView')) $('chatView').style.display = 'none';
    if ($('voiceRoomView')) $('voiceRoomView').style.display = 'flex';
    S.view = serverId;
    S.channelId = channelId;

    renderSidebar();
    renderHeader();
    renderVoiceRoom();

    send({ t: 'voiceJoin', serverId, channelId });
  } catch (e) {
    openMicHelpModal();
  }
}

function openMicHelpModal() {
  openModal(`
    <h2>🎤 Microfone bloqueado</h2>
    <p>O JohnCord precisa do microfone para você entrar na call. Libere o acesso:</p>
    <div style="background:var(--bg-dark,#1e1f22);border-radius:8px;padding:12px;margin-bottom:14px;font-size:14px;line-height:1.7">
      <b>Chrome / Edge:</b> clique no ícone 🔒 ou 🎥 na barra de endereço → Permissões → Microfone → Permitir<br>
      <b>Firefox:</b> ícone 🛡️ na barra de endereço → Remover bloqueio de microfone<br>
      Depois <b>recarregue a página (F5)</b> e aceite a permissão quando aparecer.
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="location.reload()">🔄 Recarregar agora</button>
      <button class="btn btn-primary" onclick="closeModal()">Entendi</button>
    </div>`);
}

function leaveVoice() {
  cleanupLocalVAD();
  stopScreenShare(false);
  stopVoiceTimer();
  stopRelaySender();
  Object.values(peers).forEach(pc => { clearTimeout(pc._watchdog); pc.close(); });
  for (const k of Object.keys(peers)) delete peers[k];
  for (const k of Object.keys(pendingCandidates)) delete pendingCandidates[k];
  for (const k of Object.keys(connStatus)) delete connStatus[k];
  for (const k of Object.keys(peerAudioStreams)) delete peerAudioStreams[k];
  for (const k of Object.keys(peerVideoStreams)) delete peerVideoStreams[k];
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  document.querySelectorAll('audio.remote-audio, video.remote-video').forEach(el => el.remove());

  const prevVoice = S.voice;
  if (S.voice) {
    // Remove usuário otimisticamente do estado de voz
    if (S.voiceStates[S.voice.serverId] && S.voiceStates[S.voice.serverId][S.voice.channelId]) {
      S.voiceStates[S.voice.serverId][S.voice.channelId] = S.voiceStates[S.voice.serverId][S.voice.channelId].filter(u => u.id !== S.user?.id);
    }
    send({ t: 'voiceLeave' });
    S.voice = null;
  }

  S.muted = false;
  S.deafened = false;
  S.screenSharing = false;
  updateVoiceButtons();
  updateVoiceBar(null);

  // Sai direto da tela da call e retorna ao chat de texto
  if ($('voiceRoomView')) $('voiceRoomView').style.display = 'none';
  if ($('chatView')) $('chatView').style.display = 'flex';

  if (prevVoice && prevVoice.serverId !== 'dm') {
    const srv = S.servers.find(s => s.id === prevVoice.serverId);
    const firstText = srv ? srv.channels.find(c => c.type === 'text') : null;
    if (firstText) {
      openChannel(firstText.id);
    } else {
      renderSidebar();
      renderHeader();
      renderMessages();
    }
  } else if (prevVoice && prevVoice.serverId === 'dm') {
    if (S.dmId) renderDmMessages();
    else renderHomeMain();
    renderSidebar();
    renderHeader();
  } else {
    renderSidebar();
    renderHeader();
  }
}

function toggleMute() {
  if (S.deafened) {
    toggleDeafen();
    return;
  }
  S.muted = !S.muted;
  if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !S.muted);
  if (S.muted) setLocalSpeaking(false);
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
    setLocalSpeaking(false);
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
      video: {
        cursor: 'always',
        displaySurface: 'monitor'
      },
      audio: true
    });
    S.screenSharing = true;
    send({ t: 'voiceScreen', screenSharing: true });

    // Envia APENAS o video da tela - o audio da tela sobrescreveria a voz
    // de quem assiste (o microfone continua sendo transmitido separadamente)
    for (const [pid, pc] of Object.entries(peers)) {
      screenStream.getVideoTracks().forEach(t => pc.addTrack(t, screenStream));
      makeOffer(pc, pid);
    }

    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare(true);
    };

    updateVoiceBar(S.voice.serverId, S.voice.channelId);
    renderVoiceRoom();
    toast('🖥️ Você está transmitindo sua tela ao vivo!');
  } catch (err) {
    if (err.name !== 'NotAllowedError') {
      toast('⚠ Não foi possível iniciar o compartilhamento de tela.');
    }
  }
}

function stopScreenShare(notify = true) {
  if (screenStream) {
    for (const [pid, pc] of Object.entries(peers)) {
      const senders = pc.getSenders();
      senders.forEach(sender => {
        if (sender.track && screenStream.getTracks().includes(sender.track)) {
          try { pc.removeTrack(sender); } catch (e) {}
        }
      });
    }
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  if (S.screenSharing) {
    S.screenSharing = false;
    if (S.spotlightUser === S.user?.id) S.spotlightUser = null;
    if (notify) send({ t: 'voiceScreen', screenSharing: false });
    for (const [pid, pc] of Object.entries(peers)) {
      makeOffer(pc, pid);
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
  let callTitle = '';
  if (serverId === 'dm') {
    const dm = S.dmList.find(x => x.dmId === channelId);
    const dmName = dm ? (dm.user.displayName || dm.user.username) : 'Amigo';
    callTitle = `📞 Privado / @${esc(dmName)}`;
  } else {
    const srv = S.servers.find(s => s.id === serverId);
    const ch = srv && srv.channels.find(c => c.id === channelId);
    callTitle = `🔊 ${esc(srv ? srv.name : '')} / ${esc(ch ? ch.name : channelId || '')}`;
  }
  const timeText = voiceStartTime ? formatDuration((Date.now() - voiceStartTime) / 1000) : '00:00';
  const bar = document.createElement('div');
  bar.className = 'call-bar';
  bar.innerHTML = `
    <div class="call-info-row" id="cbInfo" title="Clique para abrir a tela da call">
      <div class="call-info">${callTitle}</div>
      <span class="call-time-badge">${timeText}</span>
    </div>
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
if ($('btnVrFullscreen')) {
  $('btnVrFullscreen').onclick = () => {
    const stage = $('voiceRoomStage');
    if (stage) toggleFullscreen(stage);
  };
}
if ($('vrBtnChat')) {
  $('vrBtnChat').onclick = () => {
    if (S.voice && S.voice.serverId === 'dm') {
      openDm(S.voice.channelId);
    } else {
      const srv = currentServer();
      const firstText = srv ? srv.channels.find(c => c.type === 'text') : null;
      if (firstText) openChannel(firstText.id);
      else {
        if ($('chatView')) $('chatView').style.display = 'flex';
        if ($('voiceRoomView')) $('voiceRoomView').style.display = 'none';
      }
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
  const srv = S.servers.find(s => s.id === srvId);
  const ch = srv && srv.channels.find(c => c.id === chId);

  if ($('vrChanTitle')) {
    if (srvId === 'dm') {
      const dm = S.dmList.find(x => x.dmId === chId);
      const dmName = dm ? (dm.user.displayName || dm.user.username) : 'Amigo';
      $('vrChanTitle').textContent = `📞 Chamada Privada — @${dmName}`;
    } else {
      $('vrChanTitle').textContent = `🔊 ${srv ? srv.name : ''} / ${ch ? ch.name : 'Chamada'}`;
    }
  }

  const users = ((S.voiceStates[srvId] || {})[chId]) || [];
  const otherUsers = users.filter(u => u.id !== S.user?.id);

  // Determina se devemos renderizar em modo Spotlight (Foco na tela de alguém)
  let spotlightTarget = null;
  if (S.spotlightUser) {
    if (S.spotlightUser === S.user?.id && S.screenSharing && screenStream) {
      spotlightTarget = { isMe: true, user: S.user, stream: screenStream };
    } else if (peerVideoStreams[S.spotlightUser]) {
      const u = otherUsers.find(x => x.id === S.spotlightUser) || { id: S.spotlightUser, username: 'Usuário' };
      spotlightTarget = { isMe: false, user: u, stream: peerVideoStreams[S.spotlightUser] };
    }
  }

  // MODO SPOTLIGHT (TEATRO / PALCO PRINCIPAL)
  if (spotlightTarget) {
    const wrap = document.createElement('div');
    wrap.className = 'vr-spotlight-layout';

    // Palco Principal
    const main = document.createElement('div');
    main.className = 'vr-spotlight-main';
    
    const v = document.createElement('video');
    v.autoplay = true;
    v.playsInline = true;
    v.muted = true;
    v.srcObject = spotlightTarget.stream;
    v.title = "Clique duplo para Tela Cheia";
    v.ondblclick = () => toggleFullscreen(v);
    main.appendChild(v);
    v.play().catch(() => {});

    const overlay = document.createElement('div');
    overlay.className = 'vr-tile-overlay';
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span class="badge-live-pulse">🔴 AO VIVO</span>
        <span style="font-weight:700">${esc(spotlightTarget.user.displayName || spotlightTarget.user.username)}</span>
      </div>
      <div class="vr-actions">
        <button class="vr-action-btn" id="spotUnfocusBtn" title="Voltar para Grade">⊞ Modo Grade</button>
        ${!spotlightTarget.isMe ? `<button class="vr-action-btn" id="spotVolBtn">🔊 ${getUserVolume(spotlightTarget.user.id)}%</button>` : ''}
        <button class="vr-action-btn" id="spotFsBtn">⛶ Tela Cheia</button>
      </div>
    `;

    overlay.querySelector('#spotUnfocusBtn').onclick = () => {
      S.spotlightUser = null;
      renderVoiceRoom();
    };
    overlay.querySelector('#spotFsBtn').onclick = () => toggleFullscreen(v);
    const sVol = overlay.querySelector('#spotVolBtn');
    if (sVol) sVol.onclick = () => openVolumeModal(spotlightTarget.user.id, spotlightTarget.user.displayName || spotlightTarget.user.username);

    main.appendChild(overlay);
    wrap.appendChild(main);

    // Barra de Miniaturas dos Participantes
    const strip = document.createElement('div');
    strip.className = 'vr-spotlight-strip';

    // Minha miniatura na barra
    const myStrip = document.createElement('div');
    myStrip.className = 'vr-strip-tile' + (S.spotlightUser === S.user?.id ? ' active' : '');
    myStrip.dataset.uid = S.user?.id;
    const myStripAv = document.createElement('div');
    myStripAv.className = 'user-avatar';
    setAvatar(myStripAv, S.user);
    myStrip.appendChild(myStripAv);
    const myStripName = document.createElement('span');
    myStripName.className = 'vr-strip-name';
    myStripName.textContent = `${S.user?.displayName || S.user?.username || 'Você'} (Você)`;
    myStrip.appendChild(myStripName);

    if (S.screenSharing) {
      myStrip.onclick = () => { S.spotlightUser = S.user?.id; renderVoiceRoom(); };
      myStrip.title = "Clique para focar na sua transmissão";
    }
    strip.appendChild(myStrip);

    // Miniaturas dos outros
    otherUsers.forEach(u => {
      const uStrip = document.createElement('div');
      uStrip.className = 'vr-strip-tile' + (S.spotlightUser === u.id ? ' active' : '');
      uStrip.dataset.uid = u.id;
      const hasScreen = u.screenSharing || !!peerVideoStreams[u.id];
      const uStripAv = document.createElement('div');
      uStripAv.className = 'user-avatar';
      setAvatar(uStripAv, u);
      uStrip.appendChild(uStripAv);
      const uStripName = document.createElement('span');
      uStripName.className = 'vr-strip-name';
      uStripName.textContent = u.displayName || u.username;
      uStrip.appendChild(uStripName);
      if (hasScreen) {
        const liveBadge = document.createElement('span');
        liveBadge.className = 'badge-live-pulse';
        liveBadge.style.cssText = 'font-size:9px;padding:1px 4px;margin-top:2px';
        liveBadge.textContent = 'AO VIVO';
        uStrip.appendChild(liveBadge);
        uStrip.onclick = () => { S.spotlightUser = u.id; renderVoiceRoom(); };
        uStrip.title = "Clique para focar nesta transmissão";
      }
      strip.appendChild(uStrip);
    });

    wrap.appendChild(strip);
    stage.innerHTML = '';
    stage.appendChild(wrap);
    updateVoiceControls();
    return;
  }

  // MODO GRADE (MOSAICO)
  const hasAnyScreen = S.screenSharing || otherUsers.some(u => u.screenSharing || !!peerVideoStreams[u.id]);
  const grid = document.createElement('div');
  grid.className = 'vr-grid' + (hasAnyScreen ? ' has-screen' : '');

  // Card do Usuário Local
  const myTile = document.createElement('div');
  myTile.className = 'vr-tile' + (S.screenSharing ? ' is-screen' : '');
  myTile.dataset.uid = S.user?.id;
  
  if (S.screenSharing && screenStream) {
    const v = document.createElement('video');
    v.autoplay = true;
    v.muted = true;
    v.playsInline = true;
    v.srcObject = screenStream;
    v.title = "Clique duplo para Tela Cheia";
    v.ondblclick = () => toggleFullscreen(v);
    myTile.appendChild(v);
    v.play().catch(() => {});
    const hint = document.createElement('div');
    hint.className = 'fullscreen-hint';
    hint.textContent = '⛶ Duplo clique para Tela Cheia';
    myTile.appendChild(hint);
  } else {
    const myDispName = S.user?.displayName || S.user?.username || 'Você';
    const myTag = `@${S.user?.username || ''}`;
    const myCustom = S.user?.customStatus ? `<span class="vr-user-status">${esc(S.user.customStatus)}</span>` : '';
    
    const tileAvatarBox = document.createElement('div');
    tileAvatarBox.className = 'vr-tile-avatar';
    const av = document.createElement('div');
    av.className = 'user-avatar';
    setAvatar(av, S.user);
    tileAvatarBox.appendChild(av);
    const nameBox = document.createElement('div');
    nameBox.className = 'vr-user-name-box';
    nameBox.innerHTML = `
      <span class="vr-display-name">${esc(myDispName)} (Você)</span>
      <span class="vr-user-tag">${esc(myTag)}</span>
      ${myCustom}
    `;
    tileAvatarBox.appendChild(nameBox);
    myTile.appendChild(tileAvatarBox);
  }

  const myOverlay = document.createElement('div');
  myOverlay.className = 'vr-tile-overlay';
  myOverlay.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px">
      ${S.screenSharing ? `<span class="badge-live-pulse">🔴 AO VIVO</span>` : ''}
      <span>${esc(S.user?.displayName || S.user?.username || 'Você')} (Você)</span>
    </div>
    <div class="vr-actions">
      <span>${S.deafened ? '🎧🔇' : (S.muted ? '🔇' : '🎙️')}</span>
      ${S.screenSharing ? `<button class="vr-action-btn" id="mySpotBtn" title="Focar Transmissão">🔍 Focar</button>` : ''}
      ${S.screenSharing ? `<button class="vr-action-btn" id="myFsBtn" title="Tela Cheia">⛶ Tela Cheia</button>` : ''}
    </div>
  `;
  const mySpot = myOverlay.querySelector('#mySpotBtn');
  if (mySpot) {
    mySpot.onclick = (e) => {
      e.stopPropagation();
      S.spotlightUser = S.user?.id;
      renderVoiceRoom();
    };
  }
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
  otherUsers.forEach(u => {
    const hasVideo = !!peerVideoStreams[u.id];
    const isScreen = u.screenSharing || hasVideo;
    const tile = document.createElement('div');
    tile.className = 'vr-tile' + (isScreen ? ' is-screen' : '');
    tile.dataset.uid = u.id;

    if (hasVideo) {
      const v = document.createElement('video');
      v.autoplay = true;
      v.playsInline = true;
      v.muted = true;
      v.srcObject = peerVideoStreams[u.id];
      v.title = "Clique duplo para Tela Cheia";
      v.ondblclick = () => toggleFullscreen(v);
      tile.appendChild(v);
      v.play().catch(() => {});
      const hint = document.createElement('div');
      hint.className = 'fullscreen-hint';
      hint.textContent = '⛶ Duplo clique para Tela Cheia';
      tile.appendChild(hint);
    } else if (u.screenSharing) {
      const tileAvatarBox = document.createElement('div');
      tileAvatarBox.className = 'vr-tile-avatar';
      const av = document.createElement('div');
      av.className = 'user-avatar';
      setAvatar(av, u);
      tileAvatarBox.appendChild(av);
      tileAvatarBox.innerHTML += `<span class="badge-live-pulse" style="margin-top:8px">📡 Conectando Transmissão...</span>`;
      tile.appendChild(tileAvatarBox);
    } else {
      const uDispName = u.displayName || u.username;
      const uTag = `@${u.username}`;
      const uCustom = u.customStatus ? `<span class="vr-user-status">${esc(u.customStatus)}</span>` : '';
      
      const tileAvatarBox = document.createElement('div');
      tileAvatarBox.className = 'vr-tile-avatar';
      tileAvatarBox.style.cursor = 'pointer';
      tileAvatarBox.onclick = () => openUserProfileModal(u.id);
      const av = document.createElement('div');
      av.className = 'user-avatar';
      setAvatar(av, u);
      tileAvatarBox.appendChild(av);
      const nameBox = document.createElement('div');
      nameBox.className = 'vr-user-name-box';
      nameBox.innerHTML = `
        <span class="vr-display-name">${esc(uDispName)}</span>
        <span class="vr-user-tag">${esc(uTag)}</span>
        ${uCustom}
      `;
      tileAvatarBox.appendChild(nameBox);
      tile.appendChild(tileAvatarBox);
    }

    const overlay = document.createElement('div');
    overlay.className = 'vr-tile-overlay';
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;cursor:pointer" onclick="openUserProfileModal('${u.id}')">
        ${isScreen ? `<span class="badge-live-pulse">🔴 AO VIVO</span>` : ''}
        <span>${esc(u.displayName || u.username)}</span>
        <span data-conn-uid="${u.id}" style="font-size:11px"></span>
      </div>
      <div class="vr-actions">
        <span>${u.deafened ? '🎧🔇' : (u.muted ? '🔇' : '🎙️')}</span>
        <button class="vr-action-btn vr-vol-btn" title="Ajustar Volume">🔊 ${getUserVolume(u.id)}%</button>
        ${isScreen ? `<button class="vr-action-btn vr-spot-btn" title="Assistir e Focar na Transmissão">👁️ Assistir</button>` : ''}
        ${hasVideo ? `<button class="vr-action-btn vr-fs-btn" title="Tela Cheia">⛶ Tela Cheia</button>` : ''}
      </div>
    `;

    const volBtn = overlay.querySelector('.vr-vol-btn');
    if (volBtn) volBtn.onclick = (e) => { e.stopPropagation(); openVolumeModal(u.id, u.displayName || u.username); };

    const spotBtn = overlay.querySelector('.vr-spot-btn');
    if (spotBtn) {
      spotBtn.onclick = (e) => {
        e.stopPropagation();
        S.spotlightUser = u.id;
        renderVoiceRoom();
      };
    }

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

/* ---------- ICE / TURN ---------- */
function buildIceServers() {
  const servers = [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
        'stun:stun.services.mozilla.com'
      ]
    }
  ];
  const turn = window.JOHNCORD_TURN;
  // so usa o TURN se as credenciais foram realmente configuradas
  if (turn && turn.urls && turn.username && turn.credential &&
      !String(turn.username).includes('COLOQUE') && !String(turn.credential).includes('COLOQUE')) {
    servers.push({ urls: turn.urls, username: turn.username, credential: turn.credential });
  }
  return servers;
}

// Status de conexao por pessoa: pid -> 'connecting'|'connected'|'failed'|'retrying'
const connStatus = {};

function getPeer(peerId, initiator) {
  if (peers[peerId]) return peers[peerId];
  if (!pendingCandidates[peerId]) pendingCandidates[peerId] = [];

  const pc = new RTCPeerConnection({ iceServers: buildIceServers() });
  peers[peerId] = pc;
  // Perfect negotiation: polite e quem tem o id menor (aceita rollback em conflito)
  pc._polite = S.user.id < peerId;
  pc._makingOffer = false;
  pc._ignoreOffer = false;
  pc._settingAnswerPending = false;
  connStatus[peerId] = 'connecting';
  renderConnBadges();

  // Watchdog: se nao conectar em 10s, reinicia o ICE invertendo quem inicia
  clearTimeout(pc._watchdog);
  pc._watchdog = setTimeout(() => {
    if (peers[peerId] === pc && connStatus[peerId] !== 'connected') {
      console.warn('[voz] watchdog: reiniciando conexao com', peerId);
      recreatePeer(peerId, true);
    }
  }, 10000);

  // Reconexao automatica se a conexao falhar
  pc.onconnectionstatechange = () => {
    if (!peers[peerId] || peers[peerId] !== pc) return;
    if (pc.connectionState === 'connected') {
      clearTimeout(pc._watchdog);
      connStatus[peerId] = 'connected';
      renderConnBadges();
    } else if (pc.connectionState === 'failed') {
      connStatus[peerId] = 'failed';
      renderConnBadges();
      toast('⚠ Conexão com um participante falhou. Tentando novamente…');
      recreatePeer(peerId, true);
    } else if (pc.connectionState === 'disconnected') {
      connStatus[peerId] = 'connecting';
      renderConnBadges();
      try { pc.restartIce(); } catch (e) {}
    }
  };

  if (localStream) {
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  }
  if (screenStream) {
    screenStream.getVideoTracks().forEach(t => pc.addTrack(t, screenStream));
  }

  pc.onicecandidate = e => {
    if (e.candidate) {
      send({ t: 'signal', to: peerId, data: { type: 'candidate', candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate } });
    }
  };

  pc.ontrack = e => {
    unlockAudioContext();
    if (e.track.kind === 'video') {
      console.log('[WebRTC Video] Recebeu faixa de video de', peerId);
      const stream = e.streams[0] || new MediaStream([e.track]);
      peerVideoStreams[peerId] = stream;
      e.track.onended = () => {
        delete peerVideoStreams[peerId];
        if (S.spotlightUser === peerId) S.spotlightUser = null;
        renderVoiceRoom();
      };
      renderVoiceRoom();
    } else {
      // Acumula faixas de audio do peer (voz + possiveis novas fontes)
      if (!peerAudioStreams[peerId]) peerAudioStreams[peerId] = new MediaStream();
      if (!peerAudioStreams[peerId].getTracks().includes(e.track)) {
        peerAudioStreams[peerId].addTrack(e.track);
      }
      let audio = document.getElementById('audio-' + peerId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'audio-' + peerId;
        audio.autoplay = true;
        audio.playsInline = true;
        audio.className = 'remote-audio';
        audio.style.position = 'fixed';
        audio.style.top = '-9999px';
        audio.style.left = '-9999px';
        audio.style.opacity = '0';
        audio.style.pointerEvents = 'none';
        document.body.appendChild(audio);
      }
      audio.srcObject = peerAudioStreams[peerId];
      audio.muted = S.deafened;
      audio.volume = S.deafened ? 0 : Math.min(1, Math.max(0, getUserVolume(peerId) / 100));

      const tryPlay = () => {
        audio.play().catch(() => {
          const unlock = () => {
            audio.play().catch(() => {});
            document.removeEventListener('click', unlock);
            document.removeEventListener('keydown', unlock);
          };
          document.addEventListener('click', unlock, { once: true });
          document.addEventListener('keydown', unlock, { once: true });
        });
      };
      tryPlay();
    }
  };

  if (initiator) makeOffer(pc, peerId);
  return pc;
}

function recreatePeer(peerId, initiator) {
  const old = peers[peerId];
  if (old) {
    clearTimeout(old._watchdog);
    try { old.close(); } catch (e) {}
    delete peers[peerId];
  }
  delete pendingCandidates[peerId];
  delete peerAudioStreams[peerId];
  delete peerVideoStreams[peerId];
  if (S.voice) {
    connStatus[peerId] = initiator ? 'retrying' : 'connecting';
    renderConnBadges();
    getPeer(peerId, initiator);
  }
}

// Perfect negotiation: criacao de oferta com fila quando ocupado
const renegQueue = new Set();
async function makeOffer(pc, peerId) {
  if (!peers[peerId] || peers[peerId] !== pc) return;
  if (pc.signalingState !== 'stable') {
    renegQueue.add(peerId); // tenta de novo apos aplicar a resposta pendente
    return;
  }
  try {
    pc._makingOffer = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ t: 'signal', to: peerId, data: { type: 'offer', sdp: pc.localDescription } });
  } catch (e) {
    console.warn('[voz] falha ao criar oferta para', peerId, e);
  } finally {
    pc._makingOffer = false;
  }
}

function flushRenegQueue(peerId) {
  if (!renegQueue.has(peerId)) return;
  renegQueue.delete(peerId);
  const pc = peers[peerId];
  if (pc && pc.signalingState === 'stable') makeOffer(pc, peerId);
}

function syncVoicePeers() {
  if (!S.voice) return;
  const inChan = (((S.voiceStates[S.voice.serverId] || {})[S.voice.channelId]) || [])
    .map(u => u.id).filter(id => id !== S.user?.id);

  for (const pid of Object.keys(peers)) {
    if (!inChan.includes(pid)) {
      const old = peers[pid];
      if (old) clearTimeout(old._watchdog);
      peers[pid].close();
      delete peers[pid];
      delete pendingCandidates[pid];
      delete connStatus[pid];
      delete peerAudioStreams[pid];
      delete peerVideoStreams[pid];
      const a = document.getElementById('audio-' + pid);
      if (a) a.remove();
      const v = document.getElementById('video-' + pid);
      if (v) v.remove();
      if (S.spotlightUser === pid) S.spotlightUser = null;
    }
  }
  // Criacao deterministica: apenas o maior id inicia a oferta (evita glare inicial)
  inChan.forEach(pid => {
    if (!peers[pid] && S.user.id > pid) getPeer(pid, true);
  });
  renderVoiceRoom();
}

async function flushPendingCandidates(peerId, pc) {
  const list = pendingCandidates[peerId] || [];
  pendingCandidates[peerId] = [];
  for (const c of list) {
    try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
  }
}

// Perfect negotiation completa (padrao W3C - usado pelo Discord/Meet)
async function handleSignal(from, data) {
  let pc = peers[from];
  if (data.type === 'candidate') {
    // candidatos podem chegar antes da oferta: enfileira
    if (!pc) {
      if (!pendingCandidates[from]) pendingCandidates[from] = [];
      pendingCandidates[from].push(data.candidate);
      return;
    }
    try {
      if (pc._ignoreOffer) return;
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        if (!pendingCandidates[from]) pendingCandidates[from] = [];
        pendingCandidates[from].push(data.candidate);
      }
    } catch (e) {
      if (!pc._ignoreOffer) console.warn('[voz] erro ICE candidate', e);
    }
    return;
  }

  try {
    if (data.type === 'offer') {
      const offerCollision =
        pc && (pc._makingOffer || pc.signalingState !== 'stable');
      pc = pc || getPeer(from, false);
      pc._ignoreOffer = !pc._polite && offerCollision;
      if (pc._ignoreOffer) {
        console.log('[voz] oferta conflitante ignorada (impolite) de', from);
        return;
      }
      if (localStream) {
        const senders = pc.getSenders().map(s => s.track);
        localStream.getTracks().forEach(t => {
          if (!senders.includes(t)) pc.addTrack(t, localStream);
        });
      }
      if (screenStream) {
        const senders = pc.getSenders().map(s => s.track);
        screenStream.getVideoTracks().forEach(t => {
          if (!senders.includes(t)) pc.addTrack(t, screenStream);
        });
      }
      if (offerCollision) {
        await pc.setLocalDescription({ type: 'rollback' });
      }
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      await flushPendingCandidates(from, pc);
      const answer = await pc.createAnswer();
      pc._settingAnswerPending = true;
      await pc.setLocalDescription(answer);
      pc._settingAnswerPending = false;
      send({ t: 'signal', to: from, data: { type: 'answer', sdp: pc.localDescription } });
      flushRenegQueue(from);
    } else if (data.type === 'answer') {
      if (!pc) return;
      if (pc.signalingState === 'have-local-offer') {
        pc._settingAnswerPending = true;
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        pc._settingAnswerPending = false;
        await flushPendingCandidates(from, pc);
        flushRenegQueue(from);
      }
    }
  } catch (e) {
    console.warn('[voz] erro na sinalização de', from, data.type, e);
    // recupera: se a descricao remota ficou corrompida, recria a conexao
    if (data.type === 'offer' && peers[from]) recreatePeer(from, S.user.id > from);
  }
}

// Badges visuais de status de conexao por participante
let badgeTimer = null;
function renderConnBadges() {
  if (badgeTimer) return;
  badgeTimer = setTimeout(() => {
    badgeTimer = null;
    document.querySelectorAll('[data-conn-uid]').forEach(el => {
      const st = connStatus[el.dataset.connUid];
      el.textContent = st === 'connected' ? '✓' :
        st === 'failed' ? '⚠' :
        st === 'retrying' ? '↻ tentando…' : '⏳ conectando…';
      el.style.color = st === 'connected' ? '#3ba55c' :
        st === 'connecting' || st === 'retrying' ? '#faa61a' : '#ed4245';
      el.title = 'Status da conexão de voz com este usuário';
    });
  }, 120);
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

/* ---------- Chamada privada (DM) Unificada com Voice System ---------- */
let dmCallTimeout = null;

function onIncomingDmCall(dmId, fromUser) {
  if (S.voice) return; // Se já estiver em call, não interrompe
  unlockAudioContext();
  const name = fromUser ? (fromUser.displayName || fromUser.username) : 'Alguém';
  openModal(`
    <h2>📞 Ligação Privada Recebida</h2>
    <div style="display:flex;align-items:center;gap:16px;margin:20px 0">
      <div class="user-avatar" id="incAv" style="width:64px;height:64px;font-size:28px;border-radius:50%;box-shadow:0 0 0 3px #23a55a, 0 0 16px rgba(35,165,90,0.6)"></div>
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--header)">${esc(name)}</div>
        <div style="font-size:13px;color:var(--text-dim);margin-top:4px">está te chamando para uma conversa privada no PV</div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-danger" id="incDecline">✕ Recusar</button>
      <button class="btn btn-primary" id="incAccept" style="background:#23a55a">📞 Atender Chamada</button>
    </div>
  `);
  if ($('incAv') && fromUser) setAvatar($('incAv'), fromUser);
  $('modalOverlay').onclick = null;
  $('incAccept').onclick = () => {
    closeModal();
    openDm(dmId);
    joinVoice('dm', dmId);
    openVoiceRoomView();
  };
  $('incDecline').onclick = () => {
    closeModal();
    send({ t: 'dmCallDecline', dmId });
  };
}

function handleDmRelay(from, p) {
  // Mantido para compatibilidade se houver extensões
}

/* ---------- Personalizacao de aparencia ---------- */
const THEME_PRESETS = {
  dark:  { '--bg-dark': '#1e1f22', '--bg-sidebar': '#2b2d31', '--bg-chat': '#313338', '--bg-input': '#383a40', '--text': '#dbdee1', '--text-dim': '#949ba4', '--header': '#f2f3f5', '--panel': '#232428' },
  light: { '--bg-dark': '#e3e5e8', '--bg-sidebar': '#f2f3f5', '--bg-chat': '#ffffff', '--bg-input': '#ebedef', '--text': '#2e3338', '--text-dim': '#5c5e66', '--header': '#060607', '--panel': '#ebedef' },
  oled:  { '--bg-dark': '#000000', '--bg-sidebar': '#0a0a0a', '--bg-chat': '#111111', '--bg-input': '#1a1a1a', '--text': '#dbdee1', '--text-dim': '#8a8f98', '--header': '#f2f3f5', '--panel': '#000000' }
};

function loadTheme() {
  try { return JSON.parse(localStorage.getItem('jc_theme')) || {}; } catch (e) { return {}; }
}

function applyTheme(t) {
  const preset = THEME_PRESETS[t.theme] || THEME_PRESETS.dark;
  const root = document.documentElement;
  root.dataset.theme = t.theme || 'dark';
  Object.entries(preset).forEach(([k, v]) => root.style.setProperty(k, v));
  root.style.setProperty('--blurple', t.accent || '#5865f2');
  root.style.setProperty('--font-app', t.font || "'Segoe UI', Roboto, Helvetica, Arial, sans-serif");
  root.style.setProperty('--font-size', (t.fontSize || 15) + 'px');
  document.body.style.fontFamily = t.font || '';
  document.body.style.fontSize = (t.fontSize || 15) + 'px';
}

function saveTheme(patch) {
  const t = Object.assign(loadTheme(), patch);
  localStorage.setItem('jc_theme', JSON.stringify(t));
  applyTheme(t);
}

function modalAppearance() {
  const t = loadTheme();
  const fonts = [
    ["Padrão (Discord)", "'Segoe UI', Roboto, Helvetica, Arial, sans-serif"],
    ["Arial", "Arial, sans-serif"],
    ["Georgia (Serifa)", "Georgia, serif"],
    ["Courier (Mono)", "'Courier New', monospace"],
    ["Verdana", "Verdana, sans-serif"],
    ["Trebuchet MS", "'Trebuchet MS', sans-serif"],
    ["Divertida (Comic)", "'Comic Sans MS', cursive"]
  ];
  openModal(`
    <h2>🎨 Personalizar JohnCord</h2>
    <p>Deixe o app com a sua cara — as mudanças são salvas automaticamente.</p>

    <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:6px">TEMA:</label>
    <div style="display:flex;gap:8px;margin-bottom:16px" id="themeModes">
      ${[['dark', '🌙 Escuro'], ['light', '☀️ Claro'], ['oled', '🖤 OLED']].map(([v, l]) =>
        `<button class="btn btn-small ${(t.theme || 'dark') === v ? 'btn-primary' : ''}" data-theme-val="${v}" style="flex:1">${l}</button>`).join('')}
    </div>

    <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:6px">COR DE DESTAQUE:</label>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
      <input type="color" id="thAccent" value="${t.accent || '#5865f2'}" style="width:44px;height:34px;border:none;background:none;cursor:pointer;padding:0">
      <div style="display:flex;gap:6px" id="accentPresets">
        ${['#5865f2', '#eb459e', '#3ba55c', '#faa61a', '#ed4245', '#00a8fc', '#9b59b6'].map(c =>
          `<div class="color-dot" data-accent="${c}" style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;border:2px solid rgba(255,255,255,.3)"></div>`).join('')}
      </div>
    </div>

    <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:6px">FONTE:</label>
    <select class="input" id="thFont" style="margin-bottom:16px">
      ${fonts.map(([l, v]) => `<option value='${esc(v)}' ${t.font === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select>

    <label style="font-size:12px;color:var(--text-dim);font-weight:700;display:block;margin-bottom:6px">TAMANHO DA FONTE: <span id="thSizeVal">${t.fontSize || 15}px</span></label>
    <input type="range" id="thSize" min="13" max="19" step="1" value="${t.fontSize || 15}" style="width:100%;margin-bottom:16px;accent-color:var(--blurple)">

    <div class="modal-actions">
      <button class="btn btn-ghost" id="thReset">↩ Restaurar padrão</button>
      <button class="btn btn-primary" onclick="closeModal()">Concluído</button>
    </div>`);

  document.querySelectorAll('#themeModes button').forEach(b => {
    b.onclick = () => {
      saveTheme({ theme: b.dataset.themeVal });
      document.querySelectorAll('#themeModes button').forEach(x => x.classList.remove('btn-primary'));
      b.classList.add('btn-primary');
    };
  });
  $('thAccent').oninput = e => saveTheme({ accent: e.target.value });
  document.querySelectorAll('#accentPresets .color-dot').forEach(d => {
    d.onclick = () => { saveTheme({ accent: d.dataset.accent }); $('thAccent').value = d.dataset.accent; };
  });
  $('thFont').onchange = e => saveTheme({ font: e.target.value });
  $('thSize').oninput = e => { $('thSizeVal').textContent = e.target.value + 'px'; saveTheme({ fontSize: Number(e.target.value) }); };
  $('thReset').onclick = () => {
    localStorage.removeItem('jc_theme');
    applyTheme({});
    modalAppearance();
    toast('Aparência restaurada.');
  };
}
applyTheme(loadTheme());

if ($('btnTheme')) $('btnTheme').onclick = modalAppearance;

/* ---------- Navegacao mobile (gavetas) ---------- */function closeDrawers() { document.body.classList.remove('rail-open', 'sidebar-open'); }
$('mobileMenu').onclick = e => {
  e.stopPropagation();
  document.body.classList.toggle('sidebar-open');
};
$('drawerBackdrop').onclick = closeDrawers;
document.addEventListener('click', e => {
  if (!document.body.classList.contains('sidebar-open') && !document.body.classList.contains('rail-open')) return;
  // primeiro toque abre o rail de servidores, segundo fecha
  if (e.target.closest('.rail') || e.target.closest('.sidebar')) return;
  closeDrawers();
});
// abrir canal pelo mobile ja fecha as gavetas
const origOpenChannel = openChannel;
openChannel = function (chId) { origOpenChannel(chId); closeDrawers(); };
const origOpenServerFn = openServer;
openServer = function (id) { origOpenServerFn(id); closeDrawers(); };
const origOpenDmFn = openDm;
openDm = function (dmId) { origOpenDmFn(dmId); closeDrawers(); };
const origOpenHomeFn = openHome;
openHome = function () { origOpenHomeFn(); closeDrawers(); };

connect();
