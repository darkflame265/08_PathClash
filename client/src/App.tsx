import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  initializeGuestAuth,
  installNativeAuthCallbackHandler,
  logoutToGuestMode,
  onAuthStateChanged,
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

type AppView = "lobby" | "game" | "coop" | "twovtwo";

function App() {
  const [view, setView] = useState<AppView>("lobby");
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSessionReplaced, setShowSessionReplaced] = useState(false);
  const [isSessionResetting, setIsSessionResetting] = useState(false);
  const {
    authReady,
    authUserId,
    authAccessToken,
    myNickname,
    pieceSkin,
    setAuthState,
    isMusicMuted,
    musicVolume,
  } = useGameStore();
  const { lang } = useLang();
  const nicknameSyncTimeoutRef = useRef<number | null>(null);
  const lobbyBgmRef = useRef<HTMLAudioElement | null>(null);
  const inGameBgmRef = useRef<HTMLAudioElement | null>(null);

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

    void (async () => {
      cleanupNativeAuth = await installNativeAuthCallbackHandler();
      const payload = await initializeGuestAuth();
      if (active) {
        setAuthState(payload);
      }
    })();

    const unsubscribe = onAuthStateChanged((payload) => {
      if (active) {
        setAuthState(payload);
      }
    });

    return () => {
      active = false;
      cleanupNativeAuth();
      unsubscribe();
    };
  }, [setAuthState]);

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
    const socket = getSocket();
    if (!socket.connected) return;
    socket.emit("update_piece_skin", { pieceSkin });
  }, [pieceSkin]);

  useEffect(() => {
    if (!authReady || !authAccessToken) return;

    const socket = getSocket();
    const registerSession = () => {
      socket.emit("session_register", {
        auth: {
          accessToken: authAccessToken,
          userId: authUserId ?? undefined,
        },
      });
    };

    socket.on("connect", registerSession);
    if (socket.connected) {
      registerSession();
    }

    return () => {
      socket.off("connect", registerSession);
    };
  }, [authAccessToken, authReady, authUserId]);

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

  const tryStartBgm = useCallback(() => {
    const lobbyBgm = lobbyBgmRef.current;
    const inGameBgm = inGameBgmRef.current;
    if (!lobbyBgm || !inGameBgm) return;

    if (isMusicMuted) {
      lobbyBgm.pause();
      inGameBgm.pause();
      return;
    }

    const isBattleView = view === "game" || view === "coop" || view === "twovtwo";
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
      if (view === "game" || view === "coop" || view === "twovtwo") {
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

  if (!authReady) {
    return <div className="app app-loading">Connecting guest session...</div>;
  }

  return (
    <div className={`app ${view === "lobby" ? "app-lobby" : "app-game"}`}>
      <Suspense fallback={<div className="app app-loading">Loading...</div>}>
        {view === "lobby" && (
          <LobbyScreen
            onGameStart={() => setView("game")}
            onCoopStart={() => setView("coop")}
            onTwoVsTwoStart={() => setView("twovtwo")}
          />
        )}
        {view === "game" && <GameScreen onLeaveToLobby={handleReturnToLobby} />}
        {view === "coop" && <CoopScreen onLeaveToLobby={handleReturnToLobby} />}
        {view === "twovtwo" && <TwoVsTwoScreen onLeaveToLobby={handleReturnToLobby} />}
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
    </div>
  );
}

export default App;
