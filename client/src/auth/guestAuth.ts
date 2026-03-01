import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { connectSocket } from "../socket/socketClient";

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

export interface AccountProfile {
  userId: string;
  nickname: string;
  wins: number;
  losses: number;
  isGuestUser: boolean;
}

export type UpgradeFlowIntent = "link" | "switch" | "merge";

export interface PendingUpgradeContext {
  guestAuth: {
    userId: string;
    accessToken: string;
  };
  guestProfile: {
    nickname: string | null;
    wins: number;
    losses: number;
  };
  intent: UpgradeFlowIntent;
}

export type UpgradeResolution =
  | { kind: "none" }
  | { kind: "link_ok"; profile: AccountProfile }
  | { kind: "link_conflict"; context: PendingUpgradeContext }
  | { kind: "switch_ok"; profile: AccountProfile }
  | { kind: "merge_ok"; profile: AccountProfile }
  | { kind: "merge_error"; message: string }
  | { kind: "auth_error"; message: string };

interface ServerResolveAccountResponse {
  status: "ACCOUNT_OK" | "AUTH_REQUIRED" | "AUTH_INVALID";
  profile?: AccountProfile;
}

interface ServerMergeResponse {
  status:
    | "MERGE_OK"
    | "AUTH_REQUIRED"
    | "AUTH_INVALID"
    | "MERGE_ALREADY_USED"
    | "MERGE_SELF"
    | "MERGE_FAILED";
  profile?: AccountProfile;
}

interface StoredGuestSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

const UPGRADE_CONTEXT_KEY = "pathclash.pendingUpgrade";
const GUEST_SESSION_KEY = "pathclash.guestSession";

function buildRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
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

function saveGuestSession(session: Session | null) {
  if (!session?.user || !session.user.is_anonymous || !session.refresh_token) {
    return;
  }

  const stored: StoredGuestSession = {
    userId: session.user.id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
  window.localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(stored));
}

function getStoredGuestSession(): StoredGuestSession | null {
  const raw = window.localStorage.getItem(GUEST_SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredGuestSession;
  } catch {
    return null;
  }
}

async function ensureProfile(userId: string): Promise<void> {
  if (!supabase) return;

  const { data: existing } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (existing) return;

  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    nickname: null,
    is_guest: true,
  });

  if (error) {
    console.error("[supabase] failed to create profile", error);
  }
}

async function getAccountSnapshot(userId: string): Promise<AccountSnapshot> {
  if (!supabase) {
    return { nickname: null, wins: 0, losses: 0 };
  }

  await ensureProfile(userId);

  const [profileResult, statsResult] = await Promise.all([
    supabase.from("profiles").select("nickname").eq("id", userId).maybeSingle<ProfileRow>(),
    supabase.from("player_stats").select("wins, losses").eq("user_id", userId).maybeSingle<StatsRow>(),
  ]);

  return {
    nickname: profileResult.data?.nickname ?? null,
    wins: statsResult.data?.wins ?? 0,
    losses: statsResult.data?.losses ?? 0,
  };
}

function savePendingUpgradeContext(context: PendingUpgradeContext) {
  window.localStorage.setItem(UPGRADE_CONTEXT_KEY, JSON.stringify(context));
}

export function getPendingUpgradeContext(): PendingUpgradeContext | null {
  const raw = window.localStorage.getItem(UPGRADE_CONTEXT_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PendingUpgradeContext;
  } catch {
    return null;
  }
}

export function clearPendingUpgradeContext() {
  window.localStorage.removeItem(UPGRADE_CONTEXT_KEY);
}

function clearUpgradeQueryFromUrl() {
  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

async function getCurrentSession() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

async function getCurrentAuthPayload() {
  const session = await getCurrentSession();
  if (!session?.user || !session.access_token) return null;
  return {
    userId: session.user.id,
    accessToken: session.access_token,
    isGuestUser: session.user.is_anonymous ?? false,
  };
}

async function emitSocketAck<T>(event: string, payload: unknown): Promise<T> {
  const socket = connectSocket();
  return new Promise((resolve) => {
    socket.emit(event, payload, (response: T) => resolve(response));
  });
}

function mapMergeError(status: ServerMergeResponse["status"]) {
  switch (status) {
    case "MERGE_ALREADY_USED":
      return "이 게스트 계정은 이미 병합이 완료되었습니다.";
    case "MERGE_SELF":
      return "같은 계정끼리는 병합할 수 없습니다.";
    case "AUTH_REQUIRED":
    case "AUTH_INVALID":
      return "인증 상태를 확인한 뒤 다시 시도해주세요.";
    default:
      return "계정 병합에 실패했습니다.";
  }
}

async function restoreGuestSessionOrCreate(): Promise<AuthStatePayload> {
  if (!supabase) {
    return {
      ready: true,
      userId: null,
      accessToken: null,
      isGuestUser: false,
      wins: 0,
      losses: 0,
    };
  }

  const storedGuest = getStoredGuestSession();
  if (storedGuest) {
    const { data, error } = await supabase.auth.setSession({
      access_token: storedGuest.accessToken,
      refresh_token: storedGuest.refreshToken,
    });

    if (!error && data.session?.user?.is_anonymous) {
      saveGuestSession(data.session);
      const snapshot = await getAccountSnapshot(data.session.user.id);
      return toAuthState(data.session, snapshot);
    }
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) {
    console.error("[supabase] failed to create guest session after logout", error);
    return {
      ready: true,
      userId: null,
      accessToken: null,
      isGuestUser: false,
      wins: 0,
      losses: 0,
    };
  }

  saveGuestSession(data.session);
  const snapshot = await getAccountSnapshot(data.session.user.id);
  return toAuthState(data.session, snapshot);
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

  let session = await getCurrentSession();

  if (!session) {
    return restoreGuestSessionOrCreate();
  }

  if (session.user.is_anonymous) {
    saveGuestSession(session);
  }

  const snapshot = await getAccountSnapshot(session.user.id);
  return toAuthState(session, snapshot);
}

export async function refreshAccountSummary(): Promise<Pick<AuthStatePayload, "nickname" | "wins" | "losses">> {
  if (!supabase) {
    return { nickname: null, wins: 0, losses: 0 };
  }

  const session = await getCurrentSession();
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
  const session = await getCurrentSession();

  if (!session?.user) return;

  const { error } = await supabase.from("profiles").upsert({
    id: session.user.id,
    nickname: trimmed,
    is_guest: session.user.is_anonymous ?? false,
  });

  if (error) {
    console.error("[supabase] failed to sync nickname", error);
  }
}

async function startGoogleOAuth(intent: UpgradeFlowIntent): Promise<void> {
  if (!supabase) return;
  const auth = await getCurrentAuthPayload();
  if (!auth) return;

  const snapshot = await refreshAccountSummary();
  if (auth.isGuestUser) {
    const session = await getCurrentSession();
    saveGuestSession(session);
  }

  savePendingUpgradeContext({
    guestAuth: {
      userId: auth.userId,
      accessToken: auth.accessToken,
    },
    guestProfile: {
      nickname: snapshot.nickname ?? null,
      wins: snapshot.wins ?? 0,
      losses: snapshot.losses ?? 0,
    },
    intent,
  });

  const commonOptions = {
    provider: "google" as const,
    options: {
      redirectTo: buildRedirectUrl(),
    },
  };

  if (intent === "link") {
    const { data, error } = await supabase.auth.linkIdentity(commonOptions);
    if (error) {
      console.error("[supabase] failed to link google account", error);
      return;
    }

    if (data?.url) {
      window.location.assign(data.url);
    }
    return;
  }

  const { data, error } = await supabase.auth.signInWithOAuth(commonOptions);
  if (error) {
    console.error("[supabase] failed to sign in with google", error);
    return;
  }

  if (data?.url) {
    window.location.assign(data.url);
  }
}

export async function linkGoogleAccount(): Promise<void> {
  await startGoogleOAuth("link");
}

export async function switchToLinkedGoogleAccount(): Promise<void> {
  await startGoogleOAuth("switch");
}

export async function mergeGuestThenSwitchToGoogleAccount(): Promise<void> {
  await startGoogleOAuth("merge");
}

export async function logoutToGuestMode(): Promise<AuthStatePayload> {
  if (!supabase) {
    return {
      ready: true,
      userId: null,
      accessToken: null,
      isGuestUser: false,
      wins: 0,
      losses: 0,
    };
  }

  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    console.error("[supabase] failed to sign out current session", error);
  }

  clearUpgradeQueryFromUrl();
  return restoreGuestSessionOrCreate();
}

export async function resolveUpgradeFlowAfterRedirect(): Promise<UpgradeResolution> {
  const pending = getPendingUpgradeContext();
  if (!pending) return { kind: "none" };

  const url = new URL(window.location.href);
  const errorCode =
    url.searchParams.get("error_code") ??
    url.hash.match(/error_code=([^&]+)/)?.[1] ??
    null;

  if (errorCode === "identity_already_exists") {
    clearUpgradeQueryFromUrl();
    return {
      kind: "link_conflict",
      context: pending,
    };
  }

  const auth = await getCurrentAuthPayload();
  if (!auth) {
    return { kind: "auth_error", message: "로그인 상태를 확인할 수 없습니다." };
  }

  const accountSync = await emitSocketAck<ServerResolveAccountResponse>("account_sync", {
    auth: await getSocketAuthPayload(),
  });

  if (accountSync.status !== "ACCOUNT_OK" || !accountSync.profile) {
    return { kind: "auth_error", message: "계정 정보를 불러오지 못했습니다." };
  }

  if (pending.intent === "link") {
    clearPendingUpgradeContext();
    clearUpgradeQueryFromUrl();
    return {
      kind: "link_ok",
      profile: accountSync.profile,
    };
  }

  if (pending.intent === "switch") {
    clearPendingUpgradeContext();
    clearUpgradeQueryFromUrl();
    return {
      kind: "switch_ok",
      profile: accountSync.profile,
    };
  }

  const mergeResult = await emitSocketAck<ServerMergeResponse>("merge_guest_account", {
    auth: await getSocketAuthPayload(),
    guestAuth: pending.guestAuth,
  });

  clearPendingUpgradeContext();
  clearUpgradeQueryFromUrl();

  if (mergeResult.status !== "MERGE_OK" || !mergeResult.profile) {
    return {
      kind: "merge_error",
      message: mapMergeError(mergeResult.status),
    };
  }

  return {
    kind: "merge_ok",
    profile: mergeResult.profile,
  };
}

export function getSocketAuthPayload() {
  if (!supabase) return undefined;
  const session = supabase.auth.getSession();
  return session.then(({ data }) => ({
    accessToken: data.session?.access_token,
    userId: data.session?.user.id,
  }));
}

export function onAuthStateChanged(callback: (payload: AuthStatePayload) => void): () => void {
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
      if (session?.user?.is_anonymous) {
        saveGuestSession(session);
      }

      const snapshot = session?.user
        ? await getAccountSnapshot(session.user.id)
        : undefined;
      callback(toAuthState(session, snapshot));
    })();
  });

  return () => subscription.unsubscribe();
}
