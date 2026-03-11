import { create } from 'zustand';
import type {
  ClientGameState, PlayerColor, Position,
  CollisionEvent, ChatMessage, PathsRevealPayload,
  RoundStartPayload, PieceSkin,
} from '../types/game.types';
import { type Lang } from '../i18n/translations';

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
  accountWins: number;
  accountLosses: number;
  accountTokens: number;
  currentMatchType: "friend" | "random" | "ai" | null;

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
  rematchRequestSent: boolean;

  // Chat
  messages: ChatMessage[];

  // Settings
  isSfxMuted: boolean;
  isMusicMuted: boolean;
  pieceSkin: PieceSkin;
  playerPieceSkins: { red: PieceSkin; blue: PieceSkin } | null;

  // i18n
  lang: Lang;
  setLang: (lang: Lang) => void;

  // Actions
  setNickname: (n: string) => void;
  setAuthState: (payload: {
    ready: boolean;
    userId: string | null;
    accessToken: string | null;
    isGuestUser: boolean;
    nickname?: string | null;
    wins?: number;
    losses?: number;
    tokens?: number;
  }) => void;
  setMyColor: (c: PlayerColor) => void;
  setRoomCode: (c: string) => void;
  setMatchType: (matchType: "friend" | "random" | "ai" | null) => void;
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
  setRematchRequestSent: (v: boolean) => void;
  addMessage: (msg: ChatMessage) => void;
  toggleSfxMute: () => void;
  toggleMusicMute: () => void;
  toggleAllAudio: () => void;
  setPieceSkin: (skin: PieceSkin) => void;
  setPlayerPieceSkins: (skins: { red: PieceSkin; blue: PieceSkin }) => void;
  setPlayerPieceSkin: (color: PlayerColor, skin: PieceSkin) => void;
  resetGame: () => void;
}

const INITIAL_RED: Position = { row: 2, col: 0 };
const INITIAL_BLUE: Position = { row: 2, col: 4 };
const AUDIO_PREFS_KEY = 'audioPrefs';
const PIECE_SKIN_KEY = 'pieceSkin';

function getStoredAudioPrefs() {
  const raw = localStorage.getItem(AUDIO_PREFS_KEY);
  if (!raw) {
    return { isSfxMuted: false, isMusicMuted: false };
  }

  try {
    const parsed = JSON.parse(raw) as {
      isSfxMuted?: boolean;
      isMusicMuted?: boolean;
    };
    return {
      isSfxMuted: Boolean(parsed.isSfxMuted),
      isMusicMuted: Boolean(parsed.isMusicMuted),
    };
  } catch {
    return { isSfxMuted: false, isMusicMuted: false };
  }
}

function saveAudioPrefs(prefs: { isSfxMuted: boolean; isMusicMuted: boolean }) {
  localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(prefs));
}

const initialAudioPrefs = getStoredAudioPrefs();
const initialPieceSkin = (() => {
  const stored = localStorage.getItem(PIECE_SKIN_KEY);
  return stored === 'ember' ||
    stored === 'nova' ||
    stored === 'aurora' ||
    stored === 'void' ||
    stored === 'plasma' ||
    stored === 'gold_core' ||
    stored === 'flag_kr' ||
    stored === 'flag_jp' ||
    stored === 'flag_cn' ||
    stored === 'flag_us' ||
    stored === 'flag_uk'
    ? stored
    : 'classic';
})();

export const useGameStore = create<GameStore>((set, get) => ({
  myNickname: '',
  myColor: null,
  roomCode: '',
  authReady: false,
  authUserId: null,
  authAccessToken: null,
  isGuestUser: false,
  accountWins: 0,
  accountLosses: 0,
  accountTokens: 0,
  currentMatchType: null,
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
  rematchRequestSent: false,
  messages: [],
  isSfxMuted: initialAudioPrefs.isSfxMuted,
  isMusicMuted: initialAudioPrefs.isMusicMuted,
  pieceSkin: initialPieceSkin,
  playerPieceSkins: null,
  lang: (() => {
    const stored = localStorage.getItem('lang');
    return (stored === 'en' || stored === 'kr') ? stored : 'en';
  })(),
  setLang: (lang: Lang) => {
    localStorage.setItem('lang', lang);
    set({ lang });
  },

  setNickname: (n) => set({ myNickname: n }),
  setAuthState: ({ ready, userId, accessToken, isGuestUser, nickname, wins, losses, tokens }) =>
    set((state) => ({
      authReady: ready,
      authUserId: userId,
      authAccessToken: accessToken,
      isGuestUser,
      myNickname: nickname ?? state.myNickname,
      accountWins: wins ?? state.accountWins,
      accountLosses: losses ?? state.accountLosses,
      accountTokens: tokens ?? state.accountTokens,
    })),
  setMyColor: (c) => set({ myColor: c }),
  setRoomCode: (c) => set({ roomCode: c }),
  setMatchType: (matchType) => set({ currentMatchType: matchType }),

  setGameState: (gs) =>
    set(() => ({
      gameState: gs,
      playerPieceSkins: {
        red: gs.players.red.pieceSkin,
        blue: gs.players.blue.pieceSkin,
      },
      redDisplayPos: gs.players.red.position,
      blueDisplayPos: gs.players.blue.position,
      winner: null,
      gameOverMessage: null,
      rematchRequested: false,
      rematchRequestSent: false,
      myPath: [],
      opponentSubmitted: false,
    })),

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
  setRematchRequestSent: (v) => set({ rematchRequestSent: v }),
  addMessage: (msg) => set({ messages: [...get().messages.slice(-99), msg] }),
  toggleSfxMute: () => {
    const next = {
      isSfxMuted: !get().isSfxMuted,
      isMusicMuted: get().isMusicMuted,
    };
    saveAudioPrefs(next);
    set({ isSfxMuted: next.isSfxMuted });
  },
  toggleMusicMute: () => {
    const next = {
      isSfxMuted: get().isSfxMuted,
      isMusicMuted: !get().isMusicMuted,
    };
    saveAudioPrefs(next);
    set({ isMusicMuted: next.isMusicMuted });
  },
  toggleAllAudio: () => {
    const nextMuted = !(get().isSfxMuted && get().isMusicMuted);
    const next = {
      isSfxMuted: nextMuted,
      isMusicMuted: nextMuted,
    };
    saveAudioPrefs(next);
    set({
      isSfxMuted: next.isSfxMuted,
      isMusicMuted: next.isMusicMuted,
    });
  },
  setPieceSkin: (skin) => {
    localStorage.setItem(PIECE_SKIN_KEY, skin);
    set({ pieceSkin: skin });
  },
  setPlayerPieceSkins: (skins) => set({ playerPieceSkins: skins }),
  setPlayerPieceSkin: (color, skin) =>
    set((state) => ({
      playerPieceSkins: {
        red: state.playerPieceSkins?.red ?? 'classic',
        blue: state.playerPieceSkins?.blue ?? 'classic',
        [color]: skin,
      },
    })),

  resetGame: () => set({
    authReady: get().authReady,
    authUserId: get().authUserId,
    authAccessToken: get().authAccessToken,
    isGuestUser: get().isGuestUser,
    accountWins: get().accountWins,
    accountLosses: get().accountLosses,
    accountTokens: get().accountTokens,
    myNickname: get().myNickname,
    pieceSkin: get().pieceSkin,
    playerPieceSkins: null,
    myColor: null,
    roomCode: '',
    currentMatchType: null,
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
    rematchRequestSent: false,
    messages: [],
    isSfxMuted: get().isSfxMuted,
    isMusicMuted: get().isMusicMuted,
  }),
}));
