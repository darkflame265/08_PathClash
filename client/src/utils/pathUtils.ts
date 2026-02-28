import type { Position } from '../types/game.types';

export function isValidMove(from: Position, to: Position): boolean {
  const dr = Math.abs(to.row - from.row);
  const dc = Math.abs(to.col - from.col);
  return (
    dr + dc === 1 &&
    to.row >= 0 && to.row <= 4 &&
    to.col >= 0 && to.col <= 4
  );
}

export function posEqual(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export function isBlockedCell(cell: Position, obstacles: Position[]): boolean {
  return obstacles.some((obstacle) => posEqual(obstacle, cell));
}

export function getCellCenter(row: number, col: number, cellSize: number): { x: number; y: number } {
  return {
    x: col * cellSize + cellSize / 2,
    y: row * cellSize + cellSize / 2,
  };
}

export function pixelToCell(
  px: number, py: number, cellSize: number, gridOffset: { x: number; y: number }
): Position | null {
  const col = Math.floor((px - gridOffset.x) / cellSize);
  const row = Math.floor((py - gridOffset.y) / cellSize);
  if (row < 0 || row > 4 || col < 0 || col > 4) return null;
  return { row, col };
}
