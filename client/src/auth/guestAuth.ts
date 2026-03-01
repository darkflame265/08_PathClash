import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface AuthStatePayload {
  ready: boolean;
  userId: string | null;
  accessToken: string | null;
  isGuestUser: boolean;
  nickname?: string | null;
}

interface ProfileRow {
  nickname: string | null;
}

function toAuthState(session: Session | null, nickname?: string | null): AuthStatePayload {
  return {
    ready: true,
    userId: session?.user.id ?? null,
    accessToken: session?.access_token ?? null,
    isGuestUser: session?.user.is_anonymous ?? false,
    nickname,
  };
}

async function ensureProfile(userId: string): Promise<string | null> {
  if (!supabase) return null;

  const { data: existing } = await supabase
    .from('profiles')
    .select('nickname')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  if (existing) {
    return existing.nickname;
  }

  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    nickname: null,
    is_guest: true,
  });

  if (error) {
    console.error('[supabase] failed to create profile', error);
  }

  return null;
}

export async function initializeGuestAuth(): Promise<AuthStatePayload> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ready: true,
      userId: null,
      accessToken: null,
      isGuestUser: false,
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
      };
    }
    session = data.session;
  }

  const nickname = session?.user ? await ensureProfile(session.user.id) : null;
  return toAuthState(session, nickname);
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
    });
    return () => {};
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(toAuthState(session));
  });

  return () => subscription.unsubscribe();
}
