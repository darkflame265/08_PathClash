import type { PieceSkin } from '../types/game.types';
import { supabaseAdmin } from '../lib/supabase';

export interface AuthPayload {
  accessToken?: string;
  userId?: string;
}

export interface PersistentPlayerProfile {
  userId: string | null;
  nickname: string;
  stats: { wins: number; losses: number };
}

export interface AccountProfile {
  userId: string;
  nickname: string;
  equippedSkin: PieceSkin;
  ownedSkins: PieceSkin[];
  wins: number;
  losses: number;
  tokens: number;
  dailyRewardWins: number;
  dailyRewardTokens: number;
  isGuestUser: boolean;
}

export type ResolveAccountResponse =
  | { status: 'ACCOUNT_OK'; profile: AccountProfile }
  | { status: 'AUTH_REQUIRED' | 'AUTH_INVALID' };

export type FinalizeGoogleUpgradeResponse =
  | { status: 'UPGRADE_OK'; profile: AccountProfile }
  | { status: 'SWITCH_OK'; profile: AccountProfile }
  | { status: 'SWITCH_CONFIRM_REQUIRED'; profile: AccountProfile }
  | { status: 'AUTH_REQUIRED' | 'AUTH_INVALID' | 'UPGRADE_FAILED' };

interface ProfileRow {
  nickname: string | null;
  equipped_skin: PieceSkin | null;
}

interface StatsRow {
  wins: number | null;
  losses: number | null;
  tokens: number | null;
  daily_reward_wins: number | null;
  daily_reward_day: string | null;
}

interface OwnedSkinRow {
  skin_id: PieceSkin | null;
}

const DAILY_REWARD_TOKENS_PER_WIN = 6;
const DAILY_REWARD_MAX_WINS = 20;

function getUtcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function getActiveDailyRewardWins(
  stats: Pick<StatsRow, 'daily_reward_wins' | 'daily_reward_day'> | null | undefined,
  utcDayKey = getUtcDayKey(),
): number {
  if (!stats || stats.daily_reward_day !== utcDayKey) return 0;
  return Math.min(DAILY_REWARD_MAX_WINS, Math.max(0, Number(stats.daily_reward_wins ?? 0)));
}

export async function getUserFromToken(accessToken?: string) {
  if (!supabaseAdmin || !accessToken) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}

async function readAccountProfile(userId: string, fallbackNickname = 'Guest', isGuestUser = false): Promise<AccountProfile> {
  const profilePromise = supabaseAdmin
    ?.from('profiles')
    .select('nickname, equipped_skin')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  const statsPromise = supabaseAdmin
    ?.from('player_stats')
    .select('wins, losses, tokens, daily_reward_wins, daily_reward_day')
    .eq('user_id', userId)
    .maybeSingle<StatsRow>();

  const ownedSkinsPromise = supabaseAdmin
    ?.from('owned_skins')
    .select('skin_id')
    .eq('user_id', userId)
    .returns<OwnedSkinRow[]>();

  const [profileResult, statsResult, ownedSkinsResult] = await Promise.all([
    profilePromise,
    statsPromise,
    ownedSkinsPromise,
  ]);
  const nickname = profileResult?.data?.nickname?.trim() || fallbackNickname;
  const dailyRewardWins = getActiveDailyRewardWins(statsResult?.data);

  return {
    userId,
    nickname,
    equippedSkin: profileResult?.data?.equipped_skin ?? 'classic',
    ownedSkins: (ownedSkinsResult?.data ?? [])
      .map((row) => row.skin_id)
      .filter((skin): skin is PieceSkin => Boolean(skin)),
    wins: statsResult?.data?.wins ?? 0,
    losses: statsResult?.data?.losses ?? 0,
    tokens: statsResult?.data?.tokens ?? 0,
    dailyRewardWins,
    dailyRewardTokens: dailyRewardWins * DAILY_REWARD_TOKENS_PER_WIN,
    isGuestUser,
  };
}

export async function resolvePlayerProfile(
  auth: AuthPayload | undefined,
  fallbackNickname: string,
): Promise<PersistentPlayerProfile> {
  const normalizedFallback = fallbackNickname.slice(0, 16) || 'Guest';

  if (!supabaseAdmin || !auth?.accessToken) {
    return {
      userId: null,
      nickname: normalizedFallback,
      stats: { wins: 0, losses: 0 },
    };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(auth.accessToken);
  if (userError || !userData.user) {
    return {
      userId: null,
      nickname: normalizedFallback,
      stats: { wins: 0, losses: 0 },
    };
  }

  const userId = userData.user.id;
  const profile = await readAccountProfile(
    userId,
    normalizedFallback,
    userData.user.is_anonymous ?? false,
  );

  return {
    userId,
    nickname: profile.nickname,
    stats: { wins: profile.wins, losses: profile.losses },
  };
}

export async function resolveAccount(auth: AuthPayload | undefined): Promise<ResolveAccountResponse> {
  if (!supabaseAdmin || !auth?.accessToken) {
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

export async function recordMatchmakingResult(
  winnerUserId: string | null,
  loserUserId: string | null,
): Promise<void> {
  if (!supabaseAdmin || !winnerUserId || !loserUserId) return;

  const { data: rows, error } = await supabaseAdmin
    .from('player_stats')
    .select('user_id, wins, losses, tokens, daily_reward_wins, daily_reward_day')
    .in('user_id', [winnerUserId, loserUserId]);

  if (error) {
    console.error('[supabase] failed to read player_stats', error);
    return;
  }

  const byId = new Map(
    (rows ?? []).map((row) => [
      row.user_id as string,
      {
        wins: Number(row.wins ?? 0),
        losses: Number(row.losses ?? 0),
        tokens: Number(row.tokens ?? 0),
        dailyRewardWins: Number(row.daily_reward_wins ?? 0),
        dailyRewardDay: row.daily_reward_day ?? null,
      },
    ]),
  );

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

  const { error: upsertError } = await supabaseAdmin.from('player_stats').upsert(
    [
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
    ],
    { onConflict: 'user_id' },
  );

  if (upsertError) {
    console.error('[supabase] failed to upsert player_stats', upsertError);
  }
}

export async function finalizeGoogleUpgrade(
  targetAuth: AuthPayload | undefined,
  guestAuth: AuthPayload | undefined,
  guestSnapshot: {
    nickname: string | null;
    equippedSkin?: PieceSkin;
    wins: number;
    losses: number;
    tokens?: number;
    dailyRewardWins?: number;
  } | undefined,
  flowStartedAt: string | undefined,
  allowExistingSwitch = false,
): Promise<FinalizeGoogleUpgradeResponse> {
  if (!supabaseAdmin || !targetAuth?.accessToken || !guestAuth?.accessToken) {
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
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: targetUser.id,
      nickname: guestSnapshot?.nickname ?? 'Guest',
      equipped_skin: guestSnapshot?.equippedSkin ?? 'classic',
      is_guest: false,
    });

    if (profileError) {
      console.error('[supabase] failed to finalize linked profile', profileError);
      return { status: 'UPGRADE_FAILED' };
    }

    const profile = await readAccountProfile(targetUser.id, guestSnapshot?.nickname ?? 'Guest', false);
    return { status: 'UPGRADE_OK', profile };
  }

  const [targetProfile, guestAccountProfile] = await Promise.all([
    readAccountProfile(targetUser.id, 'Guest', targetUser.is_anonymous ?? false),
    readAccountProfile(guestUser.id, 'Guest', guestUser.is_anonymous ?? false),
  ]);

  const targetCreatedAt = targetUser.created_at ? new Date(targetUser.created_at).getTime() : Number.NaN;
  const startedAt = flowStartedAt ? new Date(flowStartedAt).getTime() : Number.NaN;
  const targetHasExistingData =
    Boolean(targetProfile.nickname && targetProfile.nickname !== 'Guest') ||
    targetProfile.wins > 0 ||
    targetProfile.losses > 0;
  const createdDuringFlow =
    Number.isFinite(targetCreatedAt) &&
    Number.isFinite(startedAt) &&
    targetCreatedAt >= startedAt - 5_000 &&
    targetCreatedAt <= startedAt + 5 * 60_000;

  if (targetHasExistingData || !createdDuringFlow) {
    const profile = await readAccountProfile(targetUser.id, targetProfile.nickname, false);
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
  const adoptedEquippedSkin =
    guestSnapshot?.equippedSkin ?? guestAccountProfile.equippedSkin ?? 'classic';
  const adoptedWins = guestSnapshot?.wins ?? guestAccountProfile.wins;
  const adoptedLosses = guestSnapshot?.losses ?? guestAccountProfile.losses;
  const adoptedTokens = guestSnapshot?.tokens ?? guestAccountProfile.tokens;
  const adoptedDailyRewardWins =
    guestSnapshot?.dailyRewardWins ?? guestAccountProfile.dailyRewardWins;
  const adoptedDailyRewardDay = adoptedDailyRewardWins > 0 ? getUtcDayKey() : null;

  const { error: upsertProfileError } = await supabaseAdmin.from('profiles').upsert({
    id: targetUser.id,
    nickname: adoptedNickname,
    equipped_skin: adoptedEquippedSkin,
    is_guest: false,
  });
  if (upsertProfileError) {
    console.error('[supabase] failed to adopt guest profile', upsertProfileError);
    return { status: 'UPGRADE_FAILED' };
  }

  const { error: upsertStatsError } = await supabaseAdmin.from('player_stats').upsert(
    {
      user_id: targetUser.id,
      wins: adoptedWins,
      losses: adoptedLosses,
      tokens: adoptedTokens,
      daily_reward_wins: adoptedDailyRewardWins,
      daily_reward_day: adoptedDailyRewardDay,
    },
    { onConflict: 'user_id' },
  );
  if (upsertStatsError) {
    console.error('[supabase] failed to adopt guest stats', upsertStatsError);
    return { status: 'UPGRADE_FAILED' };
  }

  const { error: clearGuestStatsError } = await supabaseAdmin.from('player_stats').upsert(
    {
      user_id: guestUser.id,
      wins: 0,
      losses: 0,
      tokens: 0,
      daily_reward_wins: 0,
      daily_reward_day: null,
    },
    { onConflict: 'user_id' },
  );
  if (clearGuestStatsError) {
    console.error('[supabase] failed to clear guest stats after upgrade', clearGuestStatsError);
  }

  if (guestAccountProfile.ownedSkins.length > 0) {
    const { error: mergeOwnedSkinsError } = await supabaseAdmin
      .from('owned_skins')
      .upsert(
        guestAccountProfile.ownedSkins.map((skinId) => ({
          user_id: targetUser.id,
          skin_id: skinId,
        })),
        { onConflict: 'user_id,skin_id' },
      );

    if (mergeOwnedSkinsError) {
      console.error('[supabase] failed to merge owned skins after upgrade', mergeOwnedSkinsError);
    }
  }

  const { error: clearGuestOwnedSkinsError } = await supabaseAdmin
    .from('owned_skins')
    .delete()
    .eq('user_id', guestUser.id);

  if (clearGuestOwnedSkinsError) {
    console.error('[supabase] failed to clear guest owned skins after upgrade', clearGuestOwnedSkinsError);
  }

  const profile = await readAccountProfile(targetUser.id, adoptedNickname, false);
  return {
    status: 'UPGRADE_OK',
    profile,
  };
}
