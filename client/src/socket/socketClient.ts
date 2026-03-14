import { io, Socket } from "socket.io-client";
import { syncServerTime } from "./timeSync";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: false });
    socket.on("connect", () => {
      void syncServerTime(socket!);
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}
