import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { initDatabase } from './database/db';
import apiRouter from './routes/api';
import { setupSocket } from './socket';

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads
const uploadsPath = path.resolve(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));

// API Routes
app.use('/api', apiRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    platform: 'Johncord API',
    database: process.env.DATABASE_URL ? 'PostgreSQL (Cloud)' : 'Local File Cache'
  });
});

// Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

setupSocket(io);

async function start() {
  await initDatabase();

  server.listen(PORT, () => {
    console.log(`🚀 Johncord Server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.IO server initialized.`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
});
