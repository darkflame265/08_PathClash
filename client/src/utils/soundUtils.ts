// Simple Web Audio API sound generator (no asset file needed)
let audioCtx: AudioContext | null = null;
let chargeAudio: HTMLAudioElement | null = null;
let quantumAudio: HTMLAudioElement | null = null;
let emberAudio: HTMLAudioElement | null = null;
let blitzAudio: HTMLAudioElement | null = null;
let bigBangAudio: HTMLAudioElement | null = null;
let healingAudio: HTMLAudioElement | null = null;
let infernoAudio: HTMLAudioElement | null = null;
let phaseShiftAudio: HTMLAudioElement | null = null;
let overdriveLoopAudio: HTMLAudioElement | null = null;
const CHARGE_SFX_GAIN = 0.4;
const QUANTUM_SFX_GAIN = 0.65;
const EMBER_SFX_GAIN = 0.3;
const BLITZ_SFX_GAIN = 0.6;
const BIGBANG_SFX_GAIN = 0.9;
const HEALING_SFX_GAIN = 0.65;
const INFERNO_SFX_GAIN = 0.6;
const PHASE_SHIFT_SFX_GAIN = 0.6;
const OVERDRIVE_LOOP_GAIN = 0.4;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
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

export function playCharge(volume = 0.55): void {
  try {
    if (!chargeAudio) {
      chargeAudio = new Audio("/sfx/ability/charge.mp3");
      chargeAudio.preload = "auto";
    }
    const audio = chargeAudio.cloneNode(true) as HTMLAudioElement;
    audio.volume = Math.max(0, Math.min(1, volume * CHARGE_SFX_GAIN));
    void audio.play().catch(() => {
      // Playback can fail if browser blocks audio; ignore.
    });
  } catch {
    // Audio element not available
  }
}

export function playQuantum(volume = 0.55): void {
  try {
    if (!quantumAudio) {
      quantumAudio = new Audio("/sfx/ability/quantum.mp3");
      quantumAudio.preload = "auto";
    }
    const audio = quantumAudio.cloneNode(true) as HTMLAudioElement;
    audio.volume = Math.max(0, Math.min(1, volume * QUANTUM_SFX_GAIN));
    void audio.play().catch(() => {
      // Playback can fail if browser blocks audio; ignore.
    });
  } catch {
    // Audio element not available
  }
}

export function playEmber(volume = 0.55): void {
  try {
    if (!emberAudio) {
      emberAudio = new Audio("/sfx/ability/ember_blast.mp3");
      emberAudio.preload = "auto";
    }
    const audio = emberAudio.cloneNode(true) as HTMLAudioElement;
    audio.volume = Math.max(0, Math.min(1, volume * EMBER_SFX_GAIN));
    void audio.play().catch(() => {
      // Playback can fail if browser blocks audio; ignore.
    });
  } catch {
    // Audio element not available
  }
}

export function playBlitz(volume = 0.55): void {
  try {
    if (!blitzAudio) {
      blitzAudio = new Audio("/sfx/ability/electric_blitz.mp3");
      blitzAudio.preload = "auto";
    }
    const audio = blitzAudio.cloneNode(true) as HTMLAudioElement;
    audio.volume = Math.max(0, Math.min(1, volume * BLITZ_SFX_GAIN));
    void audio.play().catch(() => {
      // Playback can fail if browser blocks audio; ignore.
    });
  } catch {
    // Audio element not available
  }
}

export function playBigBang(volume = 0.55): void {
  try {
    if (!bigBangAudio) {
      bigBangAudio = new Audio("/sfx/ability/cosmic_bigbang.mp3");
      bigBangAudio.preload = "auto";
    }
    const audio = bigBangAudio.cloneNode(true) as HTMLAudioElement;
    audio.volume = Math.max(0, Math.min(1, volume * BIGBANG_SFX_GAIN));
    void audio.play().catch(() => {
      // Playback can fail if browser blocks audio; ignore.
    });
  } catch {
    // Audio element not available
  }
}

export function playHealing(volume = 0.55): void {
  try {
    if (!healingAudio) {
      healingAudio = new Audio("/sfx/ability/healing_skill.mp3");
      healingAudio.preload = "auto";
    }
    const audio = healingAudio.cloneNode(true) as HTMLAudioElement;
    audio.volume = Math.max(0, Math.min(1, volume * HEALING_SFX_GAIN));
    void audio.play().catch(() => {
      // Playback can fail if browser blocks audio; ignore.
    });
  } catch {
    // Audio element not available
  }
}

export function playInferno(volume = 0.55): void {
  try {
    if (!infernoAudio) {
      infernoAudio = new Audio("/sfx/ability/inferno_field.mp3");
      infernoAudio.preload = "auto";
    }
    const audio = infernoAudio.cloneNode(true) as HTMLAudioElement;
    audio.volume = Math.max(0, Math.min(1, volume * INFERNO_SFX_GAIN));
    void audio.play().catch(() => {
      // Playback can fail if browser blocks audio; ignore.
    });
  } catch {
    // Audio element not available
  }
}

export function playPhaseShift(volume = 0.55): void {
  try {
    if (!phaseShiftAudio) {
      phaseShiftAudio = new Audio("/sfx/ability/phase_shift.mp3");
      phaseShiftAudio.preload = "auto";
    }
    const audio = phaseShiftAudio.cloneNode(true) as HTMLAudioElement;
    audio.volume = Math.max(0, Math.min(1, volume * PHASE_SHIFT_SFX_GAIN));
    void audio.play().catch(() => {
      // Playback can fail if browser blocks audio; ignore.
    });
  } catch {
    // Audio element not available
  }
}

export function startOverdriveLoop(volume = 0.55): void {
  try {
    if (!overdriveLoopAudio) {
      overdriveLoopAudio = new Audio("/sfx/ability/gold_overdrive_loop.mp3");
      overdriveLoopAudio.preload = "auto";
      overdriveLoopAudio.loop = true;
    }
    overdriveLoopAudio.volume = Math.max(
      0,
      Math.min(1, volume * OVERDRIVE_LOOP_GAIN),
    );
    if (overdriveLoopAudio.paused) {
      overdriveLoopAudio.currentTime = 0;
      void overdriveLoopAudio.play().catch(() => {
        // Playback can fail if browser blocks audio; ignore.
      });
    }
  } catch {
    // Audio element not available
  }
}

export function stopOverdriveLoop(): void {
  try {
    if (!overdriveLoopAudio) return;
    overdriveLoopAudio.pause();
    overdriveLoopAudio.currentTime = 0;
  } catch {
    // Audio element not available
  }
}
