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

export const ABILITY_ARENA_WIN_RATING = 30;

const LOSS_PROGRESS_POINTS = [
  { progress: 0, loss: 5 },
  { progress: 0.25, loss: 10 },
  { progress: 0.5, loss: 18 },
  { progress: 0.75, loss: 27 },
  { progress: 0.95, loss: 40 },
];

const RANKED_RATING_CHANGE: RatingChange = {
  win: ABILITY_ARENA_WIN_RATING,
  loss: -40,
};

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
  if (isWin) return ABILITY_ARENA_WIN_RATING;

  const arenaRange = getArenaRangeFromRating(currentRating);
  const progress = getArenaProgress(currentRating, arenaRange);
  return -getInterpolatedLoss(progress);
}

export function getRatingFloor(currentRating: number): number {
  if (currentRating >= RANKED_UNLOCKED_THRESHOLD) return RANKED_UNLOCKED_THRESHOLD;
  return getArenaRangeFromRating(currentRating).minRating;
}

function getArenaRangeFromRating(currentRating: number): ArenaRange {
  const arena = getArenaFromRating(currentRating);
  return ARENA_RANGES.find((range) => range.arena === arena) ?? ARENA_RANGES[0];
}

function getArenaProgress(currentRating: number, arenaRange: ArenaRange): number {
  const span = Math.max(1, arenaRange.maxRating - arenaRange.minRating);
  const progress = (currentRating - arenaRange.minRating) / span;
  return Math.max(0, Math.min(1, progress));
}

function getInterpolatedLoss(progress: number): number {
  for (let i = 1; i < LOSS_PROGRESS_POINTS.length; i += 1) {
    const previous = LOSS_PROGRESS_POINTS[i - 1];
    const next = LOSS_PROGRESS_POINTS[i];
    if (progress <= next.progress) {
      const width = next.progress - previous.progress;
      const localProgress = width <= 0 ? 0 : (progress - previous.progress) / width;
      return Math.round(previous.loss + (next.loss - previous.loss) * localProgress);
    }
  }
  return LOSS_PROGRESS_POINTS[LOSS_PROGRESS_POINTS.length - 1].loss;
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
