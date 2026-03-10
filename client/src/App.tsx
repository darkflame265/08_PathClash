import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  initializeGuestAuth,
  installNativeAuthCallbackHandler,
  onAuthStateChanged,
  syncNickname,
} from "./auth/guestAuth";
import { GameScreen } from "./components/Game/GameScreen";
import { LobbyScreen } from "./components/Lobby/LobbyScreen";
import { disconnectSocket } from "./socket/socketClient";
import { useGameStore } from "./store/gameStore";
import "./App.css";

type AppView = "lobby" | "game";

function App() {
  const [view, setView] = useState<AppView>("lobby");
  const { authReady, myNickname, setAuthState, isMusicMuted } = useGameStore();
  const nicknameSyncTimeoutRef = useRef<number | null>(null);
  const lobbyBgmRef = useRef<HTMLAudioElement | null>(null);
  const inGameBgmRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const lobbyBgm = new Audio("/music/Lobby_bgm_1.mp3");
    lobbyBgm.loop = true;
    lobbyBgm.preload = "auto";
    lobbyBgm.volume = 0.15;

    const inGameBgm = new Audio("/music/InGame_bgm_1.mp3");
    inGameBgm.loop = true;
    inGameBgm.preload = "auto";
    inGameBgm.volume = 0.15;

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

  const handleReturnToLobby = useCallback(() => {
    disconnectSocket();
    useGameStore.getState().resetGame();
    setView("lobby");
  }, []);

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
      void CapacitorApp.exitApp();
    }).then((listener) => {
      cleanup = () => {
        void listener.remove();
      };
    });

    return () => {
      cleanup();
    };
  }, [handleReturnToLobby, view]);

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

  if (!authReady) {
    return <div className="app app-loading">Connecting guest session...</div>;
  }

  return (
    <div className={`app ${view === "game" ? "app-game" : "app-lobby"}`}>
      {view === "lobby" && <LobbyScreen onGameStart={() => setView("game")} />}
      {view === "game" && <GameScreen onLeaveToLobby={handleReturnToLobby} />}
    </div>
  );
}

export default App;
