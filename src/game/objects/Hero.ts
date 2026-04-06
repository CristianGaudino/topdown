import { Entity } from './Entity';
import { Gun } from './Gun';
import { Bullet } from './Bullet';
import { Particle } from './Particle';
import { Rect } from '../systems/Collision';

const SPEED = 3;
const MAX_HEALTH = 100;

export class Hero extends Entity {
  readonly maxHealth = MAX_HEALTH;
  private gun: Gun;

  // Injected by the game each frame — which room the hero is in
  getStatics!: () => Rect[];
  getEnemyTargets!: () => Array<{ rect: Rect; onHit: (dmg: number) => void }>;
  spawnBullet!: (b: Bullet) => void;
  spawnParticles!: (p: Particle[]) => void;

  constructor(x: number, y: number) {
    super(x, y, 28, 28, '#8e44ad', MAX_HEALTH);
    this.gun = new Gun('rifle', 'player');
  }

  shoot(targetX: number, targetY: number) {
    const bullets = this.gun.fire(
      this.middle.x,
      this.middle.y,
      targetX,
      targetY,
      this.getStatics,
      this.getEnemyTargets,
      () => [], // player bullets don't hit player
      this.spawnParticles,
    );
    bullets.forEach(b => this.spawnBullet(b));
  }

  update(input: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  }) {
    this.gun.tick();

    const statics = this.getStatics();

    if (input.up    && !this.wouldCollide(0, -SPEED, statics)) this.y -= SPEED;
    if (input.down  && !this.wouldCollide(0,  SPEED, statics)) this.y += SPEED;
    if (input.left  && !this.wouldCollide(-SPEED, 0, statics)) this.x -= SPEED;
    if (input.right && !this.wouldCollide( SPEED, 0, statics)) this.x += SPEED;
  }

  private wouldCollide(dx: number, dy: number, statics: Rect[]): boolean {
    const nx = this.x + dx;
    const ny = this.y + dy;
    for (const s of statics) {
      const ax = nx < s.x + s.width  && nx + this.width  > s.x;
      const ay = ny < s.y + s.height && ny + this.height > s.y;
      if (ax && ay) return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D) {
    super.draw(ctx);

    // Direction indicator dot
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(this.middle.x, this.middle.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
