import type { PieceSkin } from "../types/game.types";

export interface ArenaRange {
  arena: number;
  label: string;
  themeName: string;
  minRating: number;
  maxRating: number;
}

export const ARENA_RANGES: ArenaRange[] = [
  { arena: 1,  label: "Arena 1",  themeName: "시작의 방",          minRating: 0,    maxRating: 199  },
  { arena: 2,  label: "Arena 2",  themeName: "네온사인-사이버펑크", minRating: 200,  maxRating: 499  },
  { arena: 3,  label: "Arena 3",  themeName: "화산지대",            minRating: 500,  maxRating: 899  },
  { arena: 4,  label: "Arena 4",  themeName: "번개지대",            minRating: 900,  maxRating: 1399 },
  { arena: 5,  label: "Arena 5",  themeName: "마법사의 방",         minRating: 1400, maxRating: 1999 },
  { arena: 6,  label: "Arena 6",  themeName: "피라미드",            minRating: 2000, maxRating: 2699 },
  { arena: 7,  label: "Arena 7",  themeName: "몽환의 숲",           minRating: 2700, maxRating: 3499 },
  { arena: 8,  label: "Arena 8",  themeName: "과학의 방",           minRating: 3500, maxRating: 4199 },
  { arena: 9,  label: "Arena 9",  themeName: "고산지대",            minRating: 4200, maxRating: 4799 },
  { arena: 10, label: "Arena 10", themeName: "천공의 신전",         minRating: 4800, maxRating: 4999 },
];

export const RANKED_UNLOCKED_THRESHOLD = 5000;

export function getArenaFromRating(rating: number): number {
  if (rating >= RANKED_UNLOCKED_THRESHOLD) return 10;
  for (const range of ARENA_RANGES) {
    if (rating >= range.minRating && rating <= range.maxRating) {
      return range.arena;
    }
  }
  return 1;
}

export function getArenaLabel(arena: number, rankedUnlocked: boolean): string {
  if (rankedUnlocked) return "Ranked";
  return `Arena ${arena}`;
}

/** 스킨별 필요 최소 highest_arena_reached 번호 */
export const SKIN_ARENA_REQUIREMENTS: Partial<Record<PieceSkin, number>> = {
  // Arena 1: 시작의 방
  cosmic:        1,
  plasma:        1,

  // Arena 2: 네온사인-사이버펑크
  neon_pulse:    2,
  quantum:       2,

  // Arena 3: 화산지대
  inferno:       3,

  // Arena 4: 번개지대
  electric_core: 4,

  // Arena 5: 마법사의 방
  wizard:        5,

  // Arena 6: 피라미드
  sun:           6,
  gold_core:     6,

  // Arena 8: 과학의 방
  atomic:        8,
  arc_reactor:   8,

  // Arena 10: 천공의 신전
  chronos:       10,
};

export function getSkinRequiredArena(skinId: PieceSkin): number {
  return SKIN_ARENA_REQUIREMENTS[skinId] ?? 1;
}

export function isSkinArenaUnlocked(skinId: PieceSkin, highestArena: number): boolean {
  return highestArena >= getSkinRequiredArena(skinId);
}

export const ARENA_REWARD_SKINS: Partial<Record<number, PieceSkin[]>> = {
  1:  ["cosmic", "plasma"],
  2:  ["neon_pulse", "quantum"],
  3:  ["inferno"],
  4:  ["electric_core"],
  5:  ["wizard"],
  6:  ["sun", "gold_core"],
  8:  ["atomic", "arc_reactor"],
  10: ["chronos"],
};
