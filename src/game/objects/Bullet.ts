import { Rectangle } from './Rectangle';
import { testAABB, Rect } from '../systems/Collision';
import { Particle } from './Particle';

export type BulletSource = 'player' | 'enemy';

export class Bullet extends Rectangle {
  readonly source: BulletSource;
  readonly damage: number;
  stopped = false;

  private vx = 0;
  private vy = 0;
  private lifetime: number;

  private getStatics: () => Rect[];
  private getEnemyTargets: () => Array<{ rect: Rect; onHit: (dmg: number, x: number, y: number) => void }>;
  private getPlayerTarget: () => Array<{ rect: Rect; onHit: (dmg: number, x: number, y: number) => void }>;
  private spawnParticles: (particles: Particle[]) => void;

  constructor(
    x: number, y: number,
    width: number, height: number,
    targetX: number, targetY: number,
    speed: number, damage: number, color: string,
    source: BulletSource,
    getStatics: () => Rect[],
    getEnemyTargets: () => Array<{ rect: Rect; onHit: (dmg: number, x: number, y: number) => void }>,
    getPlayerTarget: () => Array<{ rect: Rect; onHit: (dmg: number, x: number, y: number) => void }>,
    spawnParticles: (particles: Particle[]) => void,
  ) {
    super(x, y, width, height, color);
    this.damage = damage;
    this.source = source;
    this.getStatics = getStatics;
    this.getEnemyTargets = getEnemyTargets;
    this.getPlayerTarget = getPlayerTarget;
    this.spawnParticles = spawnParticles;

    const dx = targetX - (x + width / 2);
    const dy = targetY - (y + height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      this.vx = (dx / dist) * speed;
      this.vy = (dy / dist) * speed;
    }
    // Max travel ~1400 px regardless of speed; ensures stray bullets don't accumulate
    this.lifetime = Math.ceil(1400 / Math.max(speed, 1));
  }

  update() {
    if (this.stopped) return;

    if (--this.lifetime <= 0) { this.stopped = true; return; }

    this.x += this.vx;
    this.y += this.vy;

    for (const s of this.getStatics()) {
      if (testAABB(this.x, this.y, this.width, this.height, s)) {
        this.impact();
        return;
      }
    }

    if (this.source === 'player') {
      for (const t of this.getEnemyTargets()) {
        if (testAABB(this.x, this.y, this.width, this.height, t.rect)) {
          t.onHit(this.damage, this.x, this.y);
          this.impact();
          return;
        }
      }
    } else {
      for (const t of this.getPlayerTarget()) {
        if (testAABB(this.x, this.y, this.width, this.height, t.rect)) {
          t.onHit(this.damage, this.x, this.y);
          this.impact();
          return;
        }
      }
    }
  }

  private impact() {
    this.stopped = true;
    this.spawnParticles(Particle.burst(this.x, this.y, this.color));
  }
}
