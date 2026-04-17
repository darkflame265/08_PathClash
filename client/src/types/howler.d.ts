declare module "howler" {
  export const Howler: {
    autoUnlock: boolean;
    autoSuspend: boolean;
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
    volume(volume: number, id?: number): this;
    fade(from: number, to: number, duration: number, id?: number): this;
    playing(id?: number): boolean;
  }
}
