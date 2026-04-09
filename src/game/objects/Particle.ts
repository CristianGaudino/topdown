import { Rectangle } from './Rectangle';

export type ParticleDirection =
  | 'up' | 'up-right' | 'right' | 'down-right'
  | 'down' | 'down-left' | 'left' | 'up-left';

const DIRECTION_VECTORS: Record<ParticleDirection, [number, number]> = {
  'up':         [0, -1],
  'up-right':   [0.707, -0.707],
  'right':      [1, 0],
  'down-right': [0.707, 0.707],
  'down':       [0, 1],
  'down-left':  [-0.707, 0.707],
  'left':       [-1, 0],
  'up-left':    [-0.707, -0.707],
};

export class Particle extends Rectangle {
  private lifetime: number;
  private speed: number;
  private vx: number;
  private vy: number;
  stopped = false;

  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    lifetime: number,
    speed: number,
    direction?: ParticleDirection | { angle: number },
  ) {
    super(x, y, width, height, color);
    this.lifetime = lifetime;
    this.speed = speed;

    if (direction) {
      if (typeof direction === 'string') {
        const [dx, dy] = DIRECTION_VECTORS[direction];
        this.vx = dx * speed;
        this.vy = dy * speed;
      } else {
        this.vx = Math.cos(direction.angle) * speed;
        this.vy = Math.sin(direction.angle) * speed;
      }
    } else {
      const angle = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
    }
  }

  update() {
    if (this.stopped) return;
    this.x += this.vx;
    this.y += this.vy;
    this.lifetime -= 1;
    if (this.lifetime <= 0) this.stopped = true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.stopped) return;
    const alpha = Math.max(0, this.lifetime / 20);
    ctx.globalAlpha = alpha;
    super.draw(ctx);
    ctx.globalAlpha = 1;
  }

  static burst(x: number, y: number, color: string): Particle[] {
    const directions: ParticleDirection[] = [
      'up', 'up-right', 'right', 'down-right',
      'down', 'down-left', 'left', 'up-left',
    ];
    return directions.map(
      dir => new Particle(x, y, 2, 3, color, 20, Math.random() * 10, dir),
    );
  }

  static enemyDeath(x: number, y: number, color: string, size: number): Particle[] {
    const out: Particle[] = [];
    // Large slow chunks
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 1.5 + Math.random() * 3;
      out.push(new Particle(x, y, 4 + Math.random() * 4, 4 + Math.random() * 4, color, 28 + Math.random() * 12, speed, { angle }));
    }
    // Small fast sparks in a lighter tint
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      out.push(new Particle(x, y, 2, 2, '#ffffff', 14 + Math.random() * 8, speed, { angle }));
    }
    // Size-scaled central flash — one big short-lived square
    out.push(new Particle(x - size / 2, y - size / 2, size, size, color, 6, 0));
    return out;
  }

  static muzzleFlash(x: number, y: number, angle: number): Particle[] {
    const out: Particle[] = [];
    for (let i = 0; i < 3; i++) {
      const spread = (Math.random() - 0.5) * 0.8;
      const speed  = 2 + Math.random() * 3;
      out.push(new Particle(x - 2, y - 2, 4, 4, '#ffff88', 5 + Math.random() * 3, speed, { angle: angle + spread }));
    }
    return out;
  }
}
