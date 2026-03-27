import type {
  GamePhase,
  PieceSkin,
  PlayerColor,
  PlayerRole,
  Position,
} from './game.types';

export type AbilitySkillId =
  | 'classic_guard'
  | 'arc_reactor_field'
  | 'phase_shift'
  | 'ember_blast'
  | 'atomic_fission'
  | 'inferno_field'
  | 'nova_blast'
  | 'aurora_heal'
  | 'gold_overdrive'
  | 'quantum_shift'
  | 'plasma_charge'
  | 'void_cloak'
  | 'electric_blitz'
  | 'cosmic_bigbang';
export type AbilitySkillCategory = 'attack' | 'defense' | 'utility';

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
  aurora_heal: 8,
  gold_overdrive: 8,
  quantum_shift: 4,
  plasma_charge: 2,
  void_cloak: 4,
  electric_blitz: 6,
  cosmic_bigbang: 10,
};

export interface AbilitySkillDefinition {
  id: AbilitySkillId;
  name: { en: string; kr: string };
  description: { en: string; kr: string };
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

export interface AbilityPlayerState {
  id: string;
  nickname: string;
  color: PlayerColor;
  pieceSkin: PieceSkin;
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
}

export interface AbilityBattleState {
  roomId: string;
  code: string;
  turn: number;
  phase: GamePhase;
  pathPoints: number;
  obstacles: Position[];
  lavaTiles: AbilityLavaTile[];
  players: {
    red: AbilityPlayerState;
    blue: AbilityPlayerState;
  };
  attackerColor: PlayerColor;
}

export interface AbilityRoundStartPayload {
  turn: number;
  pathPoints: number;
  attackerColor: PlayerColor;
  redPosition: Position;
  bluePosition: Position;
  obstacles: Position[];
  timeLimit: number;
  serverTime: number;
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
  phaseShiftActive?: boolean;
  overdriveStage?: 0 | 1 | 2;
  lavaRemainingTurns?: number;
  cloneStart?: Position | null;
  clonePath?: Position[];
}

export interface AbilityResolutionPayload {
  redPath: Position[];
  bluePath: Position[];
  redStart: Position;
  blueStart: Position;
  lavaTiles: AbilityLavaTile[];
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
    id: 'classic_guard',
    name: { en: 'Guard', kr: '가드' },
    description: {
      en: 'Become invulnerable for two movement steps. Using it consumes all path points for this turn.',
      kr: '두 칸 이동 시간 동안 무적이 됩니다. 사용 시 이번 턴 이동이 불가능합니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.classic_guard,
    category: 'defense',
    skinId: 'classic',
    icon: '🛡',
  },
  arc_reactor_field: {
    id: 'arc_reactor_field',
    name: { en: 'AT Field', kr: 'AT 필드' },
    description: {
      en: 'For one movement step, nullify one incoming attack skill and reflect it back to the attacker. Big Bang is nullified only.',
      kr: '1칸 시간 동안 공격 스킬 1회를 무효화하고 공격자에게 반사합니다. 빅뱅폭발은 반사 없이 무효화만 합니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.arc_reactor_field,
    category: 'defense',
    skinId: 'arc_reactor',
    icon: '⬡',
  },
  phase_shift: {
    id: 'phase_shift',
    name: { en: 'Phase Shift', kr: '페이즈 시프트' },
    description: {
      en: 'Become completely invulnerable for this turn. Ignore collisions, lava, and attack skills while moving.',
      kr: '해당 턴 완전 무적 상태가 됩니다. 이동 중 충돌, 용암지대, 공격 스킬을 무시합니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.phase_shift,
    category: 'defense',
    skinId: 'neon_pulse',
    icon: '⬢',
  },
  ember_blast: {
    id: 'ember_blast',
    name: { en: 'Ember Blast', kr: '엠버 폭발' },
    description: {
      en: 'Deal 1 damage in a cross centered on your piece.',
      kr: '자신 중심 십자 범위에 1 피해를 줍니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.ember_blast,
    category: 'attack',
    skinId: 'ember',
    icon: '💥',
  },
  atomic_fission: {
    id: 'atomic_fission',
    name: { en: 'Atomic Fission', kr: '원자분열' },
    description: {
      en: 'At the start of movement, create an afterimage that repeats your previous turn path and damages the enemy on collision.',
      kr: '이동 시작 시 이전 턴의 경로를 따라 움직이는 잔상을 생성하며, 적과 충돌하면 피해를 줍니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.atomic_fission,
    category: 'attack',
    skinId: 'atomic',
    icon: '☢',
  },
  inferno_field: {
    id: 'inferno_field',
    name: { en: 'Lava Zone', kr: '용암지대' },
    description: {
      en: 'Ignite a chosen tile for 2 turns. Any player entering, crossing, or standing on it takes 1 damage.',
      kr: '선택한 1칸을 2턴 동안 불타는 지역으로 만듭니다. 해당 칸에 들어오거나 지나가거나 서 있으면 1 피해를 입습니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.inferno_field,
    category: 'attack',
    skinId: 'inferno',
    icon: '🔥',
  },
  nova_blast: {
    id: 'nova_blast',
    name: { en: 'Nova Burst', kr: '노바 폭발' },
    description: {
      en: 'Deal 1 damage in an X-shaped area up to 2 tiles away at the chosen timing.',
      kr: '지정 시점에 자신 중심 대각선 2칸 범위의 X자 영역에 1 피해를 줍니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.nova_blast,
    category: 'attack',
    skinId: 'nova',
    icon: '✸',
  },
  aurora_heal: {
    id: 'aurora_heal',
    name: { en: 'Healing', kr: '힐링' },
    description: {
      en: 'Restore 1 HP at the chosen timing. Can be combined with movement and other compatible skills.',
      kr: '원하는 시점에 HP를 1 회복합니다. 이동과 함께, 조합 가능한 다른 스킬과 함께 사용할 수 있습니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.aurora_heal,
    category: 'utility',
    skinId: 'aurora',
    icon: '✚',
  },
  gold_overdrive: {
    id: 'gold_overdrive',
    name: { en: 'Overdrive', kr: '오버드라이브' },
    description: {
      en: 'Nothing happens this turn. On your next turn, mana becomes 20 and you can use and combine skills while moving. On the turn after that, mana becomes 0 and you cannot move.',
      kr: '이번 턴에는 아무 일도 일어나지 않습니다. 다음 턴에는 마나가 20이 되고, 이동 중에도 스킬을 사용, 조합할 수 있습니다. 다다음 턴에는 마나가 0이 되며, 움직일 수 없습니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.gold_overdrive,
    category: 'defense',
    skinId: 'gold_core',
    icon: '⬢',
  },
  quantum_shift: {
    id: 'quantum_shift',
    name: { en: 'Quantum Shift', kr: '양자 도약' },
    description: {
      en: 'Teleport 1 tile in any of 8 directions, then continue writing your path.',
      kr: '8방향 1칸 순간이동 후 그 위치에서 경로를 계속 작성합니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.quantum_shift,
    category: 'utility',
    skinId: 'quantum',
    icon: '✦',
  },
  plasma_charge: {
    id: 'plasma_charge',
    name: { en: 'Charge', kr: '충전' },
    description: {
      en: 'Become unable to move this turn. Gain +4 mana at the start of your next turn. Defense skills can still be used.',
      kr: '이번 턴에는 이동할 수 없습니다. 대신 다음 턴 시작 시 마나를 +4 얻습니다. 방어 스킬은 함께 사용할 수 있습니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.plasma_charge,
    category: 'utility',
    skinId: 'plasma',
    icon: '⚡',
  },
  void_cloak: {
    id: 'void_cloak',
    name: { en: 'Invisibility', kr: '투명화' },
    description: {
      en: 'On the next turn, move to a random position and stay hidden until movement begins.',
      kr: '다음 턴에 랜덤 위치로 이동한 뒤, 이동 시간이 시작될 때까지 모습을 감춥니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.void_cloak,
    category: 'utility',
    skinId: 'void',
    icon: '◌',
  },
  electric_blitz: {
    id: 'electric_blitz',
    name: { en: 'Lightning Flash', kr: '벽력일섬' },
    description: {
      en: 'Choose a direction, then dash straight to the edge through obstacles. Damages enemies on the path.',
      kr: '방향을 고르면 장애물을 무시하고 보드 끝까지 직선 돌진합니다. 이동 경로 위 적에게 피해를 줍니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.electric_blitz,
    category: 'attack',
    skinId: 'electric_core',
    icon: '⚡',
  },
  cosmic_bigbang: {
    id: 'cosmic_bigbang',
    name: { en: 'Big Bang Burst', kr: '빅뱅폭발' },
    description: {
      en: 'Deal 2 damage to the whole board. Blocked by guard. You cannot move this turn.',
      kr: '보드 전체에 2 피해를 줍니다. 가드에 막히며, 이번 턴에는 이동할 수 없습니다.',
    },
    manaCost: ABILITY_SKILL_COSTS.cosmic_bigbang,
    category: 'attack',
    skinId: 'cosmic',
    icon: '☄',
  },
};
