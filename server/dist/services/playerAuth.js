"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePlayerProfile = resolvePlayerProfile;
exports.resolveAccount = resolveAccount;
exports.recordMatchmakingResult = recordMatchmakingResult;
exports.mergeGuestIntoAccount = mergeGuestIntoAccount;
const supabase_1 = require("../lib/supabase");
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
        .select('nickname')
        .eq('id', userId)
        .maybeSingle();
    const statsPromise = supabase_1.supabaseAdmin
        ?.from('player_stats')
        .select('wins, losses')
        .eq('user_id', userId)
        .maybeSingle();
    const [profileResult, statsResult] = await Promise.all([profilePromise, statsPromise]);
    const nickname = profileResult?.data?.nickname?.trim() || fallbackNickname;
    return {
        userId,
        nickname,
        wins: statsResult?.data?.wins ?? 0,
        losses: statsResult?.data?.losses ?? 0,
        isGuestUser,
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
        .select('user_id, wins, losses')
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
        },
    ]));
    const winner = byId.get(winnerUserId) ?? { wins: 0, losses: 0 };
    const loser = byId.get(loserUserId) ?? { wins: 0, losses: 0 };
    const { error: upsertError } = await supabase_1.supabaseAdmin.from('player_stats').upsert([
        {
            user_id: winnerUserId,
            wins: winner.wins + 1,
            losses: winner.losses,
        },
        {
            user_id: loserUserId,
            wins: loser.wins,
            losses: loser.losses + 1,
        },
    ], { onConflict: 'user_id' });
    if (upsertError) {
        console.error('[supabase] failed to upsert player_stats', upsertError);
    }
}
async function mergeGuestIntoAccount(targetAuth, guestAuth) {
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
        return { status: 'MERGE_SELF' };
    }
    const { data: existingMerge } = await supabase_1.supabaseAdmin
        .from('account_merges')
        .select('source_user_id')
        .eq('source_user_id', guestUser.id)
        .maybeSingle();
    if (existingMerge) {
        return { status: 'MERGE_ALREADY_USED' };
    }
    const [targetProfile, guestProfile] = await Promise.all([
        readAccountProfile(targetUser.id, 'Guest', targetUser.is_anonymous ?? false),
        readAccountProfile(guestUser.id, 'Guest', guestUser.is_anonymous ?? false),
    ]);
    const mergedWins = targetProfile.wins + guestProfile.wins;
    const mergedLosses = targetProfile.losses + guestProfile.losses;
    const mergedNickname = targetProfile.nickname || guestProfile.nickname;
    const { error: upsertProfileError } = await supabase_1.supabaseAdmin.from('profiles').upsert({
        id: targetUser.id,
        nickname: mergedNickname,
        is_guest: false,
    });
    if (upsertProfileError) {
        console.error('[supabase] failed to upsert merged profile', upsertProfileError);
        return { status: 'MERGE_FAILED' };
    }
    const { error: upsertStatsError } = await supabase_1.supabaseAdmin.from('player_stats').upsert({
        user_id: targetUser.id,
        wins: mergedWins,
        losses: mergedLosses,
    }, { onConflict: 'user_id' });
    if (upsertStatsError) {
        console.error('[supabase] failed to upsert merged stats', upsertStatsError);
        return { status: 'MERGE_FAILED' };
    }
    const { error: auditError } = await supabase_1.supabaseAdmin.from('account_merges').insert({
        source_user_id: guestUser.id,
        target_user_id: targetUser.id,
        merged_wins: guestProfile.wins,
        merged_losses: guestProfile.losses,
    });
    if (auditError) {
        console.error('[supabase] failed to write merge audit', auditError);
        return { status: 'MERGE_FAILED' };
    }
    const { error: clearStatsError } = await supabase_1.supabaseAdmin.from('player_stats').upsert({
        user_id: guestUser.id,
        wins: 0,
        losses: 0,
    }, { onConflict: 'user_id' });
    if (clearStatsError) {
        console.error('[supabase] failed to clear guest stats after merge', clearStatsError);
    }
    const profile = await readAccountProfile(targetUser.id, mergedNickname, false);
    return {
        status: 'MERGE_OK',
        profile,
    };
}
