import { Position, PlayerColor, CollisionEvent, PlayerState } from '../types/game.types';

export function calcPathPoints(turn: number): number {
  return Math.min(4 + turn, 10);
}

export function isValidMove(from: Position, to: Position): boolean {
  const dr = Math.abs(to.row - from.row);
  const dc = Math.abs(to.col - from.col);
  return (
    dr + dc === 1 &&
    to.row >= 0 && to.row <= 4 &&
    to.col >= 0 && to.col <= 4
  );
}

export function isValidPath(start: Position, path: Position[], maxPoints: number): boolean {
  if (path.length > maxPoints) return false;
  let cur = start;
  for (const next of path) {
    if (!isValidMove(cur, next)) return false;
    cur = next;
  }
  return true;
}

export function detectCollisions(
  redPath: Position[],
  bluePath: Position[],
  redStart: Position,
  blueStart: Position,
  attackerColor: PlayerColor,
  escaperHp: number
): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  const escapeeColor: PlayerColor = attackerColor === 'red' ? 'blue' : 'red';

  const redSeq = [redStart, ...redPath];
  const blueSeq = [blueStart, ...bluePath];
  const maxLen = Math.max(redSeq.length, blueSeq.length);

  let currentHp = escaperHp;

  for (let i = 0; i < maxLen; i++) {
    const r = redSeq[Math.min(i, redSeq.length - 1)];
    const b = blueSeq[Math.min(i, blueSeq.length - 1)];

    // Same cell collision
    if (r.row === b.row && r.col === b.col) {
      currentHp = Math.max(0, currentHp - 1);
      events.push({ step: i, position: r, escapeeColor, newHp: currentHp });
      continue;
    }

    // Swap/cross collision (between step i-1 and i)
    if (i > 0) {
      const rPrev = redSeq[Math.min(i - 1, redSeq.length - 1)];
      const bPrev = blueSeq[Math.min(i - 1, blueSeq.length - 1)];
      if (
        r.row === bPrev.row && r.col === bPrev.col &&
        b.row === rPrev.row && b.col === rPrev.col
      ) {
        currentHp = Math.max(0, currentHp - 1);
        events.push({ step: i, position: r, escapeeColor, newHp: currentHp });
      }
    }
  }

  return events;
}

export function getInitialPositions(): { red: Position; blue: Position } {
  return {
    red: { row: 2, col: 0 },
    blue: { row: 2, col: 4 },
  };
}

export function calcAnimationDuration(pathLength: number): number {
  // 200ms per step + 300ms buffer
  return pathLength * 200 + 300;
}

export function toClientPlayer(p: PlayerState) {
  const { socketId: _s, ...rest } = p;
  return rest;
}
