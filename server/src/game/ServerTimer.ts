export class ServerTimer {
  private handle: NodeJS.Timeout | null = null;

  start(durationMs: number, onExpire: () => void): void {
    this.clear();
    this.handle = setTimeout(onExpire, durationMs);
  }

  clear(): void {
    if (this.handle) {
      clearTimeout(this.handle);
      this.handle = null;
    }
  }
}
