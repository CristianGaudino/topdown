import { Entity } from './Entity';
import { Gun, GunType } from './Gun';
import { Bullet } from './Bullet';
import { Particle } from './Particle';
import { Rect } from '../systems/Collision';

const BASE_SPEED     = 3;
const DASH_SPEED     = 14;
const DASH_DURATION  = 10;   // frames
const BASE_DASH_COOLDOWN = 150; // frames (~2.5s)
const MAX_HEALTH     = 100;

export type HeroUpgradeType = 'maxHealth' | 'dashCooldown' | 'damage' | 'fireRate' | 'moveSpeed';

export class Hero extends Entity {
  maxHealth: number = MAX_HEALTH; // mutable for upgrades
  private gun: Gun;
  currentGunType: GunType = 'rifle';

  // Upgrade stats
  damageMultiplier   = 1.0;
  cooldownMultiplier = 1.0; // <1 = faster fire rate
  moveSpeedBonus     = 0;
  private maxDashCooldown = BASE_DASH_COOLDOWN;

  dashTimer    = 0;
  dashCooldown = 0;
  private dashVx = 0;
  private dashVy = 0;
  private aimAngle        = 0;
  private invincibleTimer = 0;
  private knockbackVx     = 0;
  private knockbackVy     = 0;
  private static readonly I_FRAMES = 45;

  // Injected per-frame by Game
  getStatics!:      () => Rect[];
  getEnemyTargets!: () => Array<{ rect: Rect; onHit: (dmg: number, x: number, y: number) => void }>;
  spawnBullet!:     (b: Bullet) => void;
  spawnParticles!:  (p: Particle[]) => void;

  constructor(x: number, y: number) {
    super(x, y, 28, 28, '#8e44ad', MAX_HEALTH);
    this.gun = new Gun('rifle', 'player');
  }

  takeDamage(amount: number) {
    if (this.invincibleTimer > 0) return;
    super.takeDamage(amount);
    this.invincibleTimer = Hero.I_FRAMES;
  }

  applyKnockback(fromX: number, fromY: number, strength = 6) {
    if (this.invincibleTimer > Hero.I_FRAMES - 3) return; // already fresh i-frames, skip
    const dx  = this.middle.x - fromX;
    const dy  = this.middle.y - fromY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    this.knockbackVx = (dx / len) * strength;
    this.knockbackVy = (dy / len) * strength;
  }

  equipGun(type: GunType) {
    this.currentGunType = type;
    this.gun = new Gun(type, 'player');
  }

  applyUpgrade(type: HeroUpgradeType) {
    switch (type) {
      case 'maxHealth':
        this.maxHealth += 25;
        this.health = Math.min(this.maxHealth, this.health + 25);
        break;
      case 'dashCooldown':
        this.maxDashCooldown = Math.round(this.maxDashCooldown * 0.7);
        break;
      case 'damage':
        this.damageMultiplier = +(this.damageMultiplier * 1.25).toFixed(4);
        break;
      case 'fireRate':
        this.cooldownMultiplier = +(this.cooldownMultiplier * 0.8).toFixed(4);
        break;
      case 'moveSpeed':
        this.moveSpeedBonus += 0.5;
        break;
    }
  }

  shoot(targetX: number, targetY: number) {
    const bullets = this.gun.fire(
      this.middle.x,
      this.middle.y,
      targetX,
      targetY,
      this.getStatics,
      this.getEnemyTargets,
      () => [],
      this.spawnParticles,
      this.damageMultiplier,
      this.cooldownMultiplier,
    );
    bullets.forEach(b => this.spawnBullet(b));
    if (bullets.length > 0) {
      const tipX = this.middle.x + Math.cos(this.aimAngle) * (this.width / 2 + 8);
      const tipY = this.middle.y + Math.sin(this.aimAngle) * (this.width / 2 + 8);
      this.spawnParticles(Particle.muzzleFlash(tipX, tipY, this.aimAngle));
    }
  }

  update(input: {
    up: boolean; down: boolean; left: boolean; right: boolean;
    dash: boolean; mouseX: number; mouseY: number; mouseDown: boolean;
    speedFraction: number;
  }) {
    this.gun.tick();
    if (this.invincibleTimer > 0) this.invincibleTimer--;

    this.aimAngle = Math.atan2(input.mouseY - this.middle.y, input.mouseX - this.middle.x);

    // Dash trigger
    if (input.dash && this.dashCooldown === 0 && this.dashTimer === 0) {
      const dx = input.mouseX - this.middle.x;
      const dy = input.mouseY - this.middle.y;
      const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const my = (input.down  ? 1 : 0) - (input.up   ? 1 : 0);
      const len = Math.sqrt(
        (mx !== 0 || my !== 0) ? mx * mx + my * my : dx * dx + dy * dy,
      ) || 1;
      this.dashVx = (mx !== 0 || my !== 0) ? (mx / len) * DASH_SPEED : (dx / len) * DASH_SPEED;
      this.dashVy = (mx !== 0 || my !== 0) ? (my / len) * DASH_SPEED : (dy / len) * DASH_SPEED;
      this.dashTimer      = DASH_DURATION;
      this.dashCooldown   = this.maxDashCooldown;
      this.invincibleTimer = Math.max(this.invincibleTimer, DASH_DURATION + 4);
    }

    if (this.dashCooldown > 0) this.dashCooldown--;

    const speed   = BASE_SPEED + this.moveSpeedBonus;
    const statics = this.getStatics();

    // Knockback — decays quickly, overrides other movement while active
    if (Math.abs(this.knockbackVx) > 0.1 || Math.abs(this.knockbackVy) > 0.1) {
      if (!this.wouldCollide(this.knockbackVx, 0, statics)) this.x += this.knockbackVx;
      if (!this.wouldCollide(0, this.knockbackVy, statics)) this.y += this.knockbackVy;
      this.knockbackVx *= 0.72;
      this.knockbackVy *= 0.72;
    }

    if (this.dashTimer > 0) {
      this.dashTimer--;
      if (!this.wouldCollide(this.dashVx, 0, statics)) this.x += this.dashVx;
      if (!this.wouldCollide(0, this.dashVy, statics)) this.y += this.dashVy;
    } else {
      // Normalize diagonal movement so it's never faster than cardinal
      let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let my = (input.down  ? 1 : 0) - (input.up   ? 1 : 0);
      const mlen = Math.sqrt(mx * mx + my * my);
      if (mlen > 0) {
        mx /= mlen;
        my /= mlen;
        const s = speed * input.speedFraction;
        if (!this.wouldCollide(mx * s, 0, statics)) this.x += mx * s;
        if (!this.wouldCollide(0, my * s, statics)) this.y += my * s;
      }
    }

    if (input.mouseDown) {
      this.shoot(input.mouseX, input.mouseY);
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

  get dashCooldownFraction(): number {
    return this.dashCooldown / this.maxDashCooldown;
  }

  get isInvincible(): boolean {
    return this.invincibleTimer > 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 5) % 2 === 0) return;

    const cx = this.middle.x;
    const cy = this.middle.y;
    const hw = this.width  / 2;
    const hh = this.height / 2;

    // Dash afterimage
    if (this.dashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = (this.dashTimer / DASH_DURATION) * 0.35;
      ctx.fillStyle = '#c39bd3';
      ctx.translate(cx - this.dashVx * 1.5, cy - this.dashVy * 1.5);
      ctx.rotate(this.aimAngle);
      ctx.fillRect(-hw, -hh, this.width, this.height);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.aimAngle);

    const flashing = this.damageFlashTimer > 0;
    if (flashing) this.damageFlashTimer--;
    ctx.fillStyle = flashing ? '#e74c3c' : this.color;
    ctx.fillRect(-hw, -hh, this.width, this.height);

    // Gun barrel
    ctx.fillStyle = flashing ? '#ff8888' : 'rgba(255,255,255,0.75)';
    ctx.fillRect(hw - 2, -3, 10, 6);

    // Centre dot
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
