declare module "howler" {
  export const Howler: {
    autoUnlock: boolean;
    autoSuspend: boolean;
    ctx: AudioContext | undefined;
    masterGain: GainNode | undefined;
  };

  export class Howl {
    constructor(options: {
      src: string[];
      loop?: boolean;
      preload?: boolean;
      html5?: boolean;
      volume?: number;
    });

    play(id?: number): number;
    pause(id?: number): this;
    stop(id?: number): this;
    unload(): null;
    volume(): number;
    volume(volume: number, id?: number): this;
    fade(from: number, to: number, duration: number, id?: number): this;
    playing(id?: number): boolean;
    on(event: string, fn: () => void, id?: number): this;
    once(event: string, fn: () => void, id?: number): this;
    off(event: string, fn?: () => void, id?: number): this;
  }
}
