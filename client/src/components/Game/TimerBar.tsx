import { useEffect, useState } from 'react';
import './TimerBar.css';

interface Props {
  duration: number;        // seconds
  localStartTime: number;  // performance.now timestamp
}

export function TimerBar({ duration, localStartTime }: Props) {
  const [remaining, setRemaining] = useState(duration);

  useEffect(() => {
    const update = () => {
      const elapsed = (performance.now() - localStartTime) / 1000;
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);
    };
    update();
    const id = setInterval(update, 50);
    return () => clearInterval(id);
  }, [duration, localStartTime]);

  const pct = (remaining / duration) * 100;
  const colorClass = pct > 50 ? 'green' : pct > 20 ? 'yellow' : 'red';

  return (
    <div className="timer-container">
      <div className={`timer-bar ${colorClass}`} style={{ width: `${pct}%` }} />
      <span className="timer-text">{Math.ceil(remaining)}s</span>
    </div>
  );
}
