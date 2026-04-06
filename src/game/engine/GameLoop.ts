export class GameLoop {
  private rafId: number | null = null;
  private lastTime = 0;
  private readonly targetFPS = 60;
  private readonly frameDuration = 1000 / this.targetFPS;
  private accumulator = 0;

  constructor(private onTick: (dt: number) => void) {}

  start() {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private loop = (now: number) => {
    this.rafId = requestAnimationFrame(this.loop);

    const delta = now - this.lastTime;
    this.lastTime = now;
    this.accumulator += delta;

    // Prevent spiral of death on tab focus
    if (this.accumulator > 200) this.accumulator = this.frameDuration;

    while (this.accumulator >= this.frameDuration) {
      this.onTick(this.frameDuration / 1000);
      this.accumulator -= this.frameDuration;
    }
  };

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
