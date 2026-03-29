import { io, Socket } from 'socket.io-client';

type LoadTestMode = 'idle' | 'ai' | 'random';

interface LoadTestConfig {
  serverUrl: string;
  clients: number;
  mode: LoadTestMode;
  durationSec: number;
  rampMs: number;
  nicknamePrefix: string;
}

function parseArgs(): LoadTestConfig {
  const args = process.argv.slice(2);
  const read = (flag: string) => {
    const index = args.indexOf(flag);
    if (index === -1) return null;
    return args[index + 1] ?? null;
  };

  const modeArg = read('--mode');
  const mode: LoadTestMode =
    modeArg === 'ai' || modeArg === 'random' || modeArg === 'idle'
      ? modeArg
      : 'idle';

  return {
    serverUrl: read('--server') ?? process.env.LOAD_TEST_SERVER_URL ?? 'http://localhost:3001',
    clients: Math.max(1, Number(read('--clients') ?? '50')),
    mode,
    durationSec: Math.max(5, Number(read('--duration') ?? '60')),
    rampMs: Math.max(0, Number(read('--ramp-ms') ?? '40')),
    nicknamePrefix: read('--nickname-prefix') ?? `Load${mode.toUpperCase()}`,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const config = parseArgs();
  const sockets: Socket[] = [];
  let connectedCount = 0;
  let roomJoinedCount = 0;
  let gameStartedCount = 0;
  let roundStartedCount = 0;
  let submitAckCount = 0;
  let errorCount = 0;

  console.log(
    `[load-test] starting mode=${config.mode} clients=${config.clients} duration=${config.durationSec}s server=${config.serverUrl}`,
  );

  for (let index = 0; index < config.clients; index += 1) {
    const socket = io(config.serverUrl, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 10_000,
    });

    socket.on('connect', () => {
      connectedCount += 1;
      if (config.mode === 'idle') return;

      const payload = {
        nickname: `${config.nicknamePrefix}_${index + 1}`,
        pieceSkin: 'classic',
      };

      if (config.mode === 'ai') {
        socket.emit('join_ai', { ...payload, tutorialPending: false });
        return;
      }

      socket.emit('join_random', payload);
    });

    socket.on('connect_error', (error) => {
      errorCount += 1;
      console.log(`[load-test] connect_error socket=${index + 1} message=${error.message}`);
    });

    socket.on('join_error', ({ message }: { message?: string }) => {
      errorCount += 1;
      console.log(`[load-test] join_error socket=${index + 1} message=${message ?? 'unknown'}`);
    });

    socket.on('room_joined', () => {
      roomJoinedCount += 1;
      socket.emit('game_client_ready');
    });

    socket.on('game_start', () => {
      gameStartedCount += 1;
    });

    socket.on('round_start', () => {
      roundStartedCount += 1;
      socket.emit('submit_path', { path: [] }, (response?: { ok: boolean }) => {
        if (response?.ok) {
          submitAckCount += 1;
        }
      });
    });

    sockets.push(socket);

    if (config.rampMs > 0 && index < config.clients - 1) {
      await delay(config.rampMs);
    }
  }

  const startedAt = Date.now();
  const report = setInterval(() => {
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `[load-test] elapsed=${elapsedSec}s connected=${connectedCount}/${config.clients} roomJoined=${roomJoinedCount} gameStarted=${gameStartedCount} rounds=${roundStartedCount} submits=${submitAckCount} errors=${errorCount}`,
    );
  }, 5_000);

  await delay(config.durationSec * 1000);

  clearInterval(report);
  for (const socket of sockets) {
    socket.disconnect();
  }

  console.log(
    `[load-test] finished connected=${connectedCount}/${config.clients} roomJoined=${roomJoinedCount} gameStarted=${gameStartedCount} rounds=${roundStartedCount} submits=${submitAckCount} errors=${errorCount}`,
  );
}

void run().catch((error) => {
  console.error('[load-test] fatal', error);
  process.exitCode = 1;
});
