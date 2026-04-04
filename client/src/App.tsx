import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  fetchLegalConsentRecord,
  getSocketAuthPayload,
  initializeGuestAuth,
  installNativeAuthCallbackHandler,
  logoutToGuestMode,
  onAuthStateChanged,
  refreshAccountSummary,
  syncLegalConsent,
  syncAchievementSettings,
  syncEquippedSkin,
  syncNickname,
} from "./auth/guestAuth";
import { disconnectSocket, getSocket } from "./socket/socketClient";
import { useLang } from "./hooks/useLang";
import { useGameStore } from "./store/gameStore";
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

const LEGAL_CONSENT_VERSION = "2026-04-01-v1";
const LEGAL_CONSENT_STORAGE_KEY = "pathclash.legalConsent.v1";
const TERMS_PATH_KR = "/terms.html";
const TERMS_PATH_EN = "/terms-en.html";
const POLICY_PATH_KR = "/privacy.html";
const POLICY_PATH_EN = "/privacy-en.html";

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
  window.localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, JSON.stringify(record));
}

function App() {
  const [view, setView] = useState<AppView>("lobby");
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSessionReplaced, setShowSessionReplaced] = useState(false);
  const [isSessionResetting, setIsSessionResetting] = useState(false);
  const [updateRequired, setUpdateRequired] =
    useState<UpdateRequiredPayload | null>(null);
  const [legalConsentResolved, setLegalConsentResolved] = useState(false);
  const [hasLegalConsent, setHasLegalConsent] = useState(false);
  const [legalConsentChecked, setLegalConsentChecked] = useState(false);
  const [isSavingLegalConsent, setIsSavingLegalConsent] = useState(false);
  const [openLegalDocument, setOpenLegalDocument] =
    useState<LegalDocumentType | null>(null);
  const [tutorialPromptTrigger, setTutorialPromptTrigger] = useState(0);
  const {
    authReady,
    setAccountSummaryLoading,
    authUserId,
    authAccessToken,
    isGuestUser,
    myNickname,
    pieceSkin,
    setAuthState,
    isMusicMuted,
    isSfxMuted,
    musicVolume,
    sfxVolume,
  } = useGameStore();
  const { lang } = useLang();
  const nicknameSyncTimeoutRef = useRef<number | null>(null);
  const lobbyBgmRef = useRef<HTMLAudioElement | null>(null);
  const inGameBgmRef = useRef<HTMLAudioElement | null>(null);
  const achievementRefreshTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!authReady) return;

    let active = true;

    void (async () => {
      const storedConsent = readStoredLegalConsent();
      if (storedConsent?.version === LEGAL_CONSENT_VERSION) {
        if (!active) return;
        setHasLegalConsent(true);
        setLegalConsentResolved(true);
        if (authUserId) {
          void syncLegalConsent({
            version: storedConsent.version,
            consentedAt: storedConsent.consentedAt,
          });
        }
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
      setUpdateRequired(payload);
    },
    [],
  );

  useEffect(() => {
    const lobbyBgm = new Audio("/music/Lobby_bgm_3.ogg");
    lobbyBgm.loop = true;
    lobbyBgm.preload = "auto";
    lobbyBgm.volume = musicVolume;

    const inGameBgm = new Audio("/music/InGame_bgm_3.ogg");
    inGameBgm.loop = true;
    inGameBgm.preload = "auto";
    inGameBgm.volume = musicVolume;

    lobbyBgmRef.current = lobbyBgm;
    inGameBgmRef.current = inGameBgm;

    return () => {
      lobbyBgm.pause();
      inGameBgm.pause();
      lobbyBgmRef.current = null;
      inGameBgmRef.current = null;
    };
  }, []);

  useEffect(() => {
    const lobbyBgm = lobbyBgmRef.current;
    const inGameBgm = inGameBgmRef.current;
    if (!lobbyBgm || !inGameBgm) return;
    lobbyBgm.volume = musicVolume;
    inGameBgm.volume = musicVolume;
  }, [musicVolume]);

  useEffect(() => {
    let active = true;
    let cleanupNativeAuth = () => {};
    const applyAuthPayload = (payload: Awaited<ReturnType<typeof initializeGuestAuth>>) => {
      if (!active) return;
      setAuthState(payload);
      if (!payload.userId || !payload.accessToken) {
        setAccountSummaryLoading(false);
        return;
      }
      setAccountSummaryLoading(true);
      void refreshAccountSummary({ force: true }).then(
        ({
          nickname,
          equippedSkin,
          ownedSkins,
          wins,
          losses,
          tokens,
          dailyRewardWins,
          dailyRewardTokens,
          achievements,
        }) => {
          if (!active) return;
          setAuthState({
            ready: true,
            userId: payload.userId,
            accessToken: useGameStore.getState().authAccessToken ?? payload.accessToken,
            isGuestUser: useGameStore.getState().isGuestUser,
            nickname,
            equippedSkin,
            ownedSkins,
            wins,
            losses,
            tokens,
            dailyRewardWins,
            dailyRewardTokens,
            achievements,
          });
        },
      ).finally(() => {
        if (!active) return;
        setAccountSummaryLoading(false);
      });
    };

    void (async () => {
      cleanupNativeAuth = await installNativeAuthCallbackHandler();
      const payload = await initializeGuestAuth();
      applyAuthPayload(payload);
    })();

    const unsubscribe = onAuthStateChanged((payload) => {
      applyAuthPayload(payload);
    });

    return () => {
      active = false;
      cleanupNativeAuth();
      unsubscribe();
    };
  }, [setAccountSummaryLoading, setAuthState]);

  useEffect(() => {
    if (!authReady) return;
    if (nicknameSyncTimeoutRef.current) {
      window.clearTimeout(nicknameSyncTimeoutRef.current);
    }

    nicknameSyncTimeoutRef.current = window.setTimeout(() => {
      void syncNickname(myNickname);
    }, 400);

    return () => {
      if (nicknameSyncTimeoutRef.current) {
        window.clearTimeout(nicknameSyncTimeoutRef.current);
        nicknameSyncTimeoutRef.current = null;
      }
    };
  }, [authReady, myNickname]);

  useEffect(() => {
    if (!authReady) return;
    void syncEquippedSkin(pieceSkin);
  }, [authReady, pieceSkin]);

  useEffect(() => {
    if (!authReady || !authAccessToken) return;
    const timeoutId = window.setTimeout(() => {
      void syncAchievementSettings({
        isMusicMuted,
        isSfxMuted,
        musicVolume,
        sfxVolume,
      }).then((profile) => {
        if (!profile) return;
        setAuthState({
          ready: true,
          userId: profile.userId,
          accessToken: useGameStore.getState().authAccessToken,
          isGuestUser: profile.isGuestUser,
          nickname: profile.nickname,
          equippedSkin: profile.equippedSkin,
          ownedSkins: profile.ownedSkins,
          wins: profile.wins,
          losses: profile.losses,
          tokens: profile.tokens,
          dailyRewardWins: profile.dailyRewardWins,
          dailyRewardTokens: profile.dailyRewardTokens,
          achievements: profile.achievements,
        });
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

  useEffect(() => {
    if (!authReady || !authAccessToken) return;

    const socket = getSocket();
    const registerSession = async () => {
      const authPayload = await getSocketAuthPayload();
      socket.emit(
        "session_register",
        {
          auth: {
            accessToken: authAccessToken,
            userId: authUserId ?? undefined,
            clientPlatform: authPayload?.clientPlatform,
            appVersionCode: authPayload?.appVersionCode,
          },
        },
        (response: { updateRequired?: boolean } & Partial<UpdateRequiredPayload>) => {
          if (response?.updateRequired) {
            applyUpdateRequired(response as UpdateRequiredPayload);
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
      disconnectSocket();
      useGameStore.getState().resetGame();
      setShowExitConfirm(false);
      setView("lobby");
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
            ownedSkins,
            wins,
            losses,
            tokens,
            dailyRewardWins,
            dailyRewardTokens,
            achievements,
          }) => {
            setAuthState({
              ready: true,
              userId: authUserId,
              accessToken: useGameStore.getState().authAccessToken,
              isGuestUser,
              nickname,
              equippedSkin,
              ownedSkins,
              wins,
              losses,
              tokens,
              dailyRewardWins,
              dailyRewardTokens,
              achievements,
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

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
      return;
    }

    let active = true;

    void (async () => {
      try {
        const info = await CapacitorApp.getInfo();
        const parsedVersionCode = Number(info.build ?? "");
        const versionCode = Number.isFinite(parsedVersionCode)
          ? Math.trunc(parsedVersionCode)
          : null;
        const query = versionCode !== null ? `?versionCode=${versionCode}` : "";
        const response = await fetch(
          `${import.meta.env.VITE_SERVER_URL}/app-version/android${query}`,
        );
        if (!response.ok) return;
        const payload = (await response.json()) as UpdateRequiredPayload;
        if (active) {
          applyUpdateRequired(payload);
        }
      } catch {
        // Ignore transient network/version check failures.
      }
    })();

    return () => {
      active = false;
    };
  }, [applyUpdateRequired]);

  const handleReturnToLobby = useCallback(() => {
    disconnectSocket();
    useGameStore.getState().resetGame();
    setShowExitConfirm(false);
    setView("lobby");
  }, []);

  const handleSessionReplacedConfirm = useCallback(async () => {
    setIsSessionResetting(true);
    try {
      const guestState = await logoutToGuestMode();
      setAuthState(guestState);
      disconnectSocket();
      useGameStore.getState().resetGame();
      setView("lobby");
      setShowSessionReplaced(false);
    } finally {
      setIsSessionResetting(false);
    }
  }, [setAuthState]);

  const exitTitle =
    lang === "en" ? "Exit PathClash?" : "\uC815\uB9D0\uB85C \uAC8C\uC784\uC744 \uC885\uB8CC\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?";
  const exitConfirmLabel = lang === "en" ? "Yes" : "\uC608";
  const exitCancelLabel = lang === "en" ? "No" : "\uC544\uB2C8\uC694";
  const sessionReplacedTitle =
    lang === "en"
      ? "This account is active on another device."
      : "\uB2E4\uB978 \uAE30\uAE30\uC5D0\uC11C \uC811\uC18D \uC911\uC785\uB2C8\uB2E4.";
  const sessionReplacedBody =
    lang === "en"
      ? "This session was closed to prevent duplicate matchmaking and state conflicts. Tap OK to continue in guest mode on this device."
      : "\uC911\uBCF5 \uB9E4\uCE58 \uBC0F \uC0C1\uD0DC \uCDA9\uB3CC\uC744 \uBC29\uC9C0\uD558\uAE30 \uC704\uD574 \uD604\uC7AC \uC138\uC158\uC774 \uC885\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uD655\uC778\uC744 \uB204\uB974\uBA74 \uC774 \uAE30\uAE30\uC5D0\uC11C \uAC8C\uC2A4\uD2B8 \uBAA8\uB4DC\uB85C \uACC4\uC18D\uD569\uB2C8\uB2E4.";
  const sessionReplacedConfirm =
    lang === "en" ? "OK" : "\uD655\uC778";
  const updateRequiredTitle =
    lang === "en"
      ? "A new version is available."
      : "새 버전이 나왔습니다.";
  const updateRequiredBody =
    lang === "en"
      ? "Please go to the Play Store and update the app to continue playing."
      : "게임을 계속하려면 플레이 스토어로 이동하여 앱을 업데이트해 주세요.";
  const updateRequiredConfirm =
    lang === "en" ? "Open Play Store" : "플레이 스토어로 이동";

  const handleOpenStoreForUpdate = useCallback(() => {
    if (!updateRequired) return;
    const nativeUrl =
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
        ? updateRequired.marketUrl
        : updateRequired.storeUrl;
    window.location.href = nativeUrl;
    if (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === "android"
    ) {
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
    const lobbyBgm = lobbyBgmRef.current;
    const inGameBgm = inGameBgmRef.current;
    if (!lobbyBgm || !inGameBgm) return;

    if (isMusicMuted) {
      lobbyBgm.pause();
      inGameBgm.pause();
      return;
    }

    const isBattleView = view === "game" || view === "coop" || view === "twovtwo" || view === "ability";
    const targetBgm = isBattleView ? inGameBgm : lobbyBgm;
    const otherBgm = isBattleView ? lobbyBgm : inGameBgm;

    otherBgm.pause();
    otherBgm.currentTime = 0;
    void targetBgm.play().catch(() => {
      // Autoplay can fail until the user interacts with the screen.
    });
  }, [isMusicMuted, view]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup = () => {};

    void CapacitorApp.addListener("backButton", () => {
      if (showSessionReplaced) {
        return;
      }
      if (view === "game" || view === "coop" || view === "twovtwo" || view === "ability") {
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
      const lobbyBgm = lobbyBgmRef.current;
      const inGameBgm = inGameBgmRef.current;
      if (!lobbyBgm || !inGameBgm) return;

      if (!isActive) {
        lobbyBgm.pause();
        inGameBgm.pause();
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

  if (!authReady || !legalConsentResolved) {
    return <div className="app app-loading">Connecting guest session...</div>;
  }

  const legalConsentTitle =
    lang === "en"
      ? "Terms of Service and Privacy Policy"
      : "\uC774\uC6A9\uC57D\uAD00 \uBC0F \uAC1C\uC778\uC815\uBCF4\uCC98\uB9AC\uBC29\uCE68";
  const legalConsentBody =
    lang === "en"
      ? "Please review the Terms of Service and Privacy Policy before continuing. You must agree to both to use PathClash."
      : "PathClash\uB97C \uC774\uC6A9\uD558\uB824\uBA74 \uC774\uC6A9\uC57D\uAD00\uACFC \uAC1C\uC778\uC815\uBCF4\uCC98\uB9AC\uBC29\uCE68\uC744 \uD655\uC778\uD55C \uB4A4 \uB3D9\uC758\uD574\uC57C \uD569\uB2C8\uB2E4.";
  const legalConsentTermsLabel =
    lang === "en" ? "View Terms of Service" : "\uC774\uC6A9\uC57D\uAD00 \uBCF4\uAE30";
  const legalConsentPolicyLabel =
    lang === "en" ? "View Privacy Policy" : "\uAC1C\uC778\uC815\uBCF4\uCC98\uB9AC\uBC29\uCE68 \uBCF4\uAE30";
  const legalConsentCheckboxLabel =
    lang === "en"
      ? "I agree to the Terms of Service and Privacy Policy."
      : "\uC774\uC6A9\uC57D\uAD00\uACFC \uAC1C\uC778\uC815\uBCF4\uCC98\uB9AC\uBC29\uCE68\uC5D0 \uB3D9\uC758\uD569\uB2C8\uB2E4.";
  const legalConsentConfirmLabel =
    lang === "en" ? "Agree and Start" : "\uB3D9\uC758\uD558\uACE0 \uC2DC\uC791";
  const legalConsentTermsPath = lang === "en" ? TERMS_PATH_EN : TERMS_PATH_KR;
  const legalConsentPolicyPath = lang === "en" ? POLICY_PATH_EN : POLICY_PATH_KR;
  const legalDocumentTitle =
    openLegalDocument === "terms"
      ? lang === "en"
        ? "Terms of Service"
        : "\uC774\uC6A9\uC57D\uAD00"
      : lang === "en"
        ? "Privacy Policy"
        : "\uAC1C\uC778\uC815\uBCF4\uCC98\uB9AC\uBC29\uCE68";
  const legalDocumentCloseLabel = lang === "en" ? "Close" : "\uB2EB\uAE30";
  const legalDocumentSrc =
    openLegalDocument === "terms" ? legalConsentTermsPath : legalConsentPolicyPath;

  return (
    <div className={`app ${view === "lobby" ? "app-lobby" : "app-game"}`}>
      <Suspense fallback={<div className="app app-loading">Loading...</div>}>
        {view === "lobby" && (
          <LobbyScreen
            onGameStart={() => setView("game")}
            onCoopStart={() => setView("coop")}
            onTwoVsTwoStart={() => setView("twovtwo")}
            onAbilityStart={() => setView("ability")}
            tutorialPromptTrigger={tutorialPromptTrigger}
          />
        )}
        {view === "game" && <GameScreen onLeaveToLobby={handleReturnToLobby} />}
        {view === "coop" && <CoopScreen onLeaveToLobby={handleReturnToLobby} />}
        {view === "twovtwo" && <TwoVsTwoScreen onLeaveToLobby={handleReturnToLobby} />}
        {view === "ability" && <AbilityScreen onLeaveToLobby={handleReturnToLobby} />}
      </Suspense>
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
                onChange={(event) => setLegalConsentChecked(event.target.checked)}
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
          <div className="app-legal-doc-modal" role="dialog" aria-modal="true">
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
  );
}

export default App;
