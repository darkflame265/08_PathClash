import { useEffect } from 'react';
import { getSocket } from '../../socket/socketClient';
import { registerSocketHandlers } from '../../socket/socketHandlers';
import { useGameStore } from '../../store/gameStore';
import { GameGrid } from './GameGrid';
import { TimerBar } from './TimerBar';
import { HpDisplay } from './HpDisplay';
import { PlayerInfo } from './PlayerInfo';
import { ChatPanel } from './ChatPanel';
import { GameOverOverlay } from './GameOverOverlay';
import './GameScreen.css';

interface Props {
  onLeaveToLobby: () => void;
}

export function GameScreen({ onLeaveToLobby }: Props) {
  const { gameState, myColor, roundInfo, winner } = useGameStore();

  useEffect(() => {
    const socket = getSocket();
    const cleanup = registerSocketHandlers(socket);
    return cleanup;
  }, []);

  if (!gameState) return <div className="loading">게임 로딩 중...</div>;

  const opponentColor = myColor === 'red' ? 'blue' : 'red';
  const me = myColor ? gameState.players[myColor] : null;
  const opponent = gameState.players[opponentColor];

  return (
    <div className="game-screen">
      {/* 유틸리티 바: 타이머 + 버튼 */}
      <div className="utility-bar">
        <div className="timer-slot">
          {gameState.phase === 'planning' && roundInfo && (
            <TimerBar
              duration={roundInfo.timeLimit}
              serverStartTime={roundInfo.serverTime}
            />
          )}
          {gameState.phase === 'moving' && (
            <div className="phase-label moving">이동 중...</div>
          )}
        </div>
        <div className="utility-buttons">
          <button className="lobby-btn" onClick={onLeaveToLobby}>Lobby</button>
          <MuteButton />
        </div>
      </div>

      {/* 상대방 패널 */}
      <div className="player-panel">
        <PlayerInfo player={opponent} isMe={false} />
        <div className="role-pill">
          <span className="role-icon">{opponent.role === 'attacker' ? '⚔' : '🏃'}</span>
          <span className="role-text">{opponent.role === 'attacker' ? '공격' : '도망'}</span>
        </div>
        <div className="hp-slot">
          <HpDisplay color={opponentColor} hp={gameState.players[opponentColor].hp} myColor={myColor!} />
        </div>
      </div>

      {/* 그리드 */}
      <div className="grid-area">
        <GameGrid />
      </div>

      {/* 내 패널 */}
      <div className="player-panel self-panel">
        <PlayerInfo player={me!} isMe={true} />
        <div className="role-pill role-pill-self">
          <span className="role-icon">{me?.role === 'attacker' ? '⚔' : '🏃'}</span>
          <span className="role-text">{me?.role === 'attacker' ? '공격' : '도망'}</span>
        </div>
        <div className="hp-slot">
          <HpDisplay color={myColor!} hp={me?.hp ?? 3} myColor={myColor!} />
        </div>
      </div>

      {/* 경로 포인트 */}
      {gameState.phase === 'planning' && (
        <div className="footer-row">
          <span className="path-points">경로: {useGameStore.getState().myPath.length} / {gameState.pathPoints}</span>
        </div>
      )}

      <ChatPanel />
      {winner && <GameOverOverlay winner={winner} myColor={myColor!} />}
    </div>
  );
}

function MuteButton() {
  const { isMuted, toggleMute } = useGameStore();
  return (
    <button className="mute-btn" onClick={toggleMute} title={isMuted ? '음소거 해제' : '음소거'}>
      {isMuted ? '🔇' : '🔊'}
    </button>
  );
}
