export interface Position {
  row: number;
  col: number;
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
  | 'sun';

export type BoardSkin = 'classic' | 'blue_gray' | 'pharaoh' | 'magic';

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

export interface ChatMessage {
  sender: string;
  color: PlayerColor;
  message: string;
  timestamp: number;
}
