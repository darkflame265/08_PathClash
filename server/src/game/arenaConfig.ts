export interface ArenaRange {
  arena: number;
  minRating: number;
  maxRating: number;
}

export const ARENA_RANGES: ArenaRange[] = [
  { arena: 1,  minRating: 0,    maxRating: 199  },
  { arena: 2,  minRating: 200,  maxRating: 499  },
  { arena: 3,  minRating: 500,  maxRating: 899  },
  { arena: 4,  minRating: 900,  maxRating: 1399 },
  { arena: 5,  minRating: 1400, maxRating: 1999 },
  { arena: 6,  minRating: 2000, maxRating: 2699 },
  { arena: 7,  minRating: 2700, maxRating: 3499 },
  { arena: 8,  minRating: 3500, maxRating: 4199 },
  { arena: 9,  minRating: 4200, maxRating: 4799 },
  { arena: 10, minRating: 4800, maxRating: 4999 },
];

export const RANKED_UNLOCKED_THRESHOLD = 5000;

interface RatingChange {
  win: number;
  loss: number;
}

const RATING_CHANGES: Array<{ arenas: number[]; change: RatingChange }> = [
  { arenas: [1, 2, 3], change: { win: 50,  loss: -10 } },
  { arenas: [4, 5, 6], change: { win: 40,  loss: -25 } },
  { arenas: [7, 8],    change: { win: 30,  loss: -30 } },
  { arenas: [9, 10],   change: { win: 25,  loss: -35 } },
];

const RANKED_RATING_CHANGE: RatingChange = { win: 20, loss: -40 };

export function getArenaFromRating(rating: number): number {
  if (rating >= RANKED_UNLOCKED_THRESHOLD) return 10;
  for (const range of ARENA_RANGES) {
    if (rating >= range.minRating && rating <= range.maxRating) {
      return range.arena;
    }
  }
  return 1;
}

export function getRatingChange(currentRating: number, isWin: boolean): number {
  if (currentRating >= RANKED_UNLOCKED_THRESHOLD) {
    return isWin ? RANKED_RATING_CHANGE.win : RANKED_RATING_CHANGE.loss;
  }
  const arena = getArenaFromRating(currentRating);
  for (const entry of RATING_CHANGES) {
    if (entry.arenas.includes(arena)) {
      return isWin ? entry.change.win : entry.change.loss;
    }
  }
  return isWin ? 25 : -35;
}

/** 아레나별 AI fallback 대기 시간 (ms). ranked_unlocked면 AI 없음 → -1 반환. */
export function getAbilityAiFallbackMs(currentRating: number, rankedUnlocked: boolean): number {
  if (rankedUnlocked || currentRating >= RANKED_UNLOCKED_THRESHOLD) return -1;
  const arena = getArenaFromRating(currentRating);
  if (arena <= 3) return 7_000;
  if (arena <= 6) return 12_000;
  if (arena <= 8) return 20_000;
  return 30_000;
}
