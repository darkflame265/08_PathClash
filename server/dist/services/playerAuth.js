"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserFromToken = getUserFromToken;
exports.resolvePlayerProfile = resolvePlayerProfile;
exports.resolveAccount = resolveAccount;
exports.recordMatchmakingResult = recordMatchmakingResult;
exports.grantDailyRewardTokens = grantDailyRewardTokens;
exports.finalizeGoogleUpgrade = finalizeGoogleUpgrade;
const supabase_1 = require("../lib/supabase");
const achievementService_1 = require("./achievementService");
const DAILY_REWARD_TOKENS_PER_WIN = 6;
const DAILY_REWARD_MAX_WINS = 20;
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
async function getUserFromToken(accessToken) {
    if (!supabase_1.supabaseAdmin || !accessToken)
        return null;
    const { data, error } = await supabase_1.supabaseAdmin.auth.getUser(accessToken);
    if (error || !data.user)
        return null;
    return data.user;
}
async function readAccountProfile(userId, fallbackNickname = 'Guest', isGuestUser = false) {
    const profilePromise = supabase_1.supabaseAdmin
        ?.from('profiles')
        .select('nickname, equipped_skin, equipped_board_skin')
        .eq('id', userId)
        .maybeSingle();
    const statsPromise = supabase_1.supabaseAdmin
        ?.from('player_stats')
        .select('wins, losses, tokens, daily_reward_wins, daily_reward_day')
        .eq('user_id', userId)
        .maybeSingle();
    const ownedSkinsPromise = supabase_1.supabaseAdmin
        ?.from('owned_skins')
        .select('skin_id')
        .eq('user_id', userId)
        .returns();
    const [profileResult, statsResult, ownedSkinsResult] = await Promise.all([
        profilePromise,
        statsPromise,
        ownedSkinsPromise,
    ]);
    const nickname = profileResult?.data?.nickname?.trim() || fallbackNickname;
    const dailyRewardWins = getActiveDailyRewardWins(statsResult?.data);
    const ownedSkins = (ownedSkinsResult?.data ?? [])
        .map((row) => row.skin_id)
        .filter((skin) => Boolean(skin));
    await (0, achievementService_1.syncAchievementDerivedProgress)({
        userId,
        ownedSkins,
    });
    const achievements = await (0, achievementService_1.listPlayerAchievements)(userId);
    return {
        userId,
        nickname,
        equippedSkin: profileResult?.data?.equipped_skin ?? 'classic',
        equippedBoardSkin: profileResult?.data?.equipped_board_skin ?? 'classic',
        ownedSkins,
        wins: statsResult?.data?.wins ?? 0,
        losses: statsResult?.data?.losses ?? 0,
        tokens: statsResult?.data?.tokens ?? 0,
        dailyRewardWins,
        dailyRewardTokens: dailyRewardWins * DAILY_REWARD_TOKENS_PER_WIN,
        isGuestUser,
        achievements,
    };
}
async function resolvePlayerProfile(auth, fallbackNickname) {
    const normalizedFallback = fallbackNickname.slice(0, 16) || 'Guest';
    if (!supabase_1.supabaseAdmin || !auth?.accessToken) {
        return {
            userId: null,
            nickname: normalizedFallback,
            stats: { wins: 0, losses: 0 },
        };
    }
    const { data: userData, error: userError } = await supabase_1.supabaseAdmin.auth.getUser(auth.accessToken);
    if (userError || !userData.user) {
        return {
            userId: null,
            nickname: normalizedFallback,
            stats: { wins: 0, losses: 0 },
        };
    }
    const userId = userData.user.id;
    const profile = await readAccountProfile(userId, normalizedFallback, userData.user.is_anonymous ?? false);
    return {
        userId,
        nickname: profile.nickname,
        stats: { wins: profile.wins, losses: profile.losses },
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
async function recordMatchmakingResult(winnerUserId, loserUserId) {
    if (!supabase_1.supabaseAdmin || !winnerUserId || !loserUserId)
        return;
    const { data: rows, error } = await supabase_1.supabaseAdmin
        .from('player_stats')
        .select('user_id, wins, losses, tokens, daily_reward_wins, daily_reward_day')
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
        },
    ]));
    const winner = byId.get(winnerUserId) ?? {
        wins: 0,
        losses: 0,
        tokens: 0,
        dailyRewardWins: 0,
        dailyRewardDay: null,
    };
    const loser = byId.get(loserUserId) ?? {
        wins: 0,
        losses: 0,
        tokens: 0,
        dailyRewardWins: 0,
        dailyRewardDay: null,
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
        },
        {
            user_id: loserUserId,
            wins: loser.wins,
            losses: loser.losses + 1,
            tokens: loser.tokens,
            daily_reward_wins: loser.dailyRewardWins,
            daily_reward_day: loser.dailyRewardDay,
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
        .select('user_id, wins, losses, tokens, daily_reward_wins, daily_reward_day')
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
        },
    ]));
    const payload = normalizedUserIds.map((userId) => {
        const current = byId.get(userId) ?? {
            wins: 0,
            losses: 0,
            tokens: 0,
            dailyRewardWins: 0,
            dailyRewardDay: null,
        };
        const activeDailyWins = current.dailyRewardDay === utcDayKey
            ? Math.min(DAILY_REWARD_MAX_WINS, Math.max(0, current.dailyRewardWins))
            : 0;
        const remainingRewardWins = Math.max(0, DAILY_REWARD_MAX_WINS - activeDailyWins);
        const grantedRewardWins = Math.min(rewardWins, remainingRewardWins);
        return {
            user_id: userId,
            wins: current.wins,
            losses: current.losses,
            tokens: current.tokens + grantedRewardWins * DAILY_REWARD_TOKENS_PER_WIN,
            daily_reward_wins: activeDailyWins + grantedRewardWins,
            daily_reward_day: utcDayKey,
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
            equipped_skin: guestSnapshot?.equippedSkin ?? 'classic',
            equipped_board_skin: guestSnapshot?.equippedBoardSkin ?? 'classic',
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
