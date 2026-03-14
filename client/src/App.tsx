import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  initializeGuestAuth,
  installNativeAuthCallbackHandler,
  onAuthStateChanged,
  syncEquippedSkin,
  syncNickname,
} from "./auth/guestAuth";
import { GameScreen } from "./components/Game/GameScreen";
import { LobbyScreen } from "./components/Lobby/LobbyScreen";
import { disconnectSocket, getSocket } from "./socket/socketClient";
import { useLang } from "./hooks/useLang";
import { useGameStore } from "./store/gameStore";
import "./App.css";

type AppView = "lobby" | "game";

function App() {
  const [view, setView] = useState<AppView>("lobby");
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const {
    authReady,
    myNickname,
    pieceSkin,
    setAuthState,
    isMusicMuted,
    musicVolume,
  } =
    useGameStore();
  const { lang } = useLang();
  const nicknameSyncTimeoutRef = useRef<number | null>(null);
  const lobbyBgmRef = useRef<HTMLAudioElement | null>(null);
  const inGameBgmRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const lobbyBgm = new Audio("/music/Lobby_bgm_1.ogg");
    lobbyBgm.loop = true;
    lobbyBgm.preload = "auto";
    lobbyBgm.volume = musicVolume;

    const inGameBgm = new Audio("/music/InGame_bgm_1.ogg");
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

  const handleReturnToLobby = useCallback(() => {
    disconnectSocket();
    useGameStore.getState().resetGame();
    setShowExitConfirm(false);
    setView("lobby");
  }, []);

  const exitTitle =
    lang === "en" ? "Exit PathClash?" : "\uC815\uB9D0\uB85C \uAC8C\uC784\uC744 \uC885\uB8CC\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?";
  const exitConfirmLabel = lang === "en" ? "Yes" : "\uC608";
  const exitCancelLabel = lang === "en" ? "No" : "\uC544\uB2C8\uC694";

  const tryStartBgm = useCallback(() => {
    const lobbyBgm = lobbyBgmRef.current;
    const inGameBgm = inGameBgmRef.current;
    if (!lobbyBgm || !inGameBgm) return;

    if (isMusicMuted) {
      lobbyBgm.pause();
      inGameBgm.pause();
      return;
    }

    const targetBgm = view === "game" ? inGameBgm : lobbyBgm;
    const otherBgm = view === "game" ? lobbyBgm : inGameBgm;

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
      if (view === "game") {
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
  }, [handleReturnToLobby, showExitConfirm, view]);

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
    <div className={`app ${view === "game" ? "app-game" : "app-lobby"}`}>
      {view === "lobby" && <LobbyScreen onGameStart={() => setView("game")} />}
      {view === "game" && <GameScreen onLeaveToLobby={handleReturnToLobby} />}
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
    </div>
  );
}

export default App;
