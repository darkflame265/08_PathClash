import type { PlayerState, Position } from '../../types/game.types';

export type TwoVsTwoPhase = 'waiting' | 'planning' | 'moving' | 'gameover';
export type TwoVsTwoTeam = 'red' | 'blue';
export type TwoVsTwoSlot =
  | 'red_top'
  | 'red_bottom'
  | 'blue_top'
  | 'blue_bottom';
export type TwoVsTwoRole = 'attacker' | 'escaper';
export type TwoVsTwoResult = 'red' | 'blue' | 'draw';

export interface TwoVsTwoPlayerState extends PlayerState {
  slot: TwoVsTwoSlot;
  team: TwoVsTwoTeam;
}

export interface TwoVsTwoClientPlayerState {
  id: string;
  nickname: string;
  color: TwoVsTwoTeam;
  slot: TwoVsTwoSlot;
  team: TwoVsTwoTeam;
  pieceSkin: PlayerState['pieceSkin'];
  hp: number;
  position: Position;
  pathSubmitted: boolean;
  role: TwoVsTwoRole;
  stats: { wins: number; losses: number };
}

export interface TwoVsTwoClientState {
  roomId: string;
  code: string;
  turn: number;
  phase: TwoVsTwoPhase;
  pathPoints: number;
  obstacles: Position[];
  attackerTeam: TwoVsTwoTeam;
  players: Record<TwoVsTwoSlot, TwoVsTwoClientPlayerState>;
  gameResult: TwoVsTwoResult | null;
}

export interface TwoVsTwoRoundStartPayload {
  state: TwoVsTwoClientState;
  timeLimit: number;
  serverTime: number;
  roundEndsAt: number;
}

export interface TwoVsTwoPlayerHitEvent {
  step: number;
  slot: TwoVsTwoSlot;
  newHp: number;
}

export interface TwoVsTwoResolutionPayload {
  paths: Record<TwoVsTwoSlot, Position[]>;
  starts: Record<TwoVsTwoSlot, Position>;
  playerHits: TwoVsTwoPlayerHitEvent[];
}
