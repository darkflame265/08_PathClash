import { useState } from 'react';
import type { ClientPlayerState } from '../../types/game.types';
import './PlayerInfo.css';

interface Props {
  player: ClientPlayerState;
  isMe: boolean;
}

export function PlayerInfo({ player, isMe }: Props) {
  const [showProfile, setShowProfile] = useState(false);

  if (!player) return null;

  const total = player.stats.wins + player.stats.losses;
  const winRate = total > 0 ? Math.round((player.stats.wins / total) * 100) : 0;

  return (
    <div className="player-info">
      <button
        className={`nickname-btn color-${player.color}`}
        onClick={() => setShowProfile((value) => !value)}
      >
        {player.nickname} {showProfile ? '▲' : '▼'}
      </button>

      {showProfile && (
        <div className={`profile-box ${isMe ? 'profile-box-self' : ''}`}>
          <div className="profile-row"><span>닉네임</span><span>{player.nickname}</span></div>
          <div className="profile-row"><span>전적</span><span>{player.stats.wins}승 {player.stats.losses}패</span></div>
          <div className="profile-row"><span>승률</span><span>{winRate}%</span></div>
          <div className="profile-row"><span>ID</span><span>{player.id.slice(0, 8)}</span></div>
        </div>
      )}
    </div>
  );
}
