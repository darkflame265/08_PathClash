import type { Socket } from "socket.io-client";

let serverOffsetMs = 0;

export function getEstimatedServerNow(): number {
  return Date.now() + serverOffsetMs;
}

export function getServerOffsetMs(): number {
  return serverOffsetMs;
}

export async function syncServerTime(socket: Socket): Promise<void> {
  if (!socket.connected) return;

  const clientSentAt = Date.now();

  await new Promise<void>((resolve) => {
    let resolved = false;
    const timeoutId = window.setTimeout(() => {
      if (resolved) return;
      resolved = true;
      resolve();
    }, 1_500);

    socket.emit(
      "sync_time",
      (
        response:
          | {
              serverNow?: number;
            }
          | undefined,
      ) => {
        if (resolved) return;
        resolved = true;
        window.clearTimeout(timeoutId);
        const clientReceivedAt = Date.now();
        const serverNow = response?.serverNow;

        if (typeof serverNow === "number") {
          const midpoint = (clientSentAt + clientReceivedAt) / 2;
          serverOffsetMs = serverNow - midpoint;
        }

        resolve();
      },
    );
  });
}
