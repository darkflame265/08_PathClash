import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { initSocketServer } from "./socket/socketServer";

const app = express();
const httpServer = createServer(app);

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://zero8-pathclash-1.onrender.com",
];
const configuredOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.ALLOWED_ORIGINS?.split(",") ?? []),
]
  .map((origin) => origin?.trim())
  .filter((origin): origin is string => Boolean(origin));

const allowedOrigins = [...new Set([...defaultOrigins, ...configuredOrigins])];

const io = new Server(httpServer, {
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
    methods: ["GET", "POST"],
  },
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

initSocketServer(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`PathClash server running on http://localhost:${PORT}`);
});
