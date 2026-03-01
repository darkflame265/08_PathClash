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
  wins: number;
  losses: number;
  isGuestUser: boolean;
}

export type ResolveAccountResponse =
  | { status: 'ACCOUNT_OK'; profile: AccountProfile }
  | { status: 'AUTH_REQUIRED' | 'AUTH_INVALID' };

export type FinalizeGoogleUpgradeResponse =
  | { status: 'UPGRADE_OK'; profile: AccountProfile }
  | { status: 'SWITCH_OK'; profile: AccountProfile }
  | { status: 'AUTH_REQUIRED' | 'AUTH_INVALID' | 'UPGRADE_FAILED' };

interface ProfileRow {
  nickname: string | null;
}

interface StatsRow {
  wins: number | null;
  losses: number | null;
}

async function getUserFromToken(accessToken?: string) {
  if (!supabaseAdmin || !accessToken) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}

async function readAccountProfile(userId: string, fallbackNickname = 'Guest', isGuestUser = false): Promise<AccountProfile> {
  const profilePromise = supabaseAdmin
    ?.from('profiles')
    .select('nickname')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  const statsPromise = supabaseAdmin
    ?.from('player_stats')
    .select('wins, losses')
    .eq('user_id', userId)
    .maybeSingle<StatsRow>();

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
    .select('user_id, wins, losses')
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
      },
    ]),
  );

  const winner = byId.get(winnerUserId) ?? { wins: 0, losses: 0 };
  const loser = byId.get(loserUserId) ?? { wins: 0, losses: 0 };

  const { error: upsertError } = await supabaseAdmin.from('player_stats').upsert(
    [
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
  guestSnapshot: { nickname: string | null; wins: number; losses: number } | undefined,
  flowStartedAt: string | undefined,
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
    return {
      status: 'SWITCH_OK',
      profile,
    };
  }

  const adoptedNickname = guestSnapshot?.nickname ?? guestAccountProfile.nickname ?? 'Guest';
  const adoptedWins = guestSnapshot?.wins ?? guestAccountProfile.wins;
  const adoptedLosses = guestSnapshot?.losses ?? guestAccountProfile.losses;

  const { error: upsertProfileError } = await supabaseAdmin.from('profiles').upsert({
    id: targetUser.id,
    nickname: adoptedNickname,
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
    },
    { onConflict: 'user_id' },
  );
  if (clearGuestStatsError) {
    console.error('[supabase] failed to clear guest stats after upgrade', clearGuestStatsError);
  }

  const profile = await readAccountProfile(targetUser.id, adoptedNickname, false);
  return {
    status: 'UPGRADE_OK',
    profile,
  };
}
