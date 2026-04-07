import { Entity } from './Entity';
import { Gun, GunType } from './Gun';
import { Bullet } from './Bullet';
import { Particle } from './Particle';
import { Rect, testAABB } from '../systems/Collision';

// Visual profile per gun type
interface EnemyProfile {
  width: number;
  height: number;
  color: string;
  label: string;
  speed: number;
  maxHealth: number;
}

const PROFILES: Record<GunType, EnemyProfile> = {
  rifle:     { width: 28, height: 28, color: '#922b21', label: 'R', speed: 1.5,  maxHealth: 50 },
  smg:       { width: 22, height: 22, color: '#1a5e35', label: 'S', speed: 2.2,  maxHealth: 35 },
  sniper:    { width: 18, height: 34, color: '#6e4c1e', label: 'SN', speed: 0.9, maxHealth: 40 },
  shotgun:   { width: 36, height: 30, color: '#a93226', label: 'SH', speed: 1.2, maxHealth: 70 },
  sprinkler: { width: 48, height: 48, color: '#d35400', label: '★', speed: 1.0,  maxHealth: 400 },
};

export interface EnemyContext {
  getStatics: () => Rect[];
  getPlayerTarget: () => Array<{ rect: Rect; onHit: (dmg: number, x: number, y: number) => void }>;
  spawnBullet: (b: Bullet) => void;
  spawnParticles: (p: Particle[]) => void;
  onKilled: () => void;
  onTouchPlayer: () => void;
}

export class Enemy extends Entity {
  readonly isBoss: boolean;
  readonly gunType: GunType;
  readonly profile: EnemyProfile;
  private gun: Gun;
  private maneuverTimer = 0;
  private maneuverX = 0;
  private maneuverY = 0;
  private justCollidedLeft = false;
  private justCollidedRight = false;
  private touchCooldown = 0;

  ctx!: EnemyContext;

  constructor(x: number, y: number, gunType: GunType, isBoss = false) {
    const profile = PROFILES[gunType];
    super(x, y, profile.width, profile.height, profile.color, profile.maxHealth);
    this.hostile = true;
    this.isBoss = isBoss;
    this.gunType = gunType;
    this.profile = profile;
    this.gun = new Gun(gunType, 'enemy');
  }

  update(heroX: number, heroY: number) {
    if (!this.ctx) return;

    this.gun.tick();
    if (this.touchCooldown > 0) this.touchCooldown--;

    const bullets = this.gun.fire(
      this.middle.x, this.middle.y,
      heroX, heroY,
      this.ctx.getStatics,
      () => [],
      this.ctx.getPlayerTarget,
      this.ctx.spawnParticles,
    );
    bullets.forEach(b => this.ctx.spawnBullet(b));

    const destX = this.maneuverTimer > 0 ? this.maneuverX : heroX;
    const destY = this.maneuverTimer > 0 ? this.maneuverY : heroY;
    if (this.maneuverTimer > 0) this.maneuverTimer--;

    this.moveToward(destX, destY, heroX, heroY);
  }

  private moveToward(destX: number, destY: number, heroX: number, heroY: number) {
    const statics = this.ctx.getStatics();
    const speed = this.profile.speed;

    for (const t of this.ctx.getPlayerTarget()) {
      if (testAABB(this.x, this.y, this.width, this.height, t.rect)) {
        if (this.touchCooldown === 0) {
          this.touchCooldown = 60; // 1 second between touch hits
          this.ctx.onTouchPlayer();
        }
        return;
      }
    }

    const dx = destX - this.middle.x;
    const dy = destY - this.middle.y;
    const total = Math.sqrt(dx * dx + dy * dy) || 1;
    const vx = (dx / total) * speed;
    const vy = (dy / total) * speed;

    const colUp    = this.wouldCollide(0, -speed, statics);
    const colDown  = this.wouldCollide(0,  speed, statics);
    const colLeft  = this.wouldCollide(-speed, 0, statics);
    const colRight = this.wouldCollide( speed, 0, statics);

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

    if (!colUp    && vy < 0) this.y += vy;
    if (!colDown  && vy > 0) this.y += vy;
    if (!colLeft  && vx < 0) this.x += vx;
    if (!colRight && vx > 0) this.x += vx;
  }

  private doManeuver(heroX: number, heroY: number, type: string) {
    const D = 120;
    this.maneuverTimer = 40;
    switch (type) {
      case 'up-left':
        if (!this.justCollidedLeft) { this.justCollidedLeft = true; this.maneuverX = heroX + D; this.maneuverY = heroY; }
        else { this.justCollidedLeft = false; this.maneuverX = this.x; this.maneuverY = heroY + D; }
        break;
      case 'up-right':
        if (!this.justCollidedRight) { this.justCollidedRight = true; this.maneuverX = heroX - D; this.maneuverY = heroY; }
        else { this.justCollidedRight = false; this.maneuverX = this.x; this.maneuverY = heroY + D; }
        break;
      case 'down-left':
        if (!this.justCollidedLeft) { this.justCollidedLeft = true; this.maneuverX = heroX + D; this.maneuverY = heroY; }
        else { this.justCollidedLeft = false; this.maneuverX = this.x; this.maneuverY = heroY - D; }
        break;
      case 'down-right':
        if (!this.justCollidedRight) { this.justCollidedRight = true; this.maneuverX = heroX - D; this.maneuverY = heroY; }
        else { this.justCollidedRight = false; this.maneuverX = this.x; this.maneuverY = heroY - D; }
        break;
      default:
        this.maneuverX = heroX + (type.includes('left') ? -D : D);
        this.maneuverY = heroY;
    }
  }

  private wouldCollide(dx: number, dy: number, statics: Rect[]): boolean {
    const nx = this.x + dx;
    const ny = this.y + dy;
    for (const s of statics) {
      if (nx < s.x + s.width && nx + this.width > s.x &&
          ny < s.y + s.height && ny + this.height > s.y) return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D) {
    super.draw(ctx);

    // Boss glow ring
    if (this.isBoss) {
      ctx.save();
      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + Math.sin(Date.now() * 0.005) * 0.4;
      ctx.strokeRect(this.x - 3, this.y - 3, this.width + 6, this.height + 6);
      ctx.restore();
    }

    // Health bar
    const pct = Math.max(0, this.health / this.profile.maxHealth);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(this.x, this.y - 7, this.width, 4);
    ctx.fillStyle = pct > 0.5 ? '#27ae60' : pct > 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(this.x, this.y - 7, this.width * pct, 4);

    // Type label
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `bold ${this.isBoss ? 10 : 8}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.profile.label, this.middle.x, this.middle.y);
  }
}
