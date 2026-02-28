export interface Position {
  row: number;
  col: number;
}

export type PlayerColor = 'red' | 'blue';
export type GamePhase = 'waiting' | 'planning' | 'moving' | 'gameover';
export type PlayerRole = 'attacker' | 'escaper';

export interface ClientPlayerState {
  id: string;
  nickname: string;
  color: PlayerColor;
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
}

export interface ChatMessage {
  sender: string;
  color: PlayerColor;
  message: string;
  timestamp: number;
}
