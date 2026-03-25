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
  | 'ember_blast'
  | 'nova_blast'
  | 'quantum_shift'
  | 'plasma_charge'
  | 'electric_blitz'
  | 'cosmic_bigbang';
export type AbilitySkillCategory = 'attack' | 'defense' | 'utility';

export interface AbilitySkillReservation {
  skillId: AbilitySkillId;
  step: number;
  order: number;
  target?: Position | null;
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
  equippedSkills: AbilitySkillId[];
}

export interface ClientAbilityPlayerState extends ClientPlayerState {
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
    red: ClientAbilityPlayerState;
    blue: ClientAbilityPlayerState;
  };
  attackerColor: PlayerColor;
}

export interface AbilityRoundStartPayload extends RoundStartPayload {
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
