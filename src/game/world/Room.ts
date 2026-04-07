import { Rectangle } from '../objects/Rectangle';
import { Border, GateStatus } from '../objects/Border';
import { Wall } from '../objects/Wall';
import { Bullet } from '../objects/Bullet';
import { Particle } from '../objects/Particle';
import { Pickup, PickupType } from '../objects/Pickup';
import { DamageNumber } from '../objects/DamageNumber';
import { Enemy } from '../objects/Enemy';
import { Hero } from '../objects/Hero';
import { Rect, testAABB } from '../systems/Collision';
import { GunType } from '../objects/Gun';

export type Direction = 'up' | 'down' | 'left' | 'right';

const WALL_COLOR = '#2c3e50';
const BORDER = 30;

function buildDoorMats(cw: number, ch: number): Rectangle[] {
  return [
    new Rectangle(BORDER, ch / 2 - 80, 180, 160, 'transparent'),
    new Rectangle(cw - BORDER - 180, ch / 2 - 80, 180, 160, 'transparent'),
    new Rectangle(cw / 2 - 80, BORDER, 160, 180, 'transparent'),
    new Rectangle(cw / 2 - 80, ch - BORDER - 180, 160, 180, 'transparent'),
  ];
}

const PICKUPABLE_GUNS: GunType[] = ['rifle', 'smg', 'sniper', 'shotgun'];

export class Room {
  row: number;
  col: number;

  upNeighbour: Room | null = null;
  downNeighbour: Room | null = null;
  leftNeighbour: Room | null = null;
  rightNeighbour: Room | null = null;

  readonly topWall: Border;
  readonly bottomWall: Border;
  readonly leftWall: Border;
  readonly rightWall: Border;

  walls: Wall[] = [];
  staticColliders: Rect[] = [];
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  particles: Particle[] = [];
  pickups: Pickup[] = [];
  damageNumbers: DamageNumber[] = [];
  heroPresent: Hero | null = null;
  locked = false;

  private doorMats: Rectangle[];
  private cw: number;
  private ch: number;

  private onEnemyKilled: ((x: number, y: number, gunType: GunType, isBoss: boolean) => void) | null = null;
  private onPlayerDamaged: ((dmg: number, x: number, y: number) => void) | null = null;
  private onPlayerKilled: (() => void) | null = null;
  private onPlayerTouched: (() => void) | null = null;
  private onPickupCollected: ((type: PickupType, gunType?: GunType) => void) | null = null;

  constructor(
    row: number, col: number,
    cw: number, ch: number,
    wallCount: number,
    up: GateStatus, down: GateStatus, left: GateStatus, right: GateStatus,
  ) {
    this.row = row;
    this.col = col;
    this.cw = cw;
    this.ch = ch;

    this.topWall    = new Border(BORDER, 0,           cw - BORDER, BORDER, WALL_COLOR, up);
    this.bottomWall = new Border(BORDER, ch - BORDER, cw - BORDER, BORDER, WALL_COLOR, down);
    this.leftWall   = new Border(0, 0,                BORDER, ch,          WALL_COLOR, left);
    this.rightWall  = new Border(cw - BORDER, 0,      BORDER, ch,          WALL_COLOR, right);

    this.doorMats = buildDoorMats(cw, ch);
    this.walls = this.generateWalls(wallCount);
    this.rebuildStaticColliders();
  }

  setCallbacks(
    onEnemyKilled: (x: number, y: number, gunType: GunType, isBoss: boolean) => void,
    onPlayerDamaged: (dmg: number, x: number, y: number) => void,
    onPlayerKilled: () => void,
    onPlayerTouched: () => void,
    onPickupCollected: (type: PickupType, gunType?: GunType) => void,
  ) {
    this.onEnemyKilled = onEnemyKilled;
    this.onPlayerDamaged = onPlayerDamaged;
    this.onPlayerKilled = onPlayerKilled;
    this.onPlayerTouched = onPlayerTouched;
    this.onPickupCollected = onPickupCollected;
    this.refreshEnemyContexts();
  }

  private refreshEnemyContexts() {
    for (const e of this.enemies) {
      e.ctx = this.buildEnemyContext(e);
    }
  }

  private buildEnemyContext(enemy: Enemy) {
    return {
      getStatics: () => this.staticColliders,
      getPlayerTarget: () =>
        this.heroPresent
          ? [{
              rect: this.heroPresent as Rect,
              onHit: (dmg: number, x: number, y: number) => {
                this.heroPresent!.takeDamage(dmg);
                this.onPlayerDamaged?.(dmg, x, y);
                if (this.heroPresent!.health <= 0) this.onPlayerKilled?.();
              },
            }]
          : [],
      spawnBullet: (b: Bullet) => this.bullets.push(b),
      spawnParticles: (p: Particle[]) => this.particles.push(...p),
      onKilled: () => this.removeEnemy(enemy),
      onTouchPlayer: () => {
        if (this.heroPresent) {
          const dmg = enemy.isBoss ? 30 : 20;
          this.heroPresent.takeDamage(dmg);
          const m = this.heroPresent.middle;
          this.onPlayerDamaged?.(dmg, m.x, m.y);
          if (this.heroPresent.health <= 0) this.onPlayerKilled?.();
        }
        this.onPlayerTouched?.();
      },
    };
  }

  addEnemy(enemy: Enemy) {
    enemy.ctx = this.buildEnemyContext(enemy);
    this.enemies.push(enemy);
  }

  private removeEnemy(enemy: Enemy) {
    const idx = this.enemies.indexOf(enemy);
    if (idx !== -1) {
      this.enemies.splice(idx, 1);
      this.tryDropPickup(enemy);
      this.onEnemyKilled?.(enemy.middle.x, enemy.middle.y, enemy.gunType, enemy.isBoss);
      if (this.enemies.length === 0) this.openGates();
    }
  }

  private tryDropPickup(enemy: Enemy) {
    if (enemy.isBoss) {
      // Boss always drops health + a gun pickup
      this.pickups.push(new Pickup(enemy.middle.x - 15, enemy.middle.y, 'health'));
      const gun = PICKUPABLE_GUNS[Math.floor(Math.random() * PICKUPABLE_GUNS.length)];
      this.pickups.push(new Pickup(enemy.middle.x + 15, enemy.middle.y, 'gun', gun));
      return;
    }

    const roll = Math.random();
    if (roll < 0.25) {
      this.pickups.push(new Pickup(enemy.middle.x, enemy.middle.y, 'health'));
    } else if (roll < 0.45) {
      const gun = PICKUPABLE_GUNS[Math.floor(Math.random() * PICKUPABLE_GUNS.length)];
      this.pickups.push(new Pickup(enemy.middle.x, enemy.middle.y, 'gun', gun));
    }
  }

  spawnEnemies(count: number, gunType: GunType, isBoss = false) {
    for (let i = 0; i < count; i++) {
      let attempts = 0;
      while (attempts < 60) {
        const x = Math.random() * (this.cw - BORDER * 2 - 48) + BORDER;
        const y = Math.random() * (this.ch - BORDER * 2 - 48) + BORDER;
        const e = new Enemy(x, y, gunType, isBoss);
        if (!this.isOnDoorMat(e) && !this.isOnAnyWall(e)) {
          this.addEnemy(e);
          break;
        }
        attempts++;
      }
    }
    if (this.enemies.length > 0) this.lockGates();
  }

  spawnDamageNumber(x: number, y: number, value: number, isHeal = false) {
    this.damageNumbers.push(new DamageNumber(x, y, value, isHeal));
  }

  private lockGates() {
    this.locked = true;
    for (const w of [this.topWall, this.bottomWall, this.leftWall, this.rightWall]) {
      if (w.gateStatus === 'open') {
        w.gateStatus = 'locked';
      }
    }
    this.rebuildStaticColliders();
  }

  openGates() {
    this.locked = false;
    for (const w of [this.topWall, this.bottomWall, this.leftWall, this.rightWall]) {
      if (w.gateStatus === 'locked') w.gateStatus = 'open';
    }
    this.rebuildStaticColliders();
  }

  openGate(dir: Direction) {
    this.wallByDir(dir).gateStatus = 'open';
    this.rebuildStaticColliders();
  }

  private wallByDir(dir: Direction): Border {
    switch (dir) {
      case 'up':    return this.topWall;
      case 'down':  return this.bottomWall;
      case 'left':  return this.leftWall;
      case 'right': return this.rightWall;
    }
  }

  rebuildStaticColliders() {
    this.staticColliders = [];
    for (const wall of this.walls) {
      for (const b of wall.blocks) this.staticColliders.push(b);
    }
    const addBorder = (b: Border) => {
      this.staticColliders.push(b.firstBlock, b.thirdBlock);
      if (b.gateStatus !== 'open') this.staticColliders.push(b.secondBlock);
    };
    addBorder(this.topWall);
    addBorder(this.bottomWall);
    addBorder(this.leftWall);
    addBorder(this.rightWall);
  }

  update(hero: Hero | null) {
    this.heroPresent = hero;
    const heroMid = hero ? hero.middle : null;

    for (const e of this.enemies) {
      if (heroMid) e.update(heroMid.x, heroMid.y);
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      this.bullets[i].update();
      if (this.bullets[i].stopped) this.bullets.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update();
      if (this.particles[i].stopped) this.particles.splice(i, 1);
    }

    for (const p of this.pickups) p.update();

    // Pickup collection
    if (hero) {
      for (const p of this.pickups) {
        if (p.collected) continue;
        if (testAABB(hero.x, hero.y, hero.width, hero.height, p)) {
          p.collected = true;
          this.onPickupCollected?.(p.type, p.gunType);
        }
      }
      this.pickups = this.pickups.filter(p => !p.collected);
    }

    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      this.damageNumbers[i].update();
      if (this.damageNumbers[i].stopped) this.damageNumbers.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.leftWall.draw(ctx);
    this.rightWall.draw(ctx);
    this.topWall.draw(ctx);
    this.bottomWall.draw(ctx);
    for (const w of this.walls) w.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    for (const p of this.particles) p.draw(ctx);
    for (const p of this.pickups) p.draw(ctx);
    for (const d of this.damageNumbers) d.draw(ctx);
  }

  private generateWalls(count: number): Wall[] {
    const walls: Wall[] = [];
    const placed: { x: number; y: number }[] = [];
    const MIN_GAP = 175;
    for (let i = 0; i < count; i++) {
      let attempts = 0;
      while (attempts < 60) {
        const type = Math.round(Math.random()) as 0 | 1;
        const x = Math.round(Math.random() * (this.cw - BORDER * 2 - 120) + BORDER);
        const y = Math.round(Math.random() * (this.ch - BORDER * 2 - 120) + BORDER);
        const candidate = new Wall(x, y, type, WALL_COLOR);
        const tooClose = placed.some(p => Math.abs(p.x - x) < MIN_GAP && Math.abs(p.y - y) < MIN_GAP);
        if (!tooClose && !this.isOnDoorMat(candidate)) {
          walls.push(candidate);
          placed.push({ x, y });
          break;
        }
        attempts++;
      }
    }
    return walls;
  }

  private isOnDoorMat(obj: Rect): boolean {
    return this.doorMats.some(m => testAABB(obj.x, obj.y, obj.width, obj.height, m));
  }

  private isOnAnyWall(obj: Rect): boolean {
    return this.walls.some(w => w.blocks.some(b => testAABB(obj.x, obj.y, obj.width, obj.height, b)));
  }

  get enemyCount() { return this.enemies.length; }
}
