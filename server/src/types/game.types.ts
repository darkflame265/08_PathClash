export interface Position {
  row: number; // 0~4
  col: number; // 0~4
}

export type PlayerColor = 'red' | 'blue';
export type GamePhase = 'waiting' | 'planning' | 'moving' | 'gameover';
export type PlayerRole = 'attacker' | 'escaper';
export type PieceSkin =
  | 'classic'
  | 'ember'
  | 'nova'
  | 'aurora'
  | 'void'
  | 'plasma'
  | 'gold_core'
  | 'neon_pulse'
  | 'cosmic'
  | 'inferno'
  | 'arc_reactor'
  | 'electric_core'
  | 'berserker'
  | 'quantum'
  | 'atomic'
  | 'chronos'
  | 'wizard'
  | 'sun'
  | 'flag_kr'
  | 'flag_jp'
  | 'flag_cn'
  | 'flag_us'
  | 'flag_uk';

export type BoardSkin = 'classic' | 'blue_gray' | 'pharaoh' | 'magic';

export interface PlayerState {
  id: string;
  userId: string | null;
  socketId: string;
  nickname: string;
  color: PlayerColor;
  connected?: boolean;
  pieceSkin: PieceSkin;
  boardSkin: BoardSkin;
  hp: number;
  position: Position;
  plannedPath: Position[];
  pathSubmitted: boolean;
  role: PlayerRole;
  stats: { wins: number; losses: number };
  disconnectLossRecorded?: boolean;
}

export type MatchType = 'friend' | 'random' | 'ai';

export interface GameState {
  roomId: string;
  code: string;
  turn: number;
  phase: GamePhase;
  pathPoints: number;
  obstacles: Position[];
  players: {
    red: PlayerState;
    blue: PlayerState;
  };
  attackerColor: PlayerColor;
}

export interface CollisionEvent {
  step: number;
  position: Position;
  escapeeColor: PlayerColor;
  newHp: number;
  sourceColor?: PlayerColor;
  sourceSkillId?: string;
}

export interface PathsRevealPayload {
  redPath: Position[];
  bluePath: Position[];
  redStart: Position;
  blueStart: Position;
  collisions: CollisionEvent[];
}

export interface RoundStartPayload {
  turn: number;
  pathPoints: number;
  attackerColor: PlayerColor;
  redPosition: Position;
  bluePosition: Position;
  obstacles: Position[];
  timeLimit: number;
  serverTime: number;
  roundEndsAt: number;
  tutorialScenario?:
    | 'attack'
    | 'escape'
    | 'predict'
    | 'predict_obstacle'
    | 'predict_wall'
    | 'overlap_escape'
    | 'chain_attack'
    | 'freeplay';
}

// Client-safe version (no socketId)
export interface ClientPlayerState {
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
}

export interface ClientGameState {
  roomId: string;
  code: string;
  turn: number;
  phase: GamePhase;
  pathPoints: number;
  obstacles: Position[];
  tutorialActive?: boolean;
  players: {
    red: ClientPlayerState;
    blue: ClientPlayerState;
  };
  attackerColor: PlayerColor;
}
