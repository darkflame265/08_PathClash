import { useEffect, useRef, useState } from 'react';
import { initializeGuestAuth, onAuthStateChanged, syncNickname } from './auth/guestAuth';
import { GameScreen } from './components/Game/GameScreen';
import { LobbyScreen } from './components/Lobby/LobbyScreen';
import { disconnectSocket } from './socket/socketClient';
import { useGameStore } from './store/gameStore';
import './App.css';

type AppView = 'lobby' | 'game';

function App() {
  const [view, setView] = useState<AppView>('lobby');
  const { authReady, myNickname, setAuthState } = useGameStore();
  const nicknameSyncTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    initializeGuestAuth().then((payload) => {
      if (active) {
        setAuthState(payload);
      }
    });

    const unsubscribe = onAuthStateChanged((payload) => {
      if (active) {
        setAuthState(payload);
      }
    });

    return () => {
      active = false;
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

  const handleReturnToLobby = () => {
    disconnectSocket();
    useGameStore.getState().resetGame();
    setView('lobby');
  };

  if (!authReady) {
    return <div className="app app-loading">Connecting guest session...</div>;
  }

  return (
    <div className={`app ${view === 'game' ? 'app-game' : 'app-lobby'}`}>
      {view === 'lobby' && <LobbyScreen onGameStart={() => setView('game')} />}
      {view === 'game' && <GameScreen onLeaveToLobby={handleReturnToLobby} />}
    </div>
  );
}

export default App;
