"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
const arenaConfig_1 = require("../game/arenaConfig");
const GameRoom_1 = require("../game/GameRoom");
const RoomStore_1 = require("../store/RoomStore");
const CoopRoom_1 = require("../game/coop/CoopRoom");
const CoopRoomStore_1 = require("../store/CoopRoomStore");
const TwoVsTwoRoom_1 = require("../game/twovtwo/TwoVsTwoRoom");
const TwoVsTwoRoomStore_1 = require("../store/TwoVsTwoRoomStore");
const AbilityRoom_1 = require("../game/ability/AbilityRoom");
const AbilityRoomStore_1 = require("../store/AbilityRoomStore");
const appVersion_1 = require("../config/appVersion");
const fakeRandomNicknames_1 = require("../config/fakeRandomNicknames");
const abilityUnlockConfig_1 = require("../game/ability/abilityUnlockConfig");
const playerAuth_1 = require("../services/playerAuth");
const achievementService_1 = require("../services/achievementService");
const rotationService_1 = require("../services/rotationService");
const supabase_1 = require("../lib/supabase");
const achievementCatalog_1 = require("../achievements/achievementCatalog");
const maintenanceService_1 = require("../services/maintenanceService");
const PROFILE_PIECE_SKIN_IDS = [
    'classic',
    'ember',
    'nova',
    'aurora',
    'void',
    'plasma',
    'gold_core',
    'neon_pulse',
    'inferno',
    'quantum',
    'cosmic',
    'arc_reactor',
    'electric_core',
    'berserker',
    'moonlight_seed',
    'wizard',
    'chronos',
    'atomic',
    'sun',
    'frost_heart',
];
function initSocketServer(io) {
    const store = RoomStore_1.RoomStore.getInstance();
    const coopStore = CoopRoomStore_1.CoopRoomStore.getInstance();
    const twoVsTwoStore = TwoVsTwoRoomStore_1.TwoVsTwoRoomStore.getInstance();
    const abilityStore = AbilityRoomStore_1.AbilityRoomStore.getInstance();
    const activeUserSockets = new Map();
    const socketUsers = new Map();
    const authCacheTtlMs = 10 * 60 * 1000;
    const maintenanceMatchmakingMessage = '서버 점검이 곧 시작되어 새 게임을 시작할 수 없습니다.';
    const maintenanceClosedMessage = '점검으로 인해 경기가 종료되었습니다. 해당 경기는 승패에 반영되지 않습니다.';
    const profileCacheTtlMs = 60 * 1000;
    const roomSweepIntervalMs = 60 * 1000;
    const metricsLogIntervalMs = 60 * 1000;
    const slowProfileResolveThresholdMs = 150;
    const randomFallbackMatchMs = 7000;
    const randomFallbackTimers = new Map();
    const pendingCancelRandom = new Set();
    const abilityFallbackTimers = new Map();
    const FRIEND_CODE_TTL_MS = 5 * 60 * 1000;
    const friendCodes = new Map();
    const challengePending = new Map();
    const profileCache = new Map();
    const unregisterSocketSession = (socketId) => {
        const userId = socketUsers.get(socketId);
        if (!userId)
            return null;
        socketUsers.delete(socketId);
        if (activeUserSockets.get(userId) === socketId) {
            activeUserSockets.delete(userId);
        }
        return userId;
    };
    const getSocketOrigin = (socket) => {
        const origin = socket.handshake.headers.origin;
        return typeof origin === 'string' ? origin : '';
    };
    const isNativeLikeOrigin = (origin) => origin === 'capacitor://localhost' ||
        origin === 'ionic://localhost' ||
        origin === 'http://localhost' ||
        origin === 'https://localhost';
    const getCurrentAppVersionCode = (auth) => {
        const parsed = typeof auth?.appVersionCode === 'number'
            ? auth.appVersionCode
            : Number(auth?.appVersionCode);
        return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    };
    const getUpdateRequirement = (socket, auth) => {
        const origin = getSocketOrigin(socket);
        const isAndroidClient = auth?.clientPlatform === 'android' || isNativeLikeOrigin(origin);
        if (!isAndroidClient)
            return null;
        const currentVersionCode = getCurrentAppVersionCode(auth);
        const result = (0, appVersion_1.getAndroidVersionStatus)(currentVersionCode);
        if (result.forceUpdate) {
            console.warn('[version_check] forceUpdate triggered', {
                origin,
                clientPlatform: auth?.clientPlatform,
                sentAppVersionCode: auth?.appVersionCode,
                parsedCurrentVersionCode: currentVersionCode,
                minSupportedVersionCode: result.minSupportedVersionCode,
                latestVersionCode: result.latestVersionCode,
            });
        }
        return result;
    };
    const emitUpdateRequired = (socket, auth) => {
        const requirement = getUpdateRequirement(socket, auth);
        if (!requirement?.forceUpdate)
            return null;
        socket.emit('update_required', requirement);
        socket.emit('join_error', {
            message: 'A new version is available. Please update the app from the Play Store.',
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
    const clearRandomFallback = (socketId) => {
        const timer = randomFallbackTimers.get(socketId);
        if (timer) {
            clearTimeout(timer);
            randomFallbackTimers.delete(socketId);
        }
    };
    const clearAbilityFallback = (socketId) => {
        const timer = abilityFallbackTimers.get(socketId);
        if (timer) {
            console.log(`[fallback] cleared socket=${socketId}`);
            clearTimeout(timer);
            abilityFallbackTimers.delete(socketId);
        }
    };
    const getFakeAiPieceSkinPool = (arena) => {
        const normalizedArena = Math.max(1, Math.min(10, Math.trunc(arena)));
        const skins = ['classic'];
        if (normalizedArena >= 1)
            skins.push('plasma', 'cosmic');
        if (normalizedArena >= 2)
            skins.push('neon_pulse', 'quantum');
        if (normalizedArena >= 3)
            skins.push('inferno', 'berserker');
        if (normalizedArena >= 4)
            skins.push('electric_core');
        if (normalizedArena >= 5)
            skins.push('wizard');
        if (normalizedArena >= 6)
            skins.push('gold_core', 'sun');
        if (normalizedArena >= 8)
            skins.push('arc_reactor', 'atomic');
        if (normalizedArena >= 10)
            skins.push('chronos');
        return skins;
    };
    const createDisguisedRandomProfile = (profile) => {
        const currentRating = createNearbyFakeRating(profile.currentRating);
        const skinPool = getFakeAiPieceSkinPool((0, arenaConfig_1.getArenaFromRating)(currentRating));
        const pieceSkin = skinPool[Math.floor(Math.random() * skinPool.length)] ?? 'classic';
        const nickname = fakeRandomNicknames_1.FAKE_RANDOM_NICKNAMES[Math.floor(Math.random() * fakeRandomNicknames_1.FAKE_RANDOM_NICKNAMES.length)];
        const fakeId = `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`;
        const stats = createNaturalFakeStats(Math.floor(Math.random() * 101) + Math.floor(Math.random() * 101));
        return {
            nickname,
            displayId: fakeId,
            userId: null,
            stats,
            currentRating,
            pieceSkin,
            boardSkin: 'classic',
        };
    };
    const createNearbyFakeRating = (playerRating) => {
        const normalizedPlayerRating = Math.max(0, Math.trunc(playerRating));
        const playerArena = (0, arenaConfig_1.getArenaFromRating)(normalizedPlayerRating);
        const arenaRange = arenaConfig_1.ARENA_RANGES.find((range) => range.arena === playerArena);
        const minRating = normalizedPlayerRating >= arenaConfig_1.RANKED_UNLOCKED_THRESHOLD
            ? arenaConfig_1.RANKED_UNLOCKED_THRESHOLD
            : (arenaRange?.minRating ?? 0);
        const maxRating = normalizedPlayerRating >= arenaConfig_1.RANKED_UNLOCKED_THRESHOLD
            ? Math.max(minRating, Math.ceil((normalizedPlayerRating + 180) / 10) * 10)
            : Math.floor((arenaRange?.maxRating ?? normalizedPlayerRating) / 10) * 10;
        const baseRating = Math.round(normalizedPlayerRating / 10) * 10;
        const nearbyCandidates = [];
        for (let offset = -80; offset <= 80; offset += 10) {
            const candidate = baseRating + offset;
            if (candidate < minRating || candidate > maxRating)
                continue;
            if (candidate === normalizedPlayerRating)
                continue;
            nearbyCandidates.push(candidate);
        }
        if (nearbyCandidates.length > 0) {
            return nearbyCandidates[Math.floor(Math.random() * nearbyCandidates.length)];
        }
        const fallback = Math.max(minRating, Math.min(maxRating, baseRating));
        return Math.round(fallback / 10) * 10;
    };
    const createNaturalFakeStats = (totalGames, options = {}) => {
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
        const wins = minWins + Math.floor(Math.random() * (maxRateWins - minWins + 1));
        return {
            wins,
            losses: total - wins,
        };
    };
    const randomHex = (length) => {
        let result = '';
        while (result.length < length) {
            result += Math.floor(Math.random() * 16).toString(16);
        }
        return result.slice(0, length);
    };
    const pickRandomUniqueSkills = (pool, count) => {
        const bag = [...pool];
        for (let index = bag.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
        }
        return bag.slice(0, count);
    };
    const getMinimumWinsForSkills = (skills) => skills.reduce((requiredWins, skill) => Math.max(requiredWins, abilityUnlockConfig_1.WIN_REQUIREMENT_BY_ABILITY_SKILL[skill] ?? 0), 0);
    const createDisguisedAbilityBotLoadout = (profile) => {
        const beginner = Math.random() < 0.05;
        if (beginner) {
            const nickname = fakeRandomNicknames_1.FAKE_RANDOM_NICKNAMES[Math.floor(Math.random() * fakeRandomNicknames_1.FAKE_RANDOM_NICKNAMES.length)];
            return {
                nickname,
                displayId: `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`,
                userId: null,
                stats: createNaturalFakeStats(Math.floor(Math.random() * 101) + Math.floor(Math.random() * 101)),
                currentRating: profile.currentRating,
                pieceSkin: 'classic',
                boardSkin: 'classic',
                equippedSkills: ['classic_guard'],
                beginner: true,
            };
        }
        const fakeProfile = createDisguisedRandomProfile(profile);
        const fakeArena = (0, arenaConfig_1.getArenaFromRating)(fakeProfile.currentRating);
        const skillPool = (0, abilityUnlockConfig_1.getFakeAiAbilitySkillPool)(fakeArena);
        const equippedSkills = pickRandomUniqueSkills(skillPool, 3);
        const requiredWins = getMinimumWinsForSkills(equippedSkills);
        const stats = requiredWins > fakeProfile.stats.wins
            ? createNaturalFakeStats(fakeProfile.stats.wins + fakeProfile.stats.losses, { minWins: requiredWins })
            : fakeProfile.stats;
        return {
            ...fakeProfile,
            equippedSkills,
            stats,
            beginner: false,
        };
    };
    const createRandomFallbackMatch = async ({ socket, profile, pieceSkin, boardSkin, }) => {
        clearRandomFallback(socket.id);
        if (!io.sockets.sockets.has(socket.id))
            return;
        if (!store.isQueuedRandom(socket.id))
            return;
        store.removeFromQueue(socket.id);
        const roomId = store.generateRoomId();
        const code = store.generateCode();
        const room = new GameRoom_1.GameRoom(roomId, code, io, 'random');
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
        const humanColor = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin, boardSkin);
        if (!humanColor)
            return;
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
        emitFriendPresenceForSocket(socket.id);
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
    const scheduleRandomFallback = ({ socket, profile, pieceSkin, boardSkin, }) => {
        clearRandomFallback(socket.id);
        randomFallbackTimers.set(socket.id, setTimeout(() => {
            void createRandomFallbackMatch({
                socket,
                profile,
                pieceSkin,
                boardSkin,
            });
        }, randomFallbackMatchMs));
    };
    const createAbilityFallbackMatch = async ({ socket, profile, pieceSkin, boardSkin, equippedSkills, }) => {
        clearAbilityFallback(socket.id);
        console.log(`[fallback] fired socket=${socket.id} connected=${io.sockets.sockets.has(socket.id)} queued=${abilityStore.isQueued(socket.id)}`);
        if (!io.sockets.sockets.has(socket.id))
            return;
        if (!abilityStore.isQueued(socket.id)) {
            console.warn(`[fallback] socket=${socket.id} not in queue — skip (likely already matched)`);
            return;
        }
        abilityStore.removeFromQueue(socket.id);
        const roomId = abilityStore.generateRoomId();
        const room = new AbilityRoom_1.AbilityRoom(roomId, roomId, io);
        abilityStore.add(room);
        const fakeProfile = createDisguisedAbilityBotLoadout(profile);
        const humanFirst = Math.random() < 0.5;
        if (!humanFirst) {
            room.addIdleBot(fakeProfile.nickname, fakeProfile.pieceSkin, fakeProfile.boardSkin, fakeProfile.equippedSkills, {
                displayId: fakeProfile.displayId,
                stats: fakeProfile.stats,
                rating: fakeProfile.currentRating,
            });
        }
        const humanColor = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, profile.currentRating, pieceSkin, boardSkin, equippedSkills);
        if (!humanColor)
            return;
        if (humanFirst) {
            room.addIdleBot(fakeProfile.nickname, fakeProfile.pieceSkin, fakeProfile.boardSkin, fakeProfile.equippedSkills, {
                displayId: fakeProfile.displayId,
                stats: fakeProfile.stats,
                rating: fakeProfile.currentRating,
            });
        }
        abilityStore.registerSocket(socket.id, roomId);
        emitFriendPresenceForSocket(socket.id);
        const opponentColor = humanColor === 'red' ? 'blue' : 'red';
        const opponent = room.toClientState(humanColor).players[opponentColor];
        const hostArena = (0, arenaConfig_1.getArenaFromRating)(profile.currentRating);
        console.log(`[fallback] AI match created socket=${socket.id} roomId=${roomId} color=${humanColor} hostArena=${hostArena}`);
        socket.emit('ability_room_joined', {
            roomId,
            color: humanColor,
            opponentNickname: opponent.nickname,
            hostArena,
        });
        room.prepareGameStart();
    };
    const scheduleAbilityFallback = ({ socket, profile, pieceSkin, boardSkin, equippedSkills, currentRating, rankedUnlocked, }) => {
        clearAbilityFallback(socket.id);
        const fallbackMs = (0, arenaConfig_1.getAbilityAiFallbackMs)(currentRating, rankedUnlocked);
        if (fallbackMs < 0)
            return; // ranked_unlocked: AI 없음
        console.log(`[fallback] scheduled socket=${socket.id} in ${fallbackMs}ms`);
        abilityFallbackTimers.set(socket.id, setTimeout(() => {
            void createAbilityFallbackMatch({
                socket,
                profile,
                pieceSkin,
                boardSkin,
                equippedSkills,
            });
        }, fallbackMs));
    };
    const notifyRoomClosed = ({ socketIds, reason, }) => {
        if (reason !== 'turn_limit' && reason !== 'maintenance')
            return;
        for (const socketId of socketIds) {
            if (!io.sockets.sockets.has(socketId))
                continue;
            io.to(socketId).emit('room_closed', {
                reason,
                message: reason === 'maintenance' ? maintenanceClosedMessage : undefined,
                maintenance: reason === 'maintenance' ? maintenanceService_1.maintenanceController.getStatus() : undefined,
            });
        }
    };
    const rejectMatchmakingForMaintenance = (socket) => {
        if (!maintenanceService_1.maintenanceController.isMatchmakingLocked())
            return false;
        socket.emit('join_error', {
            message: maintenanceMatchmakingMessage,
            maintenance: maintenanceService_1.maintenanceController.getStatus(),
        });
        return true;
    };
    const cancelQueuedMatchmakingForMaintenance = () => {
        const queuedSocketIds = [
            ...store.drainQueue(),
            ...coopStore.drainQueue(),
            ...twoVsTwoStore.drainQueue(),
            ...abilityStore.drainQueue(),
        ];
        for (const socketId of queuedSocketIds) {
            clearRandomFallback(socketId);
            clearAbilityFallback(socketId);
            const queuedSocket = io.sockets.sockets.get(socketId);
            queuedSocket?.emit('join_error', {
                message: maintenanceMatchmakingMessage,
                maintenance: maintenanceService_1.maintenanceController.getStatus(),
            });
        }
    };
    const forceCloseRoomsForMaintenance = () => {
        const onRemove = notifyRoomClosed;
        store.forceCloseAllRooms(onRemove);
        coopStore.forceCloseAllRooms(onRemove);
        twoVsTwoStore.forceCloseAllRooms(onRemove);
        abilityStore.forceCloseAllRooms(onRemove);
    };
    maintenanceService_1.maintenanceController.on('changed', (status) => {
        io.emit('maintenance_status', status);
    });
    maintenanceService_1.maintenanceController.on('notice', (notice) => {
        io.emit('maintenance_notice', notice);
        if (notice.kind === 'matchmaking_locked' ||
            notice.status.phase === 'matchmaking_locked' ||
            notice.status.phase === 'active') {
            cancelQueuedMatchmakingForMaintenance();
        }
    });
    maintenanceService_1.maintenanceController.on('force-close', () => {
        forceCloseRoomsForMaintenance();
    });
    const resolvePlayerProfileCached = async (socket, auth, fallbackNickname) => {
        const userId = typeof socket.data.userId === 'string' ? socket.data.userId : null;
        if (userId) {
            const cached = profileCache.get(userId);
            if (cached && cached.expiresAt > Date.now()) {
                return cached.profile;
            }
        }
        const startedAt = Date.now();
        const profile = await (0, playerAuth_1.resolvePlayerProfile)(auth, fallbackNickname);
        const durationMs = Date.now() - startedAt;
        if (durationMs >= slowProfileResolveThresholdMs) {
            console.log(`[perf] resolvePlayerProfile took ${durationMs}ms userId=${profile.userId ?? 'guest'} socket=${socket.id}`);
        }
        if (profile.userId) {
            profileCache.set(profile.userId, {
                expiresAt: Date.now() + profileCacheTtlMs,
                profile,
            });
        }
        return profile;
    };
    const getUserPresenceStatus = (userId) => {
        const socketId = activeUserSockets.get(userId);
        if (!socketId || !io.sockets.sockets.has(socketId))
            return 'offline';
        const inGame = store.getBySocket(socketId) ??
            abilityStore.getBySocket(socketId) ??
            coopStore.getBySocket(socketId) ??
            twoVsTwoStore.getBySocket(socketId);
        return inGame ? 'in_game' : 'online';
    };
    const getFriendIds = async (userId) => {
        if (!supabase_1.supabaseAdmin)
            return [];
        const { data } = await supabase_1.supabaseAdmin
            .from('friends')
            .select('friend_id')
            .eq('user_id', userId);
        return (data ?? []).map((row) => row.friend_id);
    };
    const buildFriendPresenceEntry = async (userId) => {
        if (!supabase_1.supabaseAdmin) {
            return {
                userId,
                nickname: 'Guest',
                currentRating: 0,
                equippedSkin: 'classic',
                status: getUserPresenceStatus(userId),
            };
        }
        const [profileRes, statsRes] = await Promise.all([
            supabase_1.supabaseAdmin
                .from('profiles')
                .select('nickname, equipped_skin')
                .eq('id', userId)
                .maybeSingle(),
            supabase_1.supabaseAdmin
                .from('player_stats')
                .select('current_rating')
                .eq('user_id', userId)
                .maybeSingle(),
        ]);
        return {
            userId,
            nickname: profileRes.data?.nickname ?? 'Guest',
            currentRating: Number(statsRes.data?.current_rating ?? 0),
            equippedSkin: (profileRes.data?.equipped_skin ?? 'classic'),
            status: getUserPresenceStatus(userId),
        };
    };
    const emitFriendPresenceToFriends = async (userId) => {
        const friendIds = await getFriendIds(userId);
        if (friendIds.length === 0)
            return;
        const friend = await buildFriendPresenceEntry(userId);
        for (const friendId of friendIds) {
            const socketId = activeUserSockets.get(friendId);
            if (!socketId || !io.sockets.sockets.has(socketId))
                continue;
            io.to(socketId).emit('friend_presence_updated', { friend });
        }
    };
    const emitFriendListChanged = async (userIds) => {
        for (const userId of userIds) {
            const socketId = activeUserSockets.get(userId);
            if (!socketId || !io.sockets.sockets.has(socketId))
                continue;
            io.to(socketId).emit('friend_list_changed', {});
        }
    };
    const emitFriendRequestCountChanged = async (userId) => {
        if (!supabase_1.supabaseAdmin)
            return;
        const socketId = activeUserSockets.get(userId);
        if (!socketId || !io.sockets.sockets.has(socketId))
            return;
        const { count } = await supabase_1.supabaseAdmin
            .from('friend_requests')
            .select('id', { count: 'exact', head: true })
            .eq('receiver_id', userId);
        io.to(socketId).emit('friend_request_count_updated', {
            count: count ?? 0,
        });
    };
    const emitFriendPresenceForSocket = (socketId) => {
        const userId = socketUsers.get(socketId);
        if (!userId)
            return;
        void emitFriendPresenceToFriends(userId);
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
        const hasActiveTraffic = io.sockets.sockets.size > 0 ||
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
        console.log(`[metrics] sockets=${io.sockets.sockets.size} activeUserSessions=${activeUserSockets.size} profileCache=${profileCache.size} ` +
            `rooms{duel=${duelStats.roomCount},coop=${coopStats.roomCount},2v2=${twoVsTwoStats.roomCount},ability=${abilityStats.roomCount}} ` +
            `queues{duel=${duelStats.queueLength},coop=${coopStats.queueLength},2v2Solo=${twoVsTwoStats.queueLength},2v2Team=${twoVsTwoStats.teamQueueLength},ability=${abilityStats.queueLength}} ` +
            `mappings{duel=${duelStats.socketMappings},coop=${coopStats.socketMappings},2v2=${twoVsTwoStats.socketMappings},ability=${abilityStats.socketMappings}}`);
    }, metricsLogIntervalMs);
    setInterval(() => {
        const now = Date.now();
        for (const [code, entry] of friendCodes.entries()) {
            if (entry.expiresAt <= now)
                friendCodes.delete(code);
        }
    }, 60000);
    const tryStartTwoVsTwoTeamMatch = () => {
        const match = twoVsTwoStore.dequeueTeamMatch();
        if (!match)
            return;
        const [teamA, teamB] = match;
        const roomId = twoVsTwoStore.generateRoomId();
        const room = new TwoVsTwoRoom_1.TwoVsTwoRoom(roomId, roomId, io);
        twoVsTwoStore.add(room);
        const slots = [
            'red_top',
            'red_bottom',
            'blue_top',
            'blue_bottom',
        ];
        const orderedMembers = [...teamA.members, ...teamB.members].sort((a, b) => a.socketId.localeCompare(b.socketId));
        for (let index = 0; index < orderedMembers.length; index++) {
            const member = orderedMembers[index];
            const memberSocket = io.sockets.sockets.get(member.socketId);
            if (!memberSocket)
                continue;
            const previousRoom = twoVsTwoStore.getBySocket(member.socketId);
            if (previousRoom) {
                memberSocket.leave(previousRoom.roomId);
            }
            const slot = room.addPlayer(memberSocket, member.nickname, member.userId, member.stats, member.pieceSkin);
            if (!slot)
                continue;
            twoVsTwoStore.registerSocket(member.socketId, roomId);
            emitFriendPresenceForSocket(member.socketId);
            memberSocket.emit('twovtwo_room_joined', {
                roomId,
                slot,
                team: slot.startsWith('red') ? 'red' : 'blue',
            });
        }
        room.prepareGameStart();
    };
    const registerSocketSession = async (socket, auth, options) => {
        const accessToken = auth?.accessToken?.trim();
        const cachedUserId = typeof socket.data.userId === 'string' ? socket.data.userId : null;
        const cachedAccessToken = typeof socket.data.accessToken === 'string' ? socket.data.accessToken : null;
        const cachedVerifiedAt = typeof socket.data.authVerifiedAt === 'number' ? socket.data.authVerifiedAt : 0;
        const cacheIsFresh = Date.now() - cachedVerifiedAt < authCacheTtlMs;
        const shouldReuseCachedSession = !options?.forceRevalidate &&
            cachedUserId &&
            cachedAccessToken &&
            accessToken &&
            cachedAccessToken === accessToken &&
            cacheIsFresh;
        if (shouldReuseCachedSession) {
            activeUserSockets.set(cachedUserId, socket.id);
            socketUsers.set(socket.id, cachedUserId);
            void emitFriendPresenceToFriends(cachedUserId);
            return cachedUserId;
        }
        const user = await (0, playerAuth_1.getUserFromToken)(auth?.accessToken);
        if (!user) {
            unregisterSocketSession(socket.id);
            socket.data.userId = undefined;
            socket.data.accessToken = undefined;
            socket.data.isGuestUser = undefined;
            socket.data.authVerifiedAt = undefined;
            return null;
        }
        const previousMappedUserId = socketUsers.get(socket.id);
        if (previousMappedUserId &&
            previousMappedUserId !== user.id &&
            activeUserSockets.get(previousMappedUserId) === socket.id) {
            activeUserSockets.delete(previousMappedUserId);
        }
        const previousSocketId = activeUserSockets.get(user.id);
        activeUserSockets.set(user.id, socket.id);
        socketUsers.set(socket.id, user.id);
        socket.data.userId = user.id;
        socket.data.accessToken = accessToken;
        socket.data.isGuestUser = user.is_anonymous ?? false;
        socket.data.authVerifiedAt = Date.now();
        void emitFriendPresenceToFriends(user.id);
        if (!options?.allowConcurrentSessions &&
            previousSocketId &&
            previousSocketId !== socket.id) {
            const previousSocket = io.sockets.sockets.get(previousSocketId);
            if (previousSocket) {
                previousSocket.emit('session_replaced', {});
                previousSocket.disconnect(true);
            }
        }
        return user.id;
    };
    io.on('connection', (socket) => {
        console.log(`[+] Connected: ${socket.id}`);
        socket.emit('maintenance_status', maintenanceService_1.maintenanceController.getStatus());
        socket.on('sync_time', (ack) => {
            ack?.({ serverNow: Date.now() });
        });
        socket.on('get_rotation', (ack) => {
            ack?.({ skills: (0, rotationService_1.getCurrentRotation)() });
        });
        socket.on('session_register', async ({ auth }, ack) => {
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
            try {
                const userId = await registerSocketSession(socket, auth, {
                    allowConcurrentSessions: true,
                });
                ack?.({ ok: Boolean(userId), updateRequired: false });
            }
            catch (err) {
                console.error('[session_register] handler error:', err);
                ack?.({ ok: false, updateRequired: false });
            }
        });
        socket.on('create_room', async ({ nickname, auth, pieceSkin, boardSkin }) => {
            try {
                if (emitUpdateRequired(socket, auth))
                    return;
                if (rejectMatchmakingForMaintenance(socket))
                    return;
                await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                const profile = await resolvePlayerProfileCached(socket, auth, nickname);
                if (!io.sockets.sockets.has(socket.id))
                    return;
                const roomId = store.generateRoomId();
                const code = store.generateCode();
                const room = new GameRoom_1.GameRoom(roomId, code, io, 'friend');
                const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic');
                if (!color) {
                    socket.emit('join_error', { message: '방 생성에 실패했습니다.' });
                    return;
                }
                store.add(room);
                store.registerSocket(socket.id, roomId);
                emitFriendPresenceForSocket(socket.id);
                socket.emit('room_created', { roomId, code, color, pieceSkin: pieceSkin ?? 'classic' });
            }
            catch (err) {
                console.error('[create_room] handler error:', err);
                socket.emit('join_error', { message: '방 생성 중 오류가 발생했습니다.' });
            }
        });
        socket.on('join_ai', async ({ nickname, auth, pieceSkin, tutorialPending, boardSkin, }) => {
            try {
                if (emitUpdateRequired(socket, auth))
                    return;
                if (rejectMatchmakingForMaintenance(socket))
                    return;
                await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                const profile = await resolvePlayerProfileCached(socket, auth, nickname);
                if (!io.sockets.sockets.has(socket.id))
                    return;
                const roomId = store.generateRoomId();
                const code = store.generateCode();
                const room = new GameRoom_1.GameRoom(roomId, code, io, 'ai');
                const humanColor = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic');
                if (!humanColor) {
                    socket.emit('join_error', { message: 'AI room creation failed.' });
                    return;
                }
                room.addAiPlayer('PathClash AI');
                store.add(room);
                store.registerSocket(socket.id, roomId);
                emitFriendPresenceForSocket(socket.id);
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
            }
            catch (err) {
                console.error('[join_ai] handler error:', err);
                socket.emit('join_error', { message: 'AI 매칭 중 오류가 발생했습니다.' });
            }
        });
        socket.on('join_room', async ({ code, nickname, auth, pieceSkin, boardSkin }) => {
            try {
                if (emitUpdateRequired(socket, auth))
                    return;
                if (rejectMatchmakingForMaintenance(socket))
                    return;
                await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                const profile = await resolvePlayerProfileCached(socket, auth, nickname);
                if (!io.sockets.sockets.has(socket.id))
                    return;
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
                emitFriendPresenceForSocket(socket.id);
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
            }
            catch (err) {
                console.error('[join_room] handler error:', err);
                socket.emit('join_error', { message: '방 입장 중 오류가 발생했습니다.' });
            }
        });
        socket.on('create_ability_room', async ({ nickname, auth, pieceSkin, boardSkin, equippedSkills, }) => {
            try {
                if (emitUpdateRequired(socket, auth))
                    return;
                if (rejectMatchmakingForMaintenance(socket))
                    return;
                await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                const profile = await resolvePlayerProfileCached(socket, auth, nickname);
                if (!io.sockets.sockets.has(socket.id))
                    return;
                const roomId = abilityStore.generateRoomId();
                const code = abilityStore.generateCode();
                const room = new AbilityRoom_1.AbilityRoom(roomId, code, io);
                room.enablePrivateMatch();
                const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, profile.currentRating, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills);
                if (!color) {
                    socket.emit('join_error', { message: '방 생성에 실패했습니다.' });
                    return;
                }
                abilityStore.add(room);
                abilityStore.registerSocket(socket.id, roomId);
                emitFriendPresenceForSocket(socket.id);
                socket.emit('ability_room_created', {
                    roomId,
                    code,
                    color,
                });
            }
            catch (err) {
                console.error('[create_ability_room] handler error:', err);
                socket.emit('join_error', { message: '방 생성 중 오류가 발생했습니다.' });
            }
        });
        socket.on('join_ability_room', async ({ code, nickname, auth, pieceSkin, boardSkin, equippedSkills, }) => {
            try {
                if (emitUpdateRequired(socket, auth))
                    return;
                if (rejectMatchmakingForMaintenance(socket))
                    return;
                await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                const profile = await resolvePlayerProfileCached(socket, auth, nickname);
                if (!io.sockets.sockets.has(socket.id))
                    return;
                const room = abilityStore.getByCode(code);
                if (!room || room.isFull) {
                    socket.emit('join_error', { message: '방을 찾을 수 없거나 이미 가득 찼습니다.' });
                    return;
                }
                room.enablePrivateMatch();
                const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, profile.currentRating, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills);
                if (!color) {
                    socket.emit('join_error', { message: '입장할 수 없습니다.' });
                    return;
                }
                room.prepareGameStart();
                abilityStore.registerSocket(socket.id, room.roomId);
                emitFriendPresenceForSocket(socket.id);
                socket.emit('ability_room_joined', {
                    roomId: room.roomId,
                    color,
                    opponentNickname: room.toClientState(color).players[color === 'red' ? 'blue' : 'red'].nickname,
                });
                socket.to(room.roomId).emit('ability_opponent_joined', {
                    nickname: profile.nickname,
                    color,
                });
            }
            catch (err) {
                console.error('[join_ability_room] handler error:', err);
                socket.emit('join_error', { message: '방 입장 중 오류가 발생했습니다.' });
            }
        });
        socket.on('friend_generate_code', async ({ auth }, ack) => {
            try {
                const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                if (!userId) {
                    ack?.({ error: 'auth_required' });
                    return;
                }
                const profile = await resolvePlayerProfileCached(socket, auth, '');
                // 기존 코드 제거
                for (const [code, entry] of friendCodes.entries()) {
                    if (entry.userId === userId)
                        friendCodes.delete(code);
                }
                // 새 코드 생성
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                let code;
                do {
                    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
                } while (friendCodes.has(code));
                const expiresAt = Date.now() + FRIEND_CODE_TTL_MS;
                friendCodes.set(code, { userId, nickname: profile.nickname, expiresAt });
                ack?.({ code, expiresAt });
            }
            catch (err) {
                console.error('[friend_generate_code] handler error:', err);
                ack?.({ error: 'server_error' });
            }
        });
        socket.on('friend_add_by_code', async ({ auth, code }, ack) => {
            try {
                const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                if (!userId || !supabase_1.supabaseAdmin) {
                    ack?.({ status: 'not_found' });
                    return;
                }
                const normalized = code.trim().toUpperCase();
                const entry = friendCodes.get(normalized);
                if (!entry) {
                    ack?.({ status: 'not_found' });
                    return;
                }
                if (entry.expiresAt <= Date.now()) {
                    friendCodes.delete(normalized);
                    ack?.({ status: 'expired' });
                    return;
                }
                if (entry.userId === userId) {
                    ack?.({ status: 'self' });
                    return;
                }
                const { data: existing } = await supabase_1.supabaseAdmin
                    .from('friends')
                    .select('friend_id')
                    .eq('user_id', userId)
                    .eq('friend_id', entry.userId)
                    .maybeSingle();
                if (existing) {
                    ack?.({ status: 'already_friends' });
                    return;
                }
                // 중복 요청 방지
                const { data: dupReq } = await supabase_1.supabaseAdmin
                    .from('friend_requests')
                    .select('id')
                    .eq('sender_id', userId)
                    .eq('receiver_id', entry.userId)
                    .maybeSingle();
                let requestId = '';
                if (!dupReq) {
                    const { data: inserted } = await supabase_1.supabaseAdmin
                        .from('friend_requests')
                        .insert({ sender_id: userId, receiver_id: entry.userId })
                        .select('id')
                        .maybeSingle();
                    requestId = inserted?.id ?? '';
                }
                else {
                    requestId = dupReq.id;
                }
                // 대상이 온라인이면 실시간 알림
                const targetSocketId = activeUserSockets.get(entry.userId);
                if (targetSocketId && io.sockets.sockets.has(targetSocketId)) {
                    const senderProfile = await resolvePlayerProfileCached(socket, auth, '');
                    io.to(targetSocketId).emit('friend_request_received', {
                        requestId,
                        senderNickname: senderProfile.nickname,
                    });
                    await emitFriendRequestCountChanged(entry.userId);
                }
                friendCodes.delete(normalized);
                ack?.({ status: 'ok' });
            }
            catch (err) {
                console.error('[friend_add_by_code] handler error:', err);
                ack?.({ status: 'not_found' });
            }
        });
        socket.on('friend_list', async ({ auth }, ack) => {
            try {
                const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                if (!userId || !supabase_1.supabaseAdmin) {
                    ack?.({ friends: [] });
                    return;
                }
                const { data: friendRows } = await supabase_1.supabaseAdmin
                    .from('friends')
                    .select('friend_id')
                    .eq('user_id', userId);
                if (!friendRows || friendRows.length === 0) {
                    ack?.({ friends: [] });
                    return;
                }
                const friendIds = friendRows.map((r) => r.friend_id);
                const [profilesRes, statsRes] = await Promise.all([
                    supabase_1.supabaseAdmin.from('profiles').select('id, nickname, equipped_skin').in('id', friendIds),
                    supabase_1.supabaseAdmin.from('player_stats').select('user_id, current_rating').in('user_id', friendIds),
                ]);
                const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
                const statsMap = new Map((statsRes.data ?? []).map((s) => [s.user_id, s]));
                const friends = friendIds.map((fid) => {
                    const prof = profileMap.get(fid);
                    const stats = statsMap.get(fid);
                    return {
                        userId: fid,
                        nickname: prof?.nickname ?? 'Guest',
                        currentRating: Number(stats?.current_rating ?? 0),
                        equippedSkin: (prof?.equipped_skin ?? 'classic'),
                        status: getUserPresenceStatus(fid),
                    };
                });
                ack?.({ friends });
            }
            catch (err) {
                console.error('[friend_list] handler error:', err);
                ack?.({ friends: [] });
            }
        });
        socket.on('friend_requests_list', async ({ auth }, ack) => {
            try {
                const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                if (!userId || !supabase_1.supabaseAdmin) {
                    ack?.({ requests: [] });
                    return;
                }
                const { data: reqRows } = await supabase_1.supabaseAdmin
                    .from('friend_requests')
                    .select('id, sender_id, created_at')
                    .eq('receiver_id', userId)
                    .order('created_at', { ascending: false });
                if (!reqRows || reqRows.length === 0) {
                    ack?.({ requests: [] });
                    return;
                }
                const senderIds = reqRows.map((r) => r.sender_id);
                const { data: profileRows } = await supabase_1.supabaseAdmin
                    .from('profiles')
                    .select('id, nickname')
                    .in('id', senderIds);
                const nickMap = new Map((profileRows ?? []).map((p) => [p.id, p.nickname ?? 'Guest']));
                const requests = reqRows.map((r) => ({
                    id: r.id,
                    senderId: r.sender_id,
                    senderNickname: nickMap.get(r.sender_id) ?? 'Guest',
                    createdAt: r.created_at,
                }));
                ack?.({ requests });
            }
            catch (err) {
                console.error('[friend_requests_list] handler error:', err);
                ack?.({ requests: [] });
            }
        });
        socket.on('friend_request_respond', async ({ auth, requestId, accept }, ack) => {
            try {
                const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                if (!userId || !supabase_1.supabaseAdmin) {
                    ack?.({ status: 'error' });
                    return;
                }
                const { data: reqRow } = await supabase_1.supabaseAdmin
                    .from('friend_requests')
                    .select('id, sender_id')
                    .eq('id', requestId)
                    .eq('receiver_id', userId)
                    .maybeSingle();
                if (!reqRow) {
                    ack?.({ status: 'error' });
                    return;
                }
                await supabase_1.supabaseAdmin.from('friend_requests').delete().eq('id', requestId);
                if (accept) {
                    await supabase_1.supabaseAdmin.from('friends').upsert([
                        { user_id: userId, friend_id: reqRow.sender_id },
                        { user_id: reqRow.sender_id, friend_id: userId },
                    ]);
                    await emitFriendListChanged([userId, reqRow.sender_id]);
                    await emitFriendPresenceToFriends(userId);
                    await emitFriendPresenceToFriends(reqRow.sender_id);
                }
                await emitFriendRequestCountChanged(userId);
                ack?.({ status: 'ok' });
            }
            catch (err) {
                console.error('[friend_request_respond] handler error:', err);
                ack?.({ status: 'error' });
            }
        });
        socket.on('friend_remove', async ({ auth, friendId }, ack) => {
            try {
                const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                if (!userId || !supabase_1.supabaseAdmin) {
                    ack?.({ status: 'error' });
                    return;
                }
                await supabase_1.supabaseAdmin
                    .from('friends')
                    .delete()
                    .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),` +
                    `and(user_id.eq.${friendId},friend_id.eq.${userId})`);
                await emitFriendListChanged([userId, friendId]);
                ack?.({ status: 'ok' });
            }
            catch (err) {
                console.error('[friend_remove] handler error:', err);
                ack?.({ status: 'error' });
            }
        });
        socket.on('friend_get_profile', async ({ auth, friendId }, ack) => {
            try {
                const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                if (!userId || !supabase_1.supabaseAdmin) {
                    ack?.({ profile: null });
                    return;
                }
                const { data: friendRow } = await supabase_1.supabaseAdmin
                    .from('friends')
                    .select('friend_id')
                    .eq('user_id', userId)
                    .eq('friend_id', friendId)
                    .maybeSingle();
                if (!friendRow) {
                    ack?.({ profile: null });
                    return;
                }
                const [profRes, statsRes, ownedSkinsRes, achievementsRes] = await Promise.all([
                    supabase_1.supabaseAdmin.from('profiles').select('nickname, equipped_skin').eq('id', friendId).maybeSingle(),
                    supabase_1.supabaseAdmin.from('player_stats').select('current_rating, wins, losses').eq('user_id', friendId).maybeSingle(),
                    supabase_1.supabaseAdmin.from('owned_skins').select('skin_id').eq('user_id', friendId),
                    supabase_1.supabaseAdmin.from('player_achievements').select('achievement_id').eq('user_id', friendId).eq('completed', true),
                ]);
                const profileSkinIds = new Set(PROFILE_PIECE_SKIN_IDS);
                const ownedSkinIds = new Set(['classic']);
                for (const row of ownedSkinsRes.data ?? []) {
                    const skinId = String(row.skin_id ?? '');
                    if (profileSkinIds.has(skinId))
                        ownedSkinIds.add(skinId);
                }
                const completedAchievementIds = new Set((achievementsRes.data ?? []).map((row) => String(row.achievement_id ?? '')).filter(Boolean));
                ack?.({
                    profile: {
                        userId: friendId,
                        nickname: profRes.data?.nickname ?? 'Guest',
                        currentRating: Number(statsRes.data?.current_rating ?? 0),
                        equippedSkin: (profRes.data?.equipped_skin ?? 'classic'),
                        wins: Number(statsRes.data?.wins ?? 0),
                        losses: Number(statsRes.data?.losses ?? 0),
                        ownedSkinCount: ownedSkinIds.size,
                        totalSkinCount: PROFILE_PIECE_SKIN_IDS.length,
                        completedAchievementCount: completedAchievementIds.size,
                        totalAchievementCount: achievementCatalog_1.ACHIEVEMENT_CATALOG.length,
                    },
                });
            }
            catch (err) {
                console.error('[friend_get_profile] handler error:', err);
                ack?.({ profile: null });
            }
        });
        socket.on('friend_challenge', async ({ auth, friendId, pieceSkin, boardSkin, equippedSkills, }, ack) => {
            try {
                if (rejectMatchmakingForMaintenance(socket)) {
                    ack?.({ status: 'error' });
                    return;
                }
                const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                if (!userId) {
                    ack?.({ status: 'error' });
                    return;
                }
                const targetSocketId = activeUserSockets.get(friendId);
                if (!targetSocketId || !io.sockets.sockets.has(targetSocketId)) {
                    ack?.({ status: 'offline' });
                    return;
                }
                const inGame = store.getBySocket(targetSocketId) ??
                    abilityStore.getBySocket(targetSocketId) ??
                    coopStore.getBySocket(targetSocketId) ??
                    twoVsTwoStore.getBySocket(targetSocketId);
                if (inGame) {
                    ack?.({ status: 'in_game' });
                    return;
                }
                const profile = await resolvePlayerProfileCached(socket, auth, '');
                challengePending.set(friendId, {
                    fromUserId: userId,
                    fromNickname: profile.nickname,
                    fromSocketId: socket.id,
                    fromPieceSkin: pieceSkin ?? 'classic',
                    fromBoardSkin: boardSkin ?? 'classic',
                    fromEquippedSkills: equippedSkills ?? [],
                    fromStats: profile.stats,
                    fromCurrentRating: profile.currentRating,
                });
                io.to(targetSocketId).emit('friend_challenge_received', {
                    fromUserId: userId,
                    fromNickname: profile.nickname,
                });
                ack?.({ status: 'ok' });
            }
            catch (err) {
                console.error('[friend_challenge] handler error:', err);
                ack?.({ status: 'error' });
            }
        });
        socket.on('friend_challenge_response', async ({ auth, fromUserId, accept, pieceSkin, boardSkin, equippedSkills, }, ack) => {
            try {
                const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                if (!userId) {
                    ack?.({ status: 'error' });
                    return;
                }
                const challenge = challengePending.get(userId);
                if (!challenge || challenge.fromUserId !== fromUserId) {
                    ack?.({ status: 'error' });
                    return;
                }
                challengePending.delete(userId);
                if (!accept) {
                    const aSocketId = challenge.fromSocketId;
                    if (aSocketId && io.sockets.sockets.has(aSocketId)) {
                        io.to(aSocketId).emit('friend_challenge_declined', { byNickname: '' });
                    }
                    ack?.({ status: 'ok' });
                    return;
                }
                if (rejectMatchmakingForMaintenance(socket)) {
                    ack?.({ status: 'error' });
                    return;
                }
                const aSocketId = challenge.fromSocketId;
                const aSocket = io.sockets.sockets.get(aSocketId);
                if (!aSocket) {
                    ack?.({ status: 'error' });
                    return;
                }
                const bProfile = await resolvePlayerProfileCached(socket, auth, '');
                // 방 생성
                const roomId = abilityStore.generateRoomId();
                const code = abilityStore.generateCode();
                const room = new AbilityRoom_1.AbilityRoom(roomId, code, io);
                room.enablePrivateMatch();
                // A 입장 (도전자, red)
                const aColor = room.addPlayer(aSocket, challenge.fromNickname, challenge.fromUserId, challenge.fromStats, challenge.fromCurrentRating, challenge.fromPieceSkin, challenge.fromBoardSkin, challenge.fromEquippedSkills);
                if (!aColor) {
                    ack?.({ status: 'error' });
                    return;
                }
                // B 입장 (수락자, blue)
                const bColor = room.addPlayer(socket, bProfile.nickname, bProfile.userId, bProfile.stats, bProfile.currentRating, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills ?? []);
                if (!bColor) {
                    ack?.({ status: 'error' });
                    return;
                }
                abilityStore.add(room);
                abilityStore.registerSocket(aSocketId, roomId);
                abilityStore.registerSocket(socket.id, roomId);
                emitFriendPresenceForSocket(aSocketId);
                emitFriendPresenceForSocket(socket.id);
                room.prepareGameStart();
                // A에게 게임 시작 신호
                aSocket.emit('friend_challenge_accepted', {
                    roomId,
                    color: aColor,
                    opponentNickname: bProfile.nickname,
                });
                // B에게 기존 ability_room_joined 신호
                socket.emit('ability_room_joined', {
                    roomId,
                    color: bColor,
                    opponentNickname: challenge.fromNickname,
                });
                ack?.({ status: 'ok' });
            }
            catch (err) {
                console.error('[friend_challenge_response] handler error:', err);
                ack?.({ status: 'error' });
            }
        });
        socket.on('friend_challenge_update', async ({ auth, friendId, pieceSkin, boardSkin, equippedSkills, }, ack) => {
            try {
                if (rejectMatchmakingForMaintenance(socket)) {
                    ack?.({ status: 'error' });
                    return;
                }
                const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                if (!userId) {
                    ack?.({ status: 'error' });
                    return;
                }
                const challenge = challengePending.get(friendId);
                if (!challenge || challenge.fromUserId !== userId) {
                    ack?.({ status: 'error' });
                    return;
                }
                challenge.fromPieceSkin = pieceSkin ?? challenge.fromPieceSkin;
                challenge.fromBoardSkin = boardSkin ?? challenge.fromBoardSkin;
                challenge.fromEquippedSkills = equippedSkills ?? challenge.fromEquippedSkills;
                ack?.({ status: 'ok' });
            }
            catch (err) {
                console.error('[friend_challenge_update] handler error:', err);
                ack?.({ status: 'error' });
            }
        });
        socket.on('friend_challenge_cancel', async ({ auth, friendId, }, ack) => {
            try {
                const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                if (!userId) {
                    ack?.({ status: 'error' });
                    return;
                }
                const challenge = challengePending.get(friendId);
                if (!challenge || challenge.fromUserId !== userId) {
                    ack?.({ status: 'ok' });
                    return;
                }
                challengePending.delete(friendId);
                const targetSocketId = activeUserSockets.get(friendId);
                if (targetSocketId && io.sockets.sockets.has(targetSocketId)) {
                    io.to(targetSocketId).emit('friend_challenge_canceled', {
                        fromUserId: userId,
                    });
                }
                ack?.({ status: 'ok' });
            }
            catch (err) {
                console.error('[friend_challenge_cancel] handler error:', err);
                ack?.({ status: 'error' });
            }
        });
        socket.on('join_random', async ({ nickname, auth, pieceSkin, boardSkin }) => {
            try {
                pendingCancelRandom.delete(socket.id);
                if (emitUpdateRequired(socket, auth))
                    return;
                if (rejectMatchmakingForMaintenance(socket))
                    return;
                await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                const profile = await resolvePlayerProfileCached(socket, auth, nickname);
                if (pendingCancelRandom.has(socket.id)) {
                    pendingCancelRandom.delete(socket.id);
                    return;
                }
                if (!io.sockets.sockets.has(socket.id))
                    return;
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
                const room = new GameRoom_1.GameRoom(roomId, code, io, 'random');
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
                emitFriendPresenceForSocket(queued.socketId);
                emitFriendPresenceForSocket(socket.id);
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
            }
            catch (err) {
                console.error('[join_random] handler error:', err);
                socket.emit('join_error', { message: '랜덤 매칭 중 오류가 발생했습니다.' });
            }
        });
        socket.on('cancel_random', () => {
            pendingCancelRandom.add(socket.id);
            clearRandomFallback(socket.id);
            store.removeFromQueue(socket.id);
        });
        socket.on('join_coop', async ({ nickname, auth, pieceSkin }) => {
            try {
                if (emitUpdateRequired(socket, auth))
                    return;
                if (rejectMatchmakingForMaintenance(socket))
                    return;
                await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                const profile = await resolvePlayerProfileCached(socket, auth, nickname);
                if (!io.sockets.sockets.has(socket.id))
                    return;
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
                const room = new CoopRoom_1.CoopRoom(roomId, roomId, io);
                coopStore.add(room);
                room.addPlayer(queuedSocket, queued.nickname, queued.userId, queued.stats, queued.pieceSkin);
                coopStore.registerSocket(queued.socketId, roomId);
                emitFriendPresenceForSocket(queued.socketId);
                queuedSocket.emit('coop_room_joined', {
                    roomId,
                    color: 'red',
                    teammateNickname: profile.nickname,
                    selfPieceSkin: queued.pieceSkin,
                    teammatePieceSkin: pieceSkin ?? 'classic',
                });
                room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
                coopStore.registerSocket(socket.id, roomId);
                emitFriendPresenceForSocket(socket.id);
                socket.emit('coop_room_joined', {
                    roomId,
                    color: 'blue',
                    teammateNickname: queued.nickname,
                    selfPieceSkin: pieceSkin ?? 'classic',
                    teammatePieceSkin: queued.pieceSkin,
                });
                room.prepareGameStart();
            }
            catch (err) {
                console.error('[join_coop] handler error:', err);
                socket.emit('join_error', { message: '협동 매칭 중 오류가 발생했습니다.' });
            }
        });
        socket.on('cancel_coop', () => {
            coopStore.removeFromQueue(socket.id);
        });
        socket.on('account_sync', async ({ auth }, ack) => {
            const requirement = getUpdateRequirement(socket, auth);
            if (requirement?.forceUpdate) {
                socket.emit('update_required', requirement);
                ack?.({ status: 'UPDATE_REQUIRED', ...requirement });
                return;
            }
            try {
                await registerSocketSession(socket, auth, { forceRevalidate: true });
                ack?.(await (0, playerAuth_1.resolveAccount)(auth));
            }
            catch (err) {
                console.error('[account_sync] handler error:', err);
                ack?.({ status: 'AUTH_INVALID' });
            }
        });
        socket.on('achievements_claim', async ({ auth, achievementId }, ack) => {
            const requirement = getUpdateRequirement(socket, auth);
            if (requirement?.forceUpdate) {
                socket.emit('update_required', requirement);
                ack?.({ status: 'UPDATE_REQUIRED', ...requirement });
                return;
            }
            try {
                const userId = await registerSocketSession(socket, auth, { forceRevalidate: true });
                if (userId && achievementId) {
                    await (0, achievementService_1.claimAchievementReward)(userId, achievementId);
                }
                ack?.(await (0, playerAuth_1.resolveAccountForUser)(userId, Boolean(socket.data.isGuestUser)));
            }
            catch (error) {
                console.error('[achievements] failed to claim reward', error);
                ack?.({ status: 'AUTH_INVALID' });
            }
        });
        socket.on('achievements_claim_all', async ({ auth }, ack) => {
            const requirement = getUpdateRequirement(socket, auth);
            if (requirement?.forceUpdate) {
                socket.emit('update_required', requirement);
                ack?.({ status: 'UPDATE_REQUIRED', ...requirement });
                return;
            }
            try {
                const userId = await registerSocketSession(socket, auth, { forceRevalidate: true });
                if (userId) {
                    await (0, achievementService_1.claimAllAchievementRewards)(userId);
                }
                ack?.(await (0, playerAuth_1.resolveAccountForUser)(userId, Boolean(socket.data.isGuestUser)));
            }
            catch (error) {
                console.error('[achievements] failed to claim all rewards', error);
                ack?.({ status: 'AUTH_INVALID' });
            }
        });
        socket.on('achievements_sync_settings', async ({ auth, isMusicMuted, isSfxMuted, musicVolumePercent, sfxVolumePercent, }, ack) => {
            const requirement = getUpdateRequirement(socket, auth);
            if (requirement?.forceUpdate) {
                socket.emit('update_required', requirement);
                ack?.({ ok: true, status: 'UPDATE_REQUIRED' });
                return;
            }
            try {
                const userId = await registerSocketSession(socket, auth, { forceRevalidate: true });
                if (userId) {
                    await (0, achievementService_1.trackSettingsAchievements)({
                        userId,
                        isMusicMuted,
                        isSfxMuted,
                        musicVolumePercent,
                        sfxVolumePercent,
                    });
                }
                ack?.({ ok: true, status: userId ? 'ACCOUNT_OK' : 'AUTH_INVALID' });
            }
            catch (err) {
                console.error('[achievements_sync_settings] handler error:', err);
                ack?.({ ok: true, status: 'AUTH_INVALID' });
            }
        });
        socket.on('open_victory_vault', async ({ auth }, ack) => {
            try {
                await registerSocketSession(socket, auth, { forceRevalidate: true });
                ack?.(await (0, playerAuth_1.openVictoryVault)(auth));
            }
            catch (err) {
                console.error('[open_victory_vault] handler error:', err);
                ack?.({ status: 'FAILED' });
            }
        });
        socket.on('finalize_google_upgrade', async ({ auth, guestAuth, guestProfile, flowStartedAt, allowExistingSwitch, }, ack) => {
            try {
                await registerSocketSession(socket, auth, { forceRevalidate: true });
                ack?.(await (0, playerAuth_1.finalizeGoogleUpgrade)(auth, guestAuth, guestProfile, flowStartedAt, Boolean(allowExistingSwitch)));
            }
            catch (err) {
                console.error('[finalize_google_upgrade] handler error:', err);
                ack?.({ status: 'UPGRADE_FAILED' });
            }
        });
        socket.on('path_update', ({ path }) => {
            const room = store.getBySocket(socket.id);
            if (room) {
                room.updatePlannedPath(socket.id, path);
                return;
            }
            const coopRoom = coopStore.getBySocket(socket.id);
            coopRoom?.updatePlannedPath(socket.id, path);
        });
        socket.on('join_2v2', async ({ nickname, auth, pieceSkin }) => {
            try {
                if (emitUpdateRequired(socket, auth))
                    return;
                if (rejectMatchmakingForMaintenance(socket))
                    return;
                await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                const profile = await resolvePlayerProfileCached(socket, auth, nickname);
                if (!io.sockets.sockets.has(socket.id))
                    return;
                twoVsTwoStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
                const existingRoom = twoVsTwoStore.getBySocket(socket.id);
                tryStartTwoVsTwoTeamMatch();
                if (!existingRoom && !twoVsTwoStore.getBySocket(socket.id)) {
                    socket.emit('twovtwo_matchmaking_waiting', {});
                }
            }
            catch (err) {
                console.error('[join_2v2] handler error:', err);
                socket.emit('join_error', { message: '2v2 매칭 중 오류가 발생했습니다.' });
            }
        });
        socket.on('join_ability', async ({ nickname, auth, pieceSkin, boardSkin, equippedSkills, training, }) => {
            try {
                if (emitUpdateRequired(socket, auth))
                    return;
                if (!training && rejectMatchmakingForMaintenance(socket))
                    return;
                await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                const profile = await resolvePlayerProfileCached(socket, auth, nickname);
                if (!io.sockets.sockets.has(socket.id))
                    return;
                if (training) {
                    clearAbilityFallback(socket.id);
                    const roomId = abilityStore.generateRoomId();
                    const room = new AbilityRoom_1.AbilityRoom(roomId, roomId, io);
                    room.enableTrainingMode();
                    const trainingColor = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, profile.currentRating, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills);
                    if (!trainingColor)
                        return;
                    room.addIdleBot('Training Dummy', 'classic', 'classic', []);
                    abilityStore.add(room);
                    abilityStore.registerSocket(socket.id, roomId);
                    emitFriendPresenceForSocket(socket.id);
                    socket.emit('ability_room_joined', {
                        roomId,
                        color: trainingColor,
                        opponentNickname: 'Training Dummy',
                        training: true,
                    });
                    room.waitForSkillSelection();
                    return;
                }
                const playerCurrentRating = profile.currentRating;
                const playerRankedUnlocked = profile.rankedUnlocked;
                const playerArena = (0, arenaConfig_1.getArenaFromRating)(playerCurrentRating);
                console.log(`[join_ability] socket=${socket.id} arena=${playerArena} rating=${playerCurrentRating} ranked=${playerRankedUnlocked} queueSize=${abilityStore.getStats().queueLength}`);
                const queued = abilityStore.dequeueByArena(playerArena, playerRankedUnlocked);
                if (!queued || queued.socketId === socket.id) {
                    if (queued) {
                        console.log(`[join_ability] same-socket match, re-enqueue socket=${socket.id}`);
                        abilityStore.enqueue(queued.socketId, queued.nickname, queued.userId, queued.stats, queued.pieceSkin, queued.boardSkin, queued.equippedSkills, queued.currentRating, queued.arena, queued.rankedUnlocked);
                    }
                    console.log(`[join_ability] no match found, enqueue socket=${socket.id} arena=${playerArena} ranked=${playerRankedUnlocked}`);
                    abilityStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills, playerCurrentRating, playerArena, playerRankedUnlocked);
                    socket.emit('ability_matchmaking_waiting', {});
                    scheduleAbilityFallback({
                        socket,
                        profile,
                        pieceSkin: pieceSkin ?? 'classic',
                        boardSkin: boardSkin ?? 'classic',
                        equippedSkills,
                        currentRating: playerCurrentRating,
                        rankedUnlocked: playerRankedUnlocked,
                    });
                    return;
                }
                console.log(`[join_ability] match found: socket=${socket.id}(arena=${playerArena}) <-> queued=${queued.socketId}(arena=${queued.arena}) ranked=${playerRankedUnlocked}`);
                clearAbilityFallback(socket.id);
                clearAbilityFallback(queued.socketId);
                const queuedSocket = io.sockets.sockets.get(queued.socketId);
                if (!queuedSocket) {
                    console.warn(`[join_ability] queued socket gone: ${queued.socketId}, re-enqueue current player`);
                    abilityStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills, playerCurrentRating, playerArena, playerRankedUnlocked);
                    socket.emit('ability_matchmaking_waiting', {});
                    scheduleAbilityFallback({
                        socket,
                        profile,
                        pieceSkin: pieceSkin ?? 'classic',
                        boardSkin: boardSkin ?? 'classic',
                        equippedSkills,
                        currentRating: playerCurrentRating,
                        rankedUnlocked: playerRankedUnlocked,
                    });
                    return;
                }
                // 방장(queued, 먼저 대기한 플레이어)의 아레나를 게임에 적용
                const hostArena = queued.rankedUnlocked ? 10 : queued.arena;
                const roomId = abilityStore.generateRoomId();
                const room = new AbilityRoom_1.AbilityRoom(roomId, roomId, io);
                abilityStore.add(room);
                const queuedAbilityColor = room.addPlayer(queuedSocket, queued.nickname, queued.userId, queued.stats, queued.currentRating, queued.pieceSkin, queued.boardSkin, queued.equippedSkills);
                const myAbilityColor = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, playerCurrentRating, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills);
                if (!queuedAbilityColor || !myAbilityColor) {
                    console.error('[join_ability] addPlayer failed unexpectedly, re-enqueue both players');
                    if (queuedAbilityColor)
                        queuedSocket.leave(roomId);
                    if (myAbilityColor)
                        socket.leave(roomId);
                    // Re-enqueue queued player with fallback
                    abilityStore.enqueue(queued.socketId, queued.nickname, queued.userId, queued.stats, queued.pieceSkin, queued.boardSkin, queued.equippedSkills, queued.currentRating, queued.arena, queued.rankedUnlocked);
                    queuedSocket.emit('ability_matchmaking_waiting', {});
                    scheduleAbilityFallback({
                        socket: queuedSocket,
                        profile: {
                            userId: queued.userId,
                            nickname: queued.nickname,
                            stats: queued.stats,
                            currentRating: queued.currentRating,
                            rankedUnlocked: queued.rankedUnlocked,
                        },
                        pieceSkin: queued.pieceSkin,
                        boardSkin: queued.boardSkin,
                        equippedSkills: queued.equippedSkills,
                        currentRating: queued.currentRating,
                        rankedUnlocked: queued.rankedUnlocked,
                    });
                    // Re-enqueue current player with fallback
                    abilityStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills, playerCurrentRating, playerArena, playerRankedUnlocked);
                    socket.emit('ability_matchmaking_waiting', {});
                    scheduleAbilityFallback({
                        socket,
                        profile,
                        pieceSkin: pieceSkin ?? 'classic',
                        boardSkin: boardSkin ?? 'classic',
                        equippedSkills,
                        currentRating: playerCurrentRating,
                        rankedUnlocked: playerRankedUnlocked,
                    });
                    return;
                }
                abilityStore.registerSocket(queued.socketId, roomId);
                emitFriendPresenceForSocket(queued.socketId);
                queuedSocket.emit('ability_room_joined', {
                    roomId,
                    color: queuedAbilityColor,
                    opponentNickname: profile.nickname,
                    hostArena,
                });
                abilityStore.registerSocket(socket.id, roomId);
                emitFriendPresenceForSocket(socket.id);
                socket.emit('ability_room_joined', {
                    roomId,
                    color: myAbilityColor,
                    opponentNickname: queued.nickname,
                    hostArena,
                });
                console.log(`[join_ability] room created roomId=${roomId} hostArena=${hostArena}`);
                room.prepareGameStart();
            }
            catch (err) {
                console.error('[join_ability] handler error:', err);
                socket.emit('join_error', { message: 'Ability 매칭 중 오류가 발생했습니다.' });
            }
        });
        socket.on('cancel_2v2', () => {
            twoVsTwoStore.removeFromQueue(socket.id);
        });
        socket.on('cancel_ability', () => {
            clearAbilityFallback(socket.id);
            abilityStore.removeFromQueue(socket.id);
        });
        socket.on('leave_ability_room', (ack) => {
            const { room } = abilityStore.removeSocket(socket.id);
            if (room) {
                socket.leave(room.roomId);
            }
            ack?.({ status: 'ok' });
        });
        socket.on('twovtwo_client_ready', () => {
            const room = twoVsTwoStore.getBySocket(socket.id);
            room?.markClientReady(socket.id);
        });
        socket.on('ability_client_ready', () => {
            const room = abilityStore.getBySocket(socket.id);
            room?.markClientReady(socket.id);
        });
        socket.on('ability_intro_done', () => {
            const room = abilityStore.getBySocket(socket.id);
            room?.markIntroReady(socket.id);
        });
        socket.on('training_skills_confirmed', ({ skills }) => {
            const room = abilityStore.getBySocket(socket.id);
            room?.confirmTrainingSkills(socket.id, skills);
        });
        socket.on('twovtwo_path_update', ({ path }) => {
            const room = twoVsTwoStore.getBySocket(socket.id);
            room?.updatePlannedPath(socket.id, path);
        });
        socket.on('ability_plan_update', ({ path, skills, }) => {
            const room = abilityStore.getBySocket(socket.id);
            room?.updatePlan(socket.id, path, skills);
        });
        socket.on('twovtwo_submit_path', ({ path }, ack) => {
            const room = twoVsTwoStore.getBySocket(socket.id);
            const result = room?.submitPath(socket.id, path) ?? { ok: false, acceptedPath: [] };
            ack?.(result);
        });
        socket.on('ability_submit_plan', ({ path, skills, }, ack) => {
            const room = abilityStore.getBySocket(socket.id);
            const result = room?.submitPlan(socket.id, path, skills) ?? {
                ok: false,
                acceptedPath: [],
                acceptedSkills: [],
            };
            ack?.(result);
        });
        socket.on('submit_path', ({ path }, ack) => {
            const room = store.getBySocket(socket.id);
            const ok = room?.submitPath(socket.id, path) ??
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
                    twoVsTwoStore.enqueueTeam(result.members.map((member) => ({
                        socketId: member.socketId,
                        nickname: member.nickname,
                        userId: member.userId,
                        stats: member.stats,
                        pieceSkin: member.pieceSkin,
                    })));
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
        socket.on('rejoin_game', async (auth) => {
            try {
                await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
                if (!io.sockets.sockets.has(socket.id))
                    return;
                const userId = typeof socket.data.userId === 'string' ? socket.data.userId : null;
                if (!userId) {
                    socket.emit('rejoin_not_found');
                    return;
                }
                const baseRoom = store.findRoomForRejoin(userId);
                if (baseRoom) {
                    const color = baseRoom.rejoinPlayer(socket, userId);
                    if (color) {
                        store.registerSocket(socket.id, baseRoom.roomId);
                        emitFriendPresenceForSocket(socket.id);
                        socket.emit('rejoin_ack', {
                            mode: 'base',
                            color,
                            roomCode: baseRoom.code,
                            gameState: baseRoom.toClientState(),
                        });
                        console.log(`[rejoin_game] base userId=${userId} color=${color} room=${baseRoom.roomId}`);
                        return;
                    }
                }
                const abilityRoom = abilityStore.findRoomForRejoin(userId);
                if (abilityRoom) {
                    const color = abilityRoom.rejoinPlayer(socket, userId);
                    if (color) {
                        abilityStore.registerSocket(socket.id, abilityRoom.roomId);
                        emitFriendPresenceForSocket(socket.id);
                        socket.emit('rejoin_ack', {
                            mode: 'ability',
                            color,
                            roomCode: abilityRoom.code,
                            abilityState: abilityRoom.toClientState(color),
                        });
                        console.log(`[rejoin_game] ability userId=${userId} color=${color} room=${abilityRoom.roomId}`);
                        return;
                    }
                }
                socket.emit('rejoin_not_found');
            }
            catch (err) {
                console.error('[rejoin_game] handler error:', err);
                socket.emit('rejoin_not_found');
            }
        });
        socket.on('coop_client_ready', () => {
            const room = coopStore.getBySocket(socket.id);
            room?.markClientReady(socket.id);
        });
        socket.on('chat_send', ({ message }) => {
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
        socket.on('update_piece_skin', ({ pieceSkin }) => {
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
        socket.on('coop_path_update', ({ path }) => {
            const room = coopStore.getBySocket(socket.id);
            room?.updatePlannedPath(socket.id, path);
        });
        socket.on('coop_submit_path', ({ path }, ack) => {
            const room = coopStore.getBySocket(socket.id);
            const ok = room?.submitPath(socket.id, path) ?? false;
            ack?.({ ok });
        });
        socket.on('disconnect', () => {
            clearRandomFallback(socket.id);
            clearAbilityFallback(socket.id);
            pendingCancelRandom.delete(socket.id);
            console.log(`[-] Disconnected: ${socket.id}`);
            const disconnectedUserId = unregisterSocketSession(socket.id);
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
            if (disconnectedUserId) {
                void emitFriendPresenceToFriends(disconnectedUserId);
            }
        });
    });
}
