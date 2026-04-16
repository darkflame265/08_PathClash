import type {
  BoardSkin,
  GamePhase,
  PieceSkin,
  PlayerColor,
  PlayerRole,
  Position,
} from "./game.types";

export type AbilitySkillId =
  | "classic_guard"
  | "arc_reactor_field"
  | "phase_shift"
  | "ember_blast"
  | "atomic_fission"
  | "inferno_field"
  | "nova_blast"
  | "sun_chariot"
  | "aurora_heal"
  | "gold_overdrive"
  | "quantum_shift"
  | "plasma_charge"
  | "void_cloak"
  | "electric_blitz"
  | "cosmic_bigbang"
  | "wizard_magic_mine"
  | "chronos_time_rewind";
export type AbilitySkillCategory = "attack" | "defense" | "utility" | "passive";

export const ABILITY_SKILL_IDS: AbilitySkillId[] = [
  "classic_guard",
  "arc_reactor_field",
  "phase_shift",
  "ember_blast",
  "atomic_fission",
  "inferno_field",
  "nova_blast",
  "sun_chariot",
  "aurora_heal",
  "gold_overdrive",
  "quantum_shift",
  "plasma_charge",
  "void_cloak",
  "electric_blitz",
  "cosmic_bigbang",
  "wizard_magic_mine",
  "chronos_time_rewind",
];

export function normalizeAbilityLoadout(
  value: unknown,
  fallback: AbilitySkillId[] = ["classic_guard"],
): AbilitySkillId[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value.filter(
    (entry): entry is AbilitySkillId =>
      typeof entry === "string" &&
      ABILITY_SKILL_IDS.includes(entry as AbilitySkillId),
  );

  return normalized.length > 0 ? normalized.slice(0, 3) : fallback;
}

// Client-side single source of truth for displayed mana costs.
// When balance changes happen, update this object first so skill buttons,
// tooltips, and lobby cards stay in sync.
export const ABILITY_SKILL_COSTS: Record<AbilitySkillId, number> = {
  classic_guard: 2,
  arc_reactor_field: 6,
  phase_shift: 8,
  ember_blast: 4,
  atomic_fission: 6,
  inferno_field: 6,
  nova_blast: 4,
  sun_chariot: 8,
  aurora_heal: 8,
  gold_overdrive: 8,
  quantum_shift: 4,
  plasma_charge: 2,
  void_cloak: 4,
  electric_blitz: 6,
  cosmic_bigbang: 10,
  wizard_magic_mine: 8,
  chronos_time_rewind: 0,
};

export interface AbilitySkillDefinition {
  id: AbilitySkillId;
  name: { en: string; kr: string };
  description: { en: string; kr: string };
  loadoutTags: { en: string; kr: string };
  loadoutDescription: { en: string; kr: string };
  manaCost: number;
  category: AbilitySkillCategory;
  skinId: PieceSkin;
  icon: string;
}

export interface AbilitySkillReservation {
  skillId: AbilitySkillId;
  step: number;
  order: number;
  target?: Position | null;
}

export interface AbilityLavaTile {
  position: Position;
  remainingTurns: number;
}

export interface AbilityTrapTile {
  position: Position;
  owner: PlayerColor;
  remainingTurns: number;
}

export interface AbilityPlayerState {
  id: string;
  nickname: string;
  color: PlayerColor;
  connected?: boolean;
  pieceSkin: PieceSkin;
  boardSkin: BoardSkin;
  hp: number;
  position: Position;
  pathSubmitted: boolean;
  role: PlayerRole;
  stats: { wins: number; losses: number };
  mana: number;
  invulnerableSteps: number;
  overdriveActive: boolean;
  reboundLocked: boolean;
  hidden: boolean;
  previousTurnStart: Position | null;
  previousTurnPath: Position[];
  equippedSkills: AbilitySkillId[];
  timeRewindUsed: boolean;
}

export interface AbilityBattleState {
  roomId: string;
  code: string;
  turn: number;
  phase: GamePhase;
  pathPoints: number;
  obstacles: Position[];
  lavaTiles: AbilityLavaTile[];
  trapTiles: AbilityTrapTile[];
  players: {
    red: AbilityPlayerState;
    blue: AbilityPlayerState;
  };
  attackerColor: PlayerColor;
}

export interface AbilityRoundStartPayload {
  timeLimit: number;
  roundEndsAt: number;
  state: AbilityBattleState;
}

export interface AbilityDamageEvent {
  color: PlayerColor;
  newHp: number;
  position: Position;
}

export interface AbilityHealEvent {
  color: PlayerColor;
  newHp: number;
  position: Position;
}

export interface AbilityBlockEvent {
  step: number;
  color: PlayerColor;
  skillId: "classic_guard" | "arc_reactor_field";
  position: Position;
}

export interface AbilitySkillEvent {
  step: number;
  order: number;
  color: PlayerColor;
  skillId: AbilitySkillId;
  from?: Position;
  to?: Position;
  affectedPositions?: Position[];
  damages?: AbilityDamageEvent[];
  heals?: AbilityHealEvent[];
  invulnerableSteps?: number;
  cloneStart?: Position | null;
  clonePath?: Position[];
  rewindHp?: number;
}

export interface AbilityResolutionPayload {
  redPath: Position[];
  bluePath: Position[];
  redStart: Position;
  blueStart: Position;
  lavaTiles: AbilityLavaTile[];
  trapTiles: AbilityTrapTile[];
  blocks: AbilityBlockEvent[];
  collisions: Array<{
    step: number;
    position: Position;
    escapeeColor: PlayerColor;
    newHp: number;
  }>;
  skillEvents: AbilitySkillEvent[];
}

export const ABILITY_SKILLS: Record<AbilitySkillId, AbilitySkillDefinition> = {
  classic_guard: {
    id: "classic_guard",
    name: { en: "Guard", kr: "가드" },
    description: {
      en: "Become invulnerable for 2 tile intervals. Using it consumes all path points for this turn.",
      kr: "2칸 시간 동안 무적이 됩니다. 사용 시 이번 턴 이동이 불가능합니다.",
    },
    loadoutTags: {
      en: "Move Locked · Combo OK",
      kr: "이동 불가 · 조합 가능",
    },
    loadoutDescription: {
      en: "Become invulnerable for 2 tile intervals and block attack skills.",
      kr: "2칸 시간 동안 무적이 되며, 공격 스킬을 막습니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.classic_guard,
    category: "defense",
    skinId: "classic",
    icon: "🛡",
  },
  arc_reactor_field: {
    id: "arc_reactor_field",
    name: { en: "AT Field", kr: "AT 필드" },
    description: {
      en: "For one movement step, nullify one incoming attack skill and reflect it back to the attacker. Big Bang is nullified only.",
      kr: "1칸 시간 동안 공격 스킬 1회를 무효화하고 공격자에게 반사합니다. 빅뱅폭발은 반사 없이 무효화만 합니다.",
    },
    loadoutTags: {
      en: "Move OK · Combo OK",
      kr: "이동 가능 · 조합 가능",
    },
    loadoutDescription: {
      en: "For one step, nullify one incoming attack skill and reflect it back. Big Bang is nullified only.",
      kr: "1칸 시간 동안 공격 스킬 1회를 무효화하고 반사합니다. 빅뱅폭발은 반사 없이 무효화만 합니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.arc_reactor_field,
    category: "defense",
    skinId: "arc_reactor",
    icon: "⬡",
  },
  phase_shift: {
    id: "phase_shift",
    name: { en: "Phase Shift", kr: "페이즈 시프트" },
    description: {
      en: "Become completely invulnerable for this turn. Ignore collisions, lava, and attack skills while moving.",
      kr: "해당 턴 완전 무적 상태가 됩니다. 이동 중 충돌, 용암지대, 공격 스킬을 무시합니다.",
    },
    loadoutTags: {
      en: "Move OK · Combo OK",
      kr: "이동 가능 · 조합 가능",
    },
    loadoutDescription: {
      en: "Become completely invulnerable for this turn and ignore collisions, lava, and attack skills.",
      kr: "해당 턴 완전 무적이 되며, 충돌과 용암지대, 공격 스킬을 무시합니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.phase_shift,
    category: "defense",
    skinId: "neon_pulse",
    icon: "⬢",
  },
  ember_blast: {
    id: "ember_blast",
    name: { en: "Ember Blast", kr: "엠버 폭발" },
    description: {
      en: "Deal 1 damage in a cross centered on your piece.",
      kr: "자신 중심 십자 범위에 1 피해를 줍니다.",
    },
    loadoutTags: {
      en: "Move OK · Combo OK",
      kr: "이동 가능 · 조합 가능",
    },
    loadoutDescription: {
      en: "Deal explosion damage in a 1-tile cross at the chosen timing.",
      kr: "지정 시점에 주변 1칸 십자 범위에 폭발 피해를 줍니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.ember_blast,
    category: "attack",
    skinId: "ember",
    icon: "💥",
  },
  atomic_fission: {
    id: "atomic_fission",
    name: { en: "Atomic Fission", kr: "원자분열" },
    description: {
      en: "At the start of movement, create an afterimage that repeats your previous turn path and damages the enemy on collision.",
      kr: "이동 시작 시 이전 턴의 경로를 따라 움직이는 잔상을 생성하며, 적과 충돌하면 피해를 줍니다.",
    },
    loadoutTags: {
      en: "Move OK · Combo OK",
      kr: "이동 가능 · 조합 가능",
    },
    loadoutDescription: {
      en: "At movement start, create a clone that follows your previous turn path and collides like a normal attacker.",
      kr: "이동 시작 시 이전 턴 경로를 따라 이동하는 분신을 생성하며, 일반 충돌처럼 피해를 줍니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.atomic_fission,
    category: "attack",
    skinId: "atomic",
    icon: "☢",
  },
  inferno_field: {
    id: "inferno_field",
    name: { en: "Lava Zone", kr: "용암지대" },
    description: {
      en: "Ignite a chosen tile for 4 turns. Any player entering, crossing, or standing on it takes 1 damage.",
      kr: "선택한 1칸을 4턴 동안 불타는 지역으로 만듭니다. 해당 칸에 들어오거나 지나가거나 서 있으면 1 피해를 입습니다.",
    },
    loadoutTags: {
      en: "Move OK · Combo OK",
      kr: "이동 가능 · 조합 가능",
    },
    loadoutDescription: {
      en: "Turn a chosen tile into lava for 4 turns. Anyone touching it takes damage.",
      kr: "선택한 1칸을 4턴 동안 용암지대로 만들고, 밟거나 지나가면 피해를 줍니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.inferno_field,
    category: "attack",
    skinId: "inferno",
    icon: "🔥",
  },
  nova_blast: {
    id: "nova_blast",
    name: { en: "Nova Burst", kr: "노바 폭발" },
    description: {
      en: "Deal 1 damage in an X-shaped area up to 2 tiles away at the chosen timing.",
      kr: "지정 시점에 자신 중심 대각선 2칸 범위의 X자 영역에 1 피해를 줍니다.",
    },
    loadoutTags: {
      en: "Move OK · Combo OK",
      kr: "이동 가능 · 조합 가능",
    },
    loadoutDescription: {
      en: "Deal explosion damage in an X-shaped area up to 2 tiles away at the chosen timing.",
      kr: "지정 시점에 대각선 2칸 범위의 X자 영역에 폭발 피해를 줍니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.nova_blast,
    category: "attack",
    skinId: "nova",
    icon: "✸",
  },
  sun_chariot: {
    id: "sun_chariot",
    name: { en: "Sun Chariot", kr: "태양전차" },
    description: {
      en: "Expand into a 3x3 collision zone while moving. The opponent can be hit once during this skill.",
      kr: "이동 중 3x3 충돌 범위로 확장됩니다. 스킬 사용 중 상대를 1회만 피격시킬 수 있습니다.",
    },
    loadoutTags: {
      en: "Move OK · Combo OK",
      kr: "이동 가능 · 조합 가능",
    },
    loadoutDescription: {
      en: "While moving, your collision area becomes 3x3 and can hit the opponent once.",
      kr: "이동 중 충돌 범위가 3x3으로 커지며, 상대를 1회만 타격할 수 있습니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.sun_chariot,
    category: "attack",
    skinId: "sun",
    icon: "☀",
  },
  aurora_heal: {
    id: "aurora_heal",
    name: { en: "Healing", kr: "힐링" },
    description: {
      en: "Restore 1 HP at the chosen timing. Can be combined with movement and other compatible skills.",
      kr: "원하는 시점에 HP를 1 회복합니다. 이동과 함께, 조합 가능한 다른 스킬과 함께 사용할 수 있습니다.",
    },
    loadoutTags: {
      en: "Move OK · Combo OK",
      kr: "이동 가능 · 조합 가능",
    },
    loadoutDescription: {
      en: "Restore 1 HP at the chosen timing.",
      kr: "지정 시점에 HP를 1 회복합니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.aurora_heal,
    category: "utility",
    skinId: "aurora",
    icon: "✚",
  },
  gold_overdrive: {
    id: "gold_overdrive",
    name: { en: "Overdrive", kr: "오버드라이브" },
    description: {
      en: "Nothing happens this turn. On your next turn, mana becomes 20 and you can use and combine skills while moving. On the turn after that, mana becomes 0 and you cannot move.",
      kr: "이번 턴에는 아무 일도 일어나지 않습니다. 다음 턴에는 마나가 20이 되고, 이동 중에도 스킬을 사용, 조합할 수 있습니다. 다다음 턴에는 마나가 0이 되며, 움직일 수 없습니다.",
    },
    loadoutTags: {
      en: "Move OK · Combo OK",
      kr: "이동 가능 · 조합 가능",
    },
    loadoutDescription: {
      en: "Nothing happens this turn. Next turn, mana becomes 20 and you can use and combine skills while moving. On the turn after that, mana becomes 0 and you cannot move.",
      kr: "이번 턴에는 아무 일도 일어나지 않습니다. 다음 턴에는 마나가 20이 되고, 이동 중에도 스킬을 사용, 조합할 수 있습니다. 다다음 턴에는 마나가 0이 되며, 움직일 수 없습니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.gold_overdrive,
    category: "defense",
    skinId: "gold_core",
    icon: "⬢",
  },
  quantum_shift: {
    id: "quantum_shift",
    name: { en: "Quantum Shift", kr: "양자 도약" },
    description: {
      en: "Teleport 1 tile in any of 8 directions, then continue writing your path.",
      kr: "8방향 1칸 순간이동 후 그 위치에서 경로를 계속 작성합니다.",
    },
    loadoutTags: {
      en: "Move OK · Combo OK",
      kr: "이동 가능 · 조합 가능",
    },
    loadoutDescription: {
      en: "Teleport first, then begin your path from that position.",
      kr: "지정 위치로 순간이동한 뒤, 그 위치에서 경로를 시작합니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.quantum_shift,
    category: "utility",
    skinId: "quantum",
    icon: "✦",
  },
  plasma_charge: {
    id: "plasma_charge",
    name: { en: "Charge", kr: "충전" },
    description: {
      en: "This turn, you gain 1 Pass Point. Gain +4 mana at the start of your next turn. Defense skills can still be used.",
      kr: "이번 턴에 패스 포인트가 1이 됩니다. 대신 다음 턴 시작 시 마나를 +4 얻습니다. 방어 스킬은 함께 사용할 수 있습니다.",
    },
    loadoutTags: {
      en: "Move OK · Combo OK",
      kr: "이동 가능 · 조합 가능",
    },
    loadoutDescription: {
      en: "This turn, you gain 1 Pass Point. Gain +4 mana at the start of your next turn. Defense skills can still be used.",
      kr: "이번 턴에 패스 포인트가 1이 됩니다. 대신 다음 턴 시작 시 마나를 +4 얻습니다. 방어 스킬은 함께 사용할 수 있습니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.plasma_charge,
    category: "utility",
    skinId: "plasma",
    icon: "⚡",
  },
  void_cloak: {
    id: "void_cloak",
    name: { en: "Invisibility", kr: "투명화" },
    description: {
      en: "On the next turn, move to a random position and stay hidden until movement begins.",
      kr: "다음 턴에 랜덤 위치로 이동한 뒤, 이동 시간이 시작될 때까지 모습을 감춥니다.",
    },
    loadoutTags: {
      en: "Move OK · Combo OK",
      kr: "이동 가능 · 조합 가능",
    },
    loadoutDescription: {
      en: "Next turn, move to a random position and stay hidden until movement begins.",
      kr: "다음 턴에 랜덤 위치로 이동한 뒤, 이동 시간이 시작될 때까지 모습을 감춥니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.void_cloak,
    category: "utility",
    skinId: "void",
    icon: "◌",
  },
  electric_blitz: {
    id: "electric_blitz",
    name: { en: "Lightning Flash", kr: "벽력일섬" },
    description: {
      en: "Choose a direction, then dash straight to the edge through obstacles. Damages enemies on the path.",
      kr: "방향을 고르면 장애물을 무시하고 보드 끝까지 직선 돌진합니다. 이동 경로 위 적에게 피해를 줍니다.",
    },
    loadoutTags: {
      en: "Skill Move · Combo Locked",
      kr: "스킬 이동 · 조합 불가능",
    },
    loadoutDescription: {
      en: "Dash in a straight line, ignore obstacles, and strike enemies on the path.",
      kr: "직선으로 돌진하며, 장애물을 무시하고 경로 위 적을 타격합니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.electric_blitz,
    category: "attack",
    skinId: "electric_core",
    icon: "⚡",
  },
  wizard_magic_mine: {
    id: "wizard_magic_mine",
    name: { en: "Magic Mine", kr: "매직마인" },
    description: {
      en: "Place an invisible trap at your position (at the chosen step). If the opponent steps on it, they take 1 damage and the trap disappears. Lasts 5 turns.",
      kr: "지정한 스텝 시점의 현재 위치에 보이지 않는 함정을 설치합니다. 상대가 밟으면 1 피해를 주고 사라집니다. 5턴 지속됩니다.",
    },
    loadoutTags: { en: "Move OK · Combo OK", kr: "이동 가능 · 조합 가능" },
    loadoutDescription: {
      en: "Place an invisible 1-damage trap at your movement position. Lasts 5 turns.",
      kr: "이동 위치에 1 피해짜리 보이지 않는 함정을 설치합니다. 5턴 지속됩니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.wizard_magic_mine,
    category: "attack",
    skinId: "wizard",
    icon: "✦",
  },
  chronos_time_rewind: {
    id: "chronos_time_rewind",
    name: { en: "Time Rewind", kr: "타임 리와인드" },
    description: {
      en: "If lethal damage reduces your HP to 0, finish the turn, then rewind once per match along this turn's path back to the start of the turn.",
      kr: "치명상을 입어 HP가 0이 되면, 이번 턴 이동이 끝난 뒤 경기당 1회 이번 턴 경로를 거꾸로 따라 턴 시작 지점으로 되감깁니다.",
    },
    loadoutTags: {
      en: "Passive · Auto Trigger",
      kr: "패시브 · 자동 발동",
    },
    loadoutDescription: {
      en: "Automatically rewinds once per match after the turn finishes, returning along this turn's path to the start of the turn.",
      kr: "치명상을 입으면 이번 턴 이동이 끝난 뒤 경기당 1회 이번 턴 경로를 거꾸로 따라 턴 시작 지점으로 되감습니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.chronos_time_rewind,
    category: "passive",
    skinId: "chronos",
    icon: "⏪",
  },
  cosmic_bigbang: {
    id: "cosmic_bigbang",
    name: { en: "Big Bang Burst", kr: "빅뱅폭발" },
    description: {
      en: "Deal 2 damage to the whole board. Blocked by guard. You cannot move this turn.",
      kr: "보드 전체에 2 피해를 줍니다. 가드에 막히며, 이번 턴에는 이동할 수 없습니다.",
    },
    loadoutTags: {
      en: "Move Locked · Combo Locked",
      kr: "이동 불가 · 조합 불가능",
    },
    loadoutDescription: {
      en: "Deal 2 damage to the whole board. Blocked by invulnerability.",
      kr: "보드 전체에 2 피해를 줍니다. 무적에 막힙니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.cosmic_bigbang,
    category: "attack",
    skinId: "cosmic",
    icon: "☄",
  },
};
