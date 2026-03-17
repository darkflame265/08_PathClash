import type { PieceSkin, Position } from './game.types';

export type CoopPhase = 'waiting' | 'planning' | 'moving' | 'gameover';
export type CoopResult = 'win' | 'lose';
export type CoopPortalColor = 'green' | 'blue' | 'red';

export interface CoopPortal {
  id: string;
  position: Position;
  hp: number;
  maxHp: number;
  color: CoopPortalColor;
}

export interface CoopEnemy {
  id: string;
  position: Position;
}

export interface CoopEnemyPreview {
  id: string;
  start: Position;
  path: Position[];
}

export interface CoopClientPlayerState {
  id: string;
  nickname: string;
  color: 'red' | 'blue';
  pieceSkin: PieceSkin;
  hp: number;
  position: Position;
  pathSubmitted: boolean;
  role: 'attacker' | 'escaper';
  stats: { wins: number; losses: number };
}

export interface CoopClientState {
  roomId: string;
  code: string;
  round: number;
  portalSpawnCount: number;
  phase: CoopPhase;
  pathPoints: number;
  players: {
    red: CoopClientPlayerState;
    blue: CoopClientPlayerState;
  };
  portals: CoopPortal[];
  enemies: CoopEnemy[];
  enemyPreviews: CoopEnemyPreview[];
  finalWave: boolean;
  gameResult: CoopResult | null;
}

export interface CoopRoundStartPayload {
  state: CoopClientState;
  timeLimit: number;
  serverTime: number;
  roundEndsAt: number;
}

export interface CoopPlayerHitEvent {
  step: number;
  color: 'red' | 'blue';
  newHp: number;
}

export interface CoopPortalHitEvent {
  step: number;
  portalId: string;
  newHp: number;
  destroyed: boolean;
}

export interface CoopResolutionPayload {
  redPath: Position[];
  bluePath: Position[];
  redStart: Position;
  blueStart: Position;
  enemyMoves: CoopEnemyPreview[];
  playerHits: CoopPlayerHitEvent[];
  portalHits: CoopPortalHitEvent[];
}
