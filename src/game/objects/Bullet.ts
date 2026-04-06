import { Rectangle } from './Rectangle';
import { testAABB, Rect } from '../systems/Collision';
import { Particle } from './Particle';

export type BulletSource = 'player' | 'enemy';

export class Bullet extends Rectangle {
  readonly source: BulletSource;
  readonly damage: number;
  stopped = false;

  private speed: number;
  private vx = 0;
  private vy = 0;
  private initialized = false;

  // Callbacks supplied by the room so the bullet can interact with the world
  private getStatics: () => Rect[];
  private getEnemyTargets: () => Array<{ rect: Rect; onHit: (dmg: number) => void }>;
  private getPlayerTarget: () => Array<{ rect: Rect; onHit: (dmg: number) => void }>;
  private spawnParticles: (particles: Particle[]) => void;

  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    targetX: number,
    targetY: number,
    speed: number,
    damage: number,
    color: string,
    source: BulletSource,
    getStatics: () => Rect[],
    getEnemyTargets: () => Array<{ rect: Rect; onHit: (dmg: number) => void }>,
    getPlayerTarget: () => Array<{ rect: Rect; onHit: (dmg: number) => void }>,
    spawnParticles: (particles: Particle[]) => void,
  ) {
    super(x, y, width, height, color);
    this.speed = speed;
    this.damage = damage;
    this.source = source;
    this.getStatics = getStatics;
    this.getEnemyTargets = getEnemyTargets;
    this.getPlayerTarget = getPlayerTarget;
    this.spawnParticles = spawnParticles;

    // Compute direction once
    const dx = targetX - (x + width / 2);
    const dy = targetY - (y + height / 2);
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist > 0) {
      this.vx = (dx / dist) * speed;
      this.vy = (dy / dist) * speed;
    }
    this.initialized = true;
  }

  update() {
    if (this.stopped || !this.initialized) return;

    this.x += this.vx;
    this.y += this.vy;

    // Wall collision
    for (const s of this.getStatics()) {
      if (testAABB(this.x, this.y, this.width, this.height, s)) {
        this.impact();
        return;
      }
    }

    // Target collision
    if (this.source === 'player') {
      for (const t of this.getEnemyTargets()) {
        if (testAABB(this.x, this.y, this.width, this.height, t.rect)) {
          t.onHit(this.damage);
          this.impact();
          return;
        }
      }
    } else {
      for (const t of this.getPlayerTarget()) {
        if (testAABB(this.x, this.y, this.width, this.height, t.rect)) {
          t.onHit(this.damage);
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
