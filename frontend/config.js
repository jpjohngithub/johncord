// Configuracao do frontend JohnCord
// Deixe vazio ('') quando o site e o servidor rodam juntos (local ou Render).
// Quando o frontend esta na Netlify e o backend no Render, coloque aqui a URL do backend:
// window.JOHNCORD_BACKEND = 'https://johncord-backend.onrender.com';
window.JOHNCORD_BACKEND = '';

// SERVIDOR TURN - necessario para calls funcionarem 100% entre redes diferentes.
// Crie gratis em https://dashboard.metered.ca (sem cartao, 2 minutos):
//   1. Crie um app -> copie as credenciais TURN
//   2. Cole abaixo no lugar dos valores de exemplo
// Sem isso, a call pode falhar entre casas/redes diferentes (limitacao do WebRTC).
window.JOHNCORD_TURN = {
  urls: [
    'turn:standard.relay.metered.ca:80',
    'turn:standard.relay.metered.ca:443',
    'turn:standard.relay.metered.ca:443?transport=tcp'
  ],
  username: 'COLOQUE_SEU_USUARIO_AQUI',
  credential: 'COLOQUE_SUA_SENHA_AQUI'
};
