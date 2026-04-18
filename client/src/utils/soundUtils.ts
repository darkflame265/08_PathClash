// Centralized SFX registry for PathClash ability sounds.
// Keep file paths, gain values, and preload behavior in one place so
// new skills can be added without scattering audio metadata across the codebase.

import { Howl, Howler } from "howler";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

type AbilitySfxId =
  | "guard"
  | "shield_block"
  | "atomic_fission"
  | "charge"
  | "quantum"
  | "ember_blast"
  | "electric_blitz"
  | "cosmic_bigbang"
  | "healing"
  | "inferno_field"
  | "phase_shift"
  | "arc_reactor_field"
  | "void_cloak"
  | "chronos_tick_tock"
  | "chronos_rewind_loop"
  | "gold_overdrive_loop";

type UiSfxId = "lobby_click" | "victory_result" | "defeat_result";

type AbilitySfxConfig = {
  path: string;
  gain: number;
  loop?: boolean;
  loopWindowStart?: number;
  loopWindowEndOffset?: number;
};

const ABILITY_SFX: Record<AbilitySfxId, AbilitySfxConfig> = {
  guard: {
    path: "/sfx/ability/guard.mp3",
    gain: 0.55,
  },
  shield_block: {
    path: "/sfx/ability/shield_block.mp3",
    gain: 0.6,
  },
  atomic_fission: {
    path: "/sfx/ability/atomic_fission.wav",
    gain: 0.6,
  },
  charge: {
    path: "/sfx/ability/charge.mp3",
    gain: 0.4,
  },
  quantum: {
    path: "/sfx/ability/quantum.mp3",
    gain: 0.65,
  },
  ember_blast: {
    path: "/sfx/ability/ember_blast.mp3",
    gain: 0.3,
  },
  electric_blitz: {
    path: "/sfx/ability/electric_blitz.mp3",
    gain: 0.85,
  },
  cosmic_bigbang: {
    path: "/sfx/ability/cosmic_bigbang.mp3",
    gain: 0.9,
  },
  healing: {
    path: "/sfx/ability/healing_skill.mp3",
    gain: 0.65,
  },
  inferno_field: {
    path: "/sfx/ability/inferno_field.mp3",
    gain: 0.6,
  },
  phase_shift: {
    path: "/sfx/ability/phase_shift.mp3",
    gain: 0.6,
  },
  arc_reactor_field: {
    path: "/sfx/ability/arc_reactor_field.mp3",
    gain: 0.6,
  },
  void_cloak: {
    path: "/sfx/ability/void_cloak.mp3",
    gain: 0.6,
  },
  chronos_tick_tock: {
    path: "/sfx/ability/chronos_tick_tock.mp3",
    gain: 0.72,
  },
  chronos_rewind_loop: {
    path: "/sfx/ability/chronos_rewind_loop.mp3",
    gain: 0.62,
    loop: true,
    loopWindowStart: 0.48,
    loopWindowEndOffset: 0.05,
  },
  gold_overdrive_loop: {
    path: "/sfx/ability/gold_overdrive_loop.mp3",
    gain: 0.4,
    loop: true,
  },
};

const UI_SFX: Record<UiSfxId, AbilitySfxConfig> = {
  lobby_click: {
    path: "/sfx/ui/lobby_click.mp3",
    gain: 0.55,
  },
  victory_result: {
    path: "/sfx/ui/victory_result.mp3",
    gain: 0.75,
  },
  defeat_result: {
    path: "/sfx/ui/defeat_result.mp3",
    gain: 0.75,
  },
};

export type MatchResultAudioKind = "victory" | "defeat";
export type BgmTrackId = "lobby" | "ingame" | "victory" | "defeat";

const MATCH_RESULT_AUDIO_EVENT = "pathclash:match-result-audio";
const STOP_MATCH_RESULT_AUDIO_EVENT = "pathclash:stop-match-result-audio";
const BGM_FADE_IN_MS = 280;

const BGM_CONFIG: Record<BgmTrackId, { src: string; gain: number }> = {
  lobby: {
    src: "/music/Lobby_bgm_3.ogg",
    gain: 1,
  },
  ingame: {
    src: "/music/InGame_bgm_3.ogg",
    gain: 1,
  },
  victory: {
    src: "/music/victory_bgm.mp3",
    gain: 1,
  },
  defeat: {
    src: "/music/defeat_bgm.mp3",
    gain: 1,
  },
};

const audioCache: Partial<Record<AbilitySfxId, HTMLAudioElement>> = {};
const uiAudioCache: Partial<Record<UiSfxId, HTMLAudioElement>> = {};
const abilityHowlCache: Partial<Record<AbilitySfxId, Howl>> = {};
const uiHowlCache: Partial<Record<UiSfxId, Howl>> = {};
const bgmCache: Partial<
  Record<BgmTrackId, { howl: Howl; soundId: number | null }>
> = {};
const segmentedLoopHandlers = new WeakMap<
  HTMLAudioElement,
  { timeupdate: () => void; ended: () => void }
>();
let activeBgmTrackId: BgmTrackId | null = null;
let goldOverdriveSoundId: number | null = null;
let bgmVolume = 0.15;
let bgmMuted = false;

Howler.autoUnlock = true;
Howler.autoSuspend = false;

export function resumeAudioContext(): void {
  try {
    const ctx = Howler.ctx as AudioContext | undefined;
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
  } catch {
    // AudioContext not available
  }
}

function getBgm(trackId: BgmTrackId): {
  howl: Howl;
  soundId: number | null;
} {
  if (!bgmCache[trackId]) {
    const config = BGM_CONFIG[trackId];
    bgmCache[trackId] = {
      howl: new Howl({
        src: [config.src],
        loop: true,
        preload: true,
        html5: false,
        volume: bgmVolume * config.gain,
      }),
      soundId: null,
    };
  }

  return bgmCache[trackId];
}

function setBgmTrackVolume(trackId: BgmTrackId): void {
  const bgm = bgmCache[trackId];
  if (!bgm) return;
  bgm.howl.volume(
    Math.max(0, Math.min(1, bgmVolume * BGM_CONFIG[trackId].gain)),
  );
}

function getBgmTrackVolume(trackId: BgmTrackId): number {
  return Math.max(0, Math.min(1, bgmVolume * BGM_CONFIG[trackId].gain));
}

export function setBgmVolume(volume: number): void {
  bgmVolume = Math.max(0, Math.min(1, volume));
  (Object.keys(BGM_CONFIG) as BgmTrackId[]).forEach(setBgmTrackVolume);
}

export function setBgmMuted(muted: boolean): void {
  bgmMuted = muted;
  if (muted) {
    pauseAllBgm();
  }
}

export function playBgmTrack(trackId: BgmTrackId): void {
  if (bgmMuted) {
    pauseAllBgm();
    return;
  }

  // Always stop every other track first so only one BGM plays at a time.
  (Object.keys(BGM_CONFIG) as BgmTrackId[]).forEach((otherTrackId) => {
    if (otherTrackId === trackId) return;
    const other = bgmCache[otherTrackId];
    if (!other) return;
    other.howl.stop();
    other.soundId = null;
  });

  const target = getBgm(trackId);
  setBgmTrackVolume(trackId);

  if (target.soundId !== null && target.howl.playing(target.soundId)) {
    activeBgmTrackId = trackId;
    return;
  }

  if (target.soundId !== null) {
    target.howl.stop(target.soundId);
  }
  const targetVolume = getBgmTrackVolume(trackId);
  target.howl.volume(0);
  target.soundId = target.howl.play();
  target.howl.fade(0, targetVolume, BGM_FADE_IN_MS, target.soundId);
  activeBgmTrackId = trackId;
}

export function pauseAllBgm(): void {
  (Object.keys(BGM_CONFIG) as BgmTrackId[]).forEach((trackId) => {
    const bgm = bgmCache[trackId];
    if (!bgm || bgm.soundId === null || !bgm.howl.playing(bgm.soundId)) return;
    bgm.howl.pause(bgm.soundId);
  });
}

export function stopAllBgm(): void {
  (Object.keys(BGM_CONFIG) as BgmTrackId[]).forEach((trackId) => {
    const bgm = bgmCache[trackId];
    if (!bgm) return;
    bgm.howl.stop();
    bgm.soundId = null;
  });
  activeBgmTrackId = null;
}

export function unloadBgm(): void {
  stopAllBgm();
  (Object.keys(BGM_CONFIG) as BgmTrackId[]).forEach((trackId) => {
    bgmCache[trackId]?.howl.unload();
    delete bgmCache[trackId];
  });
}

function getAbilityAudio(id: AbilitySfxId): HTMLAudioElement | null {
  try {
    if (!audioCache[id]) {
      const config = ABILITY_SFX[id];
      const audio = new Audio(config.path);
      audio.preload = "auto";
      audio.loop = !!config.loop;
      audioCache[id] = audio;
    }
    return audioCache[id] ?? null;
  } catch {
    return null;
  }
}

function shouldUseHtmlAbilityAudio(id: AbilitySfxId): boolean {
  return id === "chronos_rewind_loop";
}

function getAbilityHowl(id: AbilitySfxId): Howl | null {
  try {
    if (!abilityHowlCache[id]) {
      const config = ABILITY_SFX[id];
      abilityHowlCache[id] = new Howl({
        src: [config.path],
        loop: !!config.loop,
        preload: true,
        html5: false,
        volume: Math.max(0, Math.min(1, config.gain)),
      });
    }
    return abilityHowlCache[id] ?? null;
  } catch {
    return null;
  }
}

function detachSegmentedLoop(audio: HTMLAudioElement): void {
  const handlers = segmentedLoopHandlers.get(audio);
  if (!handlers) return;
  audio.removeEventListener("timeupdate", handlers.timeupdate);
  audio.removeEventListener("ended", handlers.ended);
  segmentedLoopHandlers.delete(audio);
}

function attachSegmentedLoop(
  audio: HTMLAudioElement,
  config: AbilitySfxConfig,
): void {
  detachSegmentedLoop(audio);
  if (
    typeof config.loopWindowStart !== "number" ||
    typeof config.loopWindowEndOffset !== "number"
  ) {
    return;
  }
  const loopWindowStart = config.loopWindowStart;
  const loopWindowEndOffset = config.loopWindowEndOffset;

  const timeupdate = () => {
    const duration = audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const loopEnd = Math.max(
      loopWindowStart + 0.05,
      duration - loopWindowEndOffset,
    );
    if (audio.currentTime >= loopEnd) {
      audio.currentTime = loopWindowStart;
      void audio.play().catch(() => {
        // Ignore playback restart failures.
      });
    }
  };

  const ended = () => {
    audio.currentTime = loopWindowStart;
    void audio.play().catch(() => {
      // Ignore playback restart failures.
    });
  };

  audio.addEventListener("timeupdate", timeupdate);
  audio.addEventListener("ended", ended);
  segmentedLoopHandlers.set(audio, { timeupdate, ended });
}

function playAbilitySfx(id: AbilitySfxId, volume = 0.55): void {
  try {
    const normalizedVolume = Math.max(
      0,
      Math.min(1, volume * ABILITY_SFX[id].gain),
    );
    if (!shouldUseHtmlAbilityAudio(id)) {
      const howl = getAbilityHowl(id);
      if (!howl) return;
      const soundId = howl.play();
      howl.volume(normalizedVolume, soundId);
      return;
    }

    const baseAudio = getAbilityAudio(id);
    if (!baseAudio) return;
    const audio = baseAudio.cloneNode(true) as HTMLAudioElement;
    audio.loop = false;
    audio.volume = normalizedVolume;
    void audio.play().catch(() => {
      // Playback can fail if browser blocks audio; ignore.
    });
  } catch {
    // Audio element not available
  }
}

function getUiAudio(id: UiSfxId): HTMLAudioElement | null {
  try {
    if (!uiAudioCache[id]) {
      const config = UI_SFX[id];
      const audio = new Audio(config.path);
      audio.preload = "auto";
      audio.loop = !!config.loop;
      uiAudioCache[id] = audio;
    }
    return uiAudioCache[id] ?? null;
  } catch {
    return null;
  }
}

function getUiHowl(id: UiSfxId): Howl | null {
  try {
    if (!uiHowlCache[id]) {
      const config = UI_SFX[id];
      uiHowlCache[id] = new Howl({
        src: [config.path],
        loop: false,
        preload: true,
        html5: false,
        volume: Math.max(0, Math.min(1, config.gain)),
      });
    }
    return uiHowlCache[id] ?? null;
  } catch {
    return null;
  }
}

function playUiSfx(id: UiSfxId, volume = 0.55): void {
  try {
    const howl = getUiHowl(id);
    if (howl) {
      const soundId = howl.play();
      howl.volume(Math.max(0, Math.min(1, volume * UI_SFX[id].gain)), soundId);
      return;
    }

    const baseAudio = getUiAudio(id);
    if (!baseAudio) return;
    const audio = baseAudio.cloneNode(true) as HTMLAudioElement;
    audio.loop = false;
    audio.volume = Math.max(0, Math.min(1, volume * UI_SFX[id].gain));
    void audio.play().catch(() => {
      // Playback can fail if browser blocks audio; ignore.
    });
  } catch {
    // Audio element not available
  }
}

export function preloadAbilitySfxAssets(): void {
  for (const id of Object.keys(ABILITY_SFX) as AbilitySfxId[]) {
    if (!shouldUseHtmlAbilityAudio(id)) {
      getAbilityHowl(id);
      continue;
    }

    const audio = getAbilityAudio(id);
    if (!audio) continue;
    try {
      audio.load();
    } catch {
      // Ignore browsers that reject manual load hints.
    }
  }

  for (const id of Object.keys(UI_SFX) as UiSfxId[]) {
    getUiHowl(id);
  }
}

export function playLobbyClick(volume = 0.55): void {
  playUiSfx("lobby_click", volume);
}

export function playMatchResultSfx(
  kind: MatchResultAudioKind,
  volume = 0.55,
): void {
  playUiSfx(kind === "victory" ? "victory_result" : "defeat_result", volume);
}

export function startMatchResultBgm(kind: MatchResultAudioKind): void {
  window.dispatchEvent(
    new CustomEvent(MATCH_RESULT_AUDIO_EVENT, {
      detail: { kind },
    }),
  );
}

export function stopMatchResultBgm(): void {
  window.dispatchEvent(new CustomEvent(STOP_MATCH_RESULT_AUDIO_EVENT));
}

export function getMatchResultAudioEvents() {
  return {
    start: MATCH_RESULT_AUDIO_EVENT,
    stop: STOP_MATCH_RESULT_AUDIO_EVENT,
  };
}

export function playHit(volume = 0.55): void {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);
    const normalized = Math.max(0, Math.min(1, volume));
    gain.gain.setValueAtTime(0.4 * normalized, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // AudioContext not available
  }
}

export function playGuard(volume = 0.55): void {
  playAbilitySfx("guard", volume);
}

export function playShieldBlock(volume = 0.55): void {
  playAbilitySfx("shield_block", volume);
}

export function playAtomicFission(volume = 0.55): void {
  playAbilitySfx("atomic_fission", volume);
}

export function playCharge(volume = 0.55): void {
  playAbilitySfx("charge", volume);
}

export function playQuantum(volume = 0.55): void {
  playAbilitySfx("quantum", volume);
}

export function playEmber(volume = 0.55): void {
  playAbilitySfx("ember_blast", volume);
}

export function playBlitz(volume = 0.55): void {
  playAbilitySfx("electric_blitz", volume);
}

export function playBigBang(volume = 0.55): void {
  playAbilitySfx("cosmic_bigbang", volume);
}

export function playHealing(volume = 0.55): void {
  playAbilitySfx("healing", volume);
}

export function playInferno(volume = 0.55): void {
  playAbilitySfx("inferno_field", volume);
}

export function playPhaseShift(volume = 0.55): void {
  playAbilitySfx("phase_shift", volume);
}

export function playArcReactor(volume = 0.55): void {
  playAbilitySfx("arc_reactor_field", volume);
}

export function playVoidCloak(volume = 0.55): void {
  playAbilitySfx("void_cloak", volume);
}

export function playChronosTickTock(volume = 0.55): void {
  playAbilitySfx("chronos_tick_tock", volume);
}

export function startChronosRewindLoop(volume = 0.55): void {
  try {
    const audio = getAbilityAudio("chronos_rewind_loop");
    if (!audio) return;
    const config = ABILITY_SFX.chronos_rewind_loop;
    audio.loop = false;
    attachSegmentedLoop(audio, config);
    audio.volume = Math.max(0, Math.min(1, volume * config.gain));
    if (audio.paused) {
      audio.currentTime = 0;
      void audio.play().catch(() => {
        // Playback can fail if browser blocks audio; ignore.
      });
    }
  } catch {
    // Audio element not available
  }
}

export function stopChronosRewindLoop(): void {
  try {
    const audio = audioCache.chronos_rewind_loop;
    if (!audio) return;
    detachSegmentedLoop(audio);
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // Audio element not available
  }
}

export function startOverdriveLoop(volume = 0.55): void {
  try {
    const howl = getAbilityHowl("gold_overdrive_loop");
    if (!howl) return;
    const normalizedVolume = Math.max(
      0,
      Math.min(1, volume * ABILITY_SFX.gold_overdrive_loop.gain),
    );
    if (
      goldOverdriveSoundId === null ||
      !howl.playing(goldOverdriveSoundId)
    ) {
      goldOverdriveSoundId = howl.play();
    }
    howl.volume(normalizedVolume, goldOverdriveSoundId);
  } catch {
    // Audio engine not available
  }
}

export function stopOverdriveLoop(): void {
  try {
    const howl = abilityHowlCache.gold_overdrive_loop;
    if (!howl || goldOverdriveSoundId === null) return;
    howl.stop(goldOverdriveSoundId);
    goldOverdriveSoundId = null;
  } catch {
    // Audio engine not available
  }
}
