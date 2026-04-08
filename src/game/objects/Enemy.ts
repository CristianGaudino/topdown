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
  preferredRange: number;
  turnRate: number;
  wanderStrength: number;
  behavior: BehaviorType;
}

const PROFILES: Record<GunType, EnemyProfile> = {
  rifle:     { width: 28, height: 28, color: '#922b21', label: 'R',  speed: 1.5, maxHealth: 50,  preferredRange: 200, turnRate: 0.12, wanderStrength: 0.25, behavior: 'seeker'  },
  smg:       { width: 22, height: 22, color: '#1a5e35', label: 'S',  speed: 2.2, maxHealth: 35,  preferredRange: 80,  turnRate: 0.22, wanderStrength: 0.50, behavior: 'charger' },
  sniper:    { width: 18, height: 34, color: '#6e4c1e', label: 'SN', speed: 0.9, maxHealth: 40,  preferredRange: 340, turnRate: 0.07, wanderStrength: 0.10, behavior: 'ranger'  },
  shotgun:   { width: 36, height: 30, color: '#a93226', label: 'SH', speed: 1.3, maxHealth: 70,  preferredRange: 110, turnRate: 0.09, wanderStrength: 0.15, behavior: 'charger' },
  sprinkler: { width: 48, height: 48, color: '#d35400', label: '★',  speed: 1.0, maxHealth: 400, preferredRange: 220, turnRate: 0.05, wanderStrength: 0.05, behavior: 'orbiter' },
};

const WALL_LOOK_AHEAD = 52;
const SEP_RADIUS      = 50;

const BOSS_PALETTE = [
  '#ff4444', '#ff8800', '#ffff00', '#88ff44',
  '#44ffff', '#4488ff', '#ff44ff', '#ffffff',
];

export interface EnemyContext {
  getStatics:      () => Rect[];
  getEnemies:      () => Enemy[];
  getPlayerTarget: () => Array<{ rect: Rect; onHit: (dmg: number, x: number, y: number) => void }>;
  spawnBullet:     (b: Bullet) => void;
  spawnParticles:  (p: Particle[]) => void;
  onKilled:        () => void;
  onTouchPlayer:   () => void;
}

export class Enemy extends Entity {
  readonly isBoss:   boolean;
  readonly gunType:  GunType;
  readonly profile:  EnemyProfile;
  private gun:       Gun;
  private touchCooldown = 0;

  // Velocity-based movement
  private vx = 0;
  private vy = 0;
  private wanderAngle = Math.random() * Math.PI * 2;
  private orbitSign   = Math.random() < 0.5 ? 1 : -1;

  // Stuck detection
  private stuckFrames = 0;
  private prevStuckX  = 0;
  private prevStuckY  = 0;

  // Speed multiplier (used for boss phase scaling)
  private speedMultiplier = 1.0;

  // Last known hero position (for draw rotation)
  private lastHeroX = 0;
  private lastHeroY = 0;

  // ── Boss-specific state ────────────────────────────────────────────────────
  private bossFireTimer      = 90;
  private bossBurstTimer     = 0;
  private bossChargeTimer    = 0;
  private bossChargeCooldown = 0;
  private bossChargeVx       = 0;
  private bossChargeVy       = 0;
  private bossPaletteIndex   = 0;
  private bossSprinklerAngle = 0;

  ctx!: EnemyContext;

  constructor(x: number, y: number, gunType: GunType, isBoss = false) {
    const profile = PROFILES[gunType];
    super(x, y, profile.width, profile.height, profile.color, profile.maxHealth);
    this.hostile  = true;
    this.isBoss   = isBoss;
    this.gunType  = gunType;
    this.profile  = profile;
    this.gun      = new Gun(gunType, 'enemy');
  }

  get bossPhase(): 1 | 2 | 3 {
    const pct = this.health / this.profile.maxHealth;
    if (pct > 0.66) return 1;
    if (pct > 0.33) return 2;
    return 3;
  }

  update(heroX: number, heroY: number) {
    if (!this.ctx) return;

    this.lastHeroX = heroX;
    this.lastHeroY = heroY;
    this.gun.tick();
    if (this.touchCooldown > 0) this.touchCooldown--;

    // Touch damage (all types)
    for (const t of this.ctx.getPlayerTarget()) {
      if (testAABB(this.x, this.y, this.width, this.height, t.rect)) {
        if (this.touchCooldown === 0) {
          this.touchCooldown = 60;
          this.ctx.onTouchPlayer();
        }
        break;
      }
    }

    if (this.isBoss) {
      this.updateBoss(heroX, heroY);
    } else {
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
  }

  // ── Boss update ─────────────────────────────────────────────────────────────

  private updateBoss(heroX: number, heroY: number) {
    const phase = this.bossPhase;

    // ── Firing ────────────────────────────────────────────────────────────────
    this.bossFireTimer--;
    if (this.bossFireTimer <= 0) {
      const cd = phase === 1 ? 90 : phase === 2 ? 60 : 40;
      this.bossFireTimer = cd;
      this.fireBossSpread(phase === 3 ? 8 : 4);
    }

    // Phase 2+: extra burst salvo
    if (phase >= 2) {
      this.bossBurstTimer--;
      if (this.bossBurstTimer <= 0) {
        this.bossBurstTimer = phase === 2 ? 180 : 110;
        this.fireBossSpread(8);
      }
    }

    // ── Movement ──────────────────────────────────────────────────────────────
    if (this.bossChargeTimer > 0) {
      // Charging straight at hero
      this.bossChargeTimer--;
      const statics = this.ctx.getStatics();
      if (!this.wouldCollide(this.bossChargeVx, 0, statics)) this.x += this.bossChargeVx;
      if (!this.wouldCollide(0, this.bossChargeVy, statics)) this.y += this.bossChargeVy;
      if (this.bossChargeTimer === 0) {
        this.bossChargeCooldown = phase === 2 ? 220 : 140;
      }
    } else if (phase >= 2) {
      if (this.bossChargeCooldown > 0) {
        this.bossChargeCooldown--;
      } else {
        // Start charge toward hero
        const dx = heroX - this.middle.x;
        const dy = heroY - this.middle.y;
        const d  = Math.sqrt(dx * dx + dy * dy) || 1;
        const spd = phase === 2 ? 5 : 7;
        this.bossChargeVx   = (dx / d) * spd;
        this.bossChargeVy   = (dy / d) * spd;
        this.bossChargeTimer = 28;
      }
      this.speedMultiplier = phase === 2 ? 1.4 : 1.8;
      this.steer(heroX, heroY);
    } else {
      this.speedMultiplier = 1.0;
      this.steer(heroX, heroY);
    }
  }

  private fireBossSpread(count: number) {
    const cx    = this.middle.x;
    const cy    = this.middle.y;
    const color = BOSS_PALETTE[this.bossPaletteIndex % BOSS_PALETTE.length];
    this.bossPaletteIndex++;
    const base = this.bossSprinklerAngle;
    this.bossSprinklerAngle = (this.bossSprinklerAngle + 22.5) % 360;

    for (let i = 0; i < count; i++) {
      const angle = (base + (360 / count) * i) * (Math.PI / 180);
      const b = new Bullet(
        cx - 5, cy - 5, 10, 10,
        cx + Math.cos(angle) * 200,
        cy + Math.sin(angle) * 200,
        5, 10, color,
        'enemy',
        this.ctx.getStatics,
        () => [],
        this.ctx.getPlayerTarget,
        this.ctx.spawnParticles,
      );
      this.ctx.spawnBullet(b);
    }
  }

  // ── Steering ────────────────────────────────────────────────────────────────

  private steer(heroX: number, heroY: number) {
    const statics = this.ctx.getStatics();
    const enemies = this.ctx.getEnemies();
    const { speed: baseSpeed, preferredRange, turnRate, wanderStrength, behavior } = this.profile;
    const speed = baseSpeed * this.speedMultiplier;
    const cx = this.middle.x;
    const cy = this.middle.y;

    const dx   = heroX - cx;
    const dy   = heroY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // ── 1. Primary intention ───────────────────────────────────────────────────
    let seekX = 0;
    let seekY = 0;

    if (behavior === 'orbiter') {
      const tangentX  = (-dy / dist) * this.orbitSign;
      const tangentY  = ( dx / dist) * this.orbitSign;
      const rangeErr  = dist - preferredRange;
      const radialStr = Math.min(Math.abs(rangeErr) / preferredRange, 1);
      const radialX   = (dx / dist) * Math.sign(rangeErr) * radialStr;
      const radialY   = (dy / dist) * Math.sign(rangeErr) * radialStr;
      seekX = (tangentX * 0.78 + radialX * 0.22) * speed;
      seekY = (tangentY * 0.78 + radialY * 0.22) * speed;

    } else if (behavior === 'ranger') {
      if (dist < preferredRange * 0.75) {
        const strafeX = -dy / dist;
        const strafeY =  dx / dist;
        seekX = ((-dx / dist) * 0.65 + strafeX * 0.35) * speed;
        seekY = ((-dy / dist) * 0.65 + strafeY * 0.35) * speed;
      } else if (dist > preferredRange * 1.35) {
        seekX = (dx / dist) * speed;
        seekY = (dy / dist) * speed;
      } else {
        const strafeX = -dy / dist;
        const strafeY =  dx / dist;
        seekX = strafeX * speed * 0.85;
        seekY = strafeY * speed * 0.85;
      }

    } else {
      if (dist > preferredRange) {
        seekX = (dx / dist) * speed;
        seekY = (dy / dist) * speed;
      } else {
        const excess = (preferredRange - dist) / preferredRange;
        seekX = (-dx / dist) * speed * excess * 0.4;
        seekY = (-dy / dist) * speed * excess * 0.4;
      }
    }

    // ── 2. Separation ─────────────────────────────────────────────────────────
    let sepX = 0;
    let sepY = 0;
    for (const e of enemies) {
      if (e === this) continue;
      const ex = cx - e.middle.x;
      const ey = cy - e.middle.y;
      const d  = Math.sqrt(ex * ex + ey * ey) || 1;
      const threshold = SEP_RADIUS + (this.width + e.width) * 0.3;
      if (d < threshold) {
        const strength = (threshold - d) / threshold;
        sepX += (ex / d) * strength * speed * 2.2;
        sepY += (ey / d) * strength * speed * 2.2;
      }
    }

    // ── 3. Wall avoidance whiskers ─────────────────────────────────────────────
    let wallX = 0;
    let wallY = 0;
    const curLen = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 1;
    const fdx = this.vx / curLen;
    const fdy = this.vy / curLen;

    const whiskers = [
      { nx: fdx,                        ny: fdy,                        w: 3.0 },
      { nx: fdx * 0.707 - fdy * 0.707,  ny: fdx * 0.707 + fdy * 0.707, w: 1.5 },
      { nx: fdx * 0.707 + fdy * 0.707,  ny: -fdx * 0.707 + fdy * 0.707, w: 1.5 },
    ];

    for (const wh of whiskers) {
      const wlen = Math.sqrt(wh.nx * wh.nx + wh.ny * wh.ny) || 1;
      const wnx  = wh.nx / wlen;
      const wny  = wh.ny / wlen;
      for (let step = 1; step <= 3; step++) {
        const px = cx + wnx * WALL_LOOK_AHEAD * step / 3;
        const py = cy + wny * WALL_LOOK_AHEAD * step / 3;
        for (const s of statics) {
          if (px > s.x && px < s.x + s.width && py > s.y && py < s.y + s.height) {
            const wx = cx - (s.x + s.width  / 2);
            const wy = cy - (s.y + s.height / 2);
            const wd = Math.sqrt(wx * wx + wy * wy) || 1;
            const sw = (4 - step);
            wallX += (wx / wd) * sw * wh.w * speed * 1.8;
            wallY += (wy / wd) * sw * wh.w * speed * 1.8;
          }
        }
      }
    }

    // ── 4. Wander ─────────────────────────────────────────────────────────────
    this.wanderAngle += (Math.random() - 0.5) * 0.45;
    const wanderX = Math.cos(this.wanderAngle) * wanderStrength * speed;
    const wanderY = Math.sin(this.wanderAngle) * wanderStrength * speed;

    // ── 5. Combine ────────────────────────────────────────────────────────────
    const fx   = seekX + sepX + wallX + wanderX;
    const fy   = seekY + sepY + wallY + wanderY;
    const flen = Math.sqrt(fx * fx + fy * fy) || 1;
    const targetVx = (fx / flen) * speed;
    const targetVy = (fy / flen) * speed;

    this.vx += (targetVx - this.vx) * turnRate;
    this.vy += (targetVy - this.vy) * turnRate;

    // ── 6. Stuck detection — escape kick ──────────────────────────────────────
    const moved = Math.hypot(this.x - this.prevStuckX, this.y - this.prevStuckY);
    if (moved < 0.25 && Math.hypot(this.vx, this.vy) > 0.2) {
      this.stuckFrames++;
      if (this.stuckFrames > 22) {
        const kickAngle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(kickAngle) * speed * 3;
        this.vy = Math.sin(kickAngle) * speed * 3;
        this.stuckFrames = 0;
      }
    } else {
      this.stuckFrames = 0;
    }
    this.prevStuckX = this.x;
    this.prevStuckY = this.y;

    // ── 7. Move with wall sliding ──────────────────────────────────────────────
    if (this.wouldCollide(this.vx, 0, statics)) {
      this.vx = 0; // zero out so wander can redirect next frame
    } else {
      this.x += this.vx;
    }
    if (this.wouldCollide(0, this.vy, statics)) {
      this.vy = 0;
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

  // ── Draw ────────────────────────────────────────────────────────────────────

  draw(ctx: CanvasRenderingContext2D) {
    const angle = Math.atan2(this.lastHeroY - this.middle.y, this.lastHeroX - this.middle.x);
    const cx = this.middle.x;
    const cy = this.middle.y;
    const hw = this.width  / 2;
    const hh = this.height / 2;

    // Damage flash
    const flashing = this.damageFlashTimer > 0;
    if (flashing) this.damageFlashTimer--;

    // Health bar (unrotated)
    const pct = Math.max(0, this.health / this.profile.maxHealth);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(this.x, this.y - 7, this.width, 4);
    ctx.fillStyle = pct > 0.5 ? '#27ae60' : pct > 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(this.x, this.y - 7, this.width * pct, 4);

    // Boss glow ring (unrotated)
    if (this.isBoss) {
      ctx.save();
      ctx.strokeStyle = this.bossPhase === 3 ? '#ff4444' : this.bossPhase === 2 ? '#ff8800' : '#f39c12';
      ctx.lineWidth   = 3;
      ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.006) * 0.5;
      ctx.strokeRect(this.x - 4, this.y - 4, this.width + 8, this.height + 8);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    const bodyColor = flashing ? '#e74c3c' : this.profile.color;
    ctx.fillStyle = bodyColor;

    switch (this.gunType) {
      case 'smg': {
        // Small rounded circle-ish body
        ctx.beginPath();
        ctx.arc(0, 0, hw, 0, Math.PI * 2);
        ctx.fill();
        // Forward nub
        ctx.fillStyle = flashing ? '#ff9999' : '#aaffcc';
        ctx.fillRect(hw - 3, -3, 7, 6);
        break;
      }
      case 'sniper': {
        // Tall thin body
        ctx.fillRect(-hw, -hh, this.width, this.height);
        // Long barrel along facing direction
        ctx.fillStyle = flashing ? '#ff9999' : '#c8a97a';
        ctx.fillRect(hw - 2, -2, 14, 4);
        break;
      }
      case 'shotgun': {
        // Wide squat body
        ctx.fillRect(-hw, -hh, this.width, this.height);
        // Double barrel dots
        ctx.fillStyle = flashing ? '#ff9999' : '#ffaaaa';
        ctx.fillRect(hw - 2, -hh + 4, 8, 5);
        ctx.fillRect(hw - 2,  hh - 9, 8, 5);
        break;
      }
      case 'sprinkler': {
        // Boss: octagonal body
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
          const r = hw * 0.92;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else         ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        // Phase-coloured spinning indicator arms
        const armColor = BOSS_PALETTE[Math.floor(Date.now() / 150) % BOSS_PALETTE.length];
        ctx.strokeStyle = armColor;
        ctx.lineWidth   = 3;
        const spinAngle = (Date.now() * 0.003) % (Math.PI * 2);
        for (let i = 0; i < 4; i++) {
          const a = spinAngle + (i / 4) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * hw * 0.7, Math.sin(a) * hw * 0.7);
          ctx.stroke();
        }
        break;
      }
      default: {
        // rifle / fallback: square with visor stripe
        ctx.fillRect(-hw, -hh, this.width, this.height);
        ctx.fillStyle = flashing ? '#ff9999' : 'rgba(255,255,255,0.4)';
        ctx.fillRect(-hw + 2, -4, this.width - 4, 8);
        // Forward nub
        ctx.fillStyle = flashing ? '#ff9999' : '#cc6666';
        ctx.fillRect(hw - 2, -3, 8, 6);
        break;
      }
    }

    // Centre dot / label
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `bold ${this.isBoss ? 10 : 8}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.profile.label, 0, 0);

    ctx.restore();
  }
}
