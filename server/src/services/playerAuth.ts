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

interface ProfileRow {
  nickname: string | null;
}

interface StatsRow {
  wins: number | null;
  losses: number | null;
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
  const profilePromise = supabaseAdmin
    .from('profiles')
    .select('nickname')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  const statsPromise = supabaseAdmin
    .from('player_stats')
    .select('wins, losses')
    .eq('user_id', userId)
    .maybeSingle<StatsRow>();

  const [profileResult, statsResult] = await Promise.all([profilePromise, statsPromise]);

  const nickname = profileResult.data?.nickname?.trim() || normalizedFallback;
  const wins = statsResult.data?.wins ?? 0;
  const losses = statsResult.data?.losses ?? 0;

  return {
    userId,
    nickname,
    stats: { wins, losses },
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
