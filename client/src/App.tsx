import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  fetchLegalConsentRecord,
  getClientAuthMetadata,
  getStoredIdentityDebugSnapshot,
  initializeGuestAuth,
  installNativeAuthCallbackHandler,
  reconnectStoredAccount,
  onAuthStateChanged,
  refreshAccountSummary,
  syncLegalConsent,
  syncAchievementSettings,
  syncEquippedAbilitySkills,
  syncEquippedBoardSkin,
  syncEquippedSkin,
} from "./auth/guestAuth";
import {
  connectSocket,
  disconnectSocket,
  getSocket,
} from "./socket/socketClient";
import type { AbilitySkillId } from "./types/ability.types";
import { stopLocalAbilityTraining } from "./ability/localTrainingSession";
import { useLang } from "./hooks/useLang";
import { useGameStore } from "./store/gameStore";
import {
  getMatchResultAudioEvents,
  pauseAllBgm,
  playBgmTrack,
  resumeAudioContext,
  setAbilitySfxGains,
  setBgmMuted,
  setBgmVolume,
  unloadBgm,
  type BgmTrackId,
  type MatchResultAudioKind,
} from "./utils/soundUtils";
import "./App.css";

const LobbyScreen = lazy(() =>
  import("./components/Lobby/LobbyScreen").then((module) => ({
    default: module.LobbyScreen,
  })),
);
const GameScreen = lazy(() =>
  import("./components/Game/GameScreen").then((module) => ({
    default: module.GameScreen,
  })),
);
const CoopScreen = lazy(() =>
  import("./components/Coop/CoopScreen").then((module) => ({
    default: module.CoopScreen,
  })),
);
const TwoVsTwoScreen = lazy(() =>
  import("./components/TwoVsTwo/TwoVsTwoScreen").then((module) => ({
    default: module.TwoVsTwoScreen,
  })),
);
const AbilityScreen = lazy(() =>
  import("./components/Ability/AbilityScreen").then((module) => ({
    default: module.AbilityScreen,
  })),
);

type AppView = "lobby" | "game" | "coop" | "twovtwo" | "ability";

type UpdateRequiredPayload = {
  latestVersionCode: number;
  minSupportedVersionCode: number;
  currentVersionCode: number | null;
  forceUpdate: boolean;
  storeUrl: string;
  marketUrl: string;
};

type StoredLegalConsent = {
  version: string;
  consentedAt: string;
  userId: string | null;
};

type LegalDocumentType = "terms" | "privacy";
type RoomClosedReason = "turn_limit" | "waiting_timeout" | "empty";

const LEGAL_CONSENT_VERSION = "2026-04-01-v1";
const LEGAL_CONSENT_STORAGE_KEY = "pathclash.legalConsent.v1";
const TERMS_PATH_KR = "/terms.html";
const TERMS_PATH_EN = "/terms-en.html";
const POLICY_PATH_KR = "/privacy.html";
const POLICY_PATH_EN = "/privacy-en.html";
const MIN_GAME_LOADING_MS = 3000;

const LOADING_TIPS = {
  kr: [
    "상대의 다음 경로를 예측하면 한 수 앞서갈 수 있습니다.",
    "마나는 라운드 당 3씩 회복됩니다.",
    "능력은 아끼는 것보다 결정적인 순간에 쓰는 것이 더 중요합니다.",
    "한 라운드 당 시간은 9초가 주어집니다.",
    "경기에서 승리하면 보상으로 다이아몬드 6개가 주어집니다.",
    "훈련장에서 스킬 조합을 미리 시험해볼 수 있습니다.",
    "승리가 어렵다면 안전한 경로를 먼저 확보해보세요.",
  ],
  en: [
    "Predicting your opponent's next path can put you one step ahead.",
    "Sometimes the best route is the one your opponent least wants you to take.",
    "Abilities matter most when saved for the decisive moment.",
    "When time is short, the simplest route can be the strongest choice.",
    "Remembering your opponent's favorite direction makes the next round easier.",
    "You can test skill combinations in Training.",
    "If winning feels hard, secure a safe route first.",
  ],
} as const;

function getRandomLoadingTipIndex() {
  return Math.floor(Math.random() * LOADING_TIPS.kr.length);
}

function GameLoadingScreen({
  tip,
  onNextTip,
}: {
  tip: string;
  onNextTip: () => void;
}) {
  return (
    <div className="game-loading-screen" role="status" aria-live="polite">
      <button className="game-loading-tip" onClick={onNextTip} type="button">
        {tip}
      </button>
    </div>
  );
}

function readStoredLegalConsent(): StoredLegalConsent | null {
  const raw = window.localStorage.getItem(LEGAL_CONSENT_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredLegalConsent;
  } catch {
    return null;
  }
}

function writeStoredLegalConsent(record: StoredLegalConsent) {
  window.localStorage.setItem(
    LEGAL_CONSENT_STORAGE_KEY,
    JSON.stringify(record),
  );
}

function App() {
  const [view, setView] = useState<AppView>("lobby");
  const [gameLoadingUntil, setGameLoadingUntil] = useState(0);
  const [loadingTipIndex, setLoadingTipIndex] = useState(
    getRandomLoadingTipIndex,
  );
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSessionReplaced, setShowSessionReplaced] = useState(false);
  const [isSessionResetting, setIsSessionResetting] = useState(false);
  const [roomClosedReason, setRoomClosedReason] =
    useState<RoomClosedReason | null>(null);
  const [updateRequired, setUpdateRequired] =
    useState<UpdateRequiredPayload | null>(null);
  const [legalConsentResolved, setLegalConsentResolved] = useState(false);
  const [hasLegalConsent, setHasLegalConsent] = useState(false);
  const [legalConsentChecked, setLegalConsentChecked] = useState(false);
  const [isSavingLegalConsent, setIsSavingLegalConsent] = useState(false);
  const [isLobbyHydrating, setIsLobbyHydrating] = useState(false);
  const [openLegalDocument, setOpenLegalDocument] =
    useState<LegalDocumentType | null>(null);
  const [tutorialPromptTrigger, setTutorialPromptTrigger] = useState(0);
  const gameLoadingTimeoutRef = useRef<number | null>(null);
  const abilityScreenReadyAtRef = useRef<number | undefined>(undefined);
  const [matchResultAudioKind, setMatchResultAudioKind] =
    useState<MatchResultAudioKind | null>(null);
  const {
    authReady,
    setAccountSummaryLoading,
    authUserId,
    authAccessToken,
    isGuestUser,
    accountSummaryLoading,
    pieceSkin,
    boardSkin,
    abilityLoadout,
    setAuthState,
    isMusicMuted,
    isSfxMuted,
    musicVolume,
    sfxVolume,
    abilitySfxGains,
  } = useGameStore();
  const { lang } = useLang();

  const loadingTips = lang === "en" ? LOADING_TIPS.en : LOADING_TIPS.kr;
  const loadingTip = loadingTips[loadingTipIndex % loadingTips.length];

  const showNextLoadingTip = useCallback(() => {
    setLoadingTipIndex((index) => (index + 1) % LOADING_TIPS.kr.length);
  }, []);

  const refreshLobbyAccountSummary = useCallback(async () => {
    const state = useGameStore.getState();
    if (!state.authUserId || !state.authAccessToken) return;

    setAccountSummaryLoading(true);
    try {
      const summary = await refreshAccountSummary({ force: true });
      setAuthState({
        ready: true,
        userId: state.authUserId,
        accessToken: useGameStore.getState().authAccessToken,
        isGuestUser: useGameStore.getState().isGuestUser,
        nickname: summary.nickname,
        equippedSkin: summary.equippedSkin,
        equippedBoardSkin: summary.equippedBoardSkin,
        equippedAbilitySkills: summary.equippedAbilitySkills,
        ownedSkins: summary.ownedSkins,
        ownedBoardSkins: summary.ownedBoardSkins,
        wins: summary.wins,
        losses: summary.losses,
        tokens: summary.tokens,
        dailyRewardWins: summary.dailyRewardWins,
        dailyRewardTokens: summary.dailyRewardTokens,
        achievements: summary.achievements,
        currentRating: summary.currentRating,
        highestArena: summary.highestArena,
        rankedUnlocked: summary.rankedUnlocked,
      });
    } catch (error) {
      console.warn("[lobby] failed to refresh account summary", error);
    } finally {
      setAccountSummaryLoading(false);
    }
  }, [setAccountSummaryLoading, setAuthState]);

  const startGameView = useCallback((nextView: Exclude<AppView, "lobby">) => {
    if (gameLoadingTimeoutRef.current !== null) {
      window.clearTimeout(gameLoadingTimeoutRef.current);
    }

    setLoadingTipIndex(getRandomLoadingTipIndex());
    const readyAt = Date.now() + MIN_GAME_LOADING_MS;
    setGameLoadingUntil(readyAt);
    abilityScreenReadyAtRef.current =
      nextView === "ability" ? readyAt : undefined;
    setView(nextView);
    gameLoadingTimeoutRef.current = window.setTimeout(() => {
      setGameLoadingUntil(0);
      gameLoadingTimeoutRef.current = null;
    }, MIN_GAME_LOADING_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (gameLoadingTimeoutRef.current !== null) {
        window.clearTimeout(gameLoadingTimeoutRef.current);
      }
    };
  }, []);
  const achievementRefreshTimeoutRef = useRef<number | null>(null);
  const accountSummaryRefreshTimeoutRef = useRef<number | null>(null);
  const lastAccountSummaryRefreshAuthKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authReady) return;

    let active = true;

    void (async () => {
      const storedConsent = readStoredLegalConsent();
      if (storedConsent?.version === LEGAL_CONSENT_VERSION) {
        if (!active) return;
        setHasLegalConsent(true);
        setLegalConsentResolved(true);
        return;
      }

      const dbRecord = await fetchLegalConsentRecord();
      if (!active) return;

      if (dbRecord?.version === LEGAL_CONSENT_VERSION && dbRecord.consentedAt) {
        writeStoredLegalConsent({
          version: dbRecord.version,
          consentedAt: dbRecord.consentedAt,
          userId: authUserId,
        });
        setHasLegalConsent(true);
        setLegalConsentResolved(true);
        return;
      }

      setHasLegalConsent(false);
      setLegalConsentResolved(true);
    })();

    return () => {
      active = false;
    };
  }, [authReady, authUserId]);

  const applyUpdateRequired = useCallback(
    (payload: UpdateRequiredPayload | null | undefined) => {
      if (!payload?.forceUpdate) return;
      disconnectSocket();
      useGameStore.getState().resetGame();
      setShowExitConfirm(false);
      setShowSessionReplaced(false);
      setView("lobby");
      setMatchResultAudioKind(null);
      setUpdateRequired(payload);
    },
    [],
  );

  useEffect(() => () => unloadBgm(), []);

  useEffect(() => {
    resumeAudioContext();
  }, []);

  useEffect(() => {
    setBgmVolume(musicVolume);
  }, [musicVolume]);

  useEffect(() => {
    setBgmMuted(isMusicMuted);
  }, [isMusicMuted]);

  useEffect(() => {
    setAbilitySfxGains(abilitySfxGains);
  }, [abilitySfxGains]);

  useEffect(() => {
    const { start, stop } = getMatchResultAudioEvents();
    const handleStart = (event: Event) => {
      const customEvent = event as CustomEvent<{ kind: MatchResultAudioKind }>;
      setMatchResultAudioKind(customEvent.detail.kind);
    };
    const handleStop = () => {
      setMatchResultAudioKind(null);
    };

    window.addEventListener(start, handleStart as EventListener);
    window.addEventListener(stop, handleStop);
    return () => {
      window.removeEventListener(start, handleStart as EventListener);
      window.removeEventListener(stop, handleStop);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let cleanupNativeAuth = () => {};
    const applyAuthPayload = (
      payload: Awaited<ReturnType<typeof initializeGuestAuth>>,
    ) => {
      console.log("[session-debug] applyAuthPayload", {
        ...getStoredIdentityDebugSnapshot(),
        userId: payload.userId,
        isGuestUser: payload.isGuestUser,
        hasAccessToken: Boolean(payload.accessToken),
      });
      if (!active) return;
      setAuthState(payload);
      if (!payload.userId || !payload.accessToken) {
        lastAccountSummaryRefreshAuthKeyRef.current = null;
        setAccountSummaryLoading(false);
        return;
      }
      const authKey = `${payload.userId}:${payload.accessToken}`;
      if (lastAccountSummaryRefreshAuthKeyRef.current === authKey) {
        return;
      }
      lastAccountSummaryRefreshAuthKeyRef.current = authKey;
      setAccountSummaryLoading(true);
      if (accountSummaryRefreshTimeoutRef.current !== null) {
        window.clearTimeout(accountSummaryRefreshTimeoutRef.current);
      }
      accountSummaryRefreshTimeoutRef.current = window.setTimeout(() => {
        accountSummaryRefreshTimeoutRef.current = null;
        void refreshAccountSummary({ force: true })
          .then(
            ({
              nickname,
              equippedSkin,
              equippedBoardSkin,
              equippedAbilitySkills,
              ownedSkins,
              ownedBoardSkins,
              wins,
              losses,
              tokens,
              dailyRewardWins,
              dailyRewardTokens,
              achievements,
              currentRating,
              highestArena,
              rankedUnlocked,
            }) => {
              if (!active) return;
              setAuthState({
                ready: true,
                userId: payload.userId,
                accessToken:
                  useGameStore.getState().authAccessToken ??
                  payload.accessToken,
                isGuestUser: useGameStore.getState().isGuestUser,
                nickname,
                equippedSkin,
                equippedBoardSkin,
                equippedAbilitySkills,
                ownedSkins,
                ownedBoardSkins,
                wins,
                losses,
                tokens,
                dailyRewardWins,
                dailyRewardTokens,
                achievements,
                currentRating,
                highestArena,
                rankedUnlocked,
              });
            },
          )
          .catch((error) => {
            if (!active) return;
            lastAccountSummaryRefreshAuthKeyRef.current = null;
            console.warn(
              "[session-debug] failed to refresh account summary",
              error,
            );
          })
          .finally(() => {
            if (!active) return;
            setAccountSummaryLoading(false);
          });
      }, 80);
    };

    void (async () => {
      cleanupNativeAuth = await installNativeAuthCallbackHandler();
      const payload = await initializeGuestAuth();
      applyAuthPayload(payload);
    })();

    const unsubscribe = onAuthStateChanged((payload) => {
      console.log("[session-debug] onAuthStateChanged callback", {
        ...getStoredIdentityDebugSnapshot(),
        userId: payload.userId,
        isGuestUser: payload.isGuestUser,
        hasAccessToken: Boolean(payload.accessToken),
      });
      applyAuthPayload(payload);
    });

    return () => {
      active = false;
      if (accountSummaryRefreshTimeoutRef.current !== null) {
        window.clearTimeout(accountSummaryRefreshTimeoutRef.current);
        accountSummaryRefreshTimeoutRef.current = null;
      }
      cleanupNativeAuth();
      unsubscribe();
    };
  }, [setAccountSummaryLoading, setAuthState]);

  useEffect(() => {
    if (!authReady || !authUserId || !authAccessToken || accountSummaryLoading)
      return;
    void syncEquippedSkin(pieceSkin);
  }, [
    accountSummaryLoading,
    authAccessToken,
    authReady,
    authUserId,
    pieceSkin,
  ]);

  useEffect(() => {
    if (!authReady || !authUserId || !authAccessToken || accountSummaryLoading)
      return;
    void syncEquippedBoardSkin(boardSkin);
  }, [
    accountSummaryLoading,
    authAccessToken,
    authReady,
    authUserId,
    boardSkin,
  ]);

  useEffect(() => {
    if (!authReady || !authUserId || !authAccessToken || accountSummaryLoading)
      return;
    void syncEquippedAbilitySkills(abilityLoadout);
  }, [
    abilityLoadout,
    accountSummaryLoading,
    authAccessToken,
    authReady,
    authUserId,
  ]);

  useEffect(() => {
    if (!authReady || !authAccessToken) return;
    const musicVolumePercent = Math.round(musicVolume * 100);
    const sfxVolumePercent = Math.round(sfxVolume * 100);
    const shouldSyncSettingsAchievement =
      (isMusicMuted &&
        isSfxMuted &&
        musicVolumePercent === 0 &&
        sfxVolumePercent === 0) ||
      (!isMusicMuted &&
        !isSfxMuted &&
        musicVolumePercent === 100 &&
        sfxVolumePercent === 100);

    if (!shouldSyncSettingsAchievement) return;

    const timeoutId = window.setTimeout(() => {
      void syncAchievementSettings({
        isMusicMuted,
        isSfxMuted,
        musicVolume,
        sfxVolume,
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [
    authAccessToken,
    authReady,
    isMusicMuted,
    isSfxMuted,
    musicVolume,
    sfxVolume,
  ]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) return;
    socket.emit("update_piece_skin", { pieceSkin });
  }, [pieceSkin]);

  // get_rotation: auth 불필요, 앱 마운트 시 소켓 연결 후 즉시 호출
  useEffect(() => {
    const socket = connectSocket();
    const fetchRotation = () => {
      socket.emit("get_rotation", (rotationResp: { skills: string[] }) => {
        useGameStore
          .getState()
          .setRotationSkills((rotationResp?.skills ?? []) as AbilitySkillId[]);
      });
    };
    socket.on("connect", fetchRotation);
    if (socket.connected) fetchRotation();
    return () => {
      socket.off("connect", fetchRotation);
    };
  }, []);

  useEffect(() => {
    if (!authReady || !authAccessToken) return;

    const socket = getSocket();
    const registerSession = async () => {
      const authMetadata = await getClientAuthMetadata();
      socket.emit(
        "session_register",
        {
          auth: {
            accessToken: authAccessToken,
            userId: authUserId ?? undefined,
            clientPlatform: authMetadata.clientPlatform,
            appVersionCode: authMetadata.appVersionCode,
          },
        },
        (
          response: {
            updateRequired?: boolean;
          } & Partial<UpdateRequiredPayload>,
        ) => {
          if (response?.updateRequired) {
            applyUpdateRequired(response as UpdateRequiredPayload);
            return;
          }
          // 계정 동기화: 만료 스킬 제거 결과 수신 + rotationSkills 갱신
          if (authAccessToken && authUserId) {
            socket.emit(
              "account_sync",
              {
                auth: {
                  accessToken: authAccessToken,
                  userId: authUserId ?? undefined,
                  clientPlatform: authMetadata.clientPlatform,
                  appVersionCode: authMetadata.appVersionCode,
                },
              },
              (syncResp: {
                status: string;
                profile?: {
                  equippedAbilitySkills?: string[];
                  removedRotationSkills?: string[];
                  rotationSkills?: string[];
                };
              }) => {
                if (syncResp?.status === "ACCOUNT_OK" && syncResp.profile) {
                  const removed = (syncResp.profile.removedRotationSkills ??
                    []) as AbilitySkillId[];
                  const rotSkills = (syncResp.profile.rotationSkills ??
                    []) as AbilitySkillId[];
                  const store = useGameStore.getState();
                  if (rotSkills.length > 0) {
                    store.setRotationSkills(rotSkills);
                  }
                  if (removed.length > 0) {
                    store.setPendingRemovedRotationSkillsNotice(removed);
                    const equipped = (syncResp.profile.equippedAbilitySkills ??
                      []) as AbilitySkillId[];
                    store.setAbilityLoadout(equipped);
                  }
                }
              },
            );
          }
        },
      );
    };

    socket.on("connect", registerSession);
    if (socket.connected) {
      void registerSession();
    }

    return () => {
      socket.off("connect", registerSession);
    };
  }, [applyUpdateRequired, authAccessToken, authReady, authUserId]);

  useEffect(() => {
    const socket = getSocket();
    const onSessionReplaced = () => {
      console.log("[session-debug] received session_replaced", {
        ...getStoredIdentityDebugSnapshot(),
        authUserId: useGameStore.getState().authUserId,
        isGuestUser: useGameStore.getState().isGuestUser,
      });
      disconnectSocket();
      useGameStore.getState().resetGame();
      setShowExitConfirm(false);
      setView("lobby");
      setMatchResultAudioKind(null);
      setShowSessionReplaced(true);
    };

    socket.on("session_replaced", onSessionReplaced);
    return () => {
      socket.off("session_replaced", onSessionReplaced);
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const onUpdateRequired = (payload: UpdateRequiredPayload) => {
      applyUpdateRequired(payload);
    };

    socket.on("update_required", onUpdateRequired);
    return () => {
      socket.off("update_required", onUpdateRequired);
    };
  }, [applyUpdateRequired]);

  useEffect(() => {
    const socket = getSocket();
    const onRoomClosed = ({ reason }: { reason?: RoomClosedReason }) => {
      if (reason !== "turn_limit") return;
      useGameStore.getState().resetGame();
      setShowExitConfirm(false);
      setMatchResultAudioKind(null);
      setView("lobby");
      setRoomClosedReason(reason);
    };

    socket.on("room_closed", onRoomClosed);
    return () => {
      socket.off("room_closed", onRoomClosed);
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const refreshAchievementSummary = () => {
      if (!authReady || !authUserId || !authAccessToken) return;
      if (achievementRefreshTimeoutRef.current !== null) {
        window.clearTimeout(achievementRefreshTimeoutRef.current);
      }
      achievementRefreshTimeoutRef.current = window.setTimeout(() => {
        void refreshAccountSummary({ force: true }).then(
          ({
            nickname,
            equippedSkin,
            equippedBoardSkin,
            equippedAbilitySkills,
            ownedSkins,
            ownedBoardSkins,
            wins,
            losses,
            tokens,
            dailyRewardWins,
            dailyRewardTokens,
            achievements,
            currentRating,
            highestArena,
            rankedUnlocked,
          }) => {
            setAuthState({
              ready: true,
              userId: authUserId,
              accessToken: useGameStore.getState().authAccessToken,
              isGuestUser,
              nickname,
              equippedSkin,
              equippedBoardSkin,
              equippedAbilitySkills,
              ownedSkins,
              ownedBoardSkins,
              wins,
              losses,
              tokens,
              dailyRewardWins,
              dailyRewardTokens,
              achievements,
              currentRating,
              highestArena,
              rankedUnlocked,
            });
          },
        );
        achievementRefreshTimeoutRef.current = null;
      }, 700);
    };

    socket.on("game_over", refreshAchievementSummary);
    socket.on("ability_game_over", refreshAchievementSummary);
    socket.on("coop_game_over", refreshAchievementSummary);
    socket.on("twovtwo_game_over", refreshAchievementSummary);

    return () => {
      socket.off("game_over", refreshAchievementSummary);
      socket.off("ability_game_over", refreshAchievementSummary);
      socket.off("coop_game_over", refreshAchievementSummary);
      socket.off("twovtwo_game_over", refreshAchievementSummary);
      if (achievementRefreshTimeoutRef.current !== null) {
        window.clearTimeout(achievementRefreshTimeoutRef.current);
        achievementRefreshTimeoutRef.current = null;
      }
    };
  }, [authAccessToken, authReady, authUserId, isGuestUser, setAuthState]);

  const handleReturnToLobby = useCallback(async () => {
    if (gameLoadingTimeoutRef.current !== null) {
      window.clearTimeout(gameLoadingTimeoutRef.current);
      gameLoadingTimeoutRef.current = null;
    }
    setLoadingTipIndex(getRandomLoadingTipIndex());
    setIsLobbyHydrating(true);
    stopLocalAbilityTraining();
    disconnectSocket();
    useGameStore.getState().resetGame();
    setShowExitConfirm(false);
    setMatchResultAudioKind(null);
    setGameLoadingUntil(0);
    setView("lobby");
    await refreshLobbyAccountSummary();
    setIsLobbyHydrating(false);
  }, [refreshLobbyAccountSummary]);

  const handleSessionReplacedConfirm = useCallback(async () => {
    setIsSessionResetting(true);
    try {
      console.log("[session-debug] session_replaced confirm:start", {
        ...getStoredIdentityDebugSnapshot(),
        authUserId: useGameStore.getState().authUserId,
        isGuestUser: useGameStore.getState().isGuestUser,
      });
      disconnectSocket();
      stopLocalAbilityTraining();
      useGameStore.getState().resetGame();
      setMatchResultAudioKind(null);
      setView("lobby");
      const restoredState = await reconnectStoredAccount();
      console.log("[session-debug] session_replaced confirm:restored", {
        ...getStoredIdentityDebugSnapshot(),
        userId: restoredState.userId,
        isGuestUser: restoredState.isGuestUser,
        hasAccessToken: Boolean(restoredState.accessToken),
      });
      setAuthState(restoredState);
      if (restoredState.userId && restoredState.accessToken) {
        setAccountSummaryLoading(true);
        try {
          const summary = await refreshAccountSummary({ force: true });
          console.log(
            "[session-debug] session_replaced confirm:summary restored",
            {
              ...getStoredIdentityDebugSnapshot(),
              userId: restoredState.userId,
              nickname: summary.nickname,
              wins: summary.wins,
              losses: summary.losses,
              tokens: summary.tokens,
            },
          );
          setAuthState({
            ready: true,
            userId: restoredState.userId,
            accessToken:
              useGameStore.getState().authAccessToken ??
              restoredState.accessToken,
            isGuestUser: useGameStore.getState().isGuestUser,
            nickname: summary.nickname,
            equippedSkin: summary.equippedSkin,
            equippedBoardSkin: summary.equippedBoardSkin,
            ownedSkins: summary.ownedSkins,
            wins: summary.wins,
            losses: summary.losses,
            tokens: summary.tokens,
            dailyRewardWins: summary.dailyRewardWins,
            dailyRewardTokens: summary.dailyRewardTokens,
            achievements: summary.achievements,
          });
        } finally {
          setAccountSummaryLoading(false);
        }
      }
      setShowSessionReplaced(false);
    } finally {
      setIsSessionResetting(false);
    }
  }, [setAccountSummaryLoading, setAuthState]);

  const exitTitle =
    lang === "en" ? "Exit PathClash?" : "정말로 게임을 종료하시겠습니까?";
  const exitConfirmLabel = lang === "en" ? "Yes" : "예";
  const exitCancelLabel = lang === "en" ? "No" : "아니요";
  const sessionReplacedTitle =
    lang === "en"
      ? "This account is active on another device."
      : "다른 기기에서 접속 중입니다.";
  const sessionReplacedBody =
    lang === "en"
      ? "This session was closed because the account was used on another device. Your account data is safe. Tap OK to return to the lobby and sign in again if needed."
      : "다른 기기에서 동일 계정으로 접속하여 현재 세션이 종료되었습니다. 계정 데이터는 유지되며, 확인을 누르면 로비로 돌아갑니다. 필요하면 다시 로그인해주세요.";
  const sessionReplacedConfirm = lang === "en" ? "Reconnect" : "다시 연결";
  const updateRequiredTitle =
    lang === "en" ? "A new version is available." : "새 버전이 출시되었습니다.";
  const updateRequiredBody =
    lang === "en"
      ? "Please go to the Play Store and update the app to continue playing."
      : "게임을 계속하려면 플레이 스토어로 이동하여 앱을 업데이트해 주세요.";
  const updateRequiredConfirm =
    lang === "en" ? "Open Play Store" : "플레이 스토어로 이동";
  const roomClosedTitle =
    lang === "en" ? "Game session closed" : "게임 세션이 종료되었습니다.";
  const roomClosedBody =
    lang === "en"
      ? "This match was closed automatically because it exceeded the round limit."
      : "이 게임은 진행 라운드 수 상한을 초과하여 자동으로 종료되었습니다.";
  const roomClosedDismiss = lang === "en" ? "Close" : "닫기";

  const handleOpenStoreForUpdate = useCallback(() => {
    if (!updateRequired) return;
    const nativeUrl =
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
        ? updateRequired.marketUrl
        : updateRequired.storeUrl;
    window.location.href = nativeUrl;
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      window.setTimeout(() => {
        window.location.href = updateRequired.storeUrl;
      }, 800);
    }
  }, [updateRequired]);

  const handleAgreeToLegalConsent = useCallback(async () => {
    const consentedAt = new Date().toISOString();
    const record: StoredLegalConsent = {
      version: LEGAL_CONSENT_VERSION,
      consentedAt,
      userId: authUserId,
    };

    setIsSavingLegalConsent(true);
    try {
      writeStoredLegalConsent(record);
      await syncLegalConsent({
        version: LEGAL_CONSENT_VERSION,
        consentedAt,
      });
      setHasLegalConsent(true);
      setTutorialPromptTrigger((value) => value + 1);
    } finally {
      setIsSavingLegalConsent(false);
    }
  }, [authUserId]);

  const tryStartBgm = useCallback(() => {
    setBgmVolume(musicVolume);
    setBgmMuted(isMusicMuted);
    if (isMusicMuted) {
      return;
    }

    let targetTrackId: BgmTrackId;
    if (matchResultAudioKind) {
      targetTrackId = matchResultAudioKind === "victory" ? "victory" : "defeat";
    } else {
      const isBattleView =
        view === "game" ||
        view === "coop" ||
        view === "twovtwo" ||
        view === "ability";
      targetTrackId = isBattleView ? "ingame" : "lobby";
    }

    playBgmTrack(targetTrackId);
  }, [isMusicMuted, matchResultAudioKind, musicVolume, view]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup = () => {};

    void CapacitorApp.addListener("backButton", () => {
      if (showSessionReplaced) {
        return;
      }
      if (
        view === "game" ||
        view === "coop" ||
        view === "twovtwo" ||
        view === "ability"
      ) {
        handleReturnToLobby();
        return;
      }
      if (showExitConfirm) {
        setShowExitConfirm(false);
        return;
      }
      setShowExitConfirm(true);
    }).then((listener) => {
      cleanup = () => {
        void listener.remove();
      };
    });

    return () => {
      cleanup();
    };
  }, [handleReturnToLobby, showExitConfirm, showSessionReplaced, view]);

  useEffect(() => {
    tryStartBgm();
  }, [tryStartBgm]);

  useEffect(() => {
    const onUserInteraction = () => {
      tryStartBgm();
    };

    window.addEventListener("pointerdown", onUserInteraction, true);
    return () =>
      window.removeEventListener("pointerdown", onUserInteraction, true);
  }, [tryStartBgm]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup = () => {};

    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        pauseAllBgm();
        return;
      }

      tryStartBgm();
    }).then((listener) => {
      cleanup = () => {
        void listener.remove();
      };
    });

    return () => {
      cleanup();
    };
  }, [tryStartBgm]);

  const shouldWaitForLobbyAccountSummary =
    view === "lobby" &&
    Boolean(authUserId && authAccessToken) &&
    accountSummaryLoading;

  if (
    !authReady ||
    !legalConsentResolved ||
    shouldWaitForLobbyAccountSummary
  ) {
    return (
      <div className="app-outer app-outer--lobby">
        <div className="app-inner">
          <GameLoadingScreen tip={loadingTip} onNextTip={showNextLoadingTip} />
        </div>
      </div>
    );
  }

  const legalConsentTitle =
    lang === "en"
      ? "Terms of Service and Privacy Policy"
      : "이용약관 및 개인정보처리방침";
  const legalConsentBody =
    lang === "en"
      ? "Please review the Terms of Service and Privacy Policy before continuing. You must agree to both to use PathClash."
      : "PathClash를 이용하려면 이용약관과 개인정보처리방침을 확인한 뒤 동의해야 합니다.";
  const legalConsentTermsLabel =
    lang === "en" ? "View Terms of Service" : "이용약관 보기";
  const legalConsentPolicyLabel =
    lang === "en" ? "View Privacy Policy" : "개인정보처리방침 보기";
  const legalConsentCheckboxLabel =
    lang === "en"
      ? "I agree to the Terms of Service and Privacy Policy."
      : "이용약관과 개인정보처리방침에 동의합니다.";
  const legalConsentConfirmLabel =
    lang === "en" ? "Agree and Start" : "동의하고 시작";
  const legalConsentTermsPath = lang === "en" ? TERMS_PATH_EN : TERMS_PATH_KR;
  const legalConsentPolicyPath =
    lang === "en" ? POLICY_PATH_EN : POLICY_PATH_KR;
  const legalDocumentTitle =
    openLegalDocument === "terms"
      ? lang === "en"
        ? "Terms of Service"
        : "이용약관"
      : lang === "en"
        ? "Privacy Policy"
        : "개인정보처리방침";
  const legalDocumentCloseLabel = lang === "en" ? "Close" : "닫기";
  const legalDocumentSrc =
    openLegalDocument === "terms"
      ? legalConsentTermsPath
      : legalConsentPolicyPath;
  const isGameLoadingVisible = gameLoadingUntil > 0;
  const isLobbyLoadingVisible = isLobbyHydrating || isGameLoadingVisible;

  return (
    <div
      className={`app-outer ${view === "lobby" ? "app-outer--lobby" : "app-outer--game"}`}
    >
      <div className="app-inner">
        <Suspense
          fallback={
            <GameLoadingScreen
              tip={loadingTip}
              onNextTip={showNextLoadingTip}
            />
          }
        >
          {view === "lobby" && (
            <LobbyScreen
              onGameStart={() => startGameView("game")}
              onCoopStart={() => startGameView("coop")}
              onTwoVsTwoStart={() => startGameView("twovtwo")}
              onAbilityStart={() => startGameView("ability")}
              onboardingPromptsEnabled={legalConsentResolved && hasLegalConsent}
              tutorialPromptTrigger={tutorialPromptTrigger}
            />
          )}
          {view === "game" && (
            <GameScreen onLeaveToLobby={handleReturnToLobby} />
          )}
          {view === "coop" && (
            <CoopScreen onLeaveToLobby={handleReturnToLobby} />
          )}
          {view === "twovtwo" && (
            <TwoVsTwoScreen onLeaveToLobby={handleReturnToLobby} />
          )}
          {view === "ability" && (
            <AbilityScreen
              onLeaveToLobby={handleReturnToLobby}
              screenReadyAt={abilityScreenReadyAtRef.current}
            />
          )}
        </Suspense>
        {isLobbyLoadingVisible && (
          <GameLoadingScreen tip={loadingTip} onNextTip={showNextLoadingTip} />
        )}
        {showExitConfirm && view === "lobby" && (
          <div
            className="app-confirm-backdrop"
            onClick={() => setShowExitConfirm(false)}
          >
            <div
              className="app-confirm-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <h3>{exitTitle}</h3>
              <div className="app-confirm-actions">
                <button
                  className="app-confirm-btn app-confirm-btn-secondary"
                  onClick={() => setShowExitConfirm(false)}
                  type="button"
                >
                  {exitCancelLabel}
                </button>
                <button
                  className="app-confirm-btn app-confirm-btn-primary"
                  onClick={() => void CapacitorApp.exitApp()}
                  type="button"
                >
                  {exitConfirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
        {showSessionReplaced && (
          <div className="app-confirm-backdrop">
            <div className="app-confirm-modal">
              <h3>{sessionReplacedTitle}</h3>
              <p className="app-confirm-copy">{sessionReplacedBody}</p>
              <div className="app-confirm-actions app-confirm-actions-single">
                <button
                  className="app-confirm-btn app-confirm-btn-primary"
                  onClick={() => void handleSessionReplacedConfirm()}
                  type="button"
                  disabled={isSessionResetting}
                >
                  {sessionReplacedConfirm}
                </button>
              </div>
            </div>
          </div>
        )}
        {updateRequired && (
          <div className="app-confirm-backdrop">
            <div className="app-confirm-modal">
              <h3>{updateRequiredTitle}</h3>
              <p className="app-confirm-copy">{updateRequiredBody}</p>
              <div className="app-confirm-actions app-confirm-actions-single">
                <button
                  className="app-confirm-btn app-confirm-btn-primary"
                  onClick={handleOpenStoreForUpdate}
                  type="button"
                >
                  {updateRequiredConfirm}
                </button>
              </div>
            </div>
          </div>
        )}
        {roomClosedReason === "turn_limit" && (
          <div
            className="app-confirm-backdrop"
            onClick={() => setRoomClosedReason(null)}
          >
            <div
              className="app-confirm-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <h3>{roomClosedTitle}</h3>
              <p className="app-confirm-copy">{roomClosedBody}</p>
              <div className="app-confirm-actions app-confirm-actions-single">
                <button
                  className="app-confirm-btn app-confirm-btn-primary"
                  onClick={() => setRoomClosedReason(null)}
                  type="button"
                >
                  {roomClosedDismiss}
                </button>
              </div>
            </div>
          </div>
        )}
        {!updateRequired && !hasLegalConsent && (
          <div className="app-confirm-backdrop">
            <div className="app-confirm-modal app-legal-consent-modal">
              <h3>{legalConsentTitle}</h3>
              <p className="app-confirm-copy">{legalConsentBody}</p>
              <div className="app-legal-consent-links">
                <button
                  className="app-legal-link"
                  onClick={() => setOpenLegalDocument("terms")}
                  type="button"
                >
                  <span>{`${legalConsentTermsLabel} >`}</span>
                </button>
                <button
                  className="app-legal-link"
                  onClick={() => setOpenLegalDocument("privacy")}
                  type="button"
                >
                  <span>{`${legalConsentPolicyLabel} >`}</span>
                </button>
              </div>
              <label className="app-legal-consent-checkbox">
                <input
                  type="checkbox"
                  checked={legalConsentChecked}
                  onChange={(event) =>
                    setLegalConsentChecked(event.target.checked)
                  }
                />
                <span>{legalConsentCheckboxLabel}</span>
              </label>
              <div className="app-confirm-actions app-confirm-actions-single">
                <button
                  className="app-confirm-btn app-confirm-btn-primary"
                  onClick={() => void handleAgreeToLegalConsent()}
                  type="button"
                  disabled={!legalConsentChecked || isSavingLegalConsent}
                >
                  {legalConsentConfirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
        {openLegalDocument && (
          <div className="app-legal-doc-backdrop">
            <div
              className="app-legal-doc-modal"
              role="dialog"
              aria-modal="true"
            >
              <div className="app-legal-doc-header">
                <h3>{legalDocumentTitle}</h3>
                <button
                  className="app-legal-doc-close"
                  onClick={() => setOpenLegalDocument(null)}
                  type="button"
                  aria-label={legalDocumentCloseLabel}
                >
                  ×
                </button>
              </div>
              <div className="app-legal-doc-body">
                <iframe
                  className="app-legal-doc-frame"
                  src={legalDocumentSrc}
                  title={legalDocumentTitle}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      {/* app-inner */}
    </div>
  );
}

export default App;
