import { create } from "zustand";
import type {
  ClientGameState,
  PlayerColor,
  Position,
  CollisionEvent,
  ChatMessage,
  PathsRevealPayload,
  RoundStartPayload,
  PieceSkin,
  BoardSkin,
} from "../types/game.types";
import type {
  TwoVsTwoResolutionPayload,
  TwoVsTwoSlot,
} from "../types/twovtwo.types";
import {
  normalizeAbilityLoadout,
  type AbilitySkillId,
} from "../types/ability.types";
import { type Lang } from "../i18n/translations";
import {
  normalizeAbilitySfxGains,
  type AbilitySfxGainId,
} from "../settings/abilitySfx";

function resolveInitialLang(): Lang {
  const stored = localStorage.getItem("lang");
  if (stored === "en" || stored === "kr") {
    return stored;
  }

  const locale =
    (Array.isArray(navigator.languages) && navigator.languages[0]) ||
    navigator.language ||
    "en";

  return locale.toLowerCase().startsWith("ko") ? "kr" : "en";
}

export interface AnimationState {
  isAnimating: boolean;
  redPath: Position[];
  bluePath: Position[];
  redStart: Position;
  blueStart: Position;
  collisions: CollisionEvent[];
  currentStep: number;
}

export interface TwoVsTwoAnimationState {
  isAnimating: boolean;
  paths: Record<TwoVsTwoSlot, Position[]>;
  starts: Record<TwoVsTwoSlot, Position>;
  currentStep: number;
}

interface GameStore {
  // Lobby
  myNickname: string;
  myColor: PlayerColor | null;
  roomCode: string;
  authReady: boolean;
  accountSummaryLoading: boolean;
  authUserId: string | null;
  authAccessToken: string | null;
  isGuestUser: boolean;
  accountWins: number;
  accountLosses: number;
  accountTokens: number;
  ownedSkins: PieceSkin[];
  ownedBoardSkins: BoardSkin[];
  equippedAbilitySkills?: AbilitySkillId[];
  accountDailyRewardWins: number;
  accountDailyRewardTokens: number;
  accountAchievements: Array<{
    achievementId: string;
    progress: number;
    completed: boolean;
    claimed: boolean;
    completedAt: string | null;
    claimedAt: string | null;
  }>;
  currentMatchType:
    | "friend"
    | "random"
    | "ai"
    | "coop"
    | "2v2"
    | "ability"
    | null;
  isLocalAbilityTraining: boolean;
  twoVsTwoSlot: "red_top" | "red_bottom" | "blue_top" | "blue_bottom" | null;
  abilityLoadout: AbilitySkillId[];
  rotationSkills: AbilitySkillId[];
  pendingRemovedRotationSkillsNotice: AbilitySkillId[];
  currentRating: number;
  highestArena: number;
  rankedUnlocked: boolean;

  // Game
  gameState: ClientGameState | null;
  myPath: Position[];
  opponentSubmitted: boolean;

  // Round
  roundInfo: RoundStartPayload | null;

  // Animation
  animation: AnimationState | null;
  twoVsTwoAnimation: TwoVsTwoAnimationState | null;

  // Visual state (separate from gameState to allow animation-driven updates)
  redDisplayPos: Position;
  blueDisplayPos: Position;
  twoVsTwoDisplayPositions: Record<TwoVsTwoSlot, Position> | null;
  hitEffect: { red: boolean; blue: boolean };
  heartShake: { red: number; blue: number }; // hp index that shakes
  collisionEffects: { id: number; position: Position; direction: { dx: number; dy: number } }[];
  boardShakeKey: number;
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
  musicVolume: number;
  sfxVolume: number;
  abilitySfxGains: Record<AbilitySfxGainId, number>;
  pieceSkin: PieceSkin;
  boardSkin: BoardSkin;
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
    equippedSkin?: PieceSkin;
    equippedBoardSkin?: BoardSkin;
    equippedAbilitySkills?: AbilitySkillId[];
    ownedSkins?: PieceSkin[];
    ownedBoardSkins?: BoardSkin[];
    wins?: number;
    losses?: number;
    tokens?: number;
    dailyRewardWins?: number;
    dailyRewardTokens?: number;
    achievements?: Array<{
      achievementId: string;
      progress: number;
      completed: boolean;
      claimed: boolean;
      completedAt: string | null;
      claimedAt: string | null;
    }>;
    currentRating?: number;
    highestArena?: number;
    rankedUnlocked?: boolean;
  }) => void;
  setAccountSummaryLoading: (loading: boolean) => void;
  setMyColor: (c: PlayerColor) => void;
  setRoomCode: (c: string) => void;
  setMatchType: (
    matchType: "friend" | "random" | "ai" | "coop" | "2v2" | "ability" | null,
  ) => void;
  setLocalAbilityTraining: (enabled: boolean) => void;
  setTwoVsTwoSlot: (
    slot: "red_top" | "red_bottom" | "blue_top" | "blue_bottom" | null,
  ) => void;
  setAbilityLoadout: (skills: AbilitySkillId[]) => void;
  setRotationSkills: (skills: AbilitySkillId[]) => void;
  setPendingRemovedRotationSkillsNotice: (skills: AbilitySkillId[]) => void;
  setGameState: (gs: ClientGameState) => void;
  setRoundInfo: (r: RoundStartPayload) => void;
  setMyPath: (p: Position[]) => void;
  setOpponentSubmitted: (v: boolean) => void;
  startAnimation: (payload: PathsRevealPayload) => void;
  advanceStep: () => void;
  finishAnimation: () => void;
  startTwoVsTwoAnimation: (payload: TwoVsTwoResolutionPayload) => void;
  advanceTwoVsTwoStep: () => void;
  finishTwoVsTwoAnimation: () => void;
  setTwoVsTwoDisplayPositions: (
    positions: Record<TwoVsTwoSlot, Position> | null,
  ) => void;
  triggerHit: (color: PlayerColor) => void;
  triggerHeartShake: (color: PlayerColor, hpIndex: number) => void;
  triggerCollisionEffect: (pos: Position, direction: { dx: number; dy: number }) => void;
  triggerExplosion: (color: PlayerColor) => void;
  setWinner: (w: PlayerColor) => void;
  setGameOverMessage: (message: string | null) => void;
  setRematchRequested: (v: boolean) => void;
  setRematchRequestSent: (v: boolean) => void;
  addMessage: (msg: ChatMessage) => void;
  toggleSfxMute: () => void;
  toggleMusicMute: () => void;
  toggleAllAudio: () => void;
  setMusicVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  setAbilitySfxGain: (id: AbilitySfxGainId, gain: number) => void;
  setPieceSkin: (skin: PieceSkin) => void;
  setBoardSkin: (skin: BoardSkin) => void;
  setPlayerPieceSkins: (skins: { red: PieceSkin; blue: PieceSkin }) => void;
  setPlayerPieceSkin: (color: PlayerColor, skin: PieceSkin) => void;
  resetGame: () => void;
}

const INITIAL_RED: Position = { row: 2, col: 0 };
const INITIAL_BLUE: Position = { row: 2, col: 4 };
const AUDIO_PREFS_KEY = "audioPrefs";
const AUDIO_PREFS_VERSION = 2;
const DEFAULT_MUSIC_VOLUME = 0.85;
const DEFAULT_SFX_VOLUME = 0.85;
const PIECE_SKIN_KEY = "pieceSkin";
const BOARD_SKIN_KEY = "boardSkin";

function normalizeStoredAudioVolume(
  value: unknown,
  fallback: number,
  shouldBoostLegacyValue: boolean,
) {
  const normalized =
    typeof value === "number" ? Math.max(0, Math.min(1, value)) : fallback;
  return shouldBoostLegacyValue ? Math.max(normalized, fallback) : normalized;
}

function getStoredAudioPrefs() {
  const raw = localStorage.getItem(AUDIO_PREFS_KEY);
  if (!raw) {
    return {
      isSfxMuted: false,
      isMusicMuted: false,
      musicVolume: DEFAULT_MUSIC_VOLUME,
      sfxVolume: DEFAULT_SFX_VOLUME,
      abilitySfxGains: normalizeAbilitySfxGains(null),
    };
  }

  try {
    const parsed = JSON.parse(raw) as {
      version?: number;
      isSfxMuted?: boolean;
      isMusicMuted?: boolean;
      musicVolume?: number;
      sfxVolume?: number;
      abilitySfxGains?: unknown;
    };
    const shouldBoostLegacyValue = parsed.version !== AUDIO_PREFS_VERSION;
    return {
      isSfxMuted: Boolean(parsed.isSfxMuted),
      isMusicMuted: Boolean(parsed.isMusicMuted),
      musicVolume: normalizeStoredAudioVolume(
        parsed.musicVolume,
        DEFAULT_MUSIC_VOLUME,
        shouldBoostLegacyValue,
      ),
      sfxVolume: normalizeStoredAudioVolume(
        parsed.sfxVolume,
        DEFAULT_SFX_VOLUME,
        shouldBoostLegacyValue,
      ),
      abilitySfxGains: normalizeAbilitySfxGains(parsed.abilitySfxGains),
    };
  } catch {
    return {
      isSfxMuted: false,
      isMusicMuted: false,
      musicVolume: DEFAULT_MUSIC_VOLUME,
      sfxVolume: DEFAULT_SFX_VOLUME,
      abilitySfxGains: normalizeAbilitySfxGains(null),
    };
  }
}

function saveAudioPrefs(prefs: {
  isSfxMuted: boolean;
  isMusicMuted: boolean;
  musicVolume: number;
  sfxVolume: number;
  abilitySfxGains: Record<AbilitySfxGainId, number>;
}) {
  localStorage.setItem(
    AUDIO_PREFS_KEY,
    JSON.stringify({ version: AUDIO_PREFS_VERSION, ...prefs }),
  );
}

const initialAudioPrefs = getStoredAudioPrefs();
const hitTimeouts: Partial<Record<PlayerColor, number>> = {};
const heartShakeTimeouts: Partial<Record<PlayerColor, number>> = {};
const initialPieceSkin = (() => {
  const stored = localStorage.getItem(PIECE_SKIN_KEY);
  return stored === "ember" ||
    stored === "nova" ||
    stored === "aurora" ||
    stored === "void" ||
    stored === "plasma" ||
    stored === "gold_core" ||
    stored === "neon_pulse" ||
    stored === "cosmic" ||
    stored === "inferno" ||
    stored === "arc_reactor" ||
    stored === "electric_core" ||
    stored === "quantum" ||
    stored === "atomic" ||
    stored === "chronos" ||
    stored === "wizard" ||
    stored === "sun"
    ? stored
    : "classic";
})();
const initialBoardSkin = (() => {
  const stored = localStorage.getItem(BOARD_SKIN_KEY);
  return stored === "blue_gray" || stored === "pharaoh" || stored === "magic"
    ? stored
    : "classic";
})();
const initialAbilityLoadout = ["classic_guard"] as AbilitySkillId[];

export const useGameStore = create<GameStore>((set, get) => ({
  myNickname: "",
  myColor: null,
  roomCode: "",
  authReady: false,
  accountSummaryLoading: false,
  authUserId: null,
  authAccessToken: null,
  isGuestUser: false,
  accountWins: 0,
  accountLosses: 0,
  accountTokens: 0,
  ownedSkins: [],
  ownedBoardSkins: [],
  accountDailyRewardWins: 0,
  accountDailyRewardTokens: 0,
  accountAchievements: [],
  currentMatchType: null,
  isLocalAbilityTraining: false,
  twoVsTwoSlot: null,
  abilityLoadout: initialAbilityLoadout,
  rotationSkills: [],
  pendingRemovedRotationSkillsNotice: [],
  currentRating: 0,
  highestArena: 1,
  rankedUnlocked: false,
  gameState: null,
  myPath: [],
  opponentSubmitted: false,
  roundInfo: null,
  animation: null,
  twoVsTwoAnimation: null,
  redDisplayPos: INITIAL_RED,
  blueDisplayPos: INITIAL_BLUE,
  twoVsTwoDisplayPositions: null,
  hitEffect: { red: false, blue: false },
  heartShake: { red: -1, blue: -1 },
  collisionEffects: [],
  boardShakeKey: 0,
  explosionEffect: null,
  winner: null,
  gameOverMessage: null,
  rematchRequested: false,
  rematchRequestSent: false,
  messages: [],
  isSfxMuted: initialAudioPrefs.isSfxMuted,
  isMusicMuted: initialAudioPrefs.isMusicMuted,
  musicVolume: initialAudioPrefs.musicVolume,
  sfxVolume: initialAudioPrefs.sfxVolume,
  abilitySfxGains: initialAudioPrefs.abilitySfxGains,
  pieceSkin: initialPieceSkin,
  boardSkin: initialBoardSkin,
  playerPieceSkins: null,
  lang: resolveInitialLang(),
  setLang: (lang: Lang) => {
    localStorage.setItem("lang", lang);
    set({ lang });
  },

  setNickname: (n) => set({ myNickname: n }),
  setAccountSummaryLoading: (loading) =>
    set({ accountSummaryLoading: loading }),
  setAuthState: ({
    ready,
    userId,
    accessToken,
    isGuestUser,
    nickname,
    equippedSkin,
    equippedBoardSkin,
    equippedAbilitySkills,
    ownedSkins,
    ownedBoardSkins,
    wins,
    losses,
    tokens,
    dailyRewardWins,
    dailyRewardTokens,
    achievements,
    currentRating,
    highestArena,
    rankedUnlocked,
  }) => {
    if (equippedSkin) {
      localStorage.setItem(PIECE_SKIN_KEY, equippedSkin);
    }
    if (equippedBoardSkin) {
      localStorage.setItem(BOARD_SKIN_KEY, equippedBoardSkin);
    }

    set((state) => ({
      authReady: ready,
      authUserId: userId,
      authAccessToken: accessToken,
      isGuestUser,
      myNickname: nickname ?? state.myNickname,
      pieceSkin: equippedSkin ?? state.pieceSkin,
      boardSkin: equippedBoardSkin ?? state.boardSkin,
      accountWins: wins ?? state.accountWins,
      accountLosses: losses ?? state.accountLosses,
      accountTokens: tokens ?? state.accountTokens,
      ownedSkins: ownedSkins ?? state.ownedSkins,
      ownedBoardSkins: ownedBoardSkins ?? state.ownedBoardSkins,
      abilityLoadout:
        equippedAbilitySkills !== undefined
          ? normalizeAbilityLoadout(equippedAbilitySkills)
          : userId
            ? userId !== state.authUserId
              ? initialAbilityLoadout
              : state.abilityLoadout
            : initialAbilityLoadout,
      accountDailyRewardWins: dailyRewardWins ?? state.accountDailyRewardWins,
      accountDailyRewardTokens:
        dailyRewardTokens ?? state.accountDailyRewardTokens,
      accountAchievements: achievements ?? state.accountAchievements,
      currentRating: currentRating ?? state.currentRating,
      highestArena: highestArena ?? state.highestArena,
      rankedUnlocked: rankedUnlocked ?? state.rankedUnlocked,
    }));
  },
  setMyColor: (c) => set({ myColor: c }),
  setRoomCode: (c) => set({ roomCode: c }),
  setMatchType: (matchType) => set({ currentMatchType: matchType }),
  setLocalAbilityTraining: (enabled) => set({ isLocalAbilityTraining: enabled }),
  setTwoVsTwoSlot: (slot) => set({ twoVsTwoSlot: slot }),
  setAbilityLoadout: (skills) => {
    const next = normalizeAbilityLoadout(skills);
    set({ abilityLoadout: next });
  },
  setRotationSkills: (skills) => set({ rotationSkills: skills }),
  setPendingRemovedRotationSkillsNotice: (skills) =>
    set({ pendingRemovedRotationSkillsNotice: skills }),

  setGameState: (gs) =>
    set(() => ({
      gameState: gs,
      roundInfo: null,
      animation: null,
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

  setRoundInfo: (r) =>
    set({
      roundInfo: r,
      myPath: [],
      opponentSubmitted: false,
      gameState: get().gameState
        ? {
            ...get().gameState!,
            turn: r.turn,
            phase: "planning",
            pathPoints: r.pathPoints,
            obstacles: r.obstacles,
            attackerColor: r.attackerColor,
            players: {
              ...get().gameState!.players,
              red: {
                ...get().gameState!.players.red,
                position: r.redPosition,
                role: r.attackerColor === "red" ? "attacker" : "escaper",
                pathSubmitted: false,
              },
              blue: {
                ...get().gameState!.players.blue,
                position: r.bluePosition,
                role: r.attackerColor === "blue" ? "attacker" : "escaper",
                pathSubmitted: false,
              },
            },
          }
        : null,
      redDisplayPos: r.redPosition,
      blueDisplayPos: r.bluePosition,
    }),

  setMyPath: (p) => set({ myPath: p }),
  setOpponentSubmitted: (v) => set({ opponentSubmitted: v }),

  startAnimation: (payload) =>
    set({
      animation: {
        isAnimating: true,
        redPath: payload.redPath,
        bluePath: payload.bluePath,
        redStart: payload.redStart,
        blueStart: payload.blueStart,
        collisions: payload.collisions,
        currentStep: 0,
      },
      gameState: get().gameState
        ? { ...get().gameState!, phase: "moving" }
        : null,
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

  finishAnimation: () =>
    set((state) => ({
      animation: state.animation
        ? { ...state.animation, isAnimating: false }
        : null,
    })),

  startTwoVsTwoAnimation: (payload) =>
    set({
      twoVsTwoAnimation: {
        isAnimating: true,
        paths: payload.paths,
        starts: payload.starts,
        currentStep: 0,
      },
      twoVsTwoDisplayPositions: payload.starts,
    }),

  advanceTwoVsTwoStep: () => {
    const anim = get().twoVsTwoAnimation;
    if (!anim) return;
    const nextStep = anim.currentStep + 1;
    const nextPositions = Object.fromEntries(
      (Object.keys(anim.paths) as TwoVsTwoSlot[]).map((slot) => {
        const sequence = [anim.starts[slot], ...anim.paths[slot]];
        return [slot, sequence[Math.min(nextStep, sequence.length - 1)]];
      }),
    ) as Record<TwoVsTwoSlot, Position>;
    set({
      twoVsTwoAnimation: { ...anim, currentStep: nextStep },
      twoVsTwoDisplayPositions: nextPositions,
    });
  },

  finishTwoVsTwoAnimation: () =>
    set({
      twoVsTwoAnimation: null,
    }),

  setTwoVsTwoDisplayPositions: (positions) =>
    set({ twoVsTwoDisplayPositions: positions }),

  triggerHit: (color) => {
    const prevTimeout = hitTimeouts[color];
    if (prevTimeout !== undefined) {
      window.clearTimeout(prevTimeout);
    }
    set({ hitEffect: { ...get().hitEffect, [color]: true } });
    hitTimeouts[color] = window.setTimeout(() => {
      hitTimeouts[color] = undefined;
      set({ hitEffect: { ...get().hitEffect, [color]: false } });
    }, 700);
  },

  triggerHeartShake: (color, hpIndex) => {
    const prevTimeout = heartShakeTimeouts[color];
    if (prevTimeout !== undefined) {
      window.clearTimeout(prevTimeout);
    }
    set({ heartShake: { ...get().heartShake, [color]: hpIndex } });
    heartShakeTimeouts[color] = window.setTimeout(() => {
      heartShakeTimeouts[color] = undefined;
      set({ heartShake: { ...get().heartShake, [color]: -1 } });
    }, 500);
  },

  triggerCollisionEffect: (pos, direction) => {
    const id = Date.now();
    set({
      collisionEffects: [...get().collisionEffects, { id, position: pos, direction }],
      boardShakeKey: get().boardShakeKey + 1,
    });
    setTimeout(
      () =>
        set({
          collisionEffects: get().collisionEffects.filter((e) => e.id !== id),
        }),
      600,
    );
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
      musicVolume: get().musicVolume,
      sfxVolume: get().sfxVolume,
      abilitySfxGains: get().abilitySfxGains,
    };
    saveAudioPrefs(next);
    set({ isSfxMuted: next.isSfxMuted });
  },
  toggleMusicMute: () => {
    const next = {
      isSfxMuted: get().isSfxMuted,
      isMusicMuted: !get().isMusicMuted,
      musicVolume: get().musicVolume,
      sfxVolume: get().sfxVolume,
      abilitySfxGains: get().abilitySfxGains,
    };
    saveAudioPrefs(next);
    set({ isMusicMuted: next.isMusicMuted });
  },
  toggleAllAudio: () => {
    const nextMuted = !(get().isSfxMuted && get().isMusicMuted);
    const next = {
      isSfxMuted: nextMuted,
      isMusicMuted: nextMuted,
      musicVolume: get().musicVolume,
      sfxVolume: get().sfxVolume,
      abilitySfxGains: get().abilitySfxGains,
    };
    saveAudioPrefs(next);
    set({
      isSfxMuted: next.isSfxMuted,
      isMusicMuted: next.isMusicMuted,
    });
  },
  setMusicVolume: (volume) => {
    const normalized = Math.max(0, Math.min(1, volume));
    const next = {
      isSfxMuted: get().isSfxMuted,
      isMusicMuted: get().isMusicMuted,
      musicVolume: normalized,
      sfxVolume: get().sfxVolume,
      abilitySfxGains: get().abilitySfxGains,
    };
    saveAudioPrefs(next);
    set({ musicVolume: normalized });
  },
  setSfxVolume: (volume) => {
    const normalized = Math.max(0, Math.min(1, volume));
    const next = {
      isSfxMuted: get().isSfxMuted,
      isMusicMuted: get().isMusicMuted,
      musicVolume: get().musicVolume,
      sfxVolume: normalized,
      abilitySfxGains: get().abilitySfxGains,
    };
    saveAudioPrefs(next);
    set({ sfxVolume: normalized });
  },
  setAbilitySfxGain: (id, gain) => {
    const normalized = Math.max(0, Math.min(1, gain));
    const abilitySfxGains = {
      ...get().abilitySfxGains,
      [id]: normalized,
    };
    saveAudioPrefs({
      isSfxMuted: get().isSfxMuted,
      isMusicMuted: get().isMusicMuted,
      musicVolume: get().musicVolume,
      sfxVolume: get().sfxVolume,
      abilitySfxGains,
    });
    set({ abilitySfxGains });
  },
  setPieceSkin: (skin) => {
    localStorage.setItem(PIECE_SKIN_KEY, skin);
    set({ pieceSkin: skin });
  },
  setBoardSkin: (skin) => {
    localStorage.setItem(BOARD_SKIN_KEY, skin);
    set({ boardSkin: skin });
  },
  setPlayerPieceSkins: (skins) => set({ playerPieceSkins: skins }),
  setPlayerPieceSkin: (color, skin) =>
    set((state) => ({
      playerPieceSkins: {
        red: state.playerPieceSkins?.red ?? "classic",
        blue: state.playerPieceSkins?.blue ?? "classic",
        [color]: skin,
      },
    })),

  resetGame: () =>
    set({
      authReady: get().authReady,
      authUserId: get().authUserId,
      authAccessToken: get().authAccessToken,
      isGuestUser: get().isGuestUser,
      accountWins: get().accountWins,
      accountLosses: get().accountLosses,
      accountTokens: get().accountTokens,
      accountAchievements: get().accountAchievements,
      myNickname: get().myNickname,
      pieceSkin: get().pieceSkin,
      boardSkin: get().boardSkin,
      playerPieceSkins: null,
      myColor: null,
      roomCode: "",
      currentMatchType: null,
      isLocalAbilityTraining: false,
      twoVsTwoSlot: null,
      abilityLoadout: get().abilityLoadout,
      gameState: null,
      myPath: [],
      opponentSubmitted: false,
      roundInfo: null,
      animation: null,
      twoVsTwoAnimation: null,
      redDisplayPos: INITIAL_RED,
      blueDisplayPos: INITIAL_BLUE,
      twoVsTwoDisplayPositions: null,
      hitEffect: { red: false, blue: false },
      heartShake: { red: -1, blue: -1 },
      collisionEffects: [],
      boardShakeKey: 0,
      explosionEffect: null,
      winner: null,
      gameOverMessage: null,
      rematchRequested: false,
      rematchRequestSent: false,
      messages: [],
      isSfxMuted: get().isSfxMuted,
      isMusicMuted: get().isMusicMuted,
      musicVolume: get().musicVolume,
      sfxVolume: get().sfxVolume,
      abilitySfxGains: get().abilitySfxGains,
    }),
}));
