import { useEffect, useState } from 'react';
import './TimerBar.css';

interface Props {
  duration: number;         // seconds
  serverStartTime: number;  // ms timestamp
}

export function TimerBar({ duration, serverStartTime }: Props) {
  const [remaining, setRemaining] = useState(duration);

  useEffect(() => {
    const update = () => {
      const elapsed = (Date.now() - serverStartTime) / 1000;
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);
    };
    update();
    const id = setInterval(update, 50);
    return () => clearInterval(id);
  }, [duration, serverStartTime]);

  const pct = (remaining / duration) * 100;
  const colorClass = pct > 50 ? 'green' : pct > 20 ? 'yellow' : 'red';

  return (
    <div className="timer-container">
      <div className={`timer-bar ${colorClass}`} style={{ width: `${pct}%` }} />
      <span className="timer-text">{Math.ceil(remaining)}s</span>
    </div>
  );
}
