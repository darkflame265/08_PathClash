import type { Session } from "@supabase/supabase-js";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { connectSocket } from "../socket/socketClient";
import type { PieceSkin } from "../types/game.types";

export interface AuthStatePayload {
  ready: boolean;
  userId: string | null;
  accessToken: string | null;
  isGuestUser: boolean;
  nickname?: string | null;
  equippedSkin?: PieceSkin;
  ownedSkins?: PieceSkin[];
  wins?: number;
  losses?: number;
  tokens?: number;
  dailyRewardWins?: number;
  dailyRewardTokens?: number;
  achievements?: PlayerAchievementState[];
}

interface ProfileRow {
  nickname: string | null;
  equipped_skin: PieceSkin | null;
  legal_consent_version?: string | null;
  legal_consented_at?: string | null;
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

interface PlayerAchievementRow {
  achievement_id: string;
  progress: number | null;
  completed: boolean | null;
  claimed: boolean | null;
  completed_at: string | null;
  claimed_at: string | null;
}

export interface PlayerAchievementState {
  achievementId: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
  completedAt: string | null;
  claimedAt: string | null;
}

export interface LegalConsentRecord {
  version: string | null;
  consentedAt: string | null;
}

interface AccountSnapshot {
  nickname: string | null;
  equippedSkin: PieceSkin;
  ownedSkins: PieceSkin[];
  wins: number;
  losses: number;
  tokens: number;
  dailyRewardWins: number;
  dailyRewardTokens: number;
  achievements: PlayerAchievementState[];
}

interface AccountSnapshotRpcRow {
  nickname?: string | null;
  equippedSkin?: PieceSkin | null;
  ownedSkins?: string[] | null;
  wins?: number | null;
  losses?: number | null;
  tokens?: number | null;
  dailyRewardWins?: number | null;
  dailyRewardTokens?: number | null;
  achievements?: Array<{
    achievementId?: string | null;
    progress?: number | null;
    completed?: boolean | null;
    claimed?: boolean | null;
    completedAt?: string | null;
    claimedAt?: string | null;
  }> | null;
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
  achievements: PlayerAchievementState[];
}

export interface PendingUpgradeContext {
  guestAuth: {
    userId: string;
    accessToken: string;
  };
  guestProfile: {
    nickname: string | null;
    equippedSkin: PieceSkin;
    wins: number;
    losses: number;
    tokens: number;
    dailyRewardWins: number;
    dailyRewardTokens: number;
  };
  flowStartedAt: string;
}

export type UpgradeResolution =
  | { kind: "none" }
  | { kind: "upgrade_ok"; profile: AccountProfile }
  | { kind: "switch_ok"; profile: AccountProfile }
  | { kind: "switch_confirm_required"; profile: AccountProfile }
  | { kind: "auth_error" };

interface ServerFinalizeUpgradeResponse {
  status:
    | "UPGRADE_OK"
    | "SWITCH_OK"
    | "SWITCH_CONFIRM_REQUIRED"
    | "AUTH_REQUIRED"
    | "AUTH_INVALID"
    | "UPGRADE_FAILED";
  profile?: AccountProfile;
}

interface ServerAccountResponse {
  status: "ACCOUNT_OK" | "AUTH_REQUIRED" | "AUTH_INVALID" | "UPDATE_REQUIRED";
  profile?: AccountProfile;
}

const DAILY_REWARD_TOKENS_PER_WIN = 6;
const DAILY_REWARD_MAX_WINS = 20;
const ACCOUNT_SNAPSHOT_CACHE_TTL_MS = 3000;

const knownProfileUsers = new Set<string>();
const accountSnapshotCache = new Map<
  string,
  { snapshot: AccountSnapshot; fetchedAt: number }
>();
const accountSnapshotInFlight = new Map<string, Promise<AccountSnapshot>>();
const lastSyncedProfileState = new Map<
  string,
  {
    nickname?: string | null;
    equippedSkin?: PieceSkin;
    legalConsentVersion?: string | null;
    legalConsentedAt?: string | null;
  }
>();

function getUtcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function getActiveDailyRewardWins(
  stats: Pick<StatsRow, "daily_reward_wins" | "daily_reward_day"> | undefined,
): number {
  if (!stats || stats.daily_reward_day !== getUtcDayKey()) return 0;
  return Math.min(DAILY_REWARD_MAX_WINS, Math.max(0, Number(stats.daily_reward_wins ?? 0)));
}

interface StoredGuestSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

const UPGRADE_CONTEXT_KEY = "pathclash.pendingUpgrade";
const GUEST_SESSION_KEY = "pathclash.guestSession";

function getNativeRedirectUrl() {
  return import.meta.env.VITE_NATIVE_REDIRECT_URL?.trim() || "com.pathclash.game://auth/callback";
}

function getConfiguredAppUrl(): string | null {
  const raw = import.meta.env.VITE_APP_URL?.trim();
  if (!raw) return null;

  try {
    return new URL(raw).origin;
  } catch {
    console.warn("[auth] invalid VITE_APP_URL, falling back to current origin");
    return null;
  }
}

function buildRedirectUrl() {
  if (Capacitor.isNativePlatform()) {
    return getNativeRedirectUrl();
  }
  const origin = getConfiguredAppUrl() ?? window.location.origin;
  return `${origin}${window.location.pathname}`;
}

function parseUrlSession(rawUrl: string) {
  const url = new URL(rawUrl);
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const queryParams = new URLSearchParams(url.search);

  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const code = queryParams.get("code");

  return { accessToken, refreshToken, code };
}

async function applyAuthCallbackUrl(rawUrl: string) {
  if (!supabase) return;

  try {
    const { accessToken, refreshToken, code } = parseUrlSession(rawUrl);

    if (accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return;
    }

    if (code) {
      await supabase.auth.exchangeCodeForSession(code);
    }
  } catch (error) {
    console.error("[auth] failed to handle native auth callback", error);
  }
}

export async function installNativeAuthCallbackHandler(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};

  const launch = await CapacitorApp.getLaunchUrl();
  if (launch?.url) {
    await applyAuthCallbackUrl(launch.url);
  }

  const listener: PluginListenerHandle = await CapacitorApp.addListener("appUrlOpen", (event) => {
    void applyAuthCallbackUrl(event.url);
  });

  return () => {
    void listener.remove();
  };
}

function toAuthState(session: Session | null, snapshot?: AccountSnapshot): AuthStatePayload {
  return {
    ready: true,
    userId: session?.user.id ?? null,
    accessToken: session?.access_token ?? null,
    isGuestUser: session?.user.is_anonymous ?? false,
    nickname: snapshot?.nickname ?? undefined,
    equippedSkin: snapshot?.equippedSkin,
    ownedSkins: snapshot?.ownedSkins,
    wins: snapshot?.wins,
    losses: snapshot?.losses,
    tokens: snapshot?.tokens,
    dailyRewardWins: snapshot?.dailyRewardWins,
    dailyRewardTokens: snapshot?.dailyRewardTokens,
    achievements: snapshot?.achievements,
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
  if (knownProfileUsers.has(userId)) return;

  const { data: existing } = await supabase
    .from("profiles")
    .select("nickname, equipped_skin")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (existing) {
    knownProfileUsers.add(userId);
    const current = lastSyncedProfileState.get(userId) ?? {};
    lastSyncedProfileState.set(userId, {
      ...current,
      nickname: existing.nickname ?? null,
      equippedSkin: existing.equipped_skin ?? "classic",
    });
    return;
  }

  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    nickname: null,
    is_guest: true,
  });

  if (error) {
    console.error("[supabase] failed to create profile", error);
    return;
  }

  knownProfileUsers.add(userId);
  const current = lastSyncedProfileState.get(userId) ?? {};
  lastSyncedProfileState.set(userId, {
    ...current,
    nickname: null,
    equippedSkin: "classic",
  });
}

function readCachedAccountSnapshot(userId: string): AccountSnapshot | null {
  const cached = accountSnapshotCache.get(userId);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > ACCOUNT_SNAPSHOT_CACHE_TTL_MS) {
    accountSnapshotCache.delete(userId);
    return null;
  }
  return cached.snapshot;
}

function cacheAccountSnapshot(userId: string, snapshot: AccountSnapshot) {
  accountSnapshotCache.set(userId, { snapshot, fetchedAt: Date.now() });
  knownProfileUsers.add(userId);
  const current = lastSyncedProfileState.get(userId) ?? {};
  lastSyncedProfileState.set(userId, {
    ...current,
    nickname: snapshot.nickname,
    equippedSkin: snapshot.equippedSkin,
  });
}

function invalidateAccountSnapshot(userId: string) {
  accountSnapshotCache.delete(userId);
}

function normalizeAccountSnapshot(
  source: AccountSnapshotRpcRow | null | undefined,
): AccountSnapshot {
  return {
    nickname: source?.nickname ?? null,
    equippedSkin: source?.equippedSkin ?? "classic",
    ownedSkins: (source?.ownedSkins ?? []).filter(
      (skin): skin is PieceSkin => Boolean(skin),
    ),
    wins: Number(source?.wins ?? 0),
    losses: Number(source?.losses ?? 0),
    tokens: Number(source?.tokens ?? 0),
    dailyRewardWins: Number(source?.dailyRewardWins ?? 0),
    dailyRewardTokens: Number(source?.dailyRewardTokens ?? 0),
    achievements: (source?.achievements ?? [])
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => ({
        achievementId: row.achievementId ?? "",
        progress: Number(row.progress ?? 0),
        completed: Boolean(row.completed),
        claimed: Boolean(row.claimed),
        completedAt: row.completedAt ?? null,
        claimedAt: row.claimedAt ?? null,
      }))
      .filter((row) => row.achievementId.length > 0),
  };
}

async function getAccountSnapshot(userId: string, options?: { force?: boolean }): Promise<AccountSnapshot> {
  if (!supabase) {
    return {
      nickname: null,
      equippedSkin: "classic",
      ownedSkins: [],
      wins: 0,
      losses: 0,
      tokens: 0,
      dailyRewardWins: 0,
      dailyRewardTokens: 0,
      achievements: [],
    };
  }

  const cachedSnapshot = options?.force ? null : readCachedAccountSnapshot(userId);
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  if (options?.force) {
    invalidateAccountSnapshot(userId);
  }

  const existingInFlight = options?.force ? undefined : accountSnapshotInFlight.get(userId);
  if (existingInFlight) {
    return existingInFlight;
  }

  const fetchPromise = (async () => {
    const { data: snapshotRpc, error: snapshotRpcError } = await supabase.rpc(
      "get_account_snapshot",
      {
        target_user_id: userId,
      },
    );

    if (!snapshotRpcError && snapshotRpc) {
      const snapshot = normalizeAccountSnapshot(
        snapshotRpc as AccountSnapshotRpcRow,
      );
      cacheAccountSnapshot(userId, snapshot);
      return snapshot;
    }

    let [profileResult, statsResult, achievementsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("nickname, equipped_skin")
        .eq("id", userId)
        .maybeSingle<ProfileRow>(),
      supabase
        .from("player_stats")
        .select("wins, losses, tokens, daily_reward_wins, daily_reward_day")
        .eq("user_id", userId)
        .maybeSingle<StatsRow>(),
      supabase
        .from("player_achievements")
        .select("achievement_id, progress, completed, claimed, completed_at, claimed_at")
        .eq("user_id", userId)
        .returns<PlayerAchievementRow[]>(),
    ]);
    const { data: ownedSkinRows } = await supabase
      .from("owned_skins")
      .select("skin_id")
      .eq("user_id", userId)
      .returns<OwnedSkinRow[]>();

    if (!profileResult.data) {
      await ensureProfile(userId);
      profileResult = await supabase
        .from("profiles")
        .select("nickname, equipped_skin")
        .eq("id", userId)
        .maybeSingle<ProfileRow>();
    }

    const dailyRewardWins = getActiveDailyRewardWins(statsResult.data ?? undefined);

    const snapshot = {
      nickname: profileResult.data?.nickname ?? null,
      equippedSkin: profileResult.data?.equipped_skin ?? "classic",
      ownedSkins: (ownedSkinRows ?? [])
        .map((row) => row.skin_id)
        .filter((skin): skin is PieceSkin => Boolean(skin)),
      wins: statsResult.data?.wins ?? 0,
      losses: statsResult.data?.losses ?? 0,
      tokens: statsResult.data?.tokens ?? 0,
      dailyRewardWins,
      dailyRewardTokens: dailyRewardWins * DAILY_REWARD_TOKENS_PER_WIN,
      achievements: (achievementsResult.data ?? []).map((row) => ({
        achievementId: row.achievement_id,
        progress: Number(row.progress ?? 0),
        completed: Boolean(row.completed),
        claimed: Boolean(row.claimed),
        completedAt: row.completed_at ?? null,
        claimedAt: row.claimed_at ?? null,
      })),
    } satisfies AccountSnapshot;

    cacheAccountSnapshot(userId, snapshot);
    return snapshot;
  })();

  accountSnapshotInFlight.set(userId, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    accountSnapshotInFlight.delete(userId);
  }
}

function savePendingUpgradeContext(context: PendingUpgradeContext) {
  window.localStorage.setItem(UPGRADE_CONTEXT_KEY, JSON.stringify(context));
}

function getPendingUpgradeContext(): PendingUpgradeContext | null {
  const raw = window.localStorage.getItem(UPGRADE_CONTEXT_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PendingUpgradeContext;
  } catch {
    return null;
  }
}

function clearPendingUpgradeContext() {
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

async function restoreGuestSessionOrCreate(): Promise<AuthStatePayload> {
  if (!supabase) {
    return {
      ready: true,
      userId: null,
      accessToken: null,
      isGuestUser: false,
      wins: 0,
      losses: 0,
      tokens: 0,
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
      const snapshot = readCachedAccountSnapshot(data.session.user.id) ?? undefined;
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
      tokens: 0,
    };
  }

  saveGuestSession(data.session);
  await ensureProfile(data.session.user.id);
  const snapshot = readCachedAccountSnapshot(data.session.user.id) ?? undefined;
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
      tokens: 0,
    };
  }

  const session = await getCurrentSession();

  if (!session) {
    return restoreGuestSessionOrCreate();
  }

  if (session.user.is_anonymous) {
    saveGuestSession(session);
  }

  const snapshot = readCachedAccountSnapshot(session.user.id) ?? undefined;
  return toAuthState(session, snapshot);
}

export async function refreshAccountSummary(options?: { force?: boolean }): Promise<
  Pick<
    AuthStatePayload,
    | "nickname"
    | "equippedSkin"
    | "ownedSkins"
    | "wins"
    | "losses"
    | "tokens"
    | "dailyRewardWins"
    | "dailyRewardTokens"
    | "achievements"
  >
> {
  if (!supabase) {
    return {
      nickname: null,
      equippedSkin: "classic",
      ownedSkins: [],
      wins: 0,
      losses: 0,
      tokens: 0,
      dailyRewardWins: 0,
      dailyRewardTokens: 0,
      achievements: [],
    };
  }

  const session = await getCurrentSession();
  if (!session?.user) {
    return {
      nickname: null,
      equippedSkin: "classic",
      ownedSkins: [],
      wins: 0,
      losses: 0,
      tokens: 0,
      dailyRewardWins: 0,
      dailyRewardTokens: 0,
      achievements: [],
    };
  }

  const snapshot = await getAccountSnapshot(session.user.id, options);
  return {
    nickname: snapshot.nickname,
    equippedSkin: snapshot.equippedSkin,
    ownedSkins: snapshot.ownedSkins,
    wins: snapshot.wins,
    losses: snapshot.losses,
    tokens: snapshot.tokens,
    dailyRewardWins: snapshot.dailyRewardWins,
    dailyRewardTokens: snapshot.dailyRewardTokens,
    achievements: snapshot.achievements,
  };
}

export async function syncNickname(nickname: string): Promise<void> {
  if (!supabase) return;
  const trimmed = nickname.trim().slice(0, 16) || null;
  const session = await getCurrentSession();

  if (!session?.user) return;
  const userId = session.user.id;
  const current = lastSyncedProfileState.get(userId);
  if (current?.nickname === trimmed) return;

  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    nickname: trimmed,
    is_guest: session.user.is_anonymous ?? false,
  });

  if (error) {
    console.error("[supabase] failed to sync nickname", error);
    return;
  }

  invalidateAccountSnapshot(userId);
  lastSyncedProfileState.set(userId, {
    ...(current ?? {}),
    nickname: trimmed,
  });
  knownProfileUsers.add(userId);
}

export async function syncEquippedSkin(equippedSkin: PieceSkin): Promise<void> {
  if (!supabase) return;
  const session = await getCurrentSession();

  if (!session?.user) return;
  const userId = session.user.id;
  const current = lastSyncedProfileState.get(userId);
  if (current?.equippedSkin === equippedSkin) return;

  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    equipped_skin: equippedSkin,
    is_guest: session.user.is_anonymous ?? false,
  });

  if (error) {
    console.error("[supabase] failed to sync equipped skin", error);
    return;
  }

  invalidateAccountSnapshot(userId);
  lastSyncedProfileState.set(userId, {
    ...(current ?? {}),
    equippedSkin,
  });
  knownProfileUsers.add(userId);
}

export async function purchaseSkinWithTokens(
  skinId: PieceSkin,
): Promise<"purchased" | "already_owned" | "insufficient_tokens" | "auth_required" | "failed"> {
  if (!supabase) return "failed";

  const { data, error } = await supabase.rpc("purchase_skin_with_tokens", {
    p_skin_id: skinId,
  });

  if (error) {
    console.error("[supabase] failed to purchase skin", error);
    return "failed";
  }

  if (data === "PURCHASED") return "purchased";
  if (data === "ALREADY_OWNED") return "already_owned";
  if (data === "INSUFFICIENT_TOKENS") return "insufficient_tokens";
  if (data === "AUTH_REQUIRED") return "auth_required";
  return "failed";
}

export async function claimAchievementReward(
  achievementId: string,
): Promise<AccountProfile | null> {
  const response = await emitSocketAck<ServerAccountResponse>("achievements_claim", {
    auth: await getSocketAuthPayload(),
    achievementId,
  });

  return response.status === "ACCOUNT_OK" && response.profile
    ? response.profile
    : null;
}

export async function claimAllAchievementRewards(): Promise<AccountProfile | null> {
  const response = await emitSocketAck<ServerAccountResponse>("achievements_claim_all", {
    auth: await getSocketAuthPayload(),
  });

  return response.status === "ACCOUNT_OK" && response.profile
    ? response.profile
    : null;
}

export async function syncAchievementSettings(args: {
  isMusicMuted: boolean;
  isSfxMuted: boolean;
  musicVolume: number;
  sfxVolume: number;
}): Promise<AccountProfile | null> {
  const response = await emitSocketAck<
    | { ok: true; status: "ACCOUNT_OK"; profile: AccountProfile }
    | { ok: true; status: "AUTH_REQUIRED" | "AUTH_INVALID" | "UPDATE_REQUIRED" }
  >("achievements_sync_settings", {
    auth: await getSocketAuthPayload(),
    isMusicMuted: args.isMusicMuted,
    isSfxMuted: args.isSfxMuted,
    musicVolumePercent: Math.round(args.musicVolume * 100),
    sfxVolumePercent: Math.round(args.sfxVolume * 100),
  });

  return response.status === "ACCOUNT_OK" ? response.profile : null;
}

export async function fetchLegalConsentRecord(): Promise<LegalConsentRecord | null> {
  if (!supabase) return null;

  const session = await getCurrentSession();
  if (!session?.user) return null;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("legal_consent_version, legal_consented_at")
      .eq("id", session.user.id)
      .maybeSingle<ProfileRow>();

    if (error) {
      console.warn("[supabase] failed to fetch legal consent record", error);
      return null;
    }

    return {
      version: data?.legal_consent_version ?? null,
      consentedAt: data?.legal_consented_at ?? null,
    };
  } catch (error) {
    console.warn("[supabase] legal consent columns unavailable", error);
    return null;
  }
}

export async function syncLegalConsent(args: {
  version: string;
  consentedAt: string;
}): Promise<void> {
  if (!supabase) return;

  const session = await getCurrentSession();
  if (!session?.user) return;
  const userId = session.user.id;
  const current = lastSyncedProfileState.get(userId);
  if (
    current?.legalConsentVersion === args.version &&
    current?.legalConsentedAt === args.consentedAt
  ) {
    return;
  }

  try {
    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      is_guest: session.user.is_anonymous ?? false,
      legal_consent_version: args.version,
      legal_consented_at: args.consentedAt,
    });

    if (error) {
      console.warn("[supabase] failed to sync legal consent", error);
      return;
    }
    invalidateAccountSnapshot(userId);
    lastSyncedProfileState.set(userId, {
      ...(current ?? {}),
      legalConsentVersion: args.version,
      legalConsentedAt: args.consentedAt,
    });
    knownProfileUsers.add(userId);
  } catch (error) {
    console.warn("[supabase] legal consent columns unavailable", error);
  }
}

export async function linkGoogleAccount(): Promise<void> {
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
      equippedSkin: snapshot.equippedSkin ?? "classic",
      wins: snapshot.wins ?? 0,
      losses: snapshot.losses ?? 0,
      tokens: snapshot.tokens ?? 0,
      dailyRewardWins: snapshot.dailyRewardWins ?? 0,
      dailyRewardTokens: snapshot.dailyRewardTokens ?? 0,
    },
    flowStartedAt: new Date().toISOString(),
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: buildRedirectUrl(),
    },
  });

  if (error) {
    console.error("[supabase] failed to sign in with google", error);
    return;
  }

  if (data?.url) {
    window.location.assign(data.url);
  }
}

export async function logoutToGuestMode(): Promise<AuthStatePayload> {
  if (!supabase) {
    return {
      ready: true,
      userId: null,
      accessToken: null,
      isGuestUser: false,
      equippedSkin: "classic",
      wins: 0,
      losses: 0,
      tokens: 0,
      dailyRewardWins: 0,
      dailyRewardTokens: 0,
      achievements: [],
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

  const auth = await getCurrentAuthPayload();
  if (!auth) {
    clearPendingUpgradeContext();
    clearUpgradeQueryFromUrl();
    return { kind: "auth_error" };
  }

  const finalizeResult = await emitSocketAck<ServerFinalizeUpgradeResponse>("finalize_google_upgrade", {
    auth: await getSocketAuthPayload(),
    guestAuth: pending.guestAuth,
    guestProfile: pending.guestProfile,
    flowStartedAt: pending.flowStartedAt,
  });

  if (finalizeResult.status === "SWITCH_CONFIRM_REQUIRED" && finalizeResult.profile) {
    clearUpgradeQueryFromUrl();
    return { kind: "switch_confirm_required", profile: finalizeResult.profile };
  }

  clearPendingUpgradeContext();
  clearUpgradeQueryFromUrl();

  if ((finalizeResult.status !== "UPGRADE_OK" && finalizeResult.status !== "SWITCH_OK") || !finalizeResult.profile) {
    return { kind: "auth_error" };
  }

  if (finalizeResult.status === "SWITCH_OK") {
    return { kind: "switch_ok", profile: finalizeResult.profile };
  }

  return { kind: "upgrade_ok", profile: finalizeResult.profile };
}

export async function confirmPendingGoogleUpgradeSwitch(): Promise<UpgradeResolution> {
  const pending = getPendingUpgradeContext();
  if (!pending) return { kind: "auth_error" };

  const finalizeResult = await emitSocketAck<ServerFinalizeUpgradeResponse>("finalize_google_upgrade", {
    auth: await getSocketAuthPayload(),
    guestAuth: pending.guestAuth,
    guestProfile: pending.guestProfile,
    flowStartedAt: pending.flowStartedAt,
    allowExistingSwitch: true,
  });

  clearPendingUpgradeContext();
  clearUpgradeQueryFromUrl();

  if (finalizeResult.status !== "SWITCH_OK" || !finalizeResult.profile) {
    return { kind: "auth_error" };
  }

  return { kind: "switch_ok", profile: finalizeResult.profile };
}

export async function cancelPendingGoogleUpgradeSwitch(): Promise<AuthStatePayload> {
  clearPendingUpgradeContext();
  return logoutToGuestMode();
}

async function getClientAuthMetadata() {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    const info = await CapacitorApp.getInfo();
    const parsedBuild = Number(info.build ?? '');
    return {
      clientPlatform: 'android' as const,
      appVersionCode: Number.isFinite(parsedBuild) ? Math.trunc(parsedBuild) : undefined,
    };
  }

  return {
    clientPlatform: 'web' as const,
    appVersionCode: undefined,
  };
}

export function getSocketAuthPayload() {
  if (!supabase) return undefined;
  const session = supabase.auth.getSession();
  return Promise.all([session, getClientAuthMetadata()]).then(
    ([{ data }, metadata]) => ({
      accessToken: data.session?.access_token,
      userId: data.session?.user.id,
      ...metadata,
    }),
  );
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
      tokens: 0,
      dailyRewardWins: 0,
      dailyRewardTokens: 0,
      achievements: [],
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
        ? (readCachedAccountSnapshot(session.user.id) ?? undefined)
        : undefined;
      callback(toAuthState(session, snapshot));
    })();
  });

  return () => subscription.unsubscribe();
}
