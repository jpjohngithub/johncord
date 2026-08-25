# 🎮 JohnCord 2.0

Clone do Discord feito em Node.js puro + WebSocket, com chat e call de voz em tempo real. Tudo em um site!

## ✨ Funcionalidades

- **Servidor geral "JohnCord"** — todo mundo entra automaticamente (chat `#geral` + call 🔊 `Geral`)
- **Mensagens em tempo real** com indicador de digitação
- **Calls de voz em tempo real** via WebRTC (mesh P2P)
- **Criar grupos/servidores** com canais de texto e voz personalizados
- **Convite por URL** — gera link tipo `https://seusite/?join=codigo` que adiciona direto
- **Amigos e mensagens diretas (DM)**
- Lista de membros, presença online/offline, histórico persistente (`db.json`)
- Contas com usuário e senha

## 📁 Estrutura do projeto

```
frontend/   → Site estático (HTML/CSS/JS) → hospedado na Netlify
backend/    → Servidor Node.js (WebSocket + WebRTC) → hospedado no Render
netlify.toml → Config de deploy da Netlify
render.yaml  → Config de deploy do Render
```

## 🚀 Rodar localmente

```bash
cd backend
npm install
npm start
```

Abra **http://localhost:3000**

Para amigos acessarem na mesma rede, use seu IP local (ex: `http://192.168.x.x:3000`).

## 🌐 Deploy online

### 1. Backend no Render ⚠️ CONFIGURAÇÃO OBRIGATÓRIA

No dashboard do Render, o serviço precisa estar assim (Settings → Build & Deploy):

| Campo | Valor |
|---|---|
| **Root Directory** | *(vazio — deixa em branco!)* |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/healthz` |

> ⚠️ Se o serviço antigo tiver comandos com `prisma`, **apague/substitua** — o JohnCord novo não usa Prisma e o build falha, deixando o site fora do ar.

Depois: **Manual Deploy → Clear build cache & deploy**.

Verifique: `https://SEU-APP.onrender.com/healthz` deve responder `{"ok":true,...}`

> 💡 O plano gratuito do Render "dorme" após 15 min sem uso (primeiro acesso demora ~50s). Para manter acordado, crie um monitor grátis no UptimeRobot apontando para `/healthz`.

### 2. Frontend na Netlify
1. A Netlify está vinculada ao repositório GitHub e publica automaticamente a pasta `frontend/` (configurada via `netlify.toml`).
2. Para conectar o site ao backend:
   - **Pela própria interface do site:** Na tela de login ou dentro do app, clique em **⚙️ Configurar** e insira a URL do backend (ex: `https://johncord-backend.onrender.com`). Fica salvo automaticamente no seu navegador!
   - **Ou no código:** Edite `frontend/config.js` e defina:
     ```js
     window.JOHNCORD_BACKEND = 'https://johncord-backend.onrender.com';
     ```
3. Pronto! O site conecta no servidor automaticamente com chat e chamada de voz.

> 💡 **Dica:** O backend no Render também serve o frontend diretamente. Se você abrir a URL do Render no navegador, o JohnCord funciona completo por padrão.

## 📞 Calls entre redes diferentes (TURN)

Para a call funcionar 100% entre pessoas em **casas/redes diferentes**, é necessário um servidor TURN próprio (Discord, Meet e Zoom usam os deles):

1. Crie conta grátis em **https://dashboard.metered.ca** (sem cartão de crédito)
2. Crie um app e copie as credenciais TURN (usuário/senha)
3. Cole em `frontend/config.js`:
   ```js
   window.JOHNCORD_TURN = {
     urls: ['turn:standard.relay.metered.ca:80', 'turn:standard.relay.metered.ca:443'],
     username: 'SEU_USUARIO',
     credential: 'SUA_SENHA'
   };
   ```
4. Faça deploy novamente

Sem o TURN configurado, calls entre redes diferentes podem falhar dependendo do roteador — limitação física do WebRTC.

## 🧪 Testes

Com o servidor rodando:

```bash
cd backend
node test-ws.js
```

Cobre: registro, chat em tempo real, DMs, histórico, membros, criação de servidores/canais, convites, entrada/saída/mudo em call e sinalização WebRTC.
