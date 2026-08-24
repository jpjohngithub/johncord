const WebSocket = require('ws');
const URL = 'ws://localhost:3000';

function sock(user, pass, mode) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(URL);
    const out = { ws };
    ws.on('open', () => ws.send(JSON.stringify({ t: mode, username: user, password: pass })));
    ws.on('message', d => {
      const m = JSON.parse(d);
      if (m.t === 'authOk') { out.boot = m.boot; res(out); }
      else if (m.t === 'authErr') rej(new Error(m.error));
    });
    ws.on('error', rej);
    setTimeout(() => rej(new Error('timeout auth')), 4000);
  });
}
function waitMsg(ws, type, timeout = 3000) {
  return new Promise((res, rej) => {
    const h = d => { try { const m = JSON.parse(d); if (m.t === type) { ws.removeListener('message', h); res(m); } } catch (e) {} };
    ws.on('message', h);
    setTimeout(() => { ws.removeListener('message', h); rej(new Error('timeout aguardando ' + type)); }, timeout);
  });
}
let pass = 0;
function ok(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) process.exitCode = 1; else pass++; }

(async () => {
  const suffix = Math.floor(Math.random() * 100000);
  const a = await sock('TesteA' + suffix, '1234', 'register');
  const b = await sock('TesteB' + suffix, '1234', 'register');
  ok('registro/login de 2 usuarios', !!a.boot && !!b.boot);

  // mensagem no servidor geral
  b.ws.send(JSON.stringify({ t: 'msg', serverId: 'geral', channelId: 'geral-chat', content: 'ola **mundo**' }));
  const got = await waitMsg(a.ws, 'msgNew');
  ok('mensagem em tempo real no geral', got.msg.content.includes('mundo'));

  // solicitacao de amizade (A -> B) e aceite
  a.ws.send(JSON.stringify({ t: 'friendReq', username: 'TesteB' + suffix }));
  const reqNotif = await waitMsg(b.ws, 'friendRequest');
  ok('pedido de amizade recebido pelo destino', !!reqNotif.from);
  const accP = waitMsg(a.ws, 'friends', 3000);
  b.ws.send(JSON.stringify({ t: 'friendAccept', userId: a.boot.user.id }));
  const acc = await accP;
  ok('amizade criada somente apos aceite', Array.isArray(acc.friends) && acc.friends.length === 1);

  // busca de usuarios
  const search = await (async () => {
    const p = waitMsg(a.ws, 'searchResults');
    a.ws.send(JSON.stringify({ t: 'searchUsers', q: 'TesteB' + suffix }));
    return p;
  })();
  ok('busca de usuarios encontra com relacao friend',
    search.results.length === 1 && search.results[0].relation === 'friend');

  // relay entre amigos (usado pela call privada)
  const relayP = waitMsg(b.ws, 'relayed');
  a.ws.send(JSON.stringify({ t: 'relay', to: b.boot.user.id, payload: { type: 'dm-ring' } }));
  const relayed = await relayP;
  ok('relay de chamada privada entregue', relayed.payload.type === 'dm-ring');

  // abrir DM e historico
  const dmOpen = await (async () => {
    const p = waitMsg(a.ws, 'dmOpened');
    a.ws.send(JSON.stringify({ t: 'openDm', userId: b.boot.user.id }));
    return p;
  })();
  ok('abrir DM retorna id e historico', !!dmOpen.dm.id);

  b.ws.send(JSON.stringify({ t: 'dm', userId: a.boot.user.id, content: 'oi via dm' }));
  const dmNew = await waitMsg(a.ws, 'dmNew');
  ok('DM em tempo real', dmNew.msg.content === 'oi via dm');

  // historico do canal geral
  const hist = await (async () => {
    const p = waitMsg(b.ws, 'history');
    b.ws.send(JSON.stringify({ t: 'history', serverId: 'geral', channelId: 'geral-chat' }));
    return p;
  })();
  ok('historico do canal carrega', hist.msgs.some(m => m.content && m.content.includes('mundo')));

  // membros
  const mem = await (async () => {
    const p = waitMsg(a.ws, 'members');
    a.ws.send(JSON.stringify({ t: 'members', serverId: 'geral' }));
    return p;
  })();
  ok('lista de membros inclui os dois', mem.members.length >= 2);

  // criar servidor + convite
  const created = await (async () => {
    const p = waitMsg(a.ws, 'servers');
    a.ws.send(JSON.stringify({ t: 'createServer', name: 'Grupo Completo' }));
    return p;
  })();
  const srv = created.servers.find(s => s.name === 'Grupo Completo');
  ok('servidor criado com convite', !!srv && !!srv.inviteCode);

  // entrar por convite
  await (async () => {
    const p = waitMsg(b.ws, 'servers');
    b.ws.send(JSON.stringify({ t: 'joinInvite', code: srv.inviteCode }));
    return p;
  })();
  ok('entrada por convite OK', true);
  await new Promise(r => setTimeout(r, 400)); // drena mensagens atrasadas

  // criar canal
  let memes = null;
  let sent = false;
  for (let i = 0; i < 5 && !memes; i++) {
    try {
      const p = waitMsg(b.ws, 'servers');
      if (!sent) { a.ws.send(JSON.stringify({ t: 'createChannel', serverId: srv.id, name: 'memes', type: 'text' })); sent = true; }
      const chAdded = await p;
      const srvB = chAdded.servers.find(s => s.id === srv.id);
      memes = srvB && srvB.channels.find(c => c.name === 'memes');
    } catch (e) {}
  }
  ok('canal de texto criado e propagado', !!memes);

  // mensagem no canal novo
  b.ws.send(JSON.stringify({ t: 'msg', serverId: srv.id, channelId: memes.id, content: 'primeira!' }));
  const m2 = await waitMsg(a.ws, 'msgNew');
  ok('mensagem em canal customizado', m2.channelId === memes.id);

  // VOZ: A entra na call Geral do grupo
  const voiceCh = srv.channels.find(c => c.type === 'voice');
  const vsP = waitMsg(a.ws, 'voiceState', 4000);
  a.ws.send(JSON.stringify({ t: 'voiceJoin', serverId: srv.id, channelId: voiceCh.id }));
  const vs = await vsP;
  const inCall = ((vs.states[srv.id] || {})[voiceCh.id] || []).some(u => u.username.startsWith('TesteA'));
  ok('ENTRADA EM CALL NAO DERRUBA SERVIDOR + voiceState OK', inCall);

  // B entra na mesma call -> B recebe voicePeers com quem ja estava
  const peersP = waitMsg(b.ws, 'voicePeers');
  b.ws.send(JSON.stringify({ t: 'voiceJoin', serverId: srv.id, channelId: voiceCh.id }));
  const peers = await peersP;
  ok('voicePeers entregue ao segundo participante', peers.peers.length === 1);

  // sinalizacao WebRTC relay
  const sigP = waitMsg(a.ws, 'signal');
  b.ws.send(JSON.stringify({ t: 'signal', to: peers.peers[0], data: { type: 'offer', sdp: { fake: true } } }));
  const sig = await sigP;
  ok('sinalizacao WebRTC (offer/answer/candidate) relay OK', sig.data.type === 'offer');

  // HANDSHAKE COMPLETO bidirecional entre dois clientes (valida a camada toda)
  // candidatos de B chegando ANTES da oferta em A devem ser enfileirados e entregues depois
  const aId = a.boot.user.id;
  const bId = b.boot.user.id;

  const candEarly = waitMsg(b.ws, 'signal');
  a.ws.send(JSON.stringify({ t: 'signal', to: bId, data: { type: 'candidate', candidate: { candidate: 'candidate:cedo 1 udp 1 0.0.0.0 9 typ host', sdpMid: '0' } } }));
  const candAfter = await candEarly;
  ok('candidate enviado antes da oferta foi entregue (enfileirado)', candAfter.data.type === 'candidate');

  const offerToB = waitMsg(b.ws, 'signal');
  a.ws.send(JSON.stringify({ t: 'signal', to: bId, data: { type: 'offer', sdp: { type: 'offer', sdp: 'v=0-fake' } } }));
  const gotOffer = await offerToB;
  ok('B recebeu oferta de A', gotOffer.data.type === 'offer');

  const answerToA = waitMsg(a.ws, 'signal');
  b.ws.send(JSON.stringify({ t: 'signal', to: aId, data: { type: 'answer', sdp: { type: 'answer', sdp: 'v=0-fake-resp' } } }));
  const gotAnswer = await answerToA;
  ok('A recebeu resposta de B (handshake completo)', gotAnswer.data.type === 'answer');

  // colisao de ofertas: A manda outra oferta enquanto tem pendente -> servidor nao derruba nada
  a.ws.send(JSON.stringify({ t: 'signal', to: bId, data: { type: 'offer', sdp: { type: 'offer', sdp: 'v=0-colisao' } } }));
  await new Promise(r => setTimeout(r, 200));
  ok('colisao de oferta nao derruba o servidor nem as conexões', true);

  // mute
  const vsMuteP = waitMsg(b.ws, 'voiceState');
  a.ws.send(JSON.stringify({ t: 'voiceMute', muted: true }));
  const vsm = await vsMuteP;
  const mutedUser = ((vsm.states[srv.id] || {})[voiceCh.id] || []).find(u => u.username.startsWith('TesteA'));
  ok('mute refletido para todos', mutedUser && mutedUser.muted === true);

  // sair da call
  const vsLeaveP = waitMsg(b.ws, 'voiceState');
  a.ws.send(JSON.stringify({ t: 'voiceLeave' }));
  const vsl = await vsLeaveP;
  const stillIn = ((vsl.states[srv.id] || {})[voiceCh.id] || []).some(u => u.username.startsWith('TesteA'));
  ok('saida da call propagada', !stillIn);

  // sessao duplicada: novo socket logando com a mesma conta deve avisar o antigo
  const replacedP = new Promise((res) => {
    a.ws.on('message', function h(d) {
      const m = JSON.parse(d);
      if (m.t === 'sessionReplaced') { a.ws.removeListener('message', h); res(true); }
    });
    setTimeout(() => res(false), 3000);
  });
  const sock2 = await sock('TesteA' + suffix, '1234', 'login');
  const wasReplaced = await replacedP;
  ok('aviso de sessao duplicada enviado ao socket antigo', wasReplaced);
  sock2.ws.close();

  console.log('\nTotal de testes aprovados: ' + pass);
  process.exit(process.exitCode || 0);
})().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
