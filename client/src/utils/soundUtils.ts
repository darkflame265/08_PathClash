// Centralized SFX registry for PathClash ability sounds.
// Keep file paths, gain values, and preload behavior in one place so
// new skills can be added without scattering audio metadata across the codebase.

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

type AbilitySfxId =
  | "guard"
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
  | "gold_overdrive_loop";

type AbilitySfxConfig = {
  path: string;
  gain: number;
  loop?: boolean;
};

const ABILITY_SFX: Record<AbilitySfxId, AbilitySfxConfig> = {
  guard: {
    path: "/sfx/ability/guard.mp3",
    gain: 0.55,
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
    gain: 0.6,
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
  gold_overdrive_loop: {
    path: "/sfx/ability/gold_overdrive_loop.mp3",
    gain: 0.4,
    loop: true,
  },
};

const audioCache: Partial<Record<AbilitySfxId, HTMLAudioElement>> = {};

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

function playAbilitySfx(id: AbilitySfxId, volume = 0.55): void {
  try {
    const baseAudio = getAbilityAudio(id);
    if (!baseAudio) return;
    const audio = baseAudio.cloneNode(true) as HTMLAudioElement;
    audio.loop = false;
    audio.volume = Math.max(0, Math.min(1, volume * ABILITY_SFX[id].gain));
    void audio.play().catch(() => {
      // Playback can fail if browser blocks audio; ignore.
    });
  } catch {
    // Audio element not available
  }
}

export function preloadAbilitySfxAssets(): void {
  for (const id of Object.keys(ABILITY_SFX) as AbilitySfxId[]) {
    const audio = getAbilityAudio(id);
    if (!audio) continue;
    try {
      audio.load();
    } catch {
      // Ignore browsers that reject manual load hints.
    }
  }
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

export function startOverdriveLoop(volume = 0.55): void {
  try {
    const audio = getAbilityAudio("gold_overdrive_loop");
    if (!audio) return;
    audio.volume = Math.max(
      0,
      Math.min(1, volume * ABILITY_SFX.gold_overdrive_loop.gain),
    );
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

export function stopOverdriveLoop(): void {
  try {
    const audio = audioCache.gold_overdrive_loop;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // Audio element not available
  }
}
