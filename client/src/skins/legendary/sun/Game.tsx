import "./game.css";

interface SunGameProps {
  cellSize: number;
}

export function SunGame({ cellSize }: SunGameProps) {
  return (
    <div
      className="sun-core"
      aria-hidden="true"
      style={{
        ["--sun-core-size" as string]: `${Math.max(18, cellSize * 0.34)}px`,
      }}
    >
      <div className="sun"></div>
    </div>
  );
}
