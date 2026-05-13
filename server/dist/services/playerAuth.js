"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserFromToken = getUserFromToken;
exports.resolvePlayerProfile = resolvePlayerProfile;
exports.resolveAccount = resolveAccount;
exports.resolveAccountForUser = resolveAccountForUser;
exports.recordMatchmakingResult = recordMatchmakingResult;
exports.recordMatchmakingWin = recordMatchmakingWin;
exports.recordMatchmakingLoss = recordMatchmakingLoss;
exports.grantDailyRewardTokens = grantDailyRewardTokens;
exports.openVictoryVault = openVictoryVault;
exports.finalizeGoogleUpgrade = finalizeGoogleUpgrade;
exports.updateAbilityRating = updateAbilityRating;
const supabase_1 = require("../lib/supabase");
const arenaConfig_1 = require("../game/arenaConfig");
const achievementService_1 = require("./achievementService");
const rotationService_1 = require("./rotationService");
function normalizeAbilityLoadout(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const validSkills = [
        'classic_guard',
        'arc_reactor_field',
        'phase_shift',
        'ember_blast',
        'atomic_fission',
        'inferno_field',
        'nova_blast',
        'sun_chariot',
        'aurora_heal',
        'gold_overdrive',
        'quantum_shift',
        'plasma_charge',
        'void_cloak',
        'electric_blitz',
        'cosmic_bigbang',
        'wizard_magic_mine',
        'chronos_time_rewind',
    ];
    const normalized = value.filter((entry) => typeof entry === 'string' &&
        validSkills.includes(entry));
    return normalized.slice(0, 3);
}
function normalizeAbilityPresets(value, activeLoadout) {
    const defaultPresets = [activeLoadout, [], [], [], []];
    if (!Array.isArray(value) || value.length === 0)
        return defaultPresets;
    const presets = value
        .slice(0, 5)
        .map((p) => normalizeAbilityLoadout(p));
    while (presets.length < 5)
        presets.push([]);
    return presets;
}
const DAILY_REWARD_TOKENS_PER_WIN = 6;
const DAILY_REWARD_MAX_WINS = 20;
const VAULT_REQUIRED_WINS = 3;
const VERIFIED_USER_CACHE_TTL_MS = 60 * 1000;
const VERIFIED_USER_CACHE_MAX_ENTRIES = 500;
const verifiedUserCache = new Map();
function pruneVerifiedUserCache(now = Date.now()) {
    for (const [token, cached] of verifiedUserCache) {
        if (cached.expiresAt <= now) {
            verifiedUserCache.delete(token);
        }
    }
    while (verifiedUserCache.size > VERIFIED_USER_CACHE_MAX_ENTRIES) {
        const oldestToken = verifiedUserCache.keys().next().value;
        if (!oldestToken)
            break;
        verifiedUserCache.delete(oldestToken);
    }
}
function normalizeNicknameCandidate(value) {
    const trimmed = value?.trim();
    if (!trimmed)
        return null;
    return trimmed.slice(0, 16);
}
function resolvePreferredAccountNickname(profileNickname, fallbackNickname = 'Guest', authUser) {
    const normalizedProfile = normalizeNicknameCandidate(profileNickname);
    if (normalizedProfile && normalizedProfile !== 'Guest') {
        return normalizedProfile;
    }
    const metadataCandidates = [
        authUser?.user_metadata?.nickname,
        authUser?.user_metadata?.preferred_username,
        authUser?.user_metadata?.name,
        authUser?.user_metadata?.full_name,
        authUser?.raw_user_meta_data?.nickname,
        authUser?.raw_user_meta_data?.preferred_username,
        authUser?.raw_user_meta_data?.name,
        authUser?.raw_user_meta_data?.full_name,
    ];
    for (const candidate of metadataCandidates) {
        if (typeof candidate !== 'string')
            continue;
        const normalizedCandidate = normalizeNicknameCandidate(candidate);
        if (normalizedCandidate) {
            return normalizedCandidate;
        }
    }
    return normalizeNicknameCandidate(fallbackNickname) ?? 'Guest';
}
function getUtcDayKey(now = new Date()) {
    return now.toISOString().slice(0, 10);
}
function getActiveDailyRewardWins(stats, utcDayKey = getUtcDayKey()) {
    if (!stats || stats.daily_reward_day !== utcDayKey)
        return 0;
    return Math.min(DAILY_REWARD_MAX_WINS, Math.max(0, Number(stats.daily_reward_wins ?? 0)));
}
function getActiveVaultWins(stats, utcDayKey = getUtcDayKey()) {
    if (!stats || stats.vault_opened_day === utcDayKey || stats.vault_day !== utcDayKey) {
        return 0;
    }
    return Math.min(VAULT_REQUIRED_WINS, Math.max(0, Number(stats.vault_wins ?? 0)));
}
function hasVaultOpenedToday(stats, utcDayKey = getUtcDayKey()) {
    return stats?.vault_opened_day === utcDayKey;
}
function getNextVaultWinsAfterVictory(stats, utcDayKey = getUtcDayKey()) {
    if (hasVaultOpenedToday(stats, utcDayKey))
        return 0;
    const activeVaultWins = stats.vault_day === utcDayKey
        ? Math.max(0, Number(stats.vault_wins ?? 0))
        : 0;
    return Math.min(VAULT_REQUIRED_WINS, activeVaultWins + 1);
}
const VAULT_SKIN_CATALOG = [
    { id: 'plasma', tier: 'common', tokenPrice: 480 },
    { id: 'gold_core', tier: 'common', tokenPrice: 480 },
    { id: 'neon_pulse', tier: 'common', tokenPrice: 480 },
    { id: 'inferno', tier: 'common', tokenPrice: 480 },
    { id: 'quantum', tier: 'common', tokenPrice: 480 },
    { id: 'cosmic', tier: 'rare', tokenPrice: 1400 },
    { id: 'arc_reactor', tier: 'rare', tokenPrice: 1400 },
    { id: 'electric_core', tier: 'rare', tokenPrice: 1400 },
    { id: 'berserker', tier: 'rare', tokenPrice: 1400 },
    { id: 'moonlight_seed', tier: 'rare', tokenPrice: 1400 },
    { id: 'wizard', tier: 'legendary', tokenPrice: 3600 },
    { id: 'chronos', tier: 'legendary', tokenPrice: 3600 },
    { id: 'atomic', tier: 'legendary', tokenPrice: 3600 },
    { id: 'sun', tier: 'legendary', tokenPrice: 3600 },
    { id: 'frost_heart', tier: 'legendary', tokenPrice: 3600 },
];
const VAULT_TOKEN_REWARDS = [
    { chance: 0.5, tokens: 50 },
    { chance: 0.3, tokens: 100 },
    { chance: 0.16, tokens: 300 },
    { chance: 0.03, tokens: 800 },
    { chance: 0.009, tokens: 3000 },
    { chance: 0.001, tokens: 10000 },
];
const VAULT_SKIN_TIER_WEIGHTS = {
    common: 60,
    rare: 30,
    legendary: 10,
};
function rollVaultTokenReward() {
    const roll = Math.random();
    let cumulative = 0;
    for (const reward of VAULT_TOKEN_REWARDS) {
        cumulative += reward.chance;
        if (roll < cumulative)
            return reward.tokens;
    }
    return VAULT_TOKEN_REWARDS[0].tokens;
}
function pickWeightedVaultSkin() {
    if (VAULT_SKIN_CATALOG.length === 0)
        return null;
    const totalWeight = VAULT_SKIN_CATALOG.reduce((sum, skin) => sum + VAULT_SKIN_TIER_WEIGHTS[skin.tier], 0);
    let roll = Math.random() * totalWeight;
    for (const skin of VAULT_SKIN_CATALOG) {
        roll -= VAULT_SKIN_TIER_WEIGHTS[skin.tier];
        if (roll <= 0)
            return skin;
    }
    return VAULT_SKIN_CATALOG[VAULT_SKIN_CATALOG.length - 1] ?? null;
}
async function getUserFromToken(accessToken) {
    const normalizedToken = accessToken?.trim();
    if (!supabase_1.supabaseAdmin || !normalizedToken)
        return null;
    const now = Date.now();
    const cached = verifiedUserCache.get(normalizedToken);
    if (cached && cached.expiresAt > now) {
        return cached.user;
    }
    if (cached) {
        verifiedUserCache.delete(normalizedToken);
    }
    try {
        const { data, error } = await supabase_1.supabaseAdmin.auth.getUser(normalizedToken);
        if (error || !data.user)
            return null;
        verifiedUserCache.set(normalizedToken, {
            expiresAt: now + VERIFIED_USER_CACHE_TTL_MS,
            user: data.user,
        });
        pruneVerifiedUserCache(now);
        return data.user;
    }
    catch (err) {
        console.error('[auth] getUserFromToken network error:', err);
        return null;
    }
}
async function readAccountProfile(userId, fallbackNickname = 'Guest', isGuestUser = false) {
    const profilePromise = supabase_1.supabaseAdmin
        ?.from('profiles')
        .select('nickname, equipped_skin, equipped_board_skin, equipped_ability_skills, ability_skill_presets, active_preset')
        .eq('id', userId)
        .maybeSingle();
    const statsPromise = supabase_1.supabaseAdmin
        ?.from('player_stats')
        .select('wins, losses, tokens, daily_reward_wins, daily_reward_day, vault_wins, vault_day, vault_opened_day, current_rating, highest_arena_reached, ranked_unlocked')
        .eq('user_id', userId)
        .maybeSingle();
    const ownedSkinsPromise = supabase_1.supabaseAdmin
        ?.from('owned_skins')
        .select('skin_id')
        .eq('user_id', userId)
        .returns();
    const ownedBoardSkinsPromise = supabase_1.supabaseAdmin
        ?.from('owned_board_skins')
        .select('board_skin_id')
        .eq('user_id', userId)
        .returns();
    const [profileResult, statsResult, ownedSkinsResult, ownedBoardSkinsResult] = await Promise.all([
        profilePromise ?? Promise.resolve(null),
        statsPromise ?? Promise.resolve(null),
        ownedSkinsPromise ?? Promise.resolve(null),
        ownedBoardSkinsPromise ?? Promise.resolve(null),
    ]).catch((err) => {
        console.error('[auth] readAccountProfile query error:', err);
        return [null, null, null, null];
    });
    const nickname = profileResult?.data?.nickname?.trim() || fallbackNickname;
    const dailyRewardWins = getActiveDailyRewardWins(statsResult?.data);
    const vaultWins = getActiveVaultWins(statsResult?.data);
    const ownedSkins = (ownedSkinsResult?.data ?? [])
        .map((row) => row.skin_id)
        .filter((skin) => Boolean(skin));
    const ownedBoardSkins = (ownedBoardSkinsResult?.data ?? [])
        .map((row) => row.board_skin_id)
        .filter((skin) => skin === 'blue_gray' || skin === 'pharaoh' || skin === 'magic');
    await (0, achievementService_1.syncAchievementDerivedProgress)({
        userId,
        ownedSkins,
    });
    const achievements = await (0, achievementService_1.listPlayerAchievements)(userId);
    const rawEquipped = normalizeAbilityLoadout(profileResult?.data?.equipped_ability_skills ?? []);
    const activeRotation = (0, rotationService_1.getCurrentRotation)();
    // 로테이션 만료 스킬 필터링: 풀 소속이지만 현재 로테이션에도 없고 스킨도 미보유인 스킬 제거
    const removedRotationSkills = [];
    const equippedAbilitySkills = rawEquipped.filter((skillId) => {
        if (!(0, rotationService_1.isRotationSkill)(skillId))
            return true;
        if (activeRotation.includes(skillId))
            return true;
        const requiredSkin = (0, rotationService_1.getRotationSkillSkin)(skillId);
        if (requiredSkin && ownedSkins.includes(requiredSkin))
            return true;
        removedRotationSkills.push(skillId);
        return false;
    });
    const rawActivePreset = typeof profileResult?.data?.active_preset === 'number'
        ? profileResult.data.active_preset
        : 1;
    const activePreset = Math.max(1, Math.min(5, rawActivePreset));
    const abilitySkillPresets = normalizeAbilityPresets(profileResult?.data?.ability_skill_presets, equippedAbilitySkills);
    // 제거된 스킬이 있으면 DB 업데이트 (fire-and-forget, 에러는 로그)
    if (removedRotationSkills.length > 0) {
        const updatedPresets = [...abilitySkillPresets];
        updatedPresets[activePreset - 1] = equippedAbilitySkills;
        void Promise.resolve(supabase_1.supabaseAdmin
            ?.from('profiles')
            .update({
            equipped_ability_skills: equippedAbilitySkills,
            ability_skill_presets: updatedPresets,
        })
            .eq('id', userId)).then((result) => {
            if (result?.error)
                console.error('[rotation] failed to update equipped_ability_skills', result.error);
        }).catch((err) => {
            console.error('[rotation] unexpected error updating equipped_ability_skills', err);
        });
    }
    return {
        userId,
        nickname,
        equippedSkin: profileResult?.data?.equipped_skin ?? 'classic',
        equippedBoardSkin: profileResult?.data?.equipped_board_skin ?? 'classic',
        equippedAbilitySkills,
        abilitySkillPresets,
        activePreset,
        ownedSkins,
        ownedBoardSkins,
        wins: statsResult?.data?.wins ?? 0,
        losses: statsResult?.data?.losses ?? 0,
        tokens: statsResult?.data?.tokens ?? 0,
        dailyRewardWins,
        dailyRewardTokens: dailyRewardWins * DAILY_REWARD_TOKENS_PER_WIN,
        vaultWins,
        vaultRequiredWins: VAULT_REQUIRED_WINS,
        vaultOpenedToday: hasVaultOpenedToday(statsResult?.data),
        isGuestUser,
        achievements,
        rotationSkills: activeRotation,
        removedRotationSkills,
        currentRating: statsResult?.data?.current_rating ?? 0,
        highestArena: statsResult?.data?.highest_arena_reached ?? 1,
        rankedUnlocked: statsResult?.data?.ranked_unlocked ?? false,
    };
}
async function resolvePlayerProfile(auth, fallbackNickname) {
    const normalizedFallback = fallbackNickname.slice(0, 16) || 'Guest';
    if (!supabase_1.supabaseAdmin || !auth?.accessToken) {
        return {
            userId: null,
            nickname: normalizedFallback,
            stats: { wins: 0, losses: 0 },
            currentRating: 0,
            rankedUnlocked: false,
        };
    }
    const user = await getUserFromToken(auth.accessToken);
    if (!user) {
        return {
            userId: null,
            nickname: normalizedFallback,
            stats: { wins: 0, losses: 0 },
            currentRating: 0,
            rankedUnlocked: false,
        };
    }
    const userId = user.id;
    const profile = await readAccountProfile(userId, normalizedFallback, user.is_anonymous ?? false);
    return {
        userId,
        nickname: profile.nickname,
        stats: { wins: profile.wins, losses: profile.losses },
        currentRating: profile.currentRating,
        rankedUnlocked: profile.rankedUnlocked,
    };
}
async function resolveAccount(auth) {
    if (!supabase_1.supabaseAdmin || !auth?.accessToken) {
        return { status: 'AUTH_REQUIRED' };
    }
    const user = await getUserFromToken(auth.accessToken);
    if (!user) {
        return { status: 'AUTH_INVALID' };
    }
    const profile = await readAccountProfile(user.id, 'Guest', user.is_anonymous ?? false);
    return {
        status: 'ACCOUNT_OK',
        profile,
    };
}
async function resolveAccountForUser(userId, isGuestUser = false) {
    if (!supabase_1.supabaseAdmin || !userId) {
        return { status: 'AUTH_INVALID' };
    }
    const profile = await readAccountProfile(userId, 'Guest', isGuestUser);
    return {
        status: 'ACCOUNT_OK',
        profile,
    };
}
async function recordMatchmakingResult(winnerUserId, loserUserId) {
    if (!supabase_1.supabaseAdmin || !winnerUserId || !loserUserId)
        return;
    const { data: rows, error } = await supabase_1.supabaseAdmin
        .from('player_stats')
        .select('user_id, wins, losses, tokens, daily_reward_wins, daily_reward_day, vault_wins, vault_day, vault_opened_day, current_rating, highest_arena_reached, ranked_unlocked')
        .in('user_id', [winnerUserId, loserUserId]);
    if (error) {
        console.error('[supabase] failed to read player_stats', error);
        return;
    }
    const byId = new Map((rows ?? []).map((row) => [
        row.user_id,
        {
            wins: Number(row.wins ?? 0),
            losses: Number(row.losses ?? 0),
            tokens: Number(row.tokens ?? 0),
            dailyRewardWins: Number(row.daily_reward_wins ?? 0),
            dailyRewardDay: row.daily_reward_day ?? null,
            vaultWins: Number(row.vault_wins ?? 0),
            vaultDay: row.vault_day ?? null,
            vaultOpenedDay: row.vault_opened_day ?? null,
        },
    ]));
    const winner = byId.get(winnerUserId) ?? {
        wins: 0,
        losses: 0,
        tokens: 0,
        dailyRewardWins: 0,
        dailyRewardDay: null,
        vaultWins: 0,
        vaultDay: null,
        vaultOpenedDay: null,
    };
    const loser = byId.get(loserUserId) ?? {
        wins: 0,
        losses: 0,
        tokens: 0,
        dailyRewardWins: 0,
        dailyRewardDay: null,
        vaultWins: 0,
        vaultDay: null,
        vaultOpenedDay: null,
    };
    const utcDayKey = getUtcDayKey();
    const winnerActiveDailyWins = winner.dailyRewardDay === utcDayKey
        ? Math.min(DAILY_REWARD_MAX_WINS, Math.max(0, winner.dailyRewardWins))
        : 0;
    const winnerEarnedReward = winnerActiveDailyWins < DAILY_REWARD_MAX_WINS;
    const nextWinnerDailyRewardWins = winnerEarnedReward
        ? winnerActiveDailyWins + 1
        : winnerActiveDailyWins;
    const { error: upsertError } = await supabase_1.supabaseAdmin.from('player_stats').upsert([
        {
            user_id: winnerUserId,
            wins: winner.wins + 1,
            losses: winner.losses,
            tokens: winner.tokens + (winnerEarnedReward ? DAILY_REWARD_TOKENS_PER_WIN : 0),
            daily_reward_wins: nextWinnerDailyRewardWins,
            daily_reward_day: utcDayKey,
            vault_wins: getNextVaultWinsAfterVictory({
                vault_wins: winner.vaultWins,
                vault_day: winner.vaultDay,
                vault_opened_day: winner.vaultOpenedDay,
            }, utcDayKey),
            vault_day: utcDayKey,
            vault_opened_day: winner.vaultOpenedDay,
        },
        {
            user_id: loserUserId,
            wins: loser.wins,
            losses: loser.losses + 1,
            tokens: loser.tokens,
            daily_reward_wins: loser.dailyRewardWins,
            daily_reward_day: loser.dailyRewardDay,
            vault_wins: loser.vaultWins,
            vault_day: loser.vaultDay,
            vault_opened_day: loser.vaultOpenedDay,
        },
    ], { onConflict: 'user_id' });
    if (upsertError) {
        console.error('[supabase] failed to upsert player_stats', upsertError);
        return;
    }
    if (winnerEarnedReward) {
        await (0, achievementService_1.recordDailyRewardGrant)([winnerUserId], 1);
    }
}
async function recordMatchmakingWin(winnerUserId) {
    if (!supabase_1.supabaseAdmin || !winnerUserId)
        return;
    const { data: row, error } = await supabase_1.supabaseAdmin
        .from('player_stats')
        .select('user_id, wins, losses, tokens, daily_reward_wins, daily_reward_day, vault_wins, vault_day, vault_opened_day')
        .eq('user_id', winnerUserId)
        .maybeSingle();
    if (error) {
        console.error('[supabase] failed to read player_stats for win', error);
        return;
    }
    const winner = {
        wins: Number(row?.wins ?? 0),
        losses: Number(row?.losses ?? 0),
        tokens: Number(row?.tokens ?? 0),
        dailyRewardWins: Number(row?.daily_reward_wins ?? 0),
        dailyRewardDay: row?.daily_reward_day ?? null,
        vaultWins: Number(row?.vault_wins ?? 0),
        vaultDay: row?.vault_day ?? null,
        vaultOpenedDay: row?.vault_opened_day ?? null,
    };
    const utcDayKey = getUtcDayKey();
    const winnerActiveDailyWins = winner.dailyRewardDay === utcDayKey
        ? Math.min(DAILY_REWARD_MAX_WINS, Math.max(0, winner.dailyRewardWins))
        : 0;
    const winnerEarnedReward = winnerActiveDailyWins < DAILY_REWARD_MAX_WINS;
    const nextWinnerDailyRewardWins = winnerEarnedReward
        ? winnerActiveDailyWins + 1
        : winnerActiveDailyWins;
    const { error: upsertError } = await supabase_1.supabaseAdmin.from('player_stats').upsert({
        user_id: winnerUserId,
        wins: winner.wins + 1,
        losses: winner.losses,
        tokens: winner.tokens + (winnerEarnedReward ? DAILY_REWARD_TOKENS_PER_WIN : 0),
        daily_reward_wins: nextWinnerDailyRewardWins,
        daily_reward_day: utcDayKey,
        vault_wins: getNextVaultWinsAfterVictory({
            vault_wins: winner.vaultWins,
            vault_day: winner.vaultDay,
            vault_opened_day: winner.vaultOpenedDay,
        }, utcDayKey),
        vault_day: utcDayKey,
        vault_opened_day: winner.vaultOpenedDay,
    }, { onConflict: 'user_id' });
    if (upsertError) {
        console.error('[supabase] failed to upsert player_stats for win', upsertError);
        return;
    }
    if (winnerEarnedReward) {
        await (0, achievementService_1.recordDailyRewardGrant)([winnerUserId], 1);
    }
}
async function recordMatchmakingLoss(loserUserId) {
    if (!supabase_1.supabaseAdmin || !loserUserId)
        return;
    const { data: row, error } = await supabase_1.supabaseAdmin
        .from('player_stats')
        .select('user_id, wins, losses, tokens, daily_reward_wins, daily_reward_day, vault_wins, vault_day, vault_opened_day')
        .eq('user_id', loserUserId)
        .maybeSingle();
    if (error) {
        console.error('[supabase] failed to read player_stats for loss', error);
        return;
    }
    const loser = {
        wins: Number(row?.wins ?? 0),
        losses: Number(row?.losses ?? 0),
        tokens: Number(row?.tokens ?? 0),
        dailyRewardWins: Number(row?.daily_reward_wins ?? 0),
        dailyRewardDay: row?.daily_reward_day ?? null,
        vaultWins: Number(row?.vault_wins ?? 0),
        vaultDay: row?.vault_day ?? null,
        vaultOpenedDay: row?.vault_opened_day ?? null,
    };
    const { error: upsertError } = await supabase_1.supabaseAdmin.from('player_stats').upsert({
        user_id: loserUserId,
        wins: loser.wins,
        losses: loser.losses + 1,
        tokens: loser.tokens,
        daily_reward_wins: loser.dailyRewardWins,
        daily_reward_day: loser.dailyRewardDay,
        vault_wins: loser.vaultWins,
        vault_day: loser.vaultDay,
        vault_opened_day: loser.vaultOpenedDay,
    }, { onConflict: 'user_id' });
    if (upsertError) {
        console.error('[supabase] failed to upsert player_stats for loss', upsertError);
    }
}
async function grantDailyRewardTokens(userIds, tokenAmount) {
    if (!supabase_1.supabaseAdmin)
        return;
    const normalizedUserIds = [...new Set(userIds.filter((userId) => Boolean(userId)))];
    if (normalizedUserIds.length === 0)
        return;
    if (tokenAmount <= 0 || tokenAmount % DAILY_REWARD_TOKENS_PER_WIN !== 0)
        return;
    const rewardWins = tokenAmount / DAILY_REWARD_TOKENS_PER_WIN;
    const utcDayKey = getUtcDayKey();
    const { data: rows, error } = await supabase_1.supabaseAdmin
        .from('player_stats')
        .select('user_id, wins, losses, tokens, daily_reward_wins, daily_reward_day, vault_wins, vault_day, vault_opened_day')
        .in('user_id', normalizedUserIds);
    if (error) {
        console.error('[supabase] failed to read player_stats for reward grant', error);
        return;
    }
    const byId = new Map((rows ?? []).map((row) => [
        row.user_id,
        {
            wins: Number(row.wins ?? 0),
            losses: Number(row.losses ?? 0),
            tokens: Number(row.tokens ?? 0),
            dailyRewardWins: Number(row.daily_reward_wins ?? 0),
            dailyRewardDay: row.daily_reward_day ?? null,
            vaultWins: Number(row.vault_wins ?? 0),
            vaultDay: row.vault_day ?? null,
            vaultOpenedDay: row.vault_opened_day ?? null,
        },
    ]));
    const payload = normalizedUserIds.map((userId) => {
        const current = byId.get(userId) ?? {
            wins: 0,
            losses: 0,
            tokens: 0,
            dailyRewardWins: 0,
            dailyRewardDay: null,
            vaultWins: 0,
            vaultDay: null,
            vaultOpenedDay: null,
        };
        const activeDailyWins = current.dailyRewardDay === utcDayKey
            ? Math.min(DAILY_REWARD_MAX_WINS, Math.max(0, current.dailyRewardWins))
            : 0;
        const remainingRewardWins = Math.max(0, DAILY_REWARD_MAX_WINS - activeDailyWins);
        const grantedRewardWins = Math.min(rewardWins, remainingRewardWins);
        const activeVaultWins = current.vaultDay === utcDayKey && current.vaultOpenedDay !== utcDayKey
            ? Math.max(0, current.vaultWins)
            : 0;
        const nextVaultWins = current.vaultOpenedDay === utcDayKey
            ? 0
            : Math.min(VAULT_REQUIRED_WINS, activeVaultWins + rewardWins);
        return {
            user_id: userId,
            wins: current.wins,
            losses: current.losses,
            tokens: current.tokens + grantedRewardWins * DAILY_REWARD_TOKENS_PER_WIN,
            daily_reward_wins: activeDailyWins + grantedRewardWins,
            daily_reward_day: utcDayKey,
            vault_wins: nextVaultWins,
            vault_day: utcDayKey,
            vault_opened_day: current.vaultOpenedDay,
        };
    });
    const { error: upsertError } = await supabase_1.supabaseAdmin
        .from('player_stats')
        .upsert(payload, { onConflict: 'user_id' });
    if (upsertError) {
        console.error('[supabase] failed to grant daily reward tokens', upsertError);
        return;
    }
    await (0, achievementService_1.recordDailyRewardGrant)(normalizedUserIds, rewardWins);
}
async function openVictoryVault(auth) {
    if (!supabase_1.supabaseAdmin || !auth?.accessToken)
        return { status: 'AUTH_REQUIRED' };
    const user = await getUserFromToken(auth.accessToken);
    if (!user)
        return { status: 'AUTH_INVALID' };
    const userId = user.id;
    const utcDayKey = getUtcDayKey();
    const { data: statsRow, error: statsError } = await supabase_1.supabaseAdmin
        .from('player_stats')
        .select('user_id, wins, losses, tokens, daily_reward_wins, daily_reward_day, vault_wins, vault_day, vault_opened_day')
        .eq('user_id', userId)
        .maybeSingle();
    if (statsError) {
        console.error('[vault] failed to read player_stats', statsError);
        return { status: 'FAILED' };
    }
    if (hasVaultOpenedToday(statsRow, utcDayKey)) {
        return { status: 'ALREADY_OPENED' };
    }
    const activeVaultWins = getActiveVaultWins(statsRow, utcDayKey);
    if (activeVaultWins < VAULT_REQUIRED_WINS) {
        return { status: 'NOT_READY' };
    }
    const { data: ownedRows, error: ownedError } = await supabase_1.supabaseAdmin
        .from('owned_skins')
        .select('skin_id')
        .eq('user_id', userId)
        .returns();
    if (ownedError) {
        console.error('[vault] failed to read owned skins', ownedError);
        return { status: 'FAILED' };
    }
    const ownedSkins = (ownedRows ?? [])
        .map((row) => row.skin_id)
        .filter((skin) => Boolean(skin));
    const ownedSkinSet = new Set(ownedSkins);
    const rewardTokens = rollVaultTokenReward();
    let bonusSkin = null;
    let duplicateSkin = null;
    let duplicateCompensationTokens = 0;
    let newlyOwnedSkins = ownedSkins;
    if (Math.random() < 0.01) {
        const rolledSkin = pickWeightedVaultSkin();
        if (rolledSkin) {
            if (ownedSkinSet.has(rolledSkin.id)) {
                duplicateSkin = rolledSkin.id;
                duplicateCompensationTokens = Math.floor(rolledSkin.tokenPrice * 0.5);
            }
            else {
                bonusSkin = rolledSkin.id;
                const { error: skinInsertError } = await supabase_1.supabaseAdmin
                    .from('owned_skins')
                    .upsert({ user_id: userId, skin_id: rolledSkin.id }, { onConflict: 'user_id,skin_id' });
                if (skinInsertError) {
                    console.error('[vault] failed to grant bonus skin', skinInsertError);
                    return { status: 'FAILED' };
                }
                newlyOwnedSkins = [...ownedSkins, rolledSkin.id];
            }
        }
    }
    const totalTokensGranted = rewardTokens + duplicateCompensationTokens;
    const currentTokens = Number(statsRow?.tokens ?? 0);
    const nextTokens = currentTokens + totalTokensGranted;
    const { error: upsertError } = await supabase_1.supabaseAdmin
        .from('player_stats')
        .upsert({
        user_id: userId,
        wins: Number(statsRow?.wins ?? 0),
        losses: Number(statsRow?.losses ?? 0),
        tokens: nextTokens,
        daily_reward_wins: Number(statsRow?.daily_reward_wins ?? 0),
        daily_reward_day: statsRow?.daily_reward_day ?? null,
        vault_wins: 0,
        vault_day: utcDayKey,
        vault_opened_day: utcDayKey,
        current_rating: Number(statsRow?.current_rating ?? 0),
        highest_arena_reached: Number(statsRow?.highest_arena_reached ?? 1),
        ranked_unlocked: Boolean(statsRow?.ranked_unlocked ?? false),
    }, { onConflict: 'user_id' });
    if (upsertError) {
        console.error('[vault] failed to update player_stats', upsertError);
        return { status: 'FAILED' };
    }
    if (bonusSkin) {
        await (0, achievementService_1.syncAchievementDerivedProgress)({ userId, ownedSkins: newlyOwnedSkins });
    }
    return {
        status: 'OPENED',
        rewardTokens,
        bonusSkin,
        duplicateSkin,
        duplicateCompensationTokens,
        tokens: nextTokens,
        ownedSkins: newlyOwnedSkins,
        vaultWins: 0,
        vaultRequiredWins: VAULT_REQUIRED_WINS,
        vaultOpenedToday: true,
    };
}
async function finalizeGoogleUpgrade(targetAuth, guestAuth, guestSnapshot, flowStartedAt, allowExistingSwitch = false) {
    if (!supabase_1.supabaseAdmin || !targetAuth?.accessToken || !guestAuth?.accessToken) {
        return { status: 'AUTH_REQUIRED' };
    }
    const [targetUser, guestUser] = await Promise.all([
        getUserFromToken(targetAuth.accessToken),
        getUserFromToken(guestAuth.accessToken),
    ]);
    if (!targetUser || !guestUser) {
        return { status: 'AUTH_INVALID' };
    }
    if (targetUser.id === guestUser.id) {
        const currentLinkedProfile = await readAccountProfile(targetUser.id, guestSnapshot?.nickname ?? 'Guest', false);
        const preservedNickname = resolvePreferredAccountNickname(currentLinkedProfile.nickname, guestSnapshot?.nickname ?? 'Guest', targetUser);
        const { error: profileError } = await supabase_1.supabaseAdmin.from('profiles').upsert({
            id: targetUser.id,
            nickname: preservedNickname,
            equipped_skin: currentLinkedProfile.equippedSkin,
            equipped_board_skin: currentLinkedProfile.equippedBoardSkin,
            equipped_ability_skills: guestSnapshot?.equippedAbilitySkills ??
                currentLinkedProfile.equippedAbilitySkills,
            is_guest: false,
        });
        if (profileError) {
            console.error('[supabase] failed to finalize linked profile', profileError);
            return { status: 'UPGRADE_FAILED' };
        }
        const profile = await readAccountProfile(targetUser.id, preservedNickname, false);
        return { status: 'UPGRADE_OK', profile };
    }
    const [targetProfile, guestAccountProfile] = await Promise.all([
        readAccountProfile(targetUser.id, 'Guest', targetUser.is_anonymous ?? false),
        readAccountProfile(guestUser.id, 'Guest', guestUser.is_anonymous ?? false),
    ]);
    const targetCreatedAt = targetUser.created_at ? new Date(targetUser.created_at).getTime() : Number.NaN;
    const startedAt = flowStartedAt ? new Date(flowStartedAt).getTime() : Number.NaN;
    const targetHasExistingData = Boolean(targetProfile.nickname && targetProfile.nickname !== 'Guest') ||
        targetProfile.wins > 0 ||
        targetProfile.losses > 0;
    const createdDuringFlow = Number.isFinite(targetCreatedAt) &&
        Number.isFinite(startedAt) &&
        targetCreatedAt >= startedAt - 5000 &&
        targetCreatedAt <= startedAt + 5 * 60000;
    if (targetHasExistingData || !createdDuringFlow) {
        const targetPreferredNickname = resolvePreferredAccountNickname(targetProfile.nickname, 'Guest', targetUser);
        if (targetPreferredNickname !== targetProfile.nickname && targetPreferredNickname !== 'Guest') {
            const { error: syncExistingProfileError } = await supabase_1.supabaseAdmin.from('profiles').upsert({
                id: targetUser.id,
                nickname: targetPreferredNickname,
                equipped_skin: targetProfile.equippedSkin,
                equipped_board_skin: targetProfile.equippedBoardSkin,
                is_guest: false,
            });
            if (syncExistingProfileError) {
                console.error('[supabase] failed to sync existing google nickname', syncExistingProfileError);
            }
        }
        const profile = await readAccountProfile(targetUser.id, targetPreferredNickname, false);
        if (!allowExistingSwitch) {
            return {
                status: 'SWITCH_CONFIRM_REQUIRED',
                profile,
            };
        }
        return {
            status: 'SWITCH_OK',
            profile,
        };
    }
    const adoptedNickname = guestSnapshot?.nickname ?? guestAccountProfile.nickname ?? 'Guest';
    const adoptedEquippedSkin = guestSnapshot?.equippedSkin ?? guestAccountProfile.equippedSkin ?? 'classic';
    const adoptedEquippedBoardSkin = guestSnapshot?.equippedBoardSkin ?? guestAccountProfile.equippedBoardSkin ?? 'classic';
    const adoptedEquippedAbilitySkills = guestSnapshot?.equippedAbilitySkills ??
        guestAccountProfile.equippedAbilitySkills ??
        [];
    const adoptedWins = guestSnapshot?.wins ?? guestAccountProfile.wins;
    const adoptedLosses = guestSnapshot?.losses ?? guestAccountProfile.losses;
    const adoptedTokens = guestSnapshot?.tokens ?? guestAccountProfile.tokens;
    const adoptedDailyRewardWins = guestSnapshot?.dailyRewardWins ?? guestAccountProfile.dailyRewardWins;
    const adoptedDailyRewardDay = adoptedDailyRewardWins > 0 ? getUtcDayKey() : null;
    const { error: upsertProfileError } = await supabase_1.supabaseAdmin.from('profiles').upsert({
        id: targetUser.id,
        nickname: adoptedNickname,
        equipped_skin: adoptedEquippedSkin,
        equipped_board_skin: adoptedEquippedBoardSkin,
        equipped_ability_skills: adoptedEquippedAbilitySkills,
        is_guest: false,
    });
    if (upsertProfileError) {
        console.error('[supabase] failed to adopt guest profile', upsertProfileError);
        return { status: 'UPGRADE_FAILED' };
    }
    const { error: upsertStatsError } = await supabase_1.supabaseAdmin.from('player_stats').upsert({
        user_id: targetUser.id,
        wins: adoptedWins,
        losses: adoptedLosses,
        tokens: adoptedTokens,
        daily_reward_wins: adoptedDailyRewardWins,
        daily_reward_day: adoptedDailyRewardDay,
    }, { onConflict: 'user_id' });
    if (upsertStatsError) {
        console.error('[supabase] failed to adopt guest stats', upsertStatsError);
        return { status: 'UPGRADE_FAILED' };
    }
    const { error: clearGuestStatsError } = await supabase_1.supabaseAdmin.from('player_stats').upsert({
        user_id: guestUser.id,
        wins: 0,
        losses: 0,
        tokens: 0,
        daily_reward_wins: 0,
        daily_reward_day: null,
    }, { onConflict: 'user_id' });
    if (clearGuestStatsError) {
        console.error('[supabase] failed to clear guest stats after upgrade', clearGuestStatsError);
    }
    if (guestAccountProfile.ownedSkins.length > 0) {
        const { error: mergeOwnedSkinsError } = await supabase_1.supabaseAdmin
            .from('owned_skins')
            .upsert(guestAccountProfile.ownedSkins.map((skinId) => ({
            user_id: targetUser.id,
            skin_id: skinId,
        })), { onConflict: 'user_id,skin_id' });
        if (mergeOwnedSkinsError) {
            console.error('[supabase] failed to merge owned skins after upgrade', mergeOwnedSkinsError);
        }
    }
    if (guestAccountProfile.ownedBoardSkins.length > 0) {
        const { error: mergeOwnedBoardSkinsError } = await supabase_1.supabaseAdmin
            .from('owned_board_skins')
            .upsert(guestAccountProfile.ownedBoardSkins.map((boardSkinId) => ({
            user_id: targetUser.id,
            board_skin_id: boardSkinId,
        })), { onConflict: 'user_id,board_skin_id' });
        if (mergeOwnedBoardSkinsError) {
            console.error('[supabase] failed to merge owned board skins after upgrade', mergeOwnedBoardSkinsError);
        }
        await supabase_1.supabaseAdmin
            .from('owned_board_skins')
            .delete()
            .eq('user_id', guestUser.id);
    }
    const { error: clearGuestOwnedSkinsError } = await supabase_1.supabaseAdmin
        .from('owned_skins')
        .delete()
        .eq('user_id', guestUser.id);
    if (clearGuestOwnedSkinsError) {
        console.error('[supabase] failed to clear guest owned skins after upgrade', clearGuestOwnedSkinsError);
    }
    await (0, achievementService_1.mergePlayerAchievements)(guestUser.id, targetUser.id);
    const profile = await readAccountProfile(targetUser.id, adoptedNickname, false);
    return {
        status: 'UPGRADE_OK',
        profile,
    };
}
async function updateAbilityRating(userId, isWin) {
    if (!supabase_1.supabaseAdmin)
        return null;
    const { data: row, error } = await supabase_1.supabaseAdmin
        .from('player_stats')
        .select('current_rating, highest_arena_reached, ranked_unlocked')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        console.error('[arena] failed to read player_stats for rating', error);
        return null;
    }
    const currentRating = Number(row?.current_rating ?? 0);
    const highestArena = Number(row?.highest_arena_reached ?? 1);
    const wasRankedUnlocked = Boolean(row?.ranked_unlocked ?? false);
    const requestedRatingChange = (0, arenaConfig_1.getRatingChange)(currentRating, isWin);
    const ratingFloor = isWin ? 0 : (0, arenaConfig_1.getRatingFloor)(currentRating);
    const newRating = Math.max(ratingFloor, currentRating + requestedRatingChange);
    const ratingChange = newRating - currentRating;
    const newArena = (0, arenaConfig_1.getArenaFromRating)(newRating);
    const newHighestArena = Math.max(highestArena, newArena);
    const arenaPromoted = newHighestArena > highestArena;
    const rankedUnlocked = wasRankedUnlocked || newRating >= arenaConfig_1.RANKED_UNLOCKED_THRESHOLD;
    const { error: upsertError } = await supabase_1.supabaseAdmin
        .from('player_stats')
        .upsert({
        user_id: userId,
        current_rating: newRating,
        highest_arena_reached: newHighestArena,
        ranked_unlocked: rankedUnlocked,
    }, { onConflict: 'user_id' });
    if (upsertError) {
        console.error('[arena] failed to upsert rating', upsertError);
        return null;
    }
    return { ratingChange, newRating, newArena, arenaPromoted, rankedUnlocked };
}
