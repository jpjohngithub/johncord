# 🎮 JohnCord 2.0

Clone do Discord feito em Node.js puro + WebSocket, com chat e call de voz em tempo real. Tudo em um site!

## ✨ Funcionalidades

- **Servidor geral "JohnCord"** — todo mundo entra automaticamente (chat `#geral` + call 🔊 `Geral`)
- **Mensagens em tempo real** com indicador de digitação
- **Calls de voz em tempo real** via WebRTC (mesh P2P)
- **Criar grupos/servidores** com canais de texto e voz personalizados
- **Convite por URL** — gera link tipo `http://host:3000/?join=codigo` que adiciona direto
- **Amigos e mensagens diretas (DM)**
- Lista de membros, presença online/offline, histórico persistente (`db.json`)
- Contas com usuário e senha

## 🚀 Como rodar

```bash
npm install
npm start
```

Depois abra **http://localhost:3000**

Para amigos acessarem na mesma rede, use seu IP local (ex: `http://192.168.x.x:3000`).

## 🛠 Tecnologias

- Node.js (sem frameworks)
- `ws` para WebSocket
- WebRTC para voz (STUN público)
- HTML/CSS/JS vanilla no frontend

## 🌐 Deploy online (Render)

O projeto está pronto para hospedar gratuitamente no [Render](https://render.com):

1. Crie um **Web Service** conectando este repositório
2. O `render.yaml` já está configurado (Node.js, `npm install` + `npm start`)
3. A porta é detectada automaticamente via variável `PORT`
4. WebSockets funcionam nativamente; calls de voz funcionam pois o Render serve em HTTPS

## 🧪 Testes

Com o servidor rodando:

```bash
node test-ws.js
```

Cobre: registro, chat em tempo real, DMs, histórico, membros, criação de servidores/canais, convites, entrada/saída/mudo em call e sinalização WebRTC.

