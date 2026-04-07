import { Entity } from './Entity';
import { Gun, GunType } from './Gun';
import { Bullet } from './Bullet';
import { Particle } from './Particle';
import { Rect, testAABB } from '../systems/Collision';

type BehaviorType = 'seeker' | 'ranger' | 'charger' | 'orbiter';

interface EnemyProfile {
  width: number;
  height: number;
  color: string;
  label: string;
  speed: number;
  maxHealth: number;
  preferredRange: number; // ideal combat distance from hero
  turnRate: number;       // 0–1: how quickly velocity steers. higher = more agile
  wanderStrength: number; // 0–1: random perturbation. higher = more erratic
  behavior: BehaviorType;
}

const PROFILES: Record<GunType, EnemyProfile> = {
  rifle:     { width: 28, height: 28, color: '#922b21', label: 'R',  speed: 1.5,  maxHealth: 50,  preferredRange: 200, turnRate: 0.12, wanderStrength: 0.25, behavior: 'seeker'  },
  smg:       { width: 22, height: 22, color: '#1a5e35', label: 'S',  speed: 2.2,  maxHealth: 35,  preferredRange: 80,  turnRate: 0.22, wanderStrength: 0.50, behavior: 'charger' },
  sniper:    { width: 18, height: 34, color: '#6e4c1e', label: 'SN', speed: 0.9,  maxHealth: 40,  preferredRange: 340, turnRate: 0.07, wanderStrength: 0.10, behavior: 'ranger'  },
  shotgun:   { width: 36, height: 30, color: '#a93226', label: 'SH', speed: 1.3,  maxHealth: 70,  preferredRange: 110, turnRate: 0.09, wanderStrength: 0.15, behavior: 'charger' },
  sprinkler: { width: 48, height: 48, color: '#d35400', label: '★',  speed: 1.0,  maxHealth: 400, preferredRange: 220, turnRate: 0.05, wanderStrength: 0.05, behavior: 'orbiter' },
};

// How far ahead to probe for walls
const WALL_LOOK_AHEAD = 52;
// Radius within which enemies push each other apart
const SEP_RADIUS = 50;

export interface EnemyContext {
  getStatics: () => Rect[];
  getEnemies: () => Enemy[];
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
  private touchCooldown = 0;

  // Velocity-based movement state
  private vx = 0;
  private vy = 0;
  private wanderAngle = Math.random() * Math.PI * 2;
  private orbitSign = Math.random() < 0.5 ? 1 : -1; // orbit CW or CCW

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

    this.steer(heroX, heroY);
  }

  private steer(heroX: number, heroY: number) {
    const statics = this.ctx.getStatics();
    const enemies = this.ctx.getEnemies();
    const { speed, preferredRange, turnRate, wanderStrength, behavior } = this.profile;
    const cx = this.middle.x;
    const cy = this.middle.y;

    // Touch damage
    for (const t of this.ctx.getPlayerTarget()) {
      if (testAABB(this.x, this.y, this.width, this.height, t.rect)) {
        if (this.touchCooldown === 0) {
          this.touchCooldown = 60;
          this.ctx.onTouchPlayer();
        }
        break;
      }
    }

    const dx = heroX - cx;
    const dy = heroY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // ── 1. Primary movement intention per behavior type ───────────────────────
    let seekX = 0;
    let seekY = 0;

    if (behavior === 'orbiter') {
      // Slowly circle the hero at preferredRange, correcting toward it radially
      const tangentX = (-dy / dist) * this.orbitSign;
      const tangentY = ( dx / dist) * this.orbitSign;
      const rangeError = dist - preferredRange;
      const radialStr = Math.min(Math.abs(rangeError) / preferredRange, 1);
      const radialX = (dx / dist) * Math.sign(rangeError) * radialStr;
      const radialY = (dy / dist) * Math.sign(rangeError) * radialStr;
      seekX = (tangentX * 0.78 + radialX * 0.22) * speed;
      seekY = (tangentY * 0.78 + radialY * 0.22) * speed;

    } else if (behavior === 'ranger') {
      if (dist < preferredRange * 0.75) {
        // Hero is too close — back away while strafing perpendicular
        const strafeX = -dy / dist;
        const strafeY =  dx / dist;
        seekX = ((-dx / dist) * 0.65 + strafeX * 0.35) * speed;
        seekY = ((-dy / dist) * 0.65 + strafeY * 0.35) * speed;
      } else if (dist > preferredRange * 1.35) {
        // Too far — close the gap straight on
        seekX = (dx / dist) * speed;
        seekY = (dy / dist) * speed;
      } else {
        // In the comfortable band — strafe across the hero's face
        const strafeX = -dy / dist;
        const strafeY =  dx / dist;
        seekX = strafeX * speed * 0.85;
        seekY = strafeY * speed * 0.85;
      }

    } else {
      // seeker / charger: approach to preferredRange, linger there
      if (dist > preferredRange) {
        seekX = (dx / dist) * speed;
        seekY = (dy / dist) * speed;
      } else {
        // Slightly back off to hold preferred distance
        const excess = (preferredRange - dist) / preferredRange;
        seekX = (-dx / dist) * speed * excess * 0.4;
        seekY = (-dy / dist) * speed * excess * 0.4;
      }
    }

    // ── 2. Separation — push away from nearby enemies ─────────────────────────
    let sepX = 0;
    let sepY = 0;
    for (const e of enemies) {
      if (e === this) continue;
      const ex = cx - e.middle.x;
      const ey = cy - e.middle.y;
      const d = Math.sqrt(ex * ex + ey * ey) || 1;
      const threshold = SEP_RADIUS + (this.width + e.width) * 0.3;
      if (d < threshold) {
        const strength = (threshold - d) / threshold;
        sepX += (ex / d) * strength * speed * 2.2;
        sepY += (ey / d) * strength * speed * 2.2;
      }
    }

    // ── 3. Wall avoidance — probe ahead in current travel direction ───────────
    let wallX = 0;
    let wallY = 0;
    const currentLen = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 1;
    const fdx = this.vx / currentLen;
    const fdy = this.vy / currentLen;

    // Three whiskers: forward, and ±45°
    const whiskers = [
      { nx: fdx,                      ny: fdy,                      w: 3.0 },
      { nx: fdx * 0.707 - fdy * 0.707, ny: fdx * 0.707 + fdy * 0.707, w: 1.5 },
      { nx: fdx * 0.707 + fdy * 0.707, ny: -fdx * 0.707 + fdy * 0.707, w: 1.5 },
    ];

    for (const wh of whiskers) {
      const wlen = Math.sqrt(wh.nx * wh.nx + wh.ny * wh.ny) || 1;
      const wnx = wh.nx / wlen;
      const wny = wh.ny / wlen;
      for (let step = 1; step <= 3; step++) {
        const px = cx + wnx * WALL_LOOK_AHEAD * step / 3;
        const py = cy + wny * WALL_LOOK_AHEAD * step / 3;
        for (const s of statics) {
          if (px > s.x && px < s.x + s.width && py > s.y && py < s.y + s.height) {
            const wx = cx - (s.x + s.width / 2);
            const wy = cy - (s.y + s.height / 2);
            const wd = Math.sqrt(wx * wx + wy * wy) || 1;
            const stepW = (4 - step); // closer probes count more
            wallX += (wx / wd) * stepW * wh.w * speed * 1.6;
            wallY += (wy / wd) * stepW * wh.w * speed * 1.6;
          }
        }
      }
    }

    // ── 4. Wander — small random angle drift ──────────────────────────────────
    this.wanderAngle += (Math.random() - 0.5) * 0.45;
    const wanderX = Math.cos(this.wanderAngle) * wanderStrength * speed;
    const wanderY = Math.sin(this.wanderAngle) * wanderStrength * speed;

    // ── 5. Combine all forces, normalise to speed ─────────────────────────────
    const fx = seekX + sepX + wallX + wanderX;
    const fy = seekY + sepY + wallY + wanderY;
    const flen = Math.sqrt(fx * fx + fy * fy) || 1;
    const targetVx = (fx / flen) * speed;
    const targetVy = (fy / flen) * speed;

    // Lerp current velocity toward target (turnRate controls how quickly)
    this.vx += (targetVx - this.vx) * turnRate;
    this.vy += (targetVy - this.vy) * turnRate;

    // ── 6. Move with wall sliding ─────────────────────────────────────────────
    if (this.wouldCollide(this.vx, 0, statics)) {
      this.vx *= -0.15; // small bounce to unstick from corners
    } else {
      this.x += this.vx;
    }
    if (this.wouldCollide(0, this.vy, statics)) {
      this.vy *= -0.15;
    } else {
      this.y += this.vy;
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
