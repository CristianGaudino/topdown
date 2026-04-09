import { Bullet, BulletSource } from './Bullet';
import { Rect } from '../systems/Collision';
import { Particle } from './Particle';

export type GunType = 'rifle' | 'smg' | 'sniper' | 'shotgun' | 'sprinkler';

interface GunStats {
  width: number;
  height: number;
  speed: number;
  enemySpeed: number;   // slower so the player can dodge
  damage: number;
  cooldown: number; // frames
  color: string | string[];
  enemyColor: string;   // brighter, distinct colour for enemy bullets
}

const GUN_STATS: Record<GunType, GunStats> = {
  rifle:     { width: 6, height: 6, speed: 9,  enemySpeed: 4.5, damage: 10, cooldown: 28, color: '#003580', enemyColor: '#ff5555' },
  smg:       { width: 5, height: 5, speed: 8,  enemySpeed: 4.0, damage: 4,  cooldown: 15, color: '#27ae60', enemyColor: '#55ff99' },
  sniper:    { width: 8, height: 4, speed: 15, enemySpeed: 7.0, damage: 25, cooldown: 90, color: '#7f4f24', enemyColor: '#ffcc44' },
  shotgun:   { width: 6, height: 6, speed: 4,  enemySpeed: 2.5, damage: 15, cooldown: 45, color: '#c0392b', enemyColor: '#ff8855' },
  sprinkler: { width: 5, height: 5, speed: 8,  enemySpeed: 4.5, damage: 3,  cooldown: 2,  color: [],        enemyColor: '' },
};

// Rainbow palette for sprinkler boss
const RAINBOW = [
  '#ff0000','#ff4000','#ff8000','#ffbf00','#ffff00','#bfff00',
  '#80ff00','#40ff00','#00ff00','#00ff40','#00ff80','#00ffbf',
  '#00ffff','#00bfff','#0080ff','#0040ff','#0000ff','#4000ff',
  '#8000ff','#bf00ff','#ff00ff','#ff00bf','#ff0080','#ff0040',
];

export class Gun {
  readonly type: GunType;
  readonly source: BulletSource;
  private cooldownTimer = 0;

  // Sprinkler state
  private rainbowIndex = 0;
  private sprinklerAngle = 0;

  constructor(type: GunType, source: BulletSource) {
    this.type = type;
    this.source = source;
  }

  canFire(): boolean {
    return this.cooldownTimer <= 0;
  }

  /** 0 = just fired / cooling down, 1 = fully charged and ready */
  get chargeFraction(): number {
    const max = GUN_STATS[this.type].cooldown;
    return max > 0 ? 1 - this.cooldownTimer / max : 1;
  }

  tick() {
    if (this.cooldownTimer > 0) this.cooldownTimer--;
  }

  fire(
    fromX: number,
    fromY: number,
    targetX: number,
    targetY: number,
    getStatics: () => Rect[],
    getEnemyTargets: () => Array<{ rect: Rect; onHit: (dmg: number, x: number, y: number) => void }>,
    getPlayerTarget: () => Array<{ rect: Rect; onHit: (dmg: number, x: number, y: number) => void }>,
    spawnParticles: (p: Particle[]) => void,
    damageMultiplier = 1,
    cooldownMultiplier = 1,
    pierce = 0,
    extraShots = 0,
  ): Bullet[] {
    if (!this.canFire()) return [];

    const stats    = GUN_STATS[this.type];
    const isEnemy  = this.source === 'enemy';
    const speed    = isEnemy ? stats.enemySpeed : stats.speed;
    // Enemy bullets are slightly larger so they're easier to see
    const bw = stats.width  + (isEnemy ? 2 : 0);
    const bh = stats.height + (isEnemy ? 2 : 0);

    const bullets: Bullet[] = [];

    const make = (tx: number, ty: number, color: string) =>
      new Bullet(
        fromX, fromY, bw, bh,
        tx, ty, speed, stats.damage * damageMultiplier, color,
        this.source, getStatics, getEnemyTargets, getPlayerTarget, spawnParticles, pierce,
      );

    const playerColor = stats.color as string;
    const baseColor   = isEnemy ? stats.enemyColor : playerColor;

    if (this.type === 'shotgun') {
      const dx    = targetX - fromX;
      const dy    = targetY - fromY;
      const base  = Math.atan2(dy, dx);
      const range = 300; // project target point at fixed distance so spread is angle-based
      const SPREAD_RAD = 0.30; // ±~17° per pellet
      for (let i = -1; i <= 1; i++) {
        const a = base + i * SPREAD_RAD;
        bullets.push(make(fromX + Math.cos(a) * range, fromY + Math.sin(a) * range, baseColor));
      }
    } else if (this.type === 'sprinkler') {
      const color = RAINBOW[this.rainbowIndex % RAINBOW.length];
      this.rainbowIndex++;
      for (let i = 0; i < 4; i++) {
        const angleDeg = this.sprinklerAngle + i * 90;
        const rad = (angleDeg * Math.PI) / 180;
        bullets.push(make(fromX + Math.cos(rad) * 100, fromY + Math.sin(rad) * 100, color));
      }
      this.sprinklerAngle = (this.sprinklerAngle + 3) % 360;
    } else {
      bullets.push(make(targetX, targetY, baseColor));
    }

    // Multishot: fire extra bullets at small angles around the main shot
    if (extraShots > 0 && this.source === 'player') {
      const dx  = targetX - fromX;
      const dy  = targetY - fromY;
      const base = Math.atan2(dy, dx);
      const range = 300;
      for (let i = 1; i <= extraShots; i++) {
        const spread = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 0.18;
        const a = base + spread;
        bullets.push(make(fromX + Math.cos(a) * range, fromY + Math.sin(a) * range, playerColor));
      }
    }

    this.cooldownTimer = Math.round(GUN_STATS[this.type].cooldown * cooldownMultiplier);
    return bullets;
  }
}
