import type {
  BoardSkin,
  GamePhase,
  PieceSkin,
  PlayerColor,
  PlayerRole,
  Position,
} from "./game.types";

export interface AbilityGameOverPayload {
  winner: PlayerColor | "draw";
  ratingChange: number | null;
  newRating: number | null;
  newArena: number | null;
  arenaPromoted: boolean;
  rankedUnlocked: boolean;
}

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
  | "chronos_time_rewind"
  | "berserker_rage"
  | "root_wall";
export type AbilitySkillCategory = "attack" | "defense" | "utility" | "passive";
export type AbilitySkillRoleRestriction = "any" | "attacker" | "escaper";
export type AbilitySkillStepRule = "any" | "zero_only";
export type AbilitySkillTargetRule = "none" | "position";

export interface AbilitySkillServerRule {
  roleRestriction: AbilitySkillRoleRestriction;
  stepRule: AbilitySkillStepRule;
  targetRule: AbilitySkillTargetRule;
  requiresEmptyPathWhenNotOverdrive?: boolean;
  exclusiveWhenNotOverdrive?: boolean;
  requiresPreviousTurnPath?: boolean;
  maxStep?: number;
}

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
  "berserker_rage",
  "root_wall",
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
  phase_shift: 7,
  ember_blast: 4,
  atomic_fission: 6,
  inferno_field: 7,
  nova_blast: 5,
  sun_chariot: 8,
  aurora_heal: 8,
  gold_overdrive: 8,
  quantum_shift: 3,
  plasma_charge: 2,
  void_cloak: 4,
  electric_blitz: 6,
  cosmic_bigbang: 10,
  wizard_magic_mine: 8,
  chronos_time_rewind: 0,
  berserker_rage: 8,
  root_wall: 7,
};

export const ABILITY_SKILL_SERVER_RULES: Record<
  AbilitySkillId,
  AbilitySkillServerRule
> = {
  classic_guard: {
    roleRestriction: "escaper",
    stepRule: "zero_only",
    targetRule: "none",
    requiresEmptyPathWhenNotOverdrive: true,
  },
  arc_reactor_field: {
    roleRestriction: "escaper",
    stepRule: "any",
    targetRule: "none",
  },
  phase_shift: {
    roleRestriction: "escaper",
    stepRule: "zero_only",
    targetRule: "none",
  },
  ember_blast: {
    roleRestriction: "attacker",
    stepRule: "any",
    targetRule: "none",
  },
  atomic_fission: {
    roleRestriction: "attacker",
    stepRule: "zero_only",
    targetRule: "none",
    requiresPreviousTurnPath: true,
  },
  inferno_field: {
    roleRestriction: "attacker",
    stepRule: "zero_only",
    targetRule: "position",
  },
  nova_blast: {
    roleRestriction: "attacker",
    stepRule: "any",
    targetRule: "none",
  },
  sun_chariot: {
    roleRestriction: "attacker",
    stepRule: "zero_only",
    targetRule: "none",
  },
  aurora_heal: {
    roleRestriction: "any",
    stepRule: "any",
    targetRule: "none",
  },
  gold_overdrive: {
    roleRestriction: "escaper",
    stepRule: "any",
    targetRule: "none",
  },
  quantum_shift: {
    roleRestriction: "any",
    stepRule: "any",
    targetRule: "position",
  },
  plasma_charge: {
    roleRestriction: "any",
    stepRule: "zero_only",
    targetRule: "none",
  },
  void_cloak: {
    roleRestriction: "any",
    stepRule: "any",
    targetRule: "none",
  },
  electric_blitz: {
    roleRestriction: "attacker",
    stepRule: "any",
    targetRule: "position",
  },
  cosmic_bigbang: {
    roleRestriction: "attacker",
    stepRule: "any",
    targetRule: "none",
    maxStep: 3,
  },
  wizard_magic_mine: {
    roleRestriction: "attacker",
    stepRule: "any",
    targetRule: "none",
  },
  chronos_time_rewind: {
    roleRestriction: "any",
    stepRule: "zero_only",
    targetRule: "none",
  },
  berserker_rage: {
    roleRestriction: "attacker",
    stepRule: "zero_only",
    targetRule: "none",
  },
  root_wall: {
    roleRestriction: "any",
    stepRule: "zero_only",
    targetRule: "position",
  },
};

export interface AbilitySkillDefinition {
  id: AbilitySkillId;
  name: { en: string; kr: string };
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

export interface AbilityTurnSnapshot {
  turn: number;
  position: Position;
  hp: number;
}

export interface AbilityLavaTile {
  position: Position;
  remainingTurns: number;
}

export interface AbilityRootWallTile {
  position: Position;
  owner: PlayerColor;
  remainingTurns: number;
}

export interface AbilityTrapTile {
  position: Position;
  owner: PlayerColor;
  remainingTurns: number;
}

export interface AbilityPlayerState {
  id: string;
  userId?: string | null;
  socketId?: string;
  nickname: string;
  color: PlayerColor;
  connected?: boolean;
  isBot?: boolean;
  pieceSkin: PieceSkin;
  boardSkin: BoardSkin;
  hp: number;
  position: Position;
  plannedPath?: Position[];
  plannedSkills?: AbilitySkillReservation[];
  pathSubmitted: boolean;
  role: PlayerRole;
  stats: { wins: number; losses: number };
  rating: number;
  mana: number;
  invulnerableSteps: number;
  pendingManaBonus?: number;
  pendingOverdriveStage?: number;
  pendingVoidCloak?: boolean;
  overdriveActive: boolean;
  reboundLocked: boolean;
  hidden: boolean;
  previousTurnStart: Position | null;
  previousTurnPath: Position[];
  equippedSkills: AbilitySkillId[];
  timeRewindUsed: boolean;
  turnHistory?: AbilityTurnSnapshot[];
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
  rootWallTiles: AbilityRootWallTile[];
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
  rootWallTiles: AbilityRootWallTile[];
  blocks: AbilityBlockEvent[];
  collisions: Array<{
    step: number;
    position: Position;
    escapeeColor: PlayerColor;
    newHp: number;
    sourceColor?: PlayerColor;
    sourceSkillId?: string;
  }>;
  skillEvents: AbilitySkillEvent[];
  rootWallBlockedPaths?: {
    red: { start: Position; path: Position[] } | null;
    blue: { start: Position; path: Position[] } | null;
  };
}

export const ABILITY_SKILLS: Record<AbilitySkillId, AbilitySkillDefinition> = {
  classic_guard: {
    id: "classic_guard",
    name: { en: "Guard", kr: "가드" },
    loadoutDescription: {
      en: "Become invulnerable for 2 tile intervals.",
      kr: "2칸 시간 동안 무적이 됩니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.classic_guard,
    category: "defense",
    skinId: "classic",
    icon: "🛡",
  },
  arc_reactor_field: {
    id: "arc_reactor_field",
    name: { en: "AT Field", kr: "AT 필드" },
    loadoutDescription: {
      en: "For 1 tile interval, nullify 1 incoming attack skill and reflect it.",
      kr: "1칸 시간 동안 공격 스킬 1회를 무효화하고 반사합니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.arc_reactor_field,
    category: "defense",
    skinId: "arc_reactor",
    icon: "⬡",
  },
  phase_shift: {
    id: "phase_shift",
    name: { en: "Phase Shift", kr: "페이즈 시프트" },
    loadoutDescription: {
      en: "Become completely invulnerable for this turn, ignoring collisions and attack skills.",
      kr: "해당 턴 완전 무적이 되며, 충돌과 공격 스킬을 무시합니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.phase_shift,
    category: "defense",
    skinId: "neon_pulse",
    icon: "⬢",
  },
  ember_blast: {
    id: "ember_blast",
    name: { en: "Ember Blast", kr: "엠버 폭발" },
    loadoutDescription: {
      en: "Deal explosion damage in a 1-tile cross.",
      kr: "주변 1칸 십자 범위에 폭발 피해를 줍니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.ember_blast,
    category: "attack",
    skinId: "ember",
    icon: "💥",
  },
  atomic_fission: {
    id: "atomic_fission",
    name: { en: "Atomic Fission", kr: "원자분열" },
    loadoutDescription: {
      en: "Create an attacking clone that follows your previous turn's path.",
      kr: "이전 턴 경로를 따라 이동하는 공격 분신을 생성합니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.atomic_fission,
    category: "attack",
    skinId: "atomic",
    icon: "☢",
  },
  inferno_field: {
    id: "inferno_field",
    name: { en: "Lava Zone", kr: "용암지대" },
    loadoutDescription: {
      en: "Ignite a chosen tile for 4 turns. Any player crossing or standing on it takes 1 damage.",
      kr: "선택한 1칸을 4턴 동안 불태웁니다. 누구든 그 칸을 지나가거나 그 위에 서 있으면 1 피해를 받습니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.inferno_field,
    category: "attack",
    skinId: "inferno",
    icon: "🔥",
  },
  nova_blast: {
    id: "nova_blast",
    name: { en: "Nova Burst", kr: "노바 폭발" },
    loadoutDescription: {
      en: "Deal explosion damage in an X-shaped area up to 2 tiles away.",
      kr: "대각선 2칸 범위의 X자 영역에 폭발 피해를 줍니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.nova_blast,
    category: "attack",
    skinId: "nova",
    icon: "✸",
  },
  sun_chariot: {
    id: "sun_chariot",
    name: { en: "Sun Chariot", kr: "태양전차" },
    loadoutDescription: {
      en: "While moving, your collision area becomes 3x3. You can only hit the opponent once.",
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
    loadoutDescription: {
      en: "Restore 1 HP.",
      kr: "HP를 1 회복합니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.aurora_heal,
    category: "utility",
    skinId: "aurora",
    icon: "✚",
  },
  gold_overdrive: {
    id: "gold_overdrive",
    name: { en: "Overdrive", kr: "오버드라이브" },
    loadoutDescription: {
      en: "Gain 20 mana next turn. On the following turn, your mana becomes 0 and you cannot move.",
      kr: "다음 턴에 마나 20을 얻습니다. 이후 턴에는 마나가 0이 되고 이동할 수 없습니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.gold_overdrive,
    category: "defense",
    skinId: "gold_core",
    icon: "⬢",
  },
  quantum_shift: {
    id: "quantum_shift",
    name: { en: "Quantum Shift", kr: "양자 도약" },
    loadoutDescription: {
      en: "Teleport 1 tile away in any of the 8 directions.",
      kr: "8방향 중 원하는 방향으로 1칸 순간이동합니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.quantum_shift,
    category: "utility",
    skinId: "quantum",
    icon: "✦",
  },
  plasma_charge: {
    id: "plasma_charge",
    name: { en: "Charge", kr: "충전" },
    loadoutDescription: {
      en: "Gain 1 path point this turn. Gain 4 mana at the start of your next turn.",
      kr: "이번 턴에 패스 포인트를 1 얻습니다. 다음 턴 시작 시 마나를 4 얻습니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.plasma_charge,
    category: "utility",
    skinId: "plasma",
    icon: "⚡",
  },
  void_cloak: {
    id: "void_cloak",
    name: { en: "Invisibility", kr: "투명화" },
    loadoutDescription: {
      en: "On the next turn, move to a random position and stay hidden until movement begins.",
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
    loadoutDescription: {
      en: "Dash in a straight line, ignoring obstacles, and strike enemies on the path.",
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
    loadoutDescription: {
      en: "Place an invisible trap that lasts for 5 turns. The trap disappears after activation.",
      kr: "5턴 동안 지속되는 보이지 않는 함정을 설치합니다. 함정은 발동 후 사라집니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.wizard_magic_mine,
    category: "attack",
    skinId: "wizard",
    icon: "✦",
  },
  chronos_time_rewind: {
    id: "chronos_time_rewind",
    name: { en: "Time Rewind", kr: "타임 리와인드" },
    loadoutDescription: {
      en: "When taking lethal damage for the first time, rewind time to the start of the turn.",
      kr: "처음으로 치명상을 입으면 시간을 턴 시작 시점으로 되감습니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.chronos_time_rewind,
    category: "passive",
    skinId: "chronos",
    icon: "⏪",
  },
  berserker_rage: {
    id: "berserker_rage",
    name: { en: "Berserk", kr: "광폭화" },
    loadoutDescription: {
      en: "This turn, collision damage becomes 2.",
      kr: "이번 턴, 충돌 피해가 2가 됩니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.berserker_rage,
    category: "attack",
    skinId: "berserker",
    icon: "⚔",
  },
  cosmic_bigbang: {
    id: "cosmic_bigbang",
    name: { en: "Big Bang Burst", kr: "빅뱅폭발" },
    loadoutDescription: {
      en: "Deal 2 damage to the whole board. Set timing at tiles 0 to 3. Cannot move after activation.",
      kr: "보드 전체에 2 피해를 줍니다. 발동 타이밍을 0~3칸 사이에서 자유롭게 설정할 수 있으며, 발동 이후 이동할 수 없습니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.cosmic_bigbang,
    category: "attack",
    skinId: "cosmic",
    icon: "☄",
  },
  root_wall: {
    id: "root_wall",
    name: { en: "Root Wall", kr: "뿌리장벽" },
    loadoutDescription: {
      en: "Place a root barrier at a chosen tile for 3 turns. The opponent cannot pass through it.",
      kr: "선택한 1칸에 3턴 동안 뿌리장벽을 설치합니다. 상대방은 해당 칸을 통과하지 못합니다.",
    },
    manaCost: ABILITY_SKILL_COSTS.root_wall,
    category: "utility",
    skinId: "moonlight_seed",
    icon: "🌿",
  },
};
