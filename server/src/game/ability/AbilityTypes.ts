import type {
  ClientPlayerState,
  GamePhase,
  PieceSkin,
  PlayerColor,
  PlayerRole,
  Position,
  RoundStartPayload,
} from '../../types/game.types';

export type AbilitySkillId =
  | 'classic_guard'
  | 'arc_reactor_field'
  | 'phase_shift'
  | 'ember_blast'
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
  userId: string | null;
  socketId: string;
  nickname: string;
  color: PlayerColor;
  pieceSkin: PieceSkin;
  hp: number;
  position: Position;
  plannedPath: Position[];
  plannedSkills: AbilitySkillReservation[];
  pathSubmitted: boolean;
  role: PlayerRole;
  stats: { wins: number; losses: number };
  mana: number;
  invulnerableSteps: number;
  pendingManaBonus: number;
  pendingOverdriveStage: 0 | 1 | 2;
  pendingVoidCloak: boolean;
  overdriveActive: boolean;
  reboundLocked: boolean;
  hidden: boolean;
  equippedSkills: AbilitySkillId[];
}

export interface ClientAbilityPlayerState extends ClientPlayerState {
  mana: number;
  invulnerableSteps: number;
  overdriveActive: boolean;
  reboundLocked: boolean;
  hidden: boolean;
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
    red: ClientAbilityPlayerState;
    blue: ClientAbilityPlayerState;
  };
  attackerColor: PlayerColor;
}

export interface AbilityRoundStartPayload extends RoundStartPayload {
  lavaTiles: AbilityLavaTile[];
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
