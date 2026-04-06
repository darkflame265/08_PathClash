import type {
  BoardSkin,
  ClientPlayerState,
  GamePhase,
  PieceSkin,
  PlayerColor,
  PlayerRole,
  Position,
} from '../../types/game.types';

export type AbilitySkillId =
  | 'classic_guard'
  | 'arc_reactor_field'
  | 'phase_shift'
  | 'ember_blast'
  | 'atomic_fission'
  | 'inferno_field'
  | 'nova_blast'
  | 'sun_chariot'
  | 'aurora_heal'
  | 'gold_overdrive'
  | 'quantum_shift'
  | 'plasma_charge'
  | 'void_cloak'
  | 'electric_blitz'
  | 'cosmic_bigbang';
export type AbilitySkillCategory = 'attack' | 'defense' | 'utility';
export type AbilitySkillRoleRestriction = 'any' | 'attacker' | 'escaper';
export type AbilitySkillStepRule = 'any' | 'zero_only';
export type AbilitySkillTargetRule = 'none' | 'position';

export interface AbilitySkillServerRule {
  roleRestriction: AbilitySkillRoleRestriction;
  stepRule: AbilitySkillStepRule;
  targetRule: AbilitySkillTargetRule;
  requiresEmptyPathWhenNotOverdrive?: boolean;
  exclusiveWhenNotOverdrive?: boolean;
  requiresPreviousTurnPath?: boolean;
}

// Single source of truth for server-side mana costs.
// When balance changes happen, update this object and keep engine/validation
// logic reading from it instead of hard-coded subtractions.
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
};

// Shared validation metadata for server-side planning rules.
// Keep common restrictions here so role/timing/target/cost rules do not drift
// between validation branches as new skills are added.
export const ABILITY_SKILL_SERVER_RULES: Record<
  AbilitySkillId,
  AbilitySkillServerRule
> = {
  classic_guard: {
    roleRestriction: 'escaper',
    stepRule: 'zero_only',
    targetRule: 'none',
    requiresEmptyPathWhenNotOverdrive: true,
  },
  arc_reactor_field: {
    roleRestriction: 'escaper',
    stepRule: 'any',
    targetRule: 'none',
  },
  phase_shift: {
    roleRestriction: 'escaper',
    stepRule: 'zero_only',
    targetRule: 'none',
  },
  ember_blast: {
    roleRestriction: 'attacker',
    stepRule: 'any',
    targetRule: 'none',
  },
  atomic_fission: {
    roleRestriction: 'attacker',
    stepRule: 'zero_only',
    targetRule: 'none',
    requiresPreviousTurnPath: true,
  },
  inferno_field: {
    roleRestriction: 'attacker',
    stepRule: 'any',
    targetRule: 'position',
  },
  nova_blast: {
    roleRestriction: 'attacker',
    stepRule: 'any',
    targetRule: 'none',
  },
  sun_chariot: {
    roleRestriction: 'attacker',
    stepRule: 'any',
    targetRule: 'none',
  },
  aurora_heal: {
    roleRestriction: 'any',
    stepRule: 'any',
    targetRule: 'none',
  },
  gold_overdrive: {
    roleRestriction: 'escaper',
    stepRule: 'any',
    targetRule: 'none',
  },
  quantum_shift: {
    roleRestriction: 'any',
    stepRule: 'any',
    targetRule: 'position',
  },
  plasma_charge: {
    roleRestriction: 'any',
    stepRule: 'zero_only',
    targetRule: 'none',
    requiresEmptyPathWhenNotOverdrive: true,
  },
  void_cloak: {
    roleRestriction: 'any',
    stepRule: 'any',
    targetRule: 'none',
  },
  electric_blitz: {
    roleRestriction: 'attacker',
    stepRule: 'any',
    targetRule: 'position',
    exclusiveWhenNotOverdrive: true,
  },
  cosmic_bigbang: {
    roleRestriction: 'attacker',
    stepRule: 'zero_only',
    targetRule: 'none',
    requiresEmptyPathWhenNotOverdrive: true,
    exclusiveWhenNotOverdrive: true,
  },
};

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
  isBot?: boolean;
  nickname: string;
  color: PlayerColor;
  pieceSkin: PieceSkin;
  boardSkin: BoardSkin;
  hp: number;
  position: Position;
  plannedPath: Position[];
  previousTurnStart: Position | null;
  previousTurnPath: Position[];
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
    red: ClientAbilityPlayerState;
    blue: ClientAbilityPlayerState;
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
  skillId: 'classic_guard' | 'arc_reactor_field';
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
}

export interface AbilityResolutionPayload {
  redPath: Position[];
  bluePath: Position[];
  redStart: Position;
  blueStart: Position;
  lavaTiles: AbilityLavaTile[];
  blocks: AbilityBlockEvent[];
  collisions: Array<{
    step: number;
    position: Position;
    escapeeColor: PlayerColor;
    newHp: number;
  }>;
  skillEvents: AbilitySkillEvent[];
}
