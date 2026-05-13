// Centralized SFX registry for PathClash ability sounds.
// Keep file paths, gain values, and preload behavior in one place so
// new skills can be added without scattering audio metadata across the codebase.

import { Howl, Howler } from "howler";
import {
  DEFAULT_ABILITY_SFX_GAINS,
  normalizeAbilitySfxGains,
  type AbilitySfxGainId,
} from "../settings/abilitySfx";

let audioCtx: AudioContext | null = null;
let masterCompressor: DynamicsCompressorNode | null = null;

function getCtx(): AudioContext {
  const howlerCtx = Howler.ctx;
  if (howlerCtx) return howlerCtx;
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function ensureMasterCompressor(): void {
  if (masterCompressor) return;
  const ctx = Howler.ctx;
  const masterGain = Howler.masterGain;
  if (!ctx || !masterGain) return;
  try {
    const compressor = ctx.createDynamicsCompressor();
    // threshold=0: only activates when combined signals actually exceed 1.0 (true clipping).
    // Prevents pumping from BGM+SFX coexistence since typical combined levels stay below 1.0.
    compressor.threshold.value = 0;
    compressor.knee.value = 0;
    compressor.ratio.value = 20;
    compressor.attack.value = 0.001;
    compressor.release.value = 0.1;
    masterGain.disconnect();
    masterGain.connect(compressor);
    compressor.connect(ctx.destination);
    masterCompressor = compressor;
  } catch {
    // DynamicsCompressor not supported
  }
}

type AbilitySfxId = AbilitySfxGainId;

type UiSfxId =
  | "lobby_click"
  | "victory_result"
  | "defeat_result"
  | "loading"
  | "ingame_player_banner";

type AbilitySfxConfig = {
  path: string;
  gain: number;
  loop?: boolean;
  loopWindowStart?: number;
  loopWindowEndOffset?: number;
};

const ABILITY_SFX_OUTPUT_GAIN = 1;
const UI_SFX_OUTPUT_GAIN = 1;
const HIT_SFX_OUTPUT_GAIN = 1;
const BERSERK_HIT_SFX = {
  path: "/sfx/ability/berserk_hit.mp3",
  gain: 0.9,
};

const ABILITY_SFX: Record<AbilitySfxId, AbilitySfxConfig> = {
  guard: {
    path: "/sfx/ability/guard.mp3",
    gain: 0.9,
  },
  shield_block: {
    path: "/sfx/ability/shield_block.mp3",
    gain: 0.9,
  },
  atomic_fission: {
    path: "/sfx/ability/atomic_fission.wav",
    gain: 0.9,
  },
  charge: {
    path: "/sfx/ability/charge.mp3",
    gain: 0.9,
  },
  quantum: {
    path: "/sfx/ability/quantum.mp3",
    gain: 0.9,
  },
  ember_blast: {
    path: "/sfx/ability/ember_blast.mp3",
    gain: 0.9,
  },
  electric_blitz: {
    path: "/sfx/ability/electric_blitz.mp3",
    gain: 0.9,
  },
  sun_chariot: {
    path: "/sfx/ability/sun_chariot.m4a",
    gain: 0.9,
  },
  cosmic_bigbang: {
    path: "/sfx/ability/cosmic_bigbang.mp3",
    gain: 0.9,
  },
  healing: {
    path: "/sfx/ability/healing_skill.mp3",
    gain: 0.9,
  },
  inferno_field: {
    path: "/sfx/ability/inferno_field.mp3",
    gain: 0.9,
  },
  phase_shift: {
    path: "/sfx/ability/phase_shift.mp3",
    gain: 0.9,
  },
  arc_reactor_field: {
    path: "/sfx/ability/arc_reactor_field.mp3",
    gain: 0.9,
  },
  void_cloak: {
    path: "/sfx/ability/void_cloak.mp3",
    gain: 0.9,
  },
  chronos_tick_tock: {
    path: "/sfx/ability/chronos_tick_tock.mp3",
    gain: 0.9,
  },
  chronos_rewind_loop: {
    path: "/sfx/ability/chronos_rewind_loop.mp3",
    gain: 0.9,
    loop: true,
    loopWindowStart: 0.48,
    loopWindowEndOffset: 0.05,
  },
  gold_overdrive_loop: {
    path: "/sfx/ability/gold_overdrive_loop.mp3",
    gain: 0.45,
    loop: true,
  },
  magic_mine: {
    path: "/sfx/ability/magic_mine.mp3",
    gain: 0.9,
  },
  root_wall: {
    path: "/sfx/ability/root_wall.mp3",
    gain: 0.9,
  },
  ice_field: {
    path: "/sfx/ability/ice_field.mp3",
    gain: 0.9,
  },
  berserk_on: {
    path: "/sfx/ability/berserk_on.wav",
    gain: 0.9,
  },
};

const UI_SFX: Record<UiSfxId, AbilitySfxConfig> = {
  lobby_click: {
    path: "/sfx/ui/button_click.wav",
    gain: 0.9,
  },
  victory_result: {
    path: "/sfx/ui/victory_result.mp3",
    gain: 0.9,
  },
  defeat_result: {
    path: "/sfx/ui/defeat_result.mp3",
    gain: 0.9,
  },
  loading: {
    path: "/sfx/ui/loading.mp3",
    gain: 0.9,
  },
  ingame_player_banner: {
    path: "/sfx/ui/ingame_player_banner.mp3",
    gain: 0.7,
  },
};

export type MatchResultAudioKind = "victory" | "defeat";
export type BgmTrackId = "lobby" | "ingame" | "victory" | "defeat";

const MATCH_RESULT_AUDIO_EVENT = "pathclash:match-result-audio";
const STOP_MATCH_RESULT_AUDIO_EVENT = "pathclash:stop-match-result-audio";

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
const activeUiAudioCache: Partial<Record<UiSfxId, HTMLAudioElement>> = {};
const uiHowlCache: Partial<Record<UiSfxId, Howl>> = {};
const activeUiHowlSoundIds: Partial<Record<UiSfxId, number>> = {};
let berserkHitAudio: HTMLAudioElement | null = null;
const abilityHowlCache: Partial<Record<AbilitySfxId, Howl>> = {};
const bgmCache: Partial<Record<BgmTrackId, { audio: HTMLAudioElement }>> = {};
const segmentedLoopHandlers = new WeakMap<
  HTMLAudioElement,
  { timeupdate: () => void; ended: () => void }
>();
let goldOverdriveSoundId: number | null = null;
let bgmVolume = 0.15;
let bgmMuted = false;
let lastPathStepSfxAt = 0;
let abilitySfxGains = DEFAULT_ABILITY_SFX_GAINS;
let chronosPreviewTimeout: number | null = null;
let overdrivePreviewTimeout: number | null = null;
let abilitySfxPreloadStarted = false;

Howler.autoUnlock = true;
Howler.autoSuspend = false;

export function resumeAudioContext(): void {
  try {
    const ctx = Howler.ctx;
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
    ensureMasterCompressor();
    preloadUiSfxAssets();
  } catch {
    // AudioContext not available
  }
}

function getBgm(trackId: BgmTrackId): { audio: HTMLAudioElement } | null {
  if (!bgmCache[trackId]) {
    const config = BGM_CONFIG[trackId];
    const audio = new Audio(config.src);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = getBgmTrackVolume(trackId);
    audio.setAttribute("playsinline", "true");
    bgmCache[trackId] = {
      audio,
    };
  }

  return bgmCache[trackId] ?? null;
}

function getSoundGainNode(howl: Howl, soundId: number): GainNode | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sounds = (howl as any)._sounds as
      | Array<{ _id: number; _node?: AudioNode }>
      | undefined;
    const sound = sounds?.find((s) => s._id === soundId);
    const node = sound?._node;
    if (node && "gain" in node) return node as GainNode;
    return null;
  } catch {
    return null;
  }
}

function setBgmTrackVolume(trackId: BgmTrackId): void {
  const bgm = bgmCache[trackId];
  if (!bgm) return;
  bgm.audio.volume = getBgmTrackVolume(trackId);
}

function getBgmTrackVolume(trackId: BgmTrackId): number {
  return Math.max(0, Math.min(1, bgmVolume * BGM_CONFIG[trackId].gain));
}

function getAbilitySfxVolume(id: AbilitySfxId, volume: number): number {
  return Math.max(
    0,
    Math.min(
      1,
      volume *
        ABILITY_SFX[id].gain *
        ABILITY_SFX_OUTPUT_GAIN *
        abilitySfxGains[id],
    ),
  );
}

export function setAbilitySfxGains(
  gains: Partial<Record<AbilitySfxGainId, number>>,
): void {
  abilitySfxGains = normalizeAbilitySfxGains(gains);
}

export function setBgmVolume(volume: number): void {
  const newVolume = Math.max(0, Math.min(1, volume));
  if (newVolume === bgmVolume) return;
  bgmVolume = newVolume;
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

  (Object.keys(BGM_CONFIG) as BgmTrackId[]).forEach((otherTrackId) => {
    if (otherTrackId === trackId) return;
    const other = bgmCache[otherTrackId];
    if (!other) return;
    other.audio.pause();
    other.audio.currentTime = 0;
  });

  const target = getBgm(trackId);
  if (!target) return;
  target.audio.volume = getBgmTrackVolume(trackId);

  if (!target.audio.paused) {
    return;
  }

  void target.audio.play().catch(() => {
    // Mobile WebView may require the first user gesture before BGM can start.
  });
}

export function pauseAllBgm(): void {
  (Object.keys(BGM_CONFIG) as BgmTrackId[]).forEach((trackId) => {
    const bgm = bgmCache[trackId];
    if (!bgm) return;
    bgm.audio.pause();
  });
}

export function stopAllBgm(): void {
  (Object.keys(BGM_CONFIG) as BgmTrackId[]).forEach((trackId) => {
    const bgm = bgmCache[trackId];
    if (!bgm) return;
    bgm.audio.pause();
    bgm.audio.currentTime = 0;
  });
}

export function unloadBgm(): void {
  stopAllBgm();
  (Object.keys(BGM_CONFIG) as BgmTrackId[]).forEach((trackId) => {
    const bgm = bgmCache[trackId];
    if (bgm) {
      bgm.audio.removeAttribute("src");
      bgm.audio.load();
    }
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
      ensureMasterCompressor();
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
    const normalizedVolume = getAbilitySfxVolume(id, volume);
    if (!shouldUseHtmlAbilityAudio(id)) {
      const howl = getAbilityHowl(id);
      if (!howl) return;
      // Howler exposes state/load at runtime, but the bundled type used here is narrower.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const abilityHowl = howl as any;
      if (abilityHowl.state?.() !== "loaded") {
        howl.once("load", () => playAbilitySfx(id, volume));
        abilityHowl.load?.();
        return;
      }
      // Start at 0 so Howler schedules setValueAtTime(0) on the new sound,
      // then ramp up on that specific sound's gain node to avoid click noise.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (howl as any)._volume = 0;
      const sfxSoundId = howl.play();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (howl as any)._volume = normalizedVolume;
      const tryAbilitySfxRamp = (attempt: number) => {
        const sfxCtx = Howler.ctx;
        const sfxGain = sfxCtx ? getSoundGainNode(howl, sfxSoundId) : null;
        if (sfxGain && sfxCtx) {
          const t = sfxCtx.currentTime;
          sfxGain.gain.setValueAtTime(0, t);
          sfxGain.gain.linearRampToValueAtTime(normalizedVolume, t + 0.005);
        } else if (attempt < 5) {
          requestAnimationFrame(() => tryAbilitySfxRamp(attempt + 1));
        } else {
          howl.volume(normalizedVolume, sfxSoundId);
        }
      };
      tryAbilitySfxRamp(0);
      return;
    }

    const baseAudio = getAbilityAudio(id);
    if (!baseAudio) return;
    if (baseAudio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      const playAfterLoad = () => playAbilitySfx(id, volume);
      baseAudio.addEventListener("loadeddata", playAfterLoad, { once: true });
      baseAudio.load();
      return;
    }
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
        loop: !!config.loop,
        preload: true,
        html5: false,
        volume: Math.max(0, Math.min(1, config.gain)),
      });
      ensureMasterCompressor();
    }
    return uiHowlCache[id] ?? null;
  } catch {
    return null;
  }
}

function playUiSfx(
  id: UiSfxId,
  volume = 0.55,
  options?: { stopPrevious?: boolean },
): void {
  try {
    resumeAudioContext();
    const howl = getUiHowl(id);
    if (howl) {
      if (options?.stopPrevious) {
        const activeSoundId = activeUiHowlSoundIds[id];
        if (activeSoundId !== undefined) {
          howl.stop(activeSoundId);
          activeUiHowlSoundIds[id] = undefined;
        }
      }

      const normalizedVolume = Math.max(
        0,
        Math.min(1, volume * UI_SFX[id].gain * UI_SFX_OUTPUT_GAIN),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uiHowl = howl as any;
      if (uiHowl.state?.() !== "loaded") {
        howl.once("load", () => playUiSfx(id, volume, options));
        uiHowl.load?.();
        return;
      }
      const soundId = howl.play();
      howl.volume(normalizedVolume, soundId);
      activeUiHowlSoundIds[id] = soundId;
      howl.once("end", () => {
        if (activeUiHowlSoundIds[id] === soundId) {
          activeUiHowlSoundIds[id] = undefined;
        }
      }, soundId);
      return;
    }

    const baseAudio = getUiAudio(id);
    if (!baseAudio) return;
    if (options?.stopPrevious) {
      activeUiAudioCache[id]?.pause();
      activeUiAudioCache[id] = undefined;
    }
    const audio = baseAudio.cloneNode(true) as HTMLAudioElement;
    audio.loop = false;
    audio.volume = Math.max(
      0,
      Math.min(1, volume * UI_SFX[id].gain * UI_SFX_OUTPUT_GAIN),
    );
    activeUiAudioCache[id] = audio;
    audio.addEventListener(
      "ended",
      () => {
        if (activeUiAudioCache[id] === audio) {
          activeUiAudioCache[id] = undefined;
        }
      },
      { once: true },
    );
    void audio.play().catch(() => {
      // Playback can fail if browser blocks audio; ignore.
    });
  } catch {
    // Audio element not available
  }
}

function preloadUiSfxAssets(): void {
  for (const id of Object.keys(UI_SFX) as UiSfxId[]) {
    getUiHowl(id);
  }
}

export function preloadAbilitySfxAssets(): void {
  if (abilitySfxPreloadStarted) return;
  abilitySfxPreloadStarted = true;
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

  const berserkHit = getBerserkHitAudio();
  try {
    berserkHit?.load();
  } catch {
    // Ignore browsers that reject manual load hints.
  }
}

export function playLobbyClick(volume = 0.55): void {
  playUiSfx("lobby_click", volume);
}

export function playPathStepClick(volume = 0.55): void {
  const now = performance.now();
  if (now - lastPathStepSfxAt < 45) return;
  lastPathStepSfxAt = now;
  playUiSfx("lobby_click", volume, { stopPrevious: true });
}

export function playMatchResultSfx(
  kind: MatchResultAudioKind,
  volume = 0.55,
): void {
  playUiSfx(kind === "victory" ? "victory_result" : "defeat_result", volume);
}

export function playLoadingSfx(volume = 0.55): void {
  playUiSfx("loading", volume, { stopPrevious: true });
}

export function playIngamePlayerBannerSfx(volume = 0.55): void {
  playUiSfx("ingame_player_banner", volume, { stopPrevious: true });
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
    gain.gain.setValueAtTime(
      Math.min(1, 0.4 * normalized * HIT_SFX_OUTPUT_GAIN),
      ctx.currentTime,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // AudioContext not available
  }
}

function getBerserkHitAudio(): HTMLAudioElement | null {
  try {
    if (!berserkHitAudio) {
      const audio = new Audio(BERSERK_HIT_SFX.path);
      audio.preload = "auto";
      berserkHitAudio = audio;
    }
    return berserkHitAudio;
  } catch {
    return null;
  }
}

export function playBerserkHit(volume = 0.55): void {
  try {
    const baseAudio = getBerserkHitAudio();
    if (!baseAudio) return;
    if (baseAudio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      const playAfterLoad = () => playBerserkHit(volume);
      baseAudio.addEventListener("loadeddata", playAfterLoad, { once: true });
      baseAudio.load();
      return;
    }
    const audio = baseAudio.cloneNode(true) as HTMLAudioElement;
    audio.loop = false;
    audio.volume = Math.max(
      0,
      Math.min(1, volume * BERSERK_HIT_SFX.gain * HIT_SFX_OUTPUT_GAIN),
    );
    void audio.play().catch(() => {
      // Playback can fail if browser blocks audio; ignore.
    });
  } catch {
    // Audio element not available
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

export function playMagicMine(volume = 0.55): void {
  playAbilitySfx("magic_mine", volume);
}

export function playRootWall(volume = 0.55): void {
  playAbilitySfx("root_wall", volume);
}

export function playIceField(volume = 0.55): void {
  playAbilitySfx("ice_field", volume);
}

export function playBerserkOn(volume = 0.55): void {
  playAbilitySfx("berserk_on", volume);
}

export function playEmber(volume = 0.55): void {
  playAbilitySfx("ember_blast", volume);
}

export function playBlitz(volume = 0.55): void {
  playAbilitySfx("electric_blitz", volume);
}

export function playSunChariot(volume = 0.55): void {
  playAbilitySfx("sun_chariot", volume);
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
    audio.volume = getAbilitySfxVolume("chronos_rewind_loop", volume);
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

function scheduleChronosPreviewStop(): void {
  if (chronosPreviewTimeout !== null) {
    window.clearTimeout(chronosPreviewTimeout);
  }
  chronosPreviewTimeout = window.setTimeout(() => {
    stopChronosRewindLoop();
    chronosPreviewTimeout = null;
  }, 1400);
}

export function startOverdriveLoop(volume = 0.55): void {
  try {
    const howl = getAbilityHowl("gold_overdrive_loop");
    if (!howl) return;
    const normalizedVolume = getAbilitySfxVolume("gold_overdrive_loop", volume);
    if (goldOverdriveSoundId === null || !howl.playing(goldOverdriveSoundId)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (howl as any)._volume = 0;
      goldOverdriveSoundId = howl.play();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (howl as any)._volume = normalizedVolume;
      const ctx = Howler.ctx;
      const gain = ctx ? getSoundGainNode(howl, goldOverdriveSoundId) : null;
      if (gain && ctx) {
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(
          normalizedVolume,
          ctx.currentTime + 0.02,
        );
      }
    } else {
      // Already playing — update volume smoothly via setTargetAtTime.
      const ctx = Howler.ctx;
      const gain = ctx ? getSoundGainNode(howl, goldOverdriveSoundId) : null;
      if (gain && ctx) {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setTargetAtTime(normalizedVolume, ctx.currentTime, 0.015);
      } else {
        howl.volume(normalizedVolume, goldOverdriveSoundId);
      }
    }
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

export function prepareSfxPreviewAudio(): void {
  resumeAudioContext();
  preloadAbilitySfxAssets();
}

function scheduleOverdrivePreviewStop(): void {
  if (overdrivePreviewTimeout !== null) {
    window.clearTimeout(overdrivePreviewTimeout);
  }
  overdrivePreviewTimeout = window.setTimeout(() => {
    stopOverdriveLoop();
    overdrivePreviewTimeout = null;
  }, 1400);
}

export function previewAbilitySfxSample(
  gainId: AbilitySfxGainId,
  volume = 0.55,
): void {
  resumeAudioContext();
  switch (gainId) {
    case "guard":
      playGuard(volume);
      break;
    case "shield_block":
      playShieldBlock(volume);
      break;
    case "atomic_fission":
      playAtomicFission(volume);
      break;
    case "charge":
      playCharge(volume);
      break;
    case "quantum":
      playQuantum(volume);
      break;
    case "ember_blast":
      playEmber(volume);
      break;
    case "electric_blitz":
      playBlitz(volume);
      break;
    case "sun_chariot":
      playSunChariot(volume);
      break;
    case "cosmic_bigbang":
      playBigBang(volume);
      break;
    case "healing":
      playHealing(volume);
      break;
    case "inferno_field":
      playInferno(volume);
      break;
    case "phase_shift":
      playPhaseShift(volume);
      break;
    case "arc_reactor_field":
      playArcReactor(volume);
      break;
    case "void_cloak":
      playVoidCloak(volume);
      break;
    case "chronos_tick_tock":
      playChronosTickTock(volume);
      break;
    case "chronos_rewind_loop":
      startChronosRewindLoop(volume);
      scheduleChronosPreviewStop();
      break;
    case "gold_overdrive_loop":
      startOverdriveLoop(volume);
      scheduleOverdrivePreviewStop();
      break;
    case "magic_mine":
      playMagicMine(volume);
      break;
    case "root_wall":
      playRootWall(volume);
      break;
    case "ice_field":
      playIceField(volume);
      break;
    case "berserk_on":
      playBerserkOn(volume);
      break;
  }
}
