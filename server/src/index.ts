import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initSocketServer } from './socket/socketServer';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
  },
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

initSocketServer(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`PathClash server running on http://localhost:${PORT}`);
});
