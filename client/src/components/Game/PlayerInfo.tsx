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
  const [copied, setCopied] = useState(false);
  const { t, lang } = useLang();

  if (!player) return null;

  const total = player.stats.wins + player.stats.losses;
  const winRate = total > 0 ? Math.round((player.stats.wins / total) * 100) : 0;
  const copyLabel = lang === "en" ? "Copy" : "\uBCF5\uC0AC";
  const copiedLabel = lang === "en" ? "Copied" : "\uBCF5\uC0AC\uB428";
  const displayId =
    player.id.length >= 12
      ? `${player.id.slice(0, 8)}-${player.id.slice(9, 13)}`
      : player.id.slice(0, 8);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(player.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

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
            <button
              className={`profile-id-btn ${copied ? "is-copied" : ""}`}
              onClick={() => void handleCopyId()}
              type="button"
            >
              <span>{displayId}</span>
              <span className="profile-id-copy">
                {copied ? copiedLabel : copyLabel}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
