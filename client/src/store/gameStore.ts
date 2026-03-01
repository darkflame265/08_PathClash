import { create } from 'zustand';
import type {
  ClientGameState, PlayerColor, Position,
  CollisionEvent, ChatMessage, PathsRevealPayload,
  RoundStartPayload,
} from '../types/game.types';

export interface AnimationState {
  isAnimating: boolean;
  redPath: Position[];
  bluePath: Position[];
  redStart: Position;
  blueStart: Position;
  collisions: CollisionEvent[];
  currentStep: number;
}

interface GameStore {
  // Lobby
  myNickname: string;
  myColor: PlayerColor | null;
  roomCode: string;
  authReady: boolean;
  authUserId: string | null;
  authAccessToken: string | null;
  isGuestUser: boolean;

  // Game
  gameState: ClientGameState | null;
  myPath: Position[];
  opponentSubmitted: boolean;

  // Round
  roundInfo: RoundStartPayload | null;

  // Animation
  animation: AnimationState | null;

  // Visual state (separate from gameState to allow animation-driven updates)
  redDisplayPos: Position;
  blueDisplayPos: Position;
  hitEffect: { red: boolean; blue: boolean };
  heartShake: { red: number; blue: number }; // hp index that shakes
  collisionEffects: { id: number; position: Position }[];
  explosionEffect: PlayerColor | null;

  // Game over
  winner: PlayerColor | null;
  gameOverMessage: string | null;
  rematchRequested: boolean; // opponent requested

  // Chat
  messages: ChatMessage[];

  // Settings
  isMuted: boolean;

  // Actions
  setNickname: (n: string) => void;
  setAuthState: (payload: {
    ready: boolean;
    userId: string | null;
    accessToken: string | null;
    isGuestUser: boolean;
    nickname?: string | null;
  }) => void;
  setMyColor: (c: PlayerColor) => void;
  setRoomCode: (c: string) => void;
  setGameState: (gs: ClientGameState) => void;
  setRoundInfo: (r: RoundStartPayload) => void;
  setMyPath: (p: Position[]) => void;
  setOpponentSubmitted: (v: boolean) => void;
  startAnimation: (payload: PathsRevealPayload) => void;
  advanceStep: () => void;
  finishAnimation: () => void;
  triggerHit: (color: PlayerColor) => void;
  triggerHeartShake: (color: PlayerColor, hpIndex: number) => void;
  triggerCollisionEffect: (pos: Position) => void;
  triggerExplosion: (color: PlayerColor) => void;
  setWinner: (w: PlayerColor) => void;
  setGameOverMessage: (message: string | null) => void;
  setRematchRequested: (v: boolean) => void;
  addMessage: (msg: ChatMessage) => void;
  toggleMute: () => void;
  resetGame: () => void;
}

const INITIAL_RED: Position = { row: 2, col: 0 };
const INITIAL_BLUE: Position = { row: 2, col: 4 };

export const useGameStore = create<GameStore>((set, get) => ({
  myNickname: '',
  myColor: null,
  roomCode: '',
  authReady: false,
  authUserId: null,
  authAccessToken: null,
  isGuestUser: false,
  gameState: null,
  myPath: [],
  opponentSubmitted: false,
  roundInfo: null,
  animation: null,
  redDisplayPos: INITIAL_RED,
  blueDisplayPos: INITIAL_BLUE,
  hitEffect: { red: false, blue: false },
  heartShake: { red: -1, blue: -1 },
  collisionEffects: [],
  explosionEffect: null,
  winner: null,
  gameOverMessage: null,
  rematchRequested: false,
  messages: [],
  isMuted: false,

  setNickname: (n) => set({ myNickname: n }),
  setAuthState: ({ ready, userId, accessToken, isGuestUser, nickname }) =>
    set((state) => ({
      authReady: ready,
      authUserId: userId,
      authAccessToken: accessToken,
      isGuestUser,
      myNickname: nickname ?? state.myNickname,
    })),
  setMyColor: (c) => set({ myColor: c }),
  setRoomCode: (c) => set({ roomCode: c }),

  setGameState: (gs) => set({
    gameState: gs,
    redDisplayPos: gs.players.red.position,
    blueDisplayPos: gs.players.blue.position,
    winner: null,
    gameOverMessage: null,
    rematchRequested: false,
    myPath: [],
    opponentSubmitted: false,
  }),

  setRoundInfo: (r) => set({
    roundInfo: r,
    myPath: [],
    opponentSubmitted: false,
    gameState: get().gameState ? {
      ...get().gameState!,
      turn: r.turn,
      phase: 'planning',
      pathPoints: r.pathPoints,
      obstacles: r.obstacles,
      attackerColor: r.attackerColor,
      players: {
        ...get().gameState!.players,
        red: { ...get().gameState!.players.red, position: r.redPosition, role: r.attackerColor === 'red' ? 'attacker' : 'escaper', pathSubmitted: false },
        blue: { ...get().gameState!.players.blue, position: r.bluePosition, role: r.attackerColor === 'blue' ? 'attacker' : 'escaper', pathSubmitted: false },
      },
    } : null,
    redDisplayPos: r.redPosition,
    blueDisplayPos: r.bluePosition,
  }),

  setMyPath: (p) => set({ myPath: p }),
  setOpponentSubmitted: (v) => set({ opponentSubmitted: v }),

  startAnimation: (payload) => set({
    animation: {
      isAnimating: true,
      redPath: payload.redPath,
      bluePath: payload.bluePath,
      redStart: payload.redStart,
      blueStart: payload.blueStart,
      collisions: payload.collisions,
      currentStep: 0,
    },
    gameState: get().gameState ? { ...get().gameState!, phase: 'moving' } : null,
  }),

  advanceStep: () => {
    const anim = get().animation;
    if (!anim) return;
    const nextStep = anim.currentStep + 1;
    const redSeq = [anim.redStart, ...anim.redPath];
    const blueSeq = [anim.blueStart, ...anim.bluePath];
    const newRed = redSeq[Math.min(nextStep, redSeq.length - 1)];
    const newBlue = blueSeq[Math.min(nextStep, blueSeq.length - 1)];
    set({
      animation: { ...anim, currentStep: nextStep },
      redDisplayPos: newRed,
      blueDisplayPos: newBlue,
    });
  },

  finishAnimation: () => set({ animation: null }),

  triggerHit: (color) => {
    set({ hitEffect: { ...get().hitEffect, [color]: true } });
    setTimeout(() => set({ hitEffect: { ...get().hitEffect, [color]: false } }), 700);
  },

  triggerHeartShake: (color, hpIndex) => {
    set({ heartShake: { ...get().heartShake, [color]: hpIndex } });
    setTimeout(() => set({ heartShake: { ...get().heartShake, [color]: -1 } }), 500);
  },

  triggerCollisionEffect: (pos) => {
    const id = Date.now();
    set({ collisionEffects: [...get().collisionEffects, { id, position: pos }] });
    setTimeout(() => set({ collisionEffects: get().collisionEffects.filter(e => e.id !== id) }), 600);
  },

  triggerExplosion: (color) => {
    set({ explosionEffect: color });
    setTimeout(() => set({ explosionEffect: null }), 600);
  },

  setWinner: (w) => set({ winner: w }),
  setGameOverMessage: (message) => set({ gameOverMessage: message }),
  setRematchRequested: (v) => set({ rematchRequested: v }),
  addMessage: (msg) => set({ messages: [...get().messages.slice(-99), msg] }),
  toggleMute: () => set({ isMuted: !get().isMuted }),

  resetGame: () => set({
    authReady: get().authReady,
    authUserId: get().authUserId,
    authAccessToken: get().authAccessToken,
    isGuestUser: get().isGuestUser,
    myNickname: get().myNickname,
    myColor: null,
    roomCode: '',
    gameState: null,
    myPath: [],
    opponentSubmitted: false,
    roundInfo: null,
    animation: null,
    redDisplayPos: INITIAL_RED,
    blueDisplayPos: INITIAL_BLUE,
    hitEffect: { red: false, blue: false },
    heartShake: { red: -1, blue: -1 },
    collisionEffects: [],
    explosionEffect: null,
    winner: null,
    gameOverMessage: null,
    rematchRequested: false,
    messages: [],
    isMuted: get().isMuted,
  }),
}));
