import { Entity } from './Entity';
import { Gun, GunType } from './Gun';
import { Bullet } from './Bullet';
import { Particle } from './Particle';
import { Rect } from '../systems/Collision';

const BASE_SPEED = 3;
const DASH_SPEED = 14;
const DASH_DURATION = 10;      // frames
const DASH_COOLDOWN = 150;     // frames (~2.5s)
const MAX_HEALTH = 100;

export class Hero extends Entity {
  readonly maxHealth = MAX_HEALTH;
  private gun: Gun;
  currentGunType: GunType = 'rifle';

  dashTimer = 0;
  dashCooldown = 0;
  private dashVx = 0;
  private dashVy = 0;
  private aimAngle = 0; // radians, hero faces this direction
  private invincibleTimer = 0;
  private static readonly I_FRAMES = 45;

  // Injected per-frame by Game
  getStatics!: () => Rect[];
  getEnemyTargets!: () => Array<{ rect: Rect; onHit: (dmg: number, x: number, y: number) => void }>;
  spawnBullet!: (b: Bullet) => void;
  spawnParticles!: (p: Particle[]) => void;

  constructor(x: number, y: number) {
    super(x, y, 28, 28, '#8e44ad', MAX_HEALTH);
    this.gun = new Gun('rifle', 'player');
  }

  takeDamage(amount: number) {
    if (this.invincibleTimer > 0) return;
    super.takeDamage(amount);
    this.invincibleTimer = Hero.I_FRAMES;
  }

  equipGun(type: GunType) {
    this.currentGunType = type;
    this.gun = new Gun(type, 'player');
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
    );
    bullets.forEach(b => this.spawnBullet(b));
  }

  update(input: {
    up: boolean; down: boolean; left: boolean; right: boolean;
    dash: boolean; mouseX: number; mouseY: number; mouseDown: boolean;
  }) {
    this.gun.tick();
    if (this.invincibleTimer > 0) this.invincibleTimer--;

    // Track aim direction for drawing
    this.aimAngle = Math.atan2(input.mouseY - this.middle.y, input.mouseX - this.middle.x);

    // Dash trigger
    if (input.dash && this.dashCooldown === 0 && this.dashTimer === 0) {
      const dx = input.mouseX - this.middle.x;
      const dy = input.mouseY - this.middle.y;
      // Use movement direction if held, else toward cursor
      const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      const len = Math.sqrt(
        (mx !== 0 || my !== 0) ? mx * mx + my * my : dx * dx + dy * dy,
      ) || 1;
      this.dashVx = (mx !== 0 || my !== 0) ? (mx / len) * DASH_SPEED : (dx / len) * DASH_SPEED;
      this.dashVy = (mx !== 0 || my !== 0) ? (my / len) * DASH_SPEED : (dy / len) * DASH_SPEED;
      this.dashTimer = DASH_DURATION;
      this.dashCooldown = DASH_COOLDOWN;
    }

    if (this.dashCooldown > 0) this.dashCooldown--;

    const statics = this.getStatics();

    if (this.dashTimer > 0) {
      // Dashing — ignore normal movement, apply dash vector
      this.dashTimer--;
      if (!this.wouldCollide(this.dashVx, 0, statics)) this.x += this.dashVx;
      if (!this.wouldCollide(0, this.dashVy, statics)) this.y += this.dashVy;
    } else {
      if (input.up    && !this.wouldCollide(0, -BASE_SPEED, statics)) this.y -= BASE_SPEED;
      if (input.down  && !this.wouldCollide(0,  BASE_SPEED, statics)) this.y += BASE_SPEED;
      if (input.left  && !this.wouldCollide(-BASE_SPEED, 0, statics)) this.x -= BASE_SPEED;
      if (input.right && !this.wouldCollide( BASE_SPEED, 0, statics)) this.x += BASE_SPEED;
    }

    // Hold-to-shoot
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
    return this.dashCooldown / DASH_COOLDOWN;
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Blink while invincible
    if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 5) % 2 === 0) return;

    const cx = this.middle.x;
    const cy = this.middle.y;
    const hw = this.width / 2;
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

    // Body
    const flashing = this.damageFlashTimer > 0;
    if (flashing) this.damageFlashTimer--;
    ctx.fillStyle = flashing ? '#e74c3c' : this.color;
    ctx.fillRect(-hw, -hh, this.width, this.height);

    // Gun barrel — small rectangle pointing right (forward)
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
