// Simple Web Audio API sound generator (no asset file needed)
let audioCtx: AudioContext | null = null;
let chargeAudio: HTMLAudioElement | null = null;
let quantumAudio: HTMLAudioElement | null = null;
const CHARGE_SFX_GAIN = 0.35;
const QUANTUM_SFX_GAIN = 0.65;

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
