import { useState } from "react";
import type { ClientPlayerState } from "../../types/game.types";
import { useLang } from "../../hooks/useLang";
import "./PlayerInfo.css";

interface Props {
  player: ClientPlayerState;
  isMe: boolean;
}

export function PlayerInfo({ player, isMe }: Props) {
  const [showProfile, setShowProfile] = useState(false);
  const { t } = useLang();

  if (!player) return null;

  const total = player.stats.wins + player.stats.losses;
  const winRate = total > 0 ? Math.round((player.stats.wins / total) * 100) : 0;

  return (
    <div className="player-info">
      <button
        className={`nickname-btn color-${player.color}`}
        onClick={() => setShowProfile((value) => !value)}
      >
        {player.nickname} {showProfile ? "▲" : "▼"}
      </button>

      {showProfile && (
        <div className={`profile-box ${isMe ? "profile-box-self" : ""}`}>
          <div className="profile-row">
            <span>{t.profileNickname}</span>
            <span>{player.nickname}</span>
          </div>
          <div className="profile-row">
            <span>{t.profileRecord}</span>
            <span>
              {player.stats.wins}
              {t.profileWins} {player.stats.losses}
              {t.profileLosses}
            </span>
          </div>
          <div className="profile-row">
            <span>{t.profileWinRate}</span>
            <span>{winRate}%</span>
          </div>
          <div className="profile-row">
            <span>ID</span>
            <span>{player.id.slice(0, 8)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
