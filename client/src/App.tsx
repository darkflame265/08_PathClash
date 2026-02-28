import { useState } from 'react';
import { LobbyScreen } from './components/Lobby/LobbyScreen';
import { GameScreen } from './components/Game/GameScreen';
import { disconnectSocket } from './socket/socketClient';
import { useGameStore } from './store/gameStore';
import './App.css';

type AppView = 'lobby' | 'game';

function App() {
  const [view, setView] = useState<AppView>('lobby');

  const handleReturnToLobby = () => {
    disconnectSocket();
    useGameStore.getState().resetGame();
    setView('lobby');
  };

  return (
    <div className={`app ${view === 'game' ? 'app-game' : 'app-lobby'}`}>
      {view === 'lobby' && <LobbyScreen onGameStart={() => setView('game')} />}
      {view === 'game' && <GameScreen onLeaveToLobby={handleReturnToLobby} />}
    </div>
  );
}

export default App;
