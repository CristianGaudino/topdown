import { Bullet, BulletSource } from './Bullet';
import { Rect } from '../systems/Collision';
import { Particle } from './Particle';

export type GunType = 'rifle' | 'smg' | 'sniper' | 'shotgun' | 'sprinkler';

interface GunStats {
  width: number;
  height: number;
  speed: number;
  damage: number;
  cooldown: number; // frames
  color: string | string[];
}

const GUN_STATS: Record<GunType, GunStats> = {
  rifle:     { width: 6, height: 6, speed: 8,  damage: 8,  cooldown: 40,  color: '#003580' },
  smg:       { width: 5, height: 5, speed: 8,  damage: 4,  cooldown: 15,  color: '#27ae60' },
  sniper:    { width: 6, height: 6, speed: 15, damage: 25, cooldown: 90,  color: '#7f4f24' },
  shotgun:   { width: 6, height: 6, speed: 4,  damage: 15, cooldown: 45,  color: '#c0392b' },
  sprinkler: { width: 5, height: 5, speed: 8,  damage: 3,  cooldown: 2,   color: [] },
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
  private sprinklerAngle = 0; // degrees, 4 guns rotating

  constructor(type: GunType, source: BulletSource) {
    this.type = type;
    this.source = source;
  }

  canFire(): boolean {
    return this.cooldownTimer <= 0;
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
  ): Bullet[] {
    if (!this.canFire()) return [];

    const stats = GUN_STATS[this.type];
    const bullets: Bullet[] = [];

    const make = (tx: number, ty: number, color: string) =>
      new Bullet(
        fromX, fromY, stats.width, stats.height,
        tx, ty, stats.speed, stats.damage, color,
        this.source, getStatics, getEnemyTargets, getPlayerTarget, spawnParticles,
      );

    if (this.type === 'shotgun') {
      // 3 pellets — main + two spread around target
      const dx = targetX - fromX;
      const dy = targetY - fromY;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      const spread = 60;
      bullets.push(make(targetX, targetY, stats.color as string));
      bullets.push(make(targetX + px * spread, targetY + py * spread, stats.color as string));
      bullets.push(make(targetX - px * spread, targetY - py * spread, stats.color as string));
    } else if (this.type === 'sprinkler') {
      // 4 bullets rotating in a spiral pattern
      const color = RAINBOW[this.rainbowIndex % RAINBOW.length];
      this.rainbowIndex++;
      for (let i = 0; i < 4; i++) {
        const angleDeg = this.sprinklerAngle + i * 90;
        const rad = (angleDeg * Math.PI) / 180;
        bullets.push(make(fromX + Math.cos(rad) * 100, fromY + Math.sin(rad) * 100, color));
      }
      this.sprinklerAngle = (this.sprinklerAngle + 3) % 360;
    } else {
      bullets.push(make(targetX, targetY, stats.color as string));
    }

    this.cooldownTimer = GUN_STATS[this.type].cooldown;
    return bullets;
  }
}
