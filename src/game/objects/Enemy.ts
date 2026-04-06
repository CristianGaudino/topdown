import { Entity } from './Entity';
import { Gun, GunType } from './Gun';
import { Bullet } from './Bullet';
import { Particle } from './Particle';
import { Rect, testAABB } from '../systems/Collision';

const ENEMY_SPEED = 1.5;
const BOSS_SPEED = 1.2;

// Injected per-frame context
export interface EnemyContext {
  getStatics: () => Rect[];
  getPlayerTarget: () => Array<{ rect: Rect; onHit: (dmg: number) => void }>;
  spawnBullet: (b: Bullet) => void;
  spawnParticles: (p: Particle[]) => void;
  onKilled: () => void;
  onTouchPlayer: () => void;
}

export class Enemy extends Entity {
  readonly isBoss: boolean;
  private gun: Gun;
  private maneuverTimer = 0;
  private maneuverX = 0;
  private maneuverY = 0;
  private justCollidedLeft = false;
  private justCollidedRight = false;

  ctx!: EnemyContext;

  constructor(x: number, y: number, gunType: GunType, isBoss = false) {
    const color = isBoss ? '#e67e22' : '#922b21';
    const health = isBoss ? 400 : 50;
    super(x, y, 32, 32, color, health);
    this.hostile = true;
    this.isBoss = isBoss;
    this.gun = new Gun(gunType, 'enemy');
  }

  update(heroX: number, heroY: number) {
    if (!this.ctx) return;

    this.gun.tick();

    // Shoot at hero
    const bullets = this.gun.fire(
      this.middle.x,
      this.middle.y,
      heroX,
      heroY,
      this.ctx.getStatics,
      () => [],
      this.ctx.getPlayerTarget,
      this.ctx.spawnParticles,
    );
    bullets.forEach(b => this.ctx.spawnBullet(b));

    // Move toward hero
    const destX = this.maneuverTimer > 0 ? this.maneuverX : heroX;
    const destY = this.maneuverTimer > 0 ? this.maneuverY : heroY;
    if (this.maneuverTimer > 0) this.maneuverTimer--;

    this.moveToward(destX, destY, heroX, heroY);
  }

  private moveToward(destX: number, destY: number, heroX: number, heroY: number) {
    const statics = this.ctx.getStatics();
    const speed = this.isBoss ? BOSS_SPEED : ENEMY_SPEED;

    // Touch check
    const playerTargets = this.ctx.getPlayerTarget();
    for (const t of playerTargets) {
      if (testAABB(this.x, this.y, this.width, this.height, t.rect)) {
        this.ctx.onTouchPlayer();
        return;
      }
    }

    const dx = destX - this.middle.x;
    const dy = destY - this.middle.y;
    const total = Math.abs(dx) + Math.abs(dy) || 1;
    const vx = (dx / total) * speed;
    const vy = (dy / total) * speed;

    const colUp    = this.wouldCollide(0, -speed, statics);
    const colDown  = this.wouldCollide(0,  speed, statics);
    const colLeft  = this.wouldCollide(-speed, 0, statics);
    const colRight = this.wouldCollide( speed, 0, statics);

    // Handle diagonal collisions with maneuver logic
    if (vy < 0 && colUp) {
      if (colLeft)  { this.doManeuver(heroX, heroY, 'up-left');  return; }
      if (colRight) { this.doManeuver(heroX, heroY, 'up-right'); return; }
      this.doManeuver(heroX, heroY, dx < 0 ? 'up-left-dodge' : 'up-right-dodge');
      return;
    }
    if (vy > 0 && colDown) {
      if (colLeft)  { this.doManeuver(heroX, heroY, 'down-left');  return; }
      if (colRight) { this.doManeuver(heroX, heroY, 'down-right'); return; }
      this.doManeuver(heroX, heroY, dx < 0 ? 'down-left-dodge' : 'down-right-dodge');
      return;
    }

    if (!colUp   && vy < 0) this.y += vy;
    if (!colDown  && vy > 0) this.y += vy;
    if (!colLeft  && vx < 0) this.x += vx;
    if (!colRight && vx > 0) this.x += vx;
  }

  private doManeuver(heroX: number, heroY: number, type: string) {
    const DODGE = 120;
    this.maneuverTimer = 40;
    switch (type) {
      case 'up-left':
        if (!this.justCollidedLeft) { this.justCollidedLeft = true; this.maneuverX = heroX + DODGE; this.maneuverY = heroY; }
        else { this.justCollidedLeft = false; this.maneuverX = this.x; this.maneuverY = heroY + DODGE; }
        break;
      case 'up-right':
        if (!this.justCollidedRight) { this.justCollidedRight = true; this.maneuverX = heroX - DODGE; this.maneuverY = heroY; }
        else { this.justCollidedRight = false; this.maneuverX = this.x; this.maneuverY = heroY + DODGE; }
        break;
      case 'down-left':
        if (!this.justCollidedLeft) { this.justCollidedLeft = true; this.maneuverX = heroX + DODGE; this.maneuverY = heroY; }
        else { this.justCollidedLeft = false; this.maneuverX = this.x; this.maneuverY = heroY - DODGE; }
        break;
      case 'down-right':
        if (!this.justCollidedRight) { this.justCollidedRight = true; this.maneuverX = heroX - DODGE; this.maneuverY = heroY; }
        else { this.justCollidedRight = false; this.maneuverX = this.x; this.maneuverY = heroY - DODGE; }
        break;
      case 'up-left-dodge':
        this.maneuverX = heroX - DODGE; this.maneuverY = heroY; break;
      case 'up-right-dodge':
        this.maneuverX = heroX + DODGE; this.maneuverY = heroY; break;
      case 'down-left-dodge':
        this.maneuverX = heroX - DODGE; this.maneuverY = heroY; break;
      case 'down-right-dodge':
        this.maneuverX = heroX + DODGE; this.maneuverY = heroY; break;
    }
  }

  private wouldCollide(dx: number, dy: number, statics: Rect[]): boolean {
    const nx = this.x + dx;
    const ny = this.y + dy;
    for (const s of statics) {
      if (nx < s.x + s.width && nx + this.width > s.x &&
          ny < s.y + s.height && ny + this.height > s.y) {
        return true;
      }
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D) {
    super.draw(ctx);

    // Health pip for non-boss
    if (!this.isBoss) {
      const maxHp = 50;
      const pct = Math.max(0, this.health / maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(this.x, this.y - 6, this.width, 4);
      ctx.fillStyle = pct > 0.5 ? '#27ae60' : pct > 0.25 ? '#f39c12' : '#e74c3c';
      ctx.fillRect(this.x, this.y - 6, this.width * pct, 4);
    }
  }
}
