"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
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
const playerAuth_1 = require("../services/playerAuth");
const achievementService_1 = require("../services/achievementService");
function initSocketServer(io) {
    const store = RoomStore_1.RoomStore.getInstance();
    const coopStore = CoopRoomStore_1.CoopRoomStore.getInstance();
    const twoVsTwoStore = TwoVsTwoRoomStore_1.TwoVsTwoRoomStore.getInstance();
    const abilityStore = AbilityRoomStore_1.AbilityRoomStore.getInstance();
    const activeUserSockets = new Map();
    const socketUsers = new Map();
    const authCacheTtlMs = 10 * 60 * 1000;
    const profileCacheTtlMs = 60 * 1000;
    const roomSweepIntervalMs = 60 * 1000;
    const metricsLogIntervalMs = 60 * 1000;
    const slowProfileResolveThresholdMs = 150;
    const randomFallbackMatchMs = 7000;
    const abilityFallbackMatchMs = 7000;
    const randomFallbackTimers = new Map();
    const pendingCancelRandom = new Set();
    const abilityFallbackTimers = new Map();
    const ABILITY_FAKE_AI_SKILL_POOL = [
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
    const profileCache = new Map();
    const unregisterSocketSession = (socketId) => {
        const userId = socketUsers.get(socketId);
        if (!userId)
            return;
        socketUsers.delete(socketId);
        if (activeUserSockets.get(userId) === socketId) {
            activeUserSockets.delete(userId);
        }
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
        return (0, appVersion_1.getAndroidVersionStatus)(getCurrentAppVersionCode(auth));
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
            clearTimeout(timer);
            abilityFallbackTimers.delete(socketId);
        }
    };
    const createDisguisedRandomProfile = (profile) => {
        const commonSkins = [
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
        const legendarySkins = [
            'atomic',
            'chronos',
            'wizard',
            'sun',
        ];
        const useLegendarySkin = Math.random() < 0.1;
        const skinPool = useLegendarySkin ? legendarySkins : commonSkins;
        const pieceSkin = skinPool[Math.floor(Math.random() * skinPool.length)] ?? 'classic';
        const nickname = fakeRandomNicknames_1.FAKE_RANDOM_NICKNAMES[Math.floor(Math.random() * fakeRandomNicknames_1.FAKE_RANDOM_NICKNAMES.length)];
        const fakeId = `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`;
        const stats = createNaturalFakeStats(Math.floor(Math.random() * 101) + Math.floor(Math.random() * 101));
        return {
            nickname,
            displayId: fakeId,
            userId: null,
            stats,
            pieceSkin,
            boardSkin: 'classic',
        };
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
    const createDisguisedAbilityBotLoadout = (profile) => {
        const beginner = Math.random() < 0.05;
        if (beginner) {
            const nickname = fakeRandomNicknames_1.FAKE_RANDOM_NICKNAMES[Math.floor(Math.random() * fakeRandomNicknames_1.FAKE_RANDOM_NICKNAMES.length)];
            return {
                nickname,
                displayId: `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`,
                userId: null,
                stats: createNaturalFakeStats(Math.floor(Math.random() * 101) + Math.floor(Math.random() * 101)),
                pieceSkin: 'classic',
                boardSkin: 'classic',
                equippedSkills: ['classic_guard'],
                beginner: true,
            };
        }
        const fakeProfile = createDisguisedRandomProfile(profile);
        const equippedSkills = pickRandomUniqueSkills(ABILITY_FAKE_AI_SKILL_POOL, 3);
        // aurora_heal은 100승 이상 해금 스킬 → 장착 시 승리 수를 100~300으로 표기
        const stats = equippedSkills.includes('aurora_heal')
            ? createNaturalFakeStats(fakeProfile.stats.wins + fakeProfile.stats.losses, { minWins: Math.floor(Math.random() * 201) + 100 })
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
        if (!io.sockets.sockets.has(socket.id))
            return;
        if (!abilityStore.isQueued(socket.id))
            return;
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
            });
        }
        const humanColor = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin, boardSkin, equippedSkills);
        if (!humanColor)
            return;
        if (humanFirst) {
            room.addIdleBot(fakeProfile.nickname, fakeProfile.pieceSkin, fakeProfile.boardSkin, fakeProfile.equippedSkills, {
                displayId: fakeProfile.displayId,
                stats: fakeProfile.stats,
            });
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
    const scheduleAbilityFallback = ({ socket, profile, pieceSkin, boardSkin, equippedSkills, }) => {
        clearAbilityFallback(socket.id);
        abilityFallbackTimers.set(socket.id, setTimeout(() => {
            void createAbilityFallbackMatch({
                socket,
                profile,
                pieceSkin,
                boardSkin,
                equippedSkills,
            });
        }, abilityFallbackMatchMs));
    };
    const notifyRoomClosed = ({ socketIds, reason, }) => {
        if (reason !== 'turn_limit')
            return;
        for (const socketId of socketIds) {
            if (!io.sockets.sockets.has(socketId))
                continue;
            io.to(socketId).emit('room_closed', {
                reason,
            });
        }
    };
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
        socket.on('sync_time', (ack) => {
            ack?.({ serverNow: Date.now() });
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
            const userId = await registerSocketSession(socket, auth, {
                allowConcurrentSessions: true,
            });
            ack?.({ ok: Boolean(userId), updateRequired: false });
        });
        socket.on('create_room', async ({ nickname, auth, pieceSkin, boardSkin }) => {
            if (emitUpdateRequired(socket, auth))
                return;
            await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
            const profile = await resolvePlayerProfileCached(socket, auth, nickname);
            const roomId = store.generateRoomId();
            const code = store.generateCode();
            const room = new GameRoom_1.GameRoom(roomId, code, io, 'friend');
            const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic');
            store.add(room);
            store.registerSocket(socket.id, roomId);
            socket.emit('room_created', { roomId, code, color, pieceSkin: pieceSkin ?? 'classic' });
        });
        socket.on('join_ai', async ({ nickname, auth, pieceSkin, tutorialPending, boardSkin, }) => {
            if (emitUpdateRequired(socket, auth))
                return;
            await registerSocketSession(socket, auth);
            const profile = await resolvePlayerProfileCached(socket, auth, nickname);
            const roomId = store.generateRoomId();
            const code = store.generateCode();
            const room = new GameRoom_1.GameRoom(roomId, code, io, 'ai');
            store.add(room);
            const humanColor = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic');
            if (!humanColor) {
                socket.emit('join_error', { message: 'AI room creation failed.' });
                return;
            }
            room.addAiPlayer('PathClash AI');
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
            room.prepareGameStart(Boolean(tutorialPending));
        });
        socket.on('join_room', async ({ code, nickname, auth, pieceSkin, boardSkin }) => {
            if (emitUpdateRequired(socket, auth))
                return;
            await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
            const profile = await resolvePlayerProfileCached(socket, auth, nickname);
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
        socket.on('create_ability_room', async ({ nickname, auth, pieceSkin, boardSkin, equippedSkills, }) => {
            if (emitUpdateRequired(socket, auth))
                return;
            await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
            const profile = await resolvePlayerProfileCached(socket, auth, nickname);
            const roomId = abilityStore.generateRoomId();
            const code = abilityStore.generateCode();
            const room = new AbilityRoom_1.AbilityRoom(roomId, code, io);
            room.enablePrivateMatch();
            const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills);
            abilityStore.add(room);
            abilityStore.registerSocket(socket.id, roomId);
            socket.emit('ability_room_created', {
                roomId,
                code,
                color,
            });
        });
        socket.on('join_ability_room', async ({ code, nickname, auth, pieceSkin, boardSkin, equippedSkills, }) => {
            if (emitUpdateRequired(socket, auth))
                return;
            await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
            const profile = await resolvePlayerProfileCached(socket, auth, nickname);
            const room = abilityStore.getByCode(code);
            if (!room || room.isFull) {
                socket.emit('join_error', { message: '방을 찾을 수 없거나 이미 가득 찼습니다.' });
                return;
            }
            room.enablePrivateMatch();
            const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills);
            if (!color) {
                socket.emit('join_error', { message: '입장할 수 없습니다.' });
                return;
            }
            room.prepareGameStart();
            abilityStore.registerSocket(socket.id, room.roomId);
            socket.emit('ability_room_joined', {
                roomId: room.roomId,
                color,
                opponentNickname: room.toClientState(color).players[color === 'red' ? 'blue' : 'red'].nickname,
            });
            socket.to(room.roomId).emit('ability_opponent_joined', {
                nickname: profile.nickname,
                color,
            });
        });
        socket.on('join_random', async ({ nickname, auth, pieceSkin, boardSkin }) => {
            pendingCancelRandom.delete(socket.id);
            if (emitUpdateRequired(socket, auth))
                return;
            await registerSocketSession(socket, auth);
            const profile = await resolvePlayerProfileCached(socket, auth, nickname);
            if (pendingCancelRandom.has(socket.id)) {
                pendingCancelRandom.delete(socket.id);
                return;
            }
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
            room.addPlayer(queuedSocket, queued.nickname, queued.userId, queued.stats, queued.pieceSkin, queued.boardSkin);
            room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, selectedPieceSkin, selectedBoardSkin);
            store.registerSocket(queued.socketId, roomId);
            store.registerSocket(socket.id, roomId);
            queuedSocket.emit('room_joined', {
                roomId,
                color: 'red',
                opponentNickname: profile.nickname,
                selfPieceSkin: queued.pieceSkin,
                opponentPieceSkin: selectedPieceSkin,
            });
            socket.emit('room_joined', {
                roomId,
                color: 'blue',
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
        socket.on('join_coop', async ({ nickname, auth, pieceSkin }) => {
            if (emitUpdateRequired(socket, auth))
                return;
            await registerSocketSession(socket, auth);
            const profile = await resolvePlayerProfileCached(socket, auth, nickname);
            const queued = coopStore.dequeue();
            if (!queued || queued.socketId === socket.id) {
                if (queued) {
                    coopStore.enqueue(queued.socketId, queued.nickname, queued.userId, queued.stats, queued.pieceSkin);
                }
                coopStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
                socket.emit('coop_matchmaking_waiting', {});
                return;
            }
            const roomId = coopStore.generateRoomId();
            const room = new CoopRoom_1.CoopRoom(roomId, roomId, io);
            coopStore.add(room);
            const queuedSocket = io.sockets.sockets.get(queued.socketId);
            if (!queuedSocket) {
                coopStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
                socket.emit('coop_matchmaking_waiting', {});
                return;
            }
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
        socket.on('account_sync', async ({ auth }, ack) => {
            const requirement = getUpdateRequirement(socket, auth);
            if (requirement?.forceUpdate) {
                socket.emit('update_required', requirement);
                ack?.({ status: 'UPDATE_REQUIRED', ...requirement });
                return;
            }
            await registerSocketSession(socket, auth, { forceRevalidate: true });
            ack?.(await (0, playerAuth_1.resolveAccount)(auth));
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
        });
        socket.on('finalize_google_upgrade', async ({ auth, guestAuth, guestProfile, flowStartedAt, allowExistingSwitch, }, ack) => {
            await registerSocketSession(socket, auth, { forceRevalidate: true });
            ack?.(await (0, playerAuth_1.finalizeGoogleUpgrade)(auth, guestAuth, guestProfile, flowStartedAt, Boolean(allowExistingSwitch)));
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
            if (emitUpdateRequired(socket, auth))
                return;
            await registerSocketSession(socket, auth);
            const profile = await resolvePlayerProfileCached(socket, auth, nickname);
            twoVsTwoStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
            const existingRoom = twoVsTwoStore.getBySocket(socket.id);
            tryStartTwoVsTwoTeamMatch();
            if (!existingRoom && !twoVsTwoStore.getBySocket(socket.id)) {
                socket.emit('twovtwo_matchmaking_waiting', {});
            }
        });
        socket.on('join_ability', async ({ nickname, auth, pieceSkin, boardSkin, equippedSkills, training, }) => {
            if (emitUpdateRequired(socket, auth))
                return;
            await registerSocketSession(socket, auth);
            const profile = await resolvePlayerProfileCached(socket, auth, nickname);
            if (training) {
                clearAbilityFallback(socket.id);
                const roomId = abilityStore.generateRoomId();
                const room = new AbilityRoom_1.AbilityRoom(roomId, roomId, io);
                room.enableTrainingMode();
                abilityStore.add(room);
                room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills);
                room.addIdleBot('Training Dummy', 'classic', 'classic', []);
                abilityStore.registerSocket(socket.id, roomId);
                socket.emit('ability_room_joined', {
                    roomId,
                    color: 'red',
                    opponentNickname: 'Training Dummy',
                    training: true,
                });
                room.waitForSkillSelection();
                return;
            }
            const queued = abilityStore.dequeue();
            if (!queued || queued.socketId === socket.id) {
                if (queued) {
                    abilityStore.enqueue(queued.socketId, queued.nickname, queued.userId, queued.stats, queued.pieceSkin, queued.boardSkin, queued.equippedSkills);
                }
                abilityStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills);
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
            const roomId = abilityStore.generateRoomId();
            const room = new AbilityRoom_1.AbilityRoom(roomId, roomId, io);
            abilityStore.add(room);
            const queuedSocket = io.sockets.sockets.get(queued.socketId);
            if (!queuedSocket) {
                abilityStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills);
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
            room.addPlayer(queuedSocket, queued.nickname, queued.userId, queued.stats, queued.pieceSkin, queued.boardSkin, queued.equippedSkills);
            abilityStore.registerSocket(queued.socketId, roomId);
            queuedSocket.emit('ability_room_joined', {
                roomId,
                color: 'red',
                opponentNickname: profile.nickname,
            });
            room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic', equippedSkills);
            abilityStore.registerSocket(socket.id, roomId);
            socket.emit('ability_room_joined', {
                roomId,
                color: 'blue',
                opponentNickname: queued.nickname,
            });
            room.prepareGameStart();
        });
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
