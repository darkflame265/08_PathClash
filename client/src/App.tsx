import { useState } from 'react';
import { LobbyScreen } from './components/Lobby/LobbyScreen';
import { GameScreen } from './components/Game/GameScreen';
import './App.css';

type AppView = 'lobby' | 'game';

function App() {
  const [view, setView] = useState<AppView>('lobby');

  return (
    <div className="app">
      {view === 'lobby' && <LobbyScreen onGameStart={() => setView('game')} />}
      {view === 'game' && <GameScreen />}
    </div>
  );
}

export default App;
