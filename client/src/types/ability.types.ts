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
  | 'nova_blast'
  | 'aurora_heal'
  | 'gold_overdrive'
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
  overdriveActive: boolean;
  reboundLocked: boolean;
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
  overdriveStage?: 0 | 1 | 2;
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
  nova_blast: {
    id: 'nova_blast',
    name: { en: 'Nova Burst', kr: '노바 폭발' },
    description: {
      en: 'Deal 1 damage in an X-shaped area up to 2 tiles away at the chosen timing.',
      kr: '지정 시점에 자신 중심 대각선 2칸 범위의 X자 영역에 1 피해를 줍니다.',
    },
    manaCost: 4,
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
    manaCost: 10,
    category: 'utility',
    skinId: 'aurora',
    icon: '✚',
  },
  gold_overdrive: {
    id: 'gold_overdrive',
    name: { en: 'Overdrive', kr: '오버드라이브' },
    description: {
      en: 'On your next turn, enter Overdrive with 20 mana and freely combine skills while moving. On the following turn, mana becomes 0 and movement points become 0.',
      kr: '다음 턴에 마나 20의 과부화 모드에 진입하고, 이동 중에도 스킬을 자유롭게 조합할 수 있습니다. 그 다음 턴에는 마나가 0이 되고 경로 포인트가 0이 됩니다.',
    },
    manaCost: 8,
    category: 'utility',
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
