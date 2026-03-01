import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export interface AuthStatePayload {
  ready: boolean;
  userId: string | null;
  accessToken: string | null;
  isGuestUser: boolean;
  nickname?: string | null;
  wins?: number;
  losses?: number;
}

interface ProfileRow {
  nickname: string | null;
}

interface StatsRow {
  wins: number | null;
  losses: number | null;
}

interface AccountSnapshot {
  nickname: string | null;
  wins: number;
  losses: number;
}

function toAuthState(session: Session | null, snapshot?: AccountSnapshot): AuthStatePayload {
  return {
    ready: true,
    userId: session?.user.id ?? null,
    accessToken: session?.access_token ?? null,
    isGuestUser: session?.user.is_anonymous ?? false,
    nickname: snapshot?.nickname ?? undefined,
    wins: snapshot?.wins ?? 0,
    losses: snapshot?.losses ?? 0,
  };
}

async function ensureProfile(userId: string): Promise<void> {
  if (!supabase) return;

  const { data: existing } = await supabase
    .from('profiles')
    .select('nickname')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  if (existing) return;

  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    nickname: null,
    is_guest: true,
  });

  if (error) {
    console.error('[supabase] failed to create profile', error);
  }
}

async function getAccountSnapshot(userId: string): Promise<AccountSnapshot> {
  if (!supabase) {
    return { nickname: null, wins: 0, losses: 0 };
  }

  await ensureProfile(userId);

  const [profileResult, statsResult] = await Promise.all([
    supabase.from('profiles').select('nickname').eq('id', userId).maybeSingle<ProfileRow>(),
    supabase.from('player_stats').select('wins, losses').eq('user_id', userId).maybeSingle<StatsRow>(),
  ]);

  return {
    nickname: profileResult.data?.nickname ?? null,
    wins: statsResult.data?.wins ?? 0,
    losses: statsResult.data?.losses ?? 0,
  };
}

export async function initializeGuestAuth(): Promise<AuthStatePayload> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ready: true,
      userId: null,
      accessToken: null,
      isGuestUser: false,
      wins: 0,
      losses: 0,
    };
  }

  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('[supabase] anonymous sign-in failed', error);
      return {
        ready: true,
        userId: null,
        accessToken: null,
        isGuestUser: false,
        wins: 0,
        losses: 0,
      };
    }
    session = data.session;
  }

  const snapshot = session?.user ? await getAccountSnapshot(session.user.id) : undefined;
  return toAuthState(session, snapshot);
}

export async function refreshAccountSummary(): Promise<Pick<AuthStatePayload, 'nickname' | 'wins' | 'losses'>> {
  if (!supabase) {
    return { nickname: null, wins: 0, losses: 0 };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return { nickname: null, wins: 0, losses: 0 };
  }

  const snapshot = await getAccountSnapshot(session.user.id);
  return {
    nickname: snapshot.nickname,
    wins: snapshot.wins,
    losses: snapshot.losses,
  };
}

export async function syncNickname(nickname: string): Promise<void> {
  if (!supabase) return;
  const trimmed = nickname.trim().slice(0, 16) || null;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return;

  const { error } = await supabase.from('profiles').upsert({
    id: session.user.id,
    nickname: trimmed,
    is_guest: session.user.is_anonymous ?? false,
  });

  if (error) {
    console.error('[supabase] failed to sync nickname', error);
  }
}

export function getSocketAuthPayload() {
  if (!supabase) return undefined;
  const session = supabase.auth.getSession();
  return session.then(({ data }) => ({
    accessToken: data.session?.access_token,
    userId: data.session?.user.id,
  }));
}

export function onAuthStateChanged(
  callback: (payload: AuthStatePayload) => void,
): () => void {
  if (!supabase) {
    callback({
      ready: true,
      userId: null,
      accessToken: null,
      isGuestUser: false,
      wins: 0,
      losses: 0,
    });
    return () => {};
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    void (async () => {
      const snapshot = session?.user ? await getAccountSnapshot(session.user.id) : undefined;
      callback(toAuthState(session, snapshot));
    })();
  });

  return () => subscription.unsubscribe();
}
