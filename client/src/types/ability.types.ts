import type {
  GamePhase,
  PieceSkin,
  PlayerColor,
  PlayerRole,
  Position,
} from './game.types';

export type AbilitySkillId =
  | 'classic_guard'
  | 'ember_blast'
  | 'quantum_shift'
  | 'plasma_charge'
  | 'electric_blitz'
  | 'cosmic_bigbang';
export type AbilitySkillCategory = 'attack' | 'defense' | 'utility';

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
  equippedSkills: AbilitySkillId[];
}

export interface AbilityBattleState {
  roomId: string;
  code: string;
  turn: number;
  phase: GamePhase;
  pathPoints: number;
  obstacles: Position[];
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

export interface AbilitySkillEvent {
  step: number;
  order: number;
  color: PlayerColor;
  skillId: AbilitySkillId;
  from?: Position;
  to?: Position;
  affectedPositions?: Position[];
  damages?: AbilityDamageEvent[];
  invulnerableSteps?: number;
}

export interface AbilityResolutionPayload {
  redPath: Position[];
  bluePath: Position[];
  redStart: Position;
  blueStart: Position;
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
    manaCost: 4,
    category: 'defense',
    skinId: 'classic',
    icon: '🛡',
  },
  ember_blast: {
    id: 'ember_blast',
    name: { en: 'Ember Blast', kr: '엠버 폭발' },
    description: {
      en: 'Deal 1 damage in a cross centered on your piece.',
      kr: '자신 중심 십자 범위에 1 피해를 줍니다.',
    },
    manaCost: 4,
    category: 'attack',
    skinId: 'ember',
    icon: '💥',
  },
  quantum_shift: {
    id: 'quantum_shift',
    name: { en: 'Quantum Shift', kr: '양자 도약' },
    description: {
      en: 'Teleport 1 tile in any of 8 directions, then continue writing your path.',
      kr: '8방향 1칸 순간이동 후 그 위치에서 경로를 계속 작성합니다.',
    },
    manaCost: 3,
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
    manaCost: 2,
    category: 'utility',
    skinId: 'plasma',
    icon: '⚡',
  },
  electric_blitz: {
    id: 'electric_blitz',
    name: { en: 'Lightning Flash', kr: '벽력일섬' },
    description: {
      en: 'Choose a direction, then dash straight to the edge through obstacles. Damages enemies on the path.',
      kr: '방향을 고르면 장애물을 무시하고 보드 끝까지 직선 돌진합니다. 이동 경로 위 적에게 피해를 줍니다.',
    },
    manaCost: 6,
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
    manaCost: 10,
    category: 'attack',
    skinId: 'cosmic',
    icon: '☄',
  },
};
