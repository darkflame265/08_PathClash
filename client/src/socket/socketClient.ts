import { io, Socket } from "socket.io-client";
import { syncServerTime } from "./timeSync";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;
export const SOCKET_CONNECT_FAILED = "SOCKET_CONNECT_FAILED";

let socket: Socket | null = null;

function clearBufferedEvents(s: Socket): void {
  const bufferedSocket = s as Socket & {
    sendBuffer?: unknown[];
    receiveBuffer?: unknown[];
  };
  bufferedSocket.sendBuffer = [];
  bufferedSocket.receiveBuffer = [];
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      timeout: 10_000,
      reconnectionAttempts: 5,
      reconnectionDelay: 500,
      reconnectionDelayMax: 2_000,
    });
    socket.on("connect", () => {
      void syncServerTime(socket!);
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) {
    clearBufferedEvents(s);
    s.connect();
  }
  return s;
}

export function connectSocketReady(timeoutMs = 10_000): Promise<Socket> {
  const s = connectSocket();
  if (s.connected) return Promise.resolve(s);

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      s.off("connect", handleConnect);
      s.off("connect_error", handleConnectError);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resetSocket();
      reject(new Error(SOCKET_CONNECT_FAILED));
    };
    const handleConnect = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(s);
    };
    const handleConnectError = () => {
      fail();
    };
    const timeout = window.setTimeout(fail, timeoutMs);

    s.once("connect", handleConnect);
    s.once("connect_error", handleConnectError);
  });
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

export function resetSocket(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}
