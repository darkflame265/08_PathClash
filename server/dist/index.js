"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const socketServer_1 = require("./socket/socketServer");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const configuredOrigins = [
    process.env.CLIENT_URL,
    ...(process.env.ALLOWED_ORIGINS?.split(',') ?? []),
]
    .map((origin) => origin?.trim())
    .filter((origin) => Boolean(origin));
const allowedOrigins = [...new Set([...defaultOrigins, ...configuredOrigins])];
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.length === defaultOrigins.length) {
                callback(null, true);
                return;
            }
            if (allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error(`CORS blocked for origin: ${origin}`));
        },
        methods: ['GET', 'POST'],
    },
});
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
(0, socketServer_1.initSocketServer)(io);
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`PathClash server running on http://localhost:${PORT}`);
});
