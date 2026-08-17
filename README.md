# 🎮 Johncord — Discord Clone em Tempo Real

Uma plataforma de comunicação moderna e completa em tempo real, inspirada no Discord, desenvolvida com alta fidelidade visual, canais de texto e voz, WebRTC, threads, sistema de servidores e permissões.

---

## ✨ Funcionalidades

### 💬 Chat e Mensagens
- **Mensagens em Tempo Real**: Websockets com Socket.IO para entrega instantânea de mensagens.
- **Message Grouping**: Agrupamento visual de mensagens do mesmo autor em até 7 minutos (estilo Discord).
- **Separadores de Data**: Linhas divisórias inteligentes ("Hoje", "Ontem", data formatada).
- **Threads (Tópicos)**: Criação de subtópicos a partir de qualquer mensagem.
- **Reações com Emoji**: Sistema completo com seletor categorizado e busca.
- **Anexos e Mídia**: Upload e pré-visualização de imagens e arquivos.
- **Formatação Markdown**: Negrito, itálico, tachado, blocos de código com destaque de sintaxe.
- **Indicador de Digitação**: 3 pontinhos animados ao vivo.

### 🎙️ Salas de Voz e Vídeo
- **WebRTC Mesh**: Chamadas de voz e vídeo peer-to-peer em tempo real.
- **Detecção de Fala**: Medidor de volume via Web Audio API com indicador visual verde ao falar.
- **Compartilhamento de Tela**: Transmissão de tela ou janelas com áudio.
- **Controles de Áudio**: Silenciar microfone, ensurdecer e ajuste de volume individual por usuário.
- **Efeitos Sonoros Sintetizados**: Sons de entrada, saída, mute/unmute e toque de chamada gerados via Web Audio API.

### 👥 Servidores, Canais e Permissões
- **Criação e Gestão de Servidores**: Personalização de nome, ícone e banner.
- **Canais e Categorias**: Organização hierárquica de canais de texto e voz.
- **Cargos e Permissões**: Sistema granular de permissões com cores customizadas.
- **Convites**: Geração e entrada por código de convite.

### 🤝 Painel Social & DMs
- **Mensagens Diretas**: Conversas 1-a-1 privadas.
- **Chamadas de DM**: Chamadas diretas de voz e vídeo com notificação sonora e modal de atendimento.
- **Sistema de Amigos**: Abas Disponíveis, Todos, Pendentes e Adicionar Amigo por tag (ex: `Nome#0001`).
- **Presença em Tempo Real**: Status Online, Ausente, Não Perturbe e Invisível + status personalizado.

---

## 🛠️ Tecnologias Utilizadas

### Frontend
- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS v4**
- **Zustand** (gerenciamento de estado)
- **Socket.IO Client** (tempo real)
- **Lucide Icons**

### Backend
- **Node.js** + **TypeScript** + **Express**
- **Socket.IO** (mensagens, presença, sinalização WebRTC)
- **JWT** (autenticação segura)
- **Banco de Dados JSON / TypeScript** (com auto-seed de dados e sem dependências nativas C++)

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- Node.js 18+ instalado

### Instalação

1. Clone o repositório:
```bash
git clone https://github.com/jpjohngithub/johncord.git
cd johncord
```

2. Instale as dependências:
```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

3. Inicie os servidores simultaneamente:
```bash
npm run dev
```

4. Acesse no navegador:
- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:3001](http://localhost:3001)

---

## 👤 Contas de Teste Pré-configuradas

| Email | Senha | Perfil |
|---|---|---|
| `dev@johncord.gg` | `123456` | John (Dono do servidor Comunidade Dev) |
| `ana@johncord.gg` | `123456` | Ana Dev |
| `lucas@johncord.gg` | `123456` | Lucas Gamer |

*Ou utilize o botão **"Entrar como Convidado"** na tela de login.*
