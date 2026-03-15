import { useEffect, useState } from "react";
import "./game.css";

interface AtomicGameProps {
  cellSize: number;
}

export function AtomicGame({ cellSize }: AtomicGameProps) {
  const [atomicReady, setAtomicReady] = useState(false);

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;

    setAtomicReady(false);
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setAtomicReady(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [cellSize]);

  return (
    <div
      className={`atomic-atom ${atomicReady ? "atomic-ready" : ""}`}
      aria-hidden="true"
    >
      <div className="atomic-nucleus" />
      <div className="atomic-electron atomic-electron-1">
        <div className="atomic-electron-ring">
          <div className="atomic-electron-particle" />
        </div>
      </div>
      <div className="atomic-electron atomic-electron-2">
        <div className="atomic-electron-ring">
          <div className="atomic-electron-particle" />
        </div>
      </div>
      <div className="atomic-electron atomic-electron-3">
        <div className="atomic-electron-ring">
          <div className="atomic-electron-particle" />
        </div>
      </div>
    </div>
  );
}
