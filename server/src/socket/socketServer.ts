import { Server, Socket } from 'socket.io';
import { GameRoom } from '../game/GameRoom';
import { RoomStore } from '../store/RoomStore';
import { CoopRoom } from '../game/coop/CoopRoom';
import { CoopRoomStore } from '../store/CoopRoomStore';
import { TwoVsTwoRoom } from '../game/twovtwo/TwoVsTwoRoom';
import { TwoVsTwoRoomStore } from '../store/TwoVsTwoRoomStore';
import { AbilityRoom } from '../game/ability/AbilityRoom';
import { AbilityRoomStore } from '../store/AbilityRoomStore';
import { getAndroidVersionStatus } from '../config/appVersion';
import { FAKE_RANDOM_NICKNAMES } from '../config/fakeRandomNicknames';
import { BoardSkin, PieceSkin, Position } from '../types/game.types';
import type { AbilitySkillId, AbilitySkillReservation } from '../game/ability/AbilityTypes';
import {
  AuthPayload,
  type AccountProfile,
  finalizeGoogleUpgrade,
  grantDailyRewardTokens,
  getUserFromToken,
  recordMatchmakingResult,
  resolveAccount,
  resolveAccountForUser,
  type PersistentPlayerProfile,
  resolvePlayerProfile,
} from '../services/playerAuth';
import {
  claimAchievementReward,
  claimAllAchievementRewards,
  recordAbilitySpecialWin,
  recordDailyRewardGrant,
  recordMatchPlayed,
  recordModeWin,
  trackSettingsAchievements,
} from '../services/achievementService';

export function initSocketServer(io: Server): void {
  const store = RoomStore.getInstance();
  const coopStore = CoopRoomStore.getInstance();
  const twoVsTwoStore = TwoVsTwoRoomStore.getInstance();
  const abilityStore = AbilityRoomStore.getInstance();
  const activeUserSockets = new Map<string, string>();
  const socketUsers = new Map<string, string>();
  const authCacheTtlMs = 10 * 60 * 1000;
  const profileCacheTtlMs = 60 * 1000;
  const roomSweepIntervalMs = 60 * 1000;
  const metricsLogIntervalMs = 60 * 1000;
  const slowProfileResolveThresholdMs = 150;
  const randomFallbackMatchMs = 7_000;
  const abilityFallbackMatchMs = 7_000;
  const randomFallbackTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  const pendingCancelRandom = new Set<string>();
  const abilityFallbackTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  const ABILITY_FAKE_AI_SKILL_POOL: AbilitySkillId[] = [
    'classic_guard',
    'ember_blast',
    'nova_blast',
    'inferno_field',
    'quantum_shift',
    'cosmic_bigbang',
    'arc_reactor_field',
    'electric_blitz',
    'wizard_magic_mine',
    'chronos_time_rewind',
    'atomic_fission',
    'sun_chariot',
    'aurora_heal',
  ];
  const profileCache = new Map<
    string,
    { expiresAt: number; profile: PersistentPlayerProfile }
  >();

  const unregisterSocketSession = (socketId: string) => {
    const userId = socketUsers.get(socketId);
    if (!userId) return;
    socketUsers.delete(socketId);
    if (activeUserSockets.get(userId) === socketId) {
      activeUserSockets.delete(userId);
    }
  };

  const getSocketOrigin = (socket: Socket) => {
    const origin = socket.handshake.headers.origin;
    return typeof origin === 'string' ? origin : '';
  };

  const isNativeLikeOrigin = (origin: string) =>
    origin === 'capacitor://localhost' ||
    origin === 'ionic://localhost' ||
    origin === 'http://localhost' ||
    origin === 'https://localhost';

  const getCurrentAppVersionCode = (auth?: AuthPayload) => {
    const parsed =
      typeof auth?.appVersionCode === 'number'
        ? auth.appVersionCode
        : Number(auth?.appVersionCode);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  };

  const getUpdateRequirement = (socket: Socket, auth?: AuthPayload) => {
    const origin = getSocketOrigin(socket);
    const isAndroidClient =
      auth?.clientPlatform === 'android' || isNativeLikeOrigin(origin);

    if (!isAndroidClient) return null;

    return getAndroidVersionStatus(getCurrentAppVersionCode(auth));
  };

  const emitUpdateRequired = (socket: Socket, auth?: AuthPayload) => {
    const requirement = getUpdateRequirement(socket, auth);
    if (!requirement?.forceUpdate) return null;

    socket.emit('update_required', requirement);
    socket.emit('join_error', {
      message:
        'A new version is available. Please update the app from the Play Store.',
    });
    return requirement;
  };

  const clearExpiredProfileCache = (now = Date.now()) => {
    for (const [userId, entry] of profileCache.entries()) {
      if (entry.expiresAt <= now) {
        profileCache.delete(userId);
      }
    }
  };

  const clearRandomFallback = (socketId: string) => {
    const timer = randomFallbackTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      randomFallbackTimers.delete(socketId);
    }
  };

  const clearAbilityFallback = (socketId: string) => {
    const timer = abilityFallbackTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      abilityFallbackTimers.delete(socketId);
    }
  };

  const createDisguisedRandomProfile = (
    profile: PersistentPlayerProfile,
  ): {
    nickname: string;
    displayId: string;
    userId: string | null;
    stats: { wins: number; losses: number };
    pieceSkin: PieceSkin;
    boardSkin: BoardSkin;
  } => {
    const commonSkins: PieceSkin[] = [
      'classic',
      'plasma',
      'gold_core',
      'neon_pulse',
      'inferno',
      'quantum',
      'cosmic',
      'arc_reactor',
      'electric_core',
    ];
    const legendarySkins: PieceSkin[] = [
      'atomic',
      'chronos',
      'wizard',
      'sun',
    ];
    const useLegendarySkin = Math.random() < 0.1;
    const skinPool = useLegendarySkin ? legendarySkins : commonSkins;
    const pieceSkin =
      skinPool[Math.floor(Math.random() * skinPool.length)] ?? 'classic';
    const nickname =
      FAKE_RANDOM_NICKNAMES[
        Math.floor(Math.random() * FAKE_RANDOM_NICKNAMES.length)
      ];
    const fakeId = `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`;
    const stats = createNaturalFakeStats(
      Math.floor(Math.random() * 101) + Math.floor(Math.random() * 101),
    );
    return {
      nickname,
      displayId: fakeId,
      userId: null,
      stats,
      pieceSkin,
      boardSkin: 'classic',
    };
  };

  const createNaturalFakeStats = (
    totalGames: number,
    options: { minWins?: number } = {},
  ): { wins: number; losses: number } => {
    const total = Math.max(1, Math.trunc(totalGames));
    const minRateWins = Math.ceil(total * 0.24);
    const maxRateWins = Math.floor(total * 0.65);
    const minWins = Math.max(minRateWins, options.minWins ?? 0);

    if (minWins > maxRateWins) {
      const adjustedTotal = Math.ceil(minWins / 0.65);
      const wins = minWins;
      return {
        wins,
        losses: Math.max(0, adjustedTotal - wins),
      };
    }

    const wins =
      minWins + Math.floor(Math.random() * (maxRateWins - minWins + 1));
    return {
      wins,
      losses: total - wins,
    };
  };

  const randomHex = (length: number) => {
    let result = '';
    while (result.length < length) {
      result += Math.floor(Math.random() * 16).toString(16);
    }
    return result.slice(0, length);
  };

  const pickRandomUniqueSkills = (
    pool: AbilitySkillId[],
    count: number,
  ): AbilitySkillId[] => {
    const bag = [...pool];
    for (let index = bag.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
    }
    return bag.slice(0, count);
  };

  const createDisguisedAbilityBotLoadout = (
    profile: PersistentPlayerProfile,
  ): {
    nickname: string;
    displayId: string;
    userId: string | null;
    stats: { wins: number; losses: number };
    pieceSkin: PieceSkin;
    boardSkin: BoardSkin;
    equippedSkills: AbilitySkillId[];
    beginner: boolean;
  } => {
    const beginner = Math.random() < 0.05;
    if (beginner) {
      const nickname =
        FAKE_RANDOM_NICKNAMES[
          Math.floor(Math.random() * FAKE_RANDOM_NICKNAMES.length)
        ];
      return {
        nickname,
        displayId: `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`,
        userId: null,
        stats: createNaturalFakeStats(
          Math.floor(Math.random() * 101) + Math.floor(Math.random() * 101),
        ),
        pieceSkin: 'classic',
        boardSkin: 'classic',
        equippedSkills: ['classic_guard'],
        beginner: true,
      };
    }

    const fakeProfile = createDisguisedRandomProfile(profile);
    const equippedSkills = pickRandomUniqueSkills(ABILITY_FAKE_AI_SKILL_POOL, 3);
    // aurora_heal은 100승 이상 해금 스킬 → 장착 시 승리 수를 100~300으로 표기
    const stats =
      equippedSkills.includes('aurora_heal')
        ? createNaturalFakeStats(
            fakeProfile.stats.wins + fakeProfile.stats.losses,
            { minWins: Math.floor(Math.random() * 201) + 100 },
          )
        : fakeProfile.stats;
    return {
      ...fakeProfile,
      equippedSkills,
      stats,
      beginner: false,
    };
  };

  const createRandomFallbackMatch = async ({
    socket,
    profile,
    pieceSkin,
    boardSkin,
  }: {
    socket: Socket;
    profile: PersistentPlayerProfile;
    pieceSkin: PieceSkin;
    boardSkin: BoardSkin;
  }) => {
    clearRandomFallback(socket.id);
    if (!io.sockets.sockets.has(socket.id)) return;
    if (!store.isQueuedRandom(socket.id)) return;

    store.removeFromQueue(socket.id);

    const roomId = store.generateRoomId();
    const code = store.generateCode();
    const room = new GameRoom(roomId, code, io, 'random');
    store.add(room);
    const fakeProfile = createDisguisedRandomProfile(profile);
    const humanFirst = Math.random() < 0.5;

    if (!humanFirst) {
      room.addAiPlayer(fakeProfile.nickname, {
        displayId: fakeProfile.displayId,
        userId: fakeProfile.userId,
        stats: fakeProfile.stats,
        pieceSkin: fakeProfile.pieceSkin,
        boardSkin: fakeProfile.boardSkin,
      });
    }

    const humanColor = room.addPlayer(
      socket,
      profile.nickname,
      profile.userId,
      profile.stats,
      pieceSkin,
      boardSkin,
    );
    if (!humanColor) return;

    if (humanFirst) {
      room.addAiPlayer(fakeProfile.nickname, {
        displayId: fakeProfile.displayId,
        userId: fakeProfile.userId,
        stats: fakeProfile.stats,
        pieceSkin: fakeProfile.pieceSkin,
        boardSkin: fakeProfile.boardSkin,
      });
    }
    store.registerSocket(socket.id, roomId);

    const opponentColor = humanColor === 'red' ? 'blue' : 'red';
    const opponent = room.toClientState().players[opponentColor];
    socket.emit('room_joined', {
      roomId,
      color: humanColor,
      opponentNickname: opponent.nickname,
      selfPieceSkin: pieceSkin,
      opponentPieceSkin: opponent.pieceSkin,
    });
    room.startGame();
  };

  const scheduleRandomFallback = ({
    socket,
    profile,
    pieceSkin,
    boardSkin,
  }: {
    socket: Socket;
    profile: PersistentPlayerProfile;
    pieceSkin: PieceSkin;
    boardSkin: BoardSkin;
  }) => {
    clearRandomFallback(socket.id);
    randomFallbackTimers.set(
      socket.id,
      setTimeout(() => {
        void createRandomFallbackMatch({
          socket,
          profile,
          pieceSkin,
          boardSkin,
        });
      }, randomFallbackMatchMs),
    );
  };

  const createAbilityFallbackMatch = async ({
    socket,
    profile,
    pieceSkin,
    boardSkin,
    equippedSkills,
  }: {
    socket: Socket;
    profile: PersistentPlayerProfile;
    pieceSkin: PieceSkin;
    boardSkin: BoardSkin;
    equippedSkills: AbilitySkillId[];
  }) => {
    clearAbilityFallback(socket.id);
    if (!io.sockets.sockets.has(socket.id)) return;
    if (!abilityStore.isQueued(socket.id)) return;

    abilityStore.removeFromQueue(socket.id);

    const roomId = abilityStore.generateRoomId();
    const room = new AbilityRoom(roomId, roomId, io);
    abilityStore.add(room);
    const fakeProfile = createDisguisedAbilityBotLoadout(profile);
    const humanFirst = Math.random() < 0.5;

    if (!humanFirst) {
      room.addIdleBot(
        fakeProfile.nickname,
        fakeProfile.pieceSkin,
        fakeProfile.boardSkin,
        fakeProfile.equippedSkills,
        {
          displayId: fakeProfile.displayId,
          stats: fakeProfile.stats,
        },
      );
    }

    const humanColor = room.addPlayer(
      socket,
      profile.nickname,
      profile.userId,
      profile.stats,
      pieceSkin,
      boardSkin,
      equippedSkills,
    );
    if (!humanColor) return;

    if (humanFirst) {
      room.addIdleBot(
        fakeProfile.nickname,
        fakeProfile.pieceSkin,
        fakeProfile.boardSkin,
        fakeProfile.equippedSkills,
        {
          displayId: fakeProfile.displayId,
          stats: fakeProfile.stats,
        },
      );
    }
    abilityStore.registerSocket(socket.id, roomId);

    const opponentColor = humanColor === 'red' ? 'blue' : 'red';
    const opponent = room.toClientState(humanColor).players[opponentColor];
    socket.emit('ability_room_joined', {
      roomId,
      color: humanColor,
      opponentNickname: opponent.nickname,
    });

    room.prepareGameStart();
  };

  const scheduleAbilityFallback = ({
    socket,
    profile,
    pieceSkin,
    boardSkin,
    equippedSkills,
  }: {
    socket: Socket;
    profile: PersistentPlayerProfile;
    pieceSkin: PieceSkin;
    boardSkin: BoardSkin;
    equippedSkills: AbilitySkillId[];
  }) => {
    clearAbilityFallback(socket.id);
    abilityFallbackTimers.set(
      socket.id,
      setTimeout(() => {
        void createAbilityFallbackMatch({
          socket,
          profile,
          pieceSkin,
          boardSkin,
          equippedSkills,
        });
      }, abilityFallbackMatchMs),
    );
  };

  const notifyRoomClosed = ({
    socketIds,
    reason,
  }: {
    socketIds: string[];
    reason: 'turn_limit' | 'waiting_timeout' | 'empty';
  }) => {
    if (reason !== 'turn_limit') return;
    for (const socketId of socketIds) {
      if (!io.sockets.sockets.has(socketId)) continue;
      io.to(socketId).emit('room_closed', {
        reason,
      });
    }
  };

  const resolvePlayerProfileCached = async (
    socket: Socket,
    auth: AuthPayload | undefined,
    fallbackNickname: string,
  ): Promise<PersistentPlayerProfile> => {
    const userId =
      typeof socket.data.userId === 'string' ? socket.data.userId : null;

    if (userId) {
      const cached = profileCache.get(userId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.profile;
      }
    }

    const startedAt = Date.now();
    const profile = await resolvePlayerProfile(auth, fallbackNickname);
    const durationMs = Date.now() - startedAt;

    if (durationMs >= slowProfileResolveThresholdMs) {
      console.log(
        `[perf] resolvePlayerProfile took ${durationMs}ms userId=${profile.userId ?? 'guest'} socket=${socket.id}`,
      );
    }

    if (profile.userId) {
      profileCache.set(profile.userId, {
        expiresAt: Date.now() + profileCacheTtlMs,
        profile,
      });
    }

    return profile;
  };

  setInterval(() => {
    const activeSocketIds = new Set(io.sockets.sockets.keys());
    store.sweep(activeSocketIds, Date.now(), notifyRoomClosed);
    coopStore.sweep(activeSocketIds, Date.now(), notifyRoomClosed);
    twoVsTwoStore.sweep(activeSocketIds, Date.now(), notifyRoomClosed);
    abilityStore.sweep(activeSocketIds, Date.now(), notifyRoomClosed);
  }, roomSweepIntervalMs);

  setInterval(() => {
    clearExpiredProfileCache();
    const duelStats = store.getStats();
    const coopStats = coopStore.getStats();
    const twoVsTwoStats = twoVsTwoStore.getStats();
    const abilityStats = abilityStore.getStats();
    const hasActiveTraffic =
      io.sockets.sockets.size > 0 ||
      activeUserSockets.size > 0 ||
      profileCache.size > 0 ||
      duelStats.roomCount > 0 ||
      duelStats.queueLength > 0 ||
      duelStats.socketMappings > 0 ||
      coopStats.roomCount > 0 ||
      coopStats.queueLength > 0 ||
      coopStats.socketMappings > 0 ||
      twoVsTwoStats.roomCount > 0 ||
      twoVsTwoStats.queueLength > 0 ||
      twoVsTwoStats.teamQueueLength > 0 ||
      twoVsTwoStats.socketMappings > 0 ||
      abilityStats.roomCount > 0 ||
      abilityStats.queueLength > 0 ||
      abilityStats.socketMappings > 0;

    if (!hasActiveTraffic) {
      return;
    }

    console.log(
      `[metrics] sockets=${io.sockets.sockets.size} activeUserSessions=${activeUserSockets.size} profileCache=${profileCache.size} ` +
        `rooms{duel=${duelStats.roomCount},coop=${coopStats.roomCount},2v2=${twoVsTwoStats.roomCount},ability=${abilityStats.roomCount}} ` +
        `queues{duel=${duelStats.queueLength},coop=${coopStats.queueLength},2v2Solo=${twoVsTwoStats.queueLength},2v2Team=${twoVsTwoStats.teamQueueLength},ability=${abilityStats.queueLength}} ` +
        `mappings{duel=${duelStats.socketMappings},coop=${coopStats.socketMappings},2v2=${twoVsTwoStats.socketMappings},ability=${abilityStats.socketMappings}}`,
    );
  }, metricsLogIntervalMs);

  const tryStartTwoVsTwoTeamMatch = () => {
    const match = twoVsTwoStore.dequeueTeamMatch();
    if (!match) return;
    const [teamA, teamB] = match;
    const roomId = twoVsTwoStore.generateRoomId();
    const room = new TwoVsTwoRoom(roomId, roomId, io);
    twoVsTwoStore.add(room);

    const slots: Array<'red_top' | 'red_bottom' | 'blue_top' | 'blue_bottom'> = [
      'red_top',
      'red_bottom',
      'blue_top',
      'blue_bottom',
    ];
    const orderedMembers = [...teamA.members, ...teamB.members].sort((a, b) =>
      a.socketId.localeCompare(b.socketId),
    );

    for (let index = 0; index < orderedMembers.length; index++) {
      const member = orderedMembers[index];
      const memberSocket = io.sockets.sockets.get(member.socketId);
      if (!memberSocket) continue;
      const previousRoom = twoVsTwoStore.getBySocket(member.socketId);
      if (previousRoom) {
        memberSocket.leave(previousRoom.roomId);
      }
      const slot = room.addPlayer(
        memberSocket,
        member.nickname,
        member.userId,
        member.stats,
        member.pieceSkin,
      );
      if (!slot) continue;
      twoVsTwoStore.registerSocket(member.socketId, roomId);
      memberSocket.emit('twovtwo_room_joined', {
        roomId,
        slot,
        team: slot.startsWith('red') ? 'red' : 'blue',
      });
    }

    room.prepareGameStart();
  };

  const registerSocketSession = async (
    socket: Socket,
    auth?: AuthPayload,
    options?: { forceRevalidate?: boolean; allowConcurrentSessions?: boolean },
  ): Promise<string | null> => {
    const accessToken = auth?.accessToken?.trim();
    const cachedUserId =
      typeof socket.data.userId === 'string' ? socket.data.userId : null;
    const cachedAccessToken =
      typeof socket.data.accessToken === 'string' ? socket.data.accessToken : null;
    const cachedVerifiedAt =
      typeof socket.data.authVerifiedAt === 'number' ? socket.data.authVerifiedAt : 0;
    const cacheIsFresh = Date.now() - cachedVerifiedAt < authCacheTtlMs;
    const shouldReuseCachedSession =
      !options?.forceRevalidate &&
      cachedUserId &&
      cachedAccessToken &&
      accessToken &&
      cachedAccessToken === accessToken &&
      cacheIsFresh;

    if (shouldReuseCachedSession) {
      activeUserSockets.set(cachedUserId, socket.id);
      socketUsers.set(socket.id, cachedUserId);
      return cachedUserId;
    }

    const user = await getUserFromToken(auth?.accessToken);
    if (!user) {
      unregisterSocketSession(socket.id);
      socket.data.userId = undefined;
      socket.data.accessToken = undefined;
      socket.data.isGuestUser = undefined;
      socket.data.authVerifiedAt = undefined;
      return null;
    }

    const previousMappedUserId = socketUsers.get(socket.id);
    if (
      previousMappedUserId &&
      previousMappedUserId !== user.id &&
      activeUserSockets.get(previousMappedUserId) === socket.id
    ) {
      activeUserSockets.delete(previousMappedUserId);
    }

    const previousSocketId = activeUserSockets.get(user.id);
    activeUserSockets.set(user.id, socket.id);
    socketUsers.set(socket.id, user.id);
    socket.data.userId = user.id;
    socket.data.accessToken = accessToken;
    socket.data.isGuestUser = user.is_anonymous ?? false;
    socket.data.authVerifiedAt = Date.now();

    if (
      !options?.allowConcurrentSessions &&
      previousSocketId &&
      previousSocketId !== socket.id
    ) {
      const previousSocket = io.sockets.sockets.get(previousSocketId);
      if (previousSocket) {
        previousSocket.emit('session_replaced', {});
        previousSocket.disconnect(true);
      }
    }

    return user.id;
  };

  io.on('connection', (socket: Socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    socket.on(
      'sync_time',
      (ack?: (response: { serverNow: number }) => void) => {
        ack?.({ serverNow: Date.now() });
      },
    );

    socket.on(
      'session_register',
      async (
        { auth }: { auth?: AuthPayload },
        ack?: (
          response:
            | { ok: boolean; updateRequired: false }
            | ({
                ok: false;
                updateRequired: true;
              } & ReturnType<typeof getAndroidVersionStatus>),
        ) => void,
      ) => {
        const requirement = getUpdateRequirement(socket, auth);
        if (requirement?.forceUpdate) {
          socket.emit('update_required', requirement);
          ack?.({
            ok: false,
            updateRequired: true,
            ...requirement,
          });
          return;
        }
        const userId = await registerSocketSession(socket, auth, {
          allowConcurrentSessions: true,
        });
        ack?.({ ok: Boolean(userId), updateRequired: false });
      },
    );

    socket.on('create_room', async ({ nickname, auth, pieceSkin, boardSkin }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin; boardSkin?: BoardSkin }) => {
      if (emitUpdateRequired(socket, auth)) return;
      await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      const profile = await resolvePlayerProfileCached(socket, auth, nickname);
      if (!io.sockets.sockets.has(socket.id)) return;
      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io, 'friend');
      const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic');
      if (!color) {
        socket.emit('join_error', { message: '방 생성에 실패했습니다.' });
        return;
      }
      store.add(room);
      store.registerSocket(socket.id, roomId);
      socket.emit('room_created', { roomId, code, color, pieceSkin: pieceSkin ?? 'classic' });
    });

    socket.on(
      'join_ai',
      async (
        {
          nickname,
          auth,
          pieceSkin,
          tutorialPending,
          boardSkin,
        }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin; boardSkin?: BoardSkin; tutorialPending?: boolean },
      ) => {
      if (emitUpdateRequired(socket, auth)) return;
      await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      const profile = await resolvePlayerProfileCached(socket, auth, nickname);
      if (!io.sockets.sockets.has(socket.id)) return;
      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io, 'ai');

      const humanColor = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic');
      if (!humanColor) {
        socket.emit('join_error', { message: 'AI room creation failed.' });
        return;
      }

      room.addAiPlayer('PathClash AI');
      store.add(room);
      store.registerSocket(socket.id, roomId);

      const roomState = room.toClientState();
      const opponent = roomState.players[humanColor === 'red' ? 'blue' : 'red'];
      socket.emit('room_joined', {
        roomId: room.roomId,
        color: humanColor,
        opponentNickname: opponent.nickname,
        selfPieceSkin: pieceSkin ?? 'classic',
        opponentPieceSkin: opponent.pieceSkin,
      });
      room.startGame(Boolean(tutorialPending));

      },
    );

    socket.on('join_room', async ({ code, nickname, auth, pieceSkin, boardSkin }: { code: string; nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin; boardSkin?: BoardSkin }) => {
      if (emitUpdateRequired(socket, auth)) return;
      await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      const profile = await resolvePlayerProfileCached(socket, auth, nickname);
      if (!io.sockets.sockets.has(socket.id)) return;
      const room = store.getByCode(code.toUpperCase());
      if (!room || room.isFull) {
        socket.emit('join_error', { message: '방을 찾을 수 없거나 이미 가득 찼습니다.' });
        return;
      }

      const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic');
      if (!color) {
        socket.emit('join_error', { message: '입장할 수 없습니다.' });
        return;
      }

      store.registerSocket(socket.id, room.roomId);
      const roomState = room.toClientState();
      const opponent = roomState.players[color === 'red' ? 'blue' : 'red'];
      socket.emit('room_joined', {
        roomId: room.roomId,
        color,
        opponentNickname: opponent.nickname,
        selfPieceSkin: pieceSkin ?? 'classic',
        opponentPieceSkin: opponent.pieceSkin,
      });
      socket.to(room.roomId).emit('opponent_joined', {
        nickname: profile.nickname,
        color,
        pieceSkin: pieceSkin ?? 'classic',
      });

      room.prepareGameStart();

    });

    socket.on(
      'create_ability_room',
      async ({
        nickname,
        auth,
        pieceSkin,
        boardSkin,
        equippedSkills,
      }: {
        nickname: string;
        auth?: AuthPayload;
        pieceSkin?: PieceSkin;
        boardSkin?: BoardSkin;
        equippedSkills: AbilitySkillId[];
      }) => {
        if (emitUpdateRequired(socket, auth)) return;
        await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
        const profile = await resolvePlayerProfileCached(socket, auth, nickname);
        if (!io.sockets.sockets.has(socket.id)) return;
        const roomId = abilityStore.generateRoomId();
        const code = abilityStore.generateCode();
        const room = new AbilityRoom(roomId, code, io);
        room.enablePrivateMatch();
        const color = room.addPlayer(
          socket,
          profile.nickname,
          profile.userId,
          profile.stats,
          pieceSkin ?? 'classic',
          boardSkin ?? 'classic',
          equippedSkills,
        );
        if (!color) {
          socket.emit('join_error', { message: '방 생성에 실패했습니다.' });
          return;
        }
        abilityStore.add(room);
        abilityStore.registerSocket(socket.id, roomId);
        socket.emit('ability_room_created', {
          roomId,
          code,
          color,
        });
      },
    );

    socket.on(
      'join_ability_room',
      async ({
        code,
        nickname,
        auth,
        pieceSkin,
        boardSkin,
        equippedSkills,
      }: {
        code: string;
        nickname: string;
        auth?: AuthPayload;
        pieceSkin?: PieceSkin;
        boardSkin?: BoardSkin;
        equippedSkills: AbilitySkillId[];
      }) => {
        if (emitUpdateRequired(socket, auth)) return;
        await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
        const profile = await resolvePlayerProfileCached(socket, auth, nickname);
        if (!io.sockets.sockets.has(socket.id)) return;
        const room = abilityStore.getByCode(code);
        if (!room || room.isFull) {
          socket.emit('join_error', { message: '방을 찾을 수 없거나 이미 가득 찼습니다.' });
          return;
        }

        room.enablePrivateMatch();
        const color = room.addPlayer(
          socket,
          profile.nickname,
          profile.userId,
          profile.stats,
          pieceSkin ?? 'classic',
          boardSkin ?? 'classic',
          equippedSkills,
        );
        if (!color) {
          socket.emit('join_error', { message: '입장할 수 없습니다.' });
          return;
        }

        room.prepareGameStart();
        abilityStore.registerSocket(socket.id, room.roomId);
        socket.emit('ability_room_joined', {
          roomId: room.roomId,
          color,
          opponentNickname:
            room.toClientState(color).players[color === 'red' ? 'blue' : 'red'].nickname,
        });
        socket.to(room.roomId).emit('ability_opponent_joined', {
          nickname: profile.nickname,
          color,
        });
      },
    );

    socket.on('join_random', async ({ nickname, auth, pieceSkin, boardSkin }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin; boardSkin?: BoardSkin }) => {
      pendingCancelRandom.delete(socket.id);
      if (emitUpdateRequired(socket, auth)) return;
      await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      const profile = await resolvePlayerProfileCached(socket, auth, nickname);
      if (pendingCancelRandom.has(socket.id)) {
        pendingCancelRandom.delete(socket.id);
        return;
      }
      if (!io.sockets.sockets.has(socket.id)) return;
      const selectedPieceSkin = pieceSkin ?? 'classic';
      const selectedBoardSkin = boardSkin ?? 'classic';
      const queued = store.dequeueRandom();
      if (!queued || queued.socketId === socket.id) {
        if (queued) {
          store.enqueueRandom(queued.socketId, queued.nickname, queued.userId, queued.stats, queued.pieceSkin, queued.boardSkin);
        }
        store.enqueueRandom(socket.id, profile.nickname, profile.userId, profile.stats, selectedPieceSkin, selectedBoardSkin);
        socket.emit('matchmaking_waiting', {});
        scheduleRandomFallback({
          socket,
          profile,
          pieceSkin: selectedPieceSkin,
          boardSkin: selectedBoardSkin,
        });
        return;
      }

      clearRandomFallback(socket.id);
      clearRandomFallback(queued.socketId);

      const queuedSocket = io.sockets.sockets.get(queued.socketId);
      if (!queuedSocket) {
        store.enqueueRandom(socket.id, profile.nickname, profile.userId, profile.stats, selectedPieceSkin, selectedBoardSkin);
        socket.emit('matchmaking_waiting', {});
        scheduleRandomFallback({
          socket,
          profile,
          pieceSkin: selectedPieceSkin,
          boardSkin: selectedBoardSkin,
        });
        return;
      }

      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io, 'random');
      store.add(room);

      const queuedColor = room.addPlayer(queuedSocket, queued.nickname, queued.userId, queued.stats, queued.pieceSkin, queued.boardSkin);
      const myColor = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, selectedPieceSkin, selectedBoardSkin);

      if (!queuedColor || !myColor) {
        console.error('[join_random] addPlayer failed unexpectedly', { queuedColor, myColor });
        socket.emit('join_error', { message: '매칭 중 오류가 발생했습니다. 다시 시도해주세요.' });
        return;
      }

      store.registerSocket(queued.socketId, roomId);
      store.registerSocket(socket.id, roomId);

      queuedSocket.emit('room_joined', {
        roomId,
        color: queuedColor,
        opponentNickname: profile.nickname,
        selfPieceSkin: queued.pieceSkin,
        opponentPieceSkin: selectedPieceSkin,
      });

      socket.emit('room_joined', {
        roomId,
        color: myColor,
        opponentNickname: queued.nickname,
        selfPieceSkin: selectedPieceSkin,
        opponentPieceSkin: queued.pieceSkin,
      });

      room.prepareGameStart();
    });

    socket.on('cancel_random', () => {
      pendingCancelRandom.add(socket.id);
      clearRandomFallback(socket.id);
      store.removeFromQueue(socket.id);
    });

    socket.on('join_coop', async ({ nickname, auth, pieceSkin }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin }) => {
      if (emitUpdateRequired(socket, auth)) return;
      await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      const profile = await resolvePlayerProfileCached(socket, auth, nickname);
      if (!io.sockets.sockets.has(socket.id)) return;
      const queued = coopStore.dequeue();
      if (!queued || queued.socketId === socket.id) {
        if (queued) {
          coopStore.enqueue(queued.socketId, queued.nickname, queued.userId, queued.stats, queued.pieceSkin);
        }
        coopStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
        socket.emit('coop_matchmaking_waiting', {});
        return;
      }

      const queuedSocket = io.sockets.sockets.get(queued.socketId);
      if (!queuedSocket) {
        coopStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
        socket.emit('coop_matchmaking_waiting', {});
        return;
      }

      const roomId = coopStore.generateRoomId();
      const room = new CoopRoom(roomId, roomId, io);
      coopStore.add(room);

      room.addPlayer(queuedSocket, queued.nickname, queued.userId, queued.stats, queued.pieceSkin);
      coopStore.registerSocket(queued.socketId, roomId);
      queuedSocket.emit('coop_room_joined', {
        roomId,
        color: 'red',
        teammateNickname: profile.nickname,
        selfPieceSkin: queued.pieceSkin,
        teammatePieceSkin: pieceSkin ?? 'classic',
      });

      room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
      coopStore.registerSocket(socket.id, roomId);
      socket.emit('coop_room_joined', {
        roomId,
        color: 'blue',
        teammateNickname: queued.nickname,
        selfPieceSkin: pieceSkin ?? 'classic',
        teammatePieceSkin: queued.pieceSkin,
      });

      room.prepareGameStart();
    });

    socket.on('cancel_coop', () => {
      coopStore.removeFromQueue(socket.id);
    });

    socket.on('account_sync', async ({ auth }: { auth?: AuthPayload }, ack?: (response: unknown) => void) => {
      const requirement = getUpdateRequirement(socket, auth);
      if (requirement?.forceUpdate) {
        socket.emit('update_required', requirement);
        ack?.({ status: 'UPDATE_REQUIRED', ...requirement });
        return;
      }
      await registerSocketSession(socket, auth, { forceRevalidate: true });
      ack?.(await resolveAccount(auth));
    });

    socket.on(
      'achievements_claim',
      async (
        { auth, achievementId }: { auth?: AuthPayload; achievementId?: string },
        ack?: (response: unknown) => void,
      ) => {
        const requirement = getUpdateRequirement(socket, auth);
        if (requirement?.forceUpdate) {
          socket.emit('update_required', requirement);
          ack?.({ status: 'UPDATE_REQUIRED', ...requirement });
          return;
        }
        try {
          const userId = await registerSocketSession(socket, auth, { forceRevalidate: true });
          if (userId && achievementId) {
            await claimAchievementReward(userId, achievementId);
          }
          ack?.(
            await resolveAccountForUser(
              userId,
              Boolean(socket.data.isGuestUser),
            ),
          );
        } catch (error) {
          console.error('[achievements] failed to claim reward', error);
          ack?.({ status: 'AUTH_INVALID' });
        }
      },
    );

    socket.on(
      'achievements_claim_all',
      async (
        { auth }: { auth?: AuthPayload },
        ack?: (response: unknown) => void,
      ) => {
        const requirement = getUpdateRequirement(socket, auth);
        if (requirement?.forceUpdate) {
          socket.emit('update_required', requirement);
          ack?.({ status: 'UPDATE_REQUIRED', ...requirement });
          return;
        }
        try {
          const userId = await registerSocketSession(socket, auth, { forceRevalidate: true });
          if (userId) {
            await claimAllAchievementRewards(userId);
          }
          ack?.(
            await resolveAccountForUser(
              userId,
              Boolean(socket.data.isGuestUser),
            ),
          );
        } catch (error) {
          console.error('[achievements] failed to claim all rewards', error);
          ack?.({ status: 'AUTH_INVALID' });
        }
      },
    );

    socket.on(
      'achievements_sync_settings',
      async (
        {
          auth,
          isMusicMuted,
          isSfxMuted,
          musicVolumePercent,
          sfxVolumePercent,
        }: {
          auth?: AuthPayload;
          isMusicMuted: boolean;
          isSfxMuted: boolean;
          musicVolumePercent: number;
          sfxVolumePercent: number;
        },
        ack?: (
          response:
            | { ok: true; status: 'ACCOUNT_OK' }
            | { ok: true; status: 'AUTH_REQUIRED' | 'AUTH_INVALID' | 'UPDATE_REQUIRED' },
        ) => void,
      ) => {
        const requirement = getUpdateRequirement(socket, auth);
        if (requirement?.forceUpdate) {
          socket.emit('update_required', requirement);
          ack?.({ ok: true, status: 'UPDATE_REQUIRED' });
          return;
        }
        const userId = await registerSocketSession(socket, auth, { forceRevalidate: true });
        if (userId) {
          await trackSettingsAchievements({
            userId,
            isMusicMuted,
            isSfxMuted,
            musicVolumePercent,
            sfxVolumePercent,
          });
        }
        ack?.({ ok: true, status: userId ? 'ACCOUNT_OK' : 'AUTH_INVALID' });
      },
    );

    socket.on(
      'finalize_google_upgrade',
      async (
        {
          auth,
          guestAuth,
          guestProfile,
          flowStartedAt,
          allowExistingSwitch,
        }: {
          auth?: AuthPayload;
          guestAuth?: AuthPayload;
          guestProfile?: {
            nickname: string | null;
            wins: number;
            losses: number;
            tokens?: number;
            dailyRewardWins?: number;
          };
          flowStartedAt?: string;
          allowExistingSwitch?: boolean;
        },
        ack?: (response: unknown) => void,
      ) => {
        await registerSocketSession(socket, auth, { forceRevalidate: true });
        ack?.(await finalizeGoogleUpgrade(
          auth,
          guestAuth,
          guestProfile,
          flowStartedAt,
          Boolean(allowExistingSwitch),
        ));
      },
    );

    socket.on('path_update', ({ path }: { path: Position[] }) => {
      const room = store.getBySocket(socket.id);
      if (room) {
        room.updatePlannedPath(socket.id, path);
        return;
      }
      const coopRoom = coopStore.getBySocket(socket.id);
      coopRoom?.updatePlannedPath(socket.id, path);
    });

    socket.on('join_2v2', async ({ nickname, auth, pieceSkin }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin }) => {
      if (emitUpdateRequired(socket, auth)) return;
      await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      const profile = await resolvePlayerProfileCached(socket, auth, nickname);
      if (!io.sockets.sockets.has(socket.id)) return;
      twoVsTwoStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
      const existingRoom = twoVsTwoStore.getBySocket(socket.id);
      tryStartTwoVsTwoTeamMatch();
      if (!existingRoom && !twoVsTwoStore.getBySocket(socket.id)) {
        socket.emit('twovtwo_matchmaking_waiting', {});
      }
    });

    socket.on(
      'join_ability',
      async (
        {
          nickname,
          auth,
          pieceSkin,
          boardSkin,
          equippedSkills,
          training,
        }: {
          nickname: string;
          auth?: AuthPayload;
          pieceSkin?: PieceSkin;
          boardSkin?: BoardSkin;
          equippedSkills: AbilitySkillId[];
          training?: boolean;
        },
      ) => {
        if (emitUpdateRequired(socket, auth)) return;
        await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
        const profile = await resolvePlayerProfileCached(socket, auth, nickname);
        if (!io.sockets.sockets.has(socket.id)) return;
        if (training) {
          clearAbilityFallback(socket.id);
          const roomId = abilityStore.generateRoomId();
          const room = new AbilityRoom(roomId, roomId, io);
          room.enableTrainingMode();
          const trainingColor = room.addPlayer(
            socket,
            profile.nickname,
            profile.userId,
            profile.stats,
            pieceSkin ?? 'classic',
            boardSkin ?? 'classic',
            equippedSkills,
          );
          if (!trainingColor) return;
          room.addIdleBot('Training Dummy', 'classic', 'classic', []);
          abilityStore.add(room);
          abilityStore.registerSocket(socket.id, roomId);
          socket.emit('ability_room_joined', {
            roomId,
            color: trainingColor,
            opponentNickname: 'Training Dummy',
            training: true,
          });
          room.waitForSkillSelection();
          return;
        }
        const queued = abilityStore.dequeue();
        if (!queued || queued.socketId === socket.id) {
          if (queued) {
            abilityStore.enqueue(
              queued.socketId,
              queued.nickname,
              queued.userId,
              queued.stats,
              queued.pieceSkin,
              queued.boardSkin,
              queued.equippedSkills,
            );
          }
          abilityStore.enqueue(
            socket.id,
            profile.nickname,
            profile.userId,
            profile.stats,
            pieceSkin ?? 'classic',
            boardSkin ?? 'classic',
            equippedSkills,
          );
          socket.emit('ability_matchmaking_waiting', {});
          scheduleAbilityFallback({
            socket,
            profile,
            pieceSkin: pieceSkin ?? 'classic',
            boardSkin: boardSkin ?? 'classic',
            equippedSkills,
          });
          return;
        }

        clearAbilityFallback(socket.id);
        clearAbilityFallback(queued.socketId);

        const queuedSocket = io.sockets.sockets.get(queued.socketId);
        if (!queuedSocket) {
          abilityStore.enqueue(
            socket.id,
            profile.nickname,
            profile.userId,
            profile.stats,
            pieceSkin ?? 'classic',
            boardSkin ?? 'classic',
            equippedSkills,
          );
          socket.emit('ability_matchmaking_waiting', {});
          scheduleAbilityFallback({
            socket,
            profile,
            pieceSkin: pieceSkin ?? 'classic',
            boardSkin: boardSkin ?? 'classic',
            equippedSkills,
          });
          return;
        }

        const roomId = abilityStore.generateRoomId();
        const room = new AbilityRoom(roomId, roomId, io);
        abilityStore.add(room);

        const queuedAbilityColor = room.addPlayer(
          queuedSocket,
          queued.nickname,
          queued.userId,
          queued.stats,
          queued.pieceSkin,
          queued.boardSkin,
          queued.equippedSkills,
        );
        const myAbilityColor = room.addPlayer(
          socket,
          profile.nickname,
          profile.userId,
          profile.stats,
          pieceSkin ?? 'classic',
          boardSkin ?? 'classic',
          equippedSkills,
        );

        if (!queuedAbilityColor || !myAbilityColor) {
          console.error('[join_ability] addPlayer failed unexpectedly');
          socket.emit('join_error', { message: '매칭 중 오류가 발생했습니다. 다시 시도해주세요.' });
          return;
        }

        abilityStore.registerSocket(queued.socketId, roomId);
        queuedSocket.emit('ability_room_joined', {
          roomId,
          color: queuedAbilityColor,
          opponentNickname: profile.nickname,
        });

        abilityStore.registerSocket(socket.id, roomId);
        socket.emit('ability_room_joined', {
          roomId,
          color: myAbilityColor,
          opponentNickname: queued.nickname,
        });

        room.prepareGameStart();
      },
    );

    socket.on('cancel_2v2', () => {
      twoVsTwoStore.removeFromQueue(socket.id);
    });

    socket.on('cancel_ability', () => {
      clearAbilityFallback(socket.id);
      abilityStore.removeFromQueue(socket.id);
    });

    socket.on('twovtwo_client_ready', () => {
      const room = twoVsTwoStore.getBySocket(socket.id);
      room?.markClientReady(socket.id);
    });

    socket.on('ability_client_ready', () => {
      const room = abilityStore.getBySocket(socket.id);
      room?.markClientReady(socket.id);
    });

    socket.on(
      'training_skills_confirmed',
      ({ skills }: { skills: AbilitySkillId[] }) => {
        const room = abilityStore.getBySocket(socket.id);
        room?.confirmTrainingSkills(socket.id, skills);
      },
    );

    socket.on('twovtwo_path_update', ({ path }: { path: Position[] }) => {
      const room = twoVsTwoStore.getBySocket(socket.id);
      room?.updatePlannedPath(socket.id, path);
    });

    socket.on(
      'ability_plan_update',
      ({
        path,
        skills,
      }: {
        path: Position[];
        skills: AbilitySkillReservation[];
      }) => {
        const room = abilityStore.getBySocket(socket.id);
        room?.updatePlan(socket.id, path, skills);
      },
    );

    socket.on(
      'twovtwo_submit_path',
      (
        { path }: { path: Position[] },
        ack?: (response: { ok: boolean; acceptedPath: Position[] }) => void,
      ) => {
        const room = twoVsTwoStore.getBySocket(socket.id);
        const result = room?.submitPath(socket.id, path) ?? { ok: false, acceptedPath: [] };
        ack?.(result);
      },
    );

    socket.on(
      'ability_submit_plan',
      (
        {
          path,
          skills,
        }: {
          path: Position[];
          skills: AbilitySkillReservation[];
        },
        ack?: (
          response: {
            ok: boolean;
            acceptedPath: Position[];
            acceptedSkills: AbilitySkillReservation[];
          },
        ) => void,
      ) => {
        const room = abilityStore.getBySocket(socket.id);
        const result =
          room?.submitPlan(socket.id, path, skills) ?? {
            ok: false,
            acceptedPath: [],
            acceptedSkills: [],
          };
        ack?.(result);
      },
    );

    socket.on('submit_path', ({ path }: { path: Position[] }, ack?: (response: { ok: boolean }) => void) => {
      const room = store.getBySocket(socket.id);
      const ok =
        room?.submitPath(socket.id, path) ??
        coopStore.getBySocket(socket.id)?.submitPath(socket.id, path) ??
        false;
      ack?.({ ok });
    });

    socket.on('request_rematch', () => {
      const abilityRoom = abilityStore.getBySocket(socket.id);
      if (abilityRoom) {
        abilityRoom.requestRematch(socket.id);
        return;
      }

      const twoVsTwoRoom = twoVsTwoStore.getBySocket(socket.id);
      if (twoVsTwoRoom) {
        const result = twoVsTwoRoom.requestRematch(socket.id);
        if (result.status === 'waiting_teammate' && result.teammateSocketId) {
          const teammateSocket = io.sockets.sockets.get(result.teammateSocketId);
          teammateSocket?.emit('rematch_requested', {});
        }
        if (result.status === 'team_ready') {
          twoVsTwoStore.enqueueTeam(
            result.members.map((member) => ({
              socketId: member.socketId,
              nickname: member.nickname,
              userId: member.userId,
              stats: member.stats,
              pieceSkin: member.pieceSkin,
            })),
          );
          for (const member of result.members) {
            const memberSocket = io.sockets.sockets.get(member.socketId);
            memberSocket?.emit('twovtwo_matchmaking_waiting', {});
          }
          tryStartTwoVsTwoTeamMatch();
        }
        return;
      }

      const room = store.getBySocket(socket.id);
      if (room) {
        room.requestRematch(socket.id);
        return;
      }
      const coopRoom = coopStore.getBySocket(socket.id);
      coopRoom?.requestRematch(socket.id);
    });

    socket.on('resume_tutorial', () => {
      const room = store.getBySocket(socket.id);
      room?.resumeTutorial(socket.id);
    });

    socket.on('game_client_ready', () => {
      const room = store.getBySocket(socket.id);
      room?.markClientReady(socket.id);
    });

    socket.on('coop_client_ready', () => {
      const room = coopStore.getBySocket(socket.id);
      room?.markClientReady(socket.id);
    });

    socket.on('chat_send', ({ message }: { message: string }) => {
      const room = store.getBySocket(socket.id);
      if (room) {
        room.sendChat(socket.id, message);
        return;
      }
      const coopRoom = coopStore.getBySocket(socket.id);
      if (coopRoom) {
        coopRoom.sendChat(socket.id, message);
        return;
      }
      const twoVsTwoRoom = twoVsTwoStore.getBySocket(socket.id);
      if (twoVsTwoRoom) {
        twoVsTwoRoom.sendChat(socket.id, message);
        return;
      }
      const abilityRoom = abilityStore.getBySocket(socket.id);
      abilityRoom?.sendChat(socket.id, message);
    });

    socket.on('update_piece_skin', ({ pieceSkin }: { pieceSkin: PieceSkin }) => {
      const room = store.getBySocket(socket.id);
      if (room) {
        room.updatePlayerSkin(socket.id, pieceSkin);
        return;
      }
      const coopRoom = coopStore.getBySocket(socket.id);
      if (coopRoom) {
        coopRoom.updatePlayerSkin(socket.id, pieceSkin);
        return;
      }
      const twoVsTwoRoom = twoVsTwoStore.getBySocket(socket.id);
      if (twoVsTwoRoom) {
        twoVsTwoRoom.updatePlayerSkin(socket.id, pieceSkin);
        return;
      }
      const abilityRoom = abilityStore.getBySocket(socket.id);
      abilityRoom?.updatePlayerSkin(socket.id, pieceSkin);
    });

    socket.on('coop_path_update', ({ path }: { path: Position[] }) => {
      const room = coopStore.getBySocket(socket.id);
      room?.updatePlannedPath(socket.id, path);
    });

    socket.on('coop_submit_path', ({ path }: { path: Position[] }, ack?: (response: { ok: boolean }) => void) => {
      const room = coopStore.getBySocket(socket.id);
      const ok = room?.submitPath(socket.id, path) ?? false;
      ack?.({ ok });
    });

    socket.on('disconnect', () => {
      clearRandomFallback(socket.id);
      clearAbilityFallback(socket.id);
      pendingCancelRandom.delete(socket.id);
      console.log(`[-] Disconnected: ${socket.id}`);
      unregisterSocketSession(socket.id);
      store.removeFromQueue(socket.id);
      coopStore.removeFromQueue(socket.id);
      twoVsTwoStore.removeFromQueue(socket.id);
      abilityStore.removeFromQueue(socket.id);
      const { room, disconnectResult } = store.removeSocket(socket.id);
      const coopRoom = coopStore.removeSocket(socket.id);
      const twoVsTwoRoom = twoVsTwoStore.removeSocket(socket.id);
      const abilityRoom = abilityStore.removeSocket(socket.id);

      if (room && disconnectResult.disconnectedColor) {
        io.to(room.roomId).emit('opponent_disconnected', {});
      }

      if (abilityRoom.room && abilityRoom.disconnectResult.disconnectedColor) {
        io.to(abilityRoom.room.roomId).emit('opponent_disconnected', {});
      }

    });
  });
}


