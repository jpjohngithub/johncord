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

### 1. Backend no Render
1. No [Render](https://render.com), crie um **Web Service** apontando para este repositório
2. O `render.yaml` já está configurado (`rootDir: backend`)
3. Copie a URL gerada (ex: `https://johncord-backend.onrender.com`)

### 2. Frontend na Netlify
1. A Netlify já está vinculada ao repositório e publica a pasta `frontend/`
2. Edite `frontend/config.js` e coloque a URL do backend:
   ```js
   window.JOHNCORD_BACKEND = 'https://johncord-backend.onrender.com';
   ```
3. Pronto! O site conecta no servidor automaticamente.

> 💡 Alternativa: o backend também serve o site sozinho. Se hospedar apenas o Render, deixe `JOHNCORD_BACKEND = ''`.

## 🧪 Testes

Com o servidor rodando:

```bash
cd backend
node test-ws.js
```

Cobre: registro, chat em tempo real, DMs, histórico, membros, criação de servidores/canais, convites, entrada/saída/mudo em call e sinalização WebRTC.
