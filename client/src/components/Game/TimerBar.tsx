import { useEffect, useState } from 'react';
import './TimerBar.css';
import { getEstimatedServerNow } from '../../socket/timeSync';

interface Props {
  duration: number;     // seconds
  roundEndsAt: number;  // ms timestamp on server clock
}

export function TimerBar({ duration, roundEndsAt }: Props) {
  const [remaining, setRemaining] = useState(duration);

  useEffect(() => {
    const update = () => {
      const left = Math.max(0, (roundEndsAt - getEstimatedServerNow()) / 1000);
      setRemaining(left);
    };
    update();
    const id = setInterval(update, 50);
    return () => clearInterval(id);
  }, [duration, roundEndsAt]);

  const pct = (remaining / duration) * 100;
  const colorClass = pct > 50 ? 'green' : pct > 20 ? 'yellow' : 'red';

  return (
    <div className="timer-container">
      <div className={`timer-bar ${colorClass}`} style={{ width: `${pct}%` }} />
      <span className="timer-text">{Math.ceil(remaining)}s</span>
    </div>
  );
}
