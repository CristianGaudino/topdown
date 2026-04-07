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

export type Direction  = 'up' | 'down' | 'left' | 'right';
export type RoomRole   = 'start' | 'combat' | 'elite' | 'loot' | 'boss';
export type LayoutType = 'open' | 'pillars' | 'cross' | 'cover-field' | 'bunker' | 'corridor' | 'arena';

const WALL_COLOR = '#2c3e50';
const BORDER = 30;

function buildDoorMats(cw: number, ch: number): Rectangle[] {
  return [
    new Rectangle(BORDER,             ch / 2 - 80,       180, 160, 'transparent'),
    new Rectangle(cw - BORDER - 180,  ch / 2 - 80,       180, 160, 'transparent'),
    new Rectangle(cw / 2 - 80,        BORDER,             160, 180, 'transparent'),
    new Rectangle(cw / 2 - 80,        ch - BORDER - 180,  160, 180, 'transparent'),
  ];
}

const PICKUPABLE_GUNS: GunType[] = ['rifle', 'smg', 'sniper', 'shotgun'];

export class Room {
  readonly row: number;
  readonly col: number;
  readonly role: RoomRole;

  upNeighbour:    Room | null = null;
  downNeighbour:  Room | null = null;
  leftNeighbour:  Room | null = null;
  rightNeighbour: Room | null = null;

  readonly topWall:    Border;
  readonly bottomWall: Border;
  readonly leftWall:   Border;
  readonly rightWall:  Border;

  walls:        Wall[]        = [];
  staticColliders: Rect[]     = [];
  enemies:      Enemy[]       = [];
  bullets:      Bullet[]      = [];
  particles:    Particle[]    = [];
  pickups:      Pickup[]      = [];
  damageNumbers: DamageNumber[] = [];
  heroPresent: Hero | null = null;
  locked  = false;
  visited = false;

  private readonly doorMats: Rectangle[];
  private readonly cw: number;
  private readonly ch: number;

  private onEnemyKilled:    ((x: number, y: number, gunType: GunType, isBoss: boolean) => void) | null = null;
  private onPlayerDamaged:  ((dmg: number, x: number, y: number) => void) | null = null;
  private onPlayerKilled:   (() => void) | null = null;
  private onPlayerTouched:  (() => void) | null = null;
  private onPickupCollected: ((type: PickupType, gunType?: GunType) => void) | null = null;

  constructor(
    row: number, col: number,
    cw: number, ch: number,
    role: RoomRole, layout: LayoutType,
    up: GateStatus, down: GateStatus, left: GateStatus, right: GateStatus,
  ) {
    this.row  = row;
    this.col  = col;
    this.cw   = cw;
    this.ch   = ch;
    this.role = role;

    this.topWall    = new Border(BORDER,        0,           cw - BORDER, BORDER, WALL_COLOR, up);
    this.bottomWall = new Border(BORDER,        ch - BORDER, cw - BORDER, BORDER, WALL_COLOR, down);
    this.leftWall   = new Border(0,             0,           BORDER,      ch,     WALL_COLOR, left);
    this.rightWall  = new Border(cw - BORDER,   0,           BORDER,      ch,     WALL_COLOR, right);

    this.doorMats = buildDoorMats(cw, ch);
    this.walls    = this.buildLayout(layout);
    this.rebuildStaticColliders();
  }

  // ── Layout generation ───────────────────────────────────────────────────────

  private buildLayout(layout: LayoutType): Wall[] {
    const B  = BORDER;
    const iW = this.cw - 2 * B; // interior width
    const iH = this.ch - 2 * B; // interior height

    // Convert fractional interior coordinates to an absolute wall spec.
    // All positions are manually verified against door-mat zones for 1200×675.
    const w = (fx: number, fy: number, t: 0 | 1): [number, number, 0 | 1] =>
      [Math.round(B + fx * iW), Math.round(B + fy * iH), t];

    type Spec = [number, number, 0 | 1];
    let specs: Spec[];

    switch (layout) {

      case 'open':
        // Two sparse walls — used for start and loot rooms
        specs = [
          w(0.08, 0.12, 0),   // upper-left
          w(0.74, 0.74, 0),   // lower-right
        ];
        break;

      case 'pillars':
        // Two columns of three vertical pillars — structured sightlines, clear flanking
        specs = [
          w(0.17, 0.14, 1), w(0.80, 0.14, 1),
          w(0.17, 0.44, 1), w(0.80, 0.44, 1),
          w(0.17, 0.70, 1), w(0.80, 0.70, 1),
        ];
        break;

      case 'cross':
        // Horizontal arms left+right of centre, vertical arms above+below centre.
        // Gap in the middle forces movement decisions.
        specs = [
          w(0.18, 0.46, 0), w(0.32, 0.46, 0),  // left horizontal arm
          w(0.58, 0.46, 0), w(0.72, 0.46, 0),  // right horizontal arm
          w(0.47, 0.30, 1),                      // upper vertical arm
          w(0.47, 0.51, 1),                      // lower vertical arm
        ];
        break;

      case 'cover-field':
        // Scattered L/T-shaped cover clusters — asymmetric, tactical
        specs = [
          w(0.18, 0.18, 0), w(0.18, 0.18, 1),  // L-shape top-left
          w(0.58, 0.12, 0),                      // mid-top bar
          w(0.74, 0.34, 1), w(0.74, 0.34, 0),  // L-shape right
          w(0.22, 0.62, 0),                      // left-bottom bar
          w(0.72, 0.68, 1),                      // lower-right pillar
        ];
        break;

      case 'bunker':
        // Dense cover on one side, open sightlines on the other.
        // Favours snipers; forces player to push or hold position.
        specs = [
          w(0.18, 0.16, 0), w(0.18, 0.36, 0), w(0.18, 0.56, 0),  // left wall row
          w(0.30, 0.26, 1), w(0.30, 0.50, 1),                      // second layer
          w(0.72, 0.43, 0), w(0.72, 0.56, 0),                      // right light cover
        ];
        break;

      case 'corridor':
        // Zigzag walls create a winding path — tight, claustrophobic, favours SMGs
        specs = [
          w(0.16, 0.14, 1), w(0.16, 0.34, 0),   // left upper bend
          w(0.35, 0.30, 0),                        // centre-left wall
          w(0.50, 0.50, 1),                        // centre divider
          w(0.57, 0.18, 0), w(0.62, 0.32, 1),    // centre-right bend
          w(0.70, 0.50, 0), w(0.70, 0.67, 1),    // right lower bend
        ];
        break;

      case 'arena':
      default:
        // Cover stations around the perimeter, wide open centre — boss room
        specs = [
          w(0.12, 0.12, 1), w(0.80, 0.12, 1),   // top pillars
          w(0.12, 0.68, 1), w(0.80, 0.68, 1),   // bottom pillars
          w(0.20, 0.43, 0), w(0.72, 0.43, 0),   // side horizontal bars
          w(0.43, 0.32, 0), w(0.43, 0.55, 0),   // centre horizontal bars
        ];
        break;
    }

    return specs
      .map(([x, y, t]) => new Wall(x, y, t, WALL_COLOR))
      .filter(wall => !this.isOnDoorMat(wall));
  }

  // ── Initial pickups (start / loot rooms) ───────────────────────────────────

  spawnInitialPickups() {
    const cx = this.cw / 2;
    const cy = this.ch / 2;

    if (this.role === 'loot') {
      this.pickups.push(new Pickup(cx - 30, cy, 'health'));
      const gun = PICKUPABLE_GUNS[Math.floor(Math.random() * PICKUPABLE_GUNS.length)];
      this.pickups.push(new Pickup(cx + 20, cy, 'gun', gun));
    } else if (this.role === 'start') {
      // Two random non-rifle guns — gives the player a meaningful first choice
      const options = (['smg', 'sniper', 'shotgun'] as GunType[])
        .sort(() => Math.random() - 0.5);
      this.pickups.push(new Pickup(200, cy - 25, 'gun', options[0]));
      this.pickups.push(new Pickup(200, cy + 25, 'gun', options[1]));
    }
  }

  // ── Callbacks ───────────────────────────────────────────────────────────────

  setCallbacks(
    onEnemyKilled:    (x: number, y: number, gunType: GunType, isBoss: boolean) => void,
    onPlayerDamaged:  (dmg: number, x: number, y: number) => void,
    onPlayerKilled:   () => void,
    onPlayerTouched:  () => void,
    onPickupCollected:(type: PickupType, gunType?: GunType) => void,
  ) {
    this.onEnemyKilled    = onEnemyKilled;
    this.onPlayerDamaged  = onPlayerDamaged;
    this.onPlayerKilled   = onPlayerKilled;
    this.onPlayerTouched  = onPlayerTouched;
    this.onPickupCollected = onPickupCollected;
    this.refreshEnemyContexts();
  }

  private refreshEnemyContexts() {
    for (const e of this.enemies) e.ctx = this.buildEnemyContext(e);
  }

  private buildEnemyContext(enemy: Enemy) {
    return {
      getStatics:     () => this.staticColliders,
      getEnemies:     () => this.enemies,
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
      spawnBullet:    (b: Bullet) => this.bullets.push(b),
      spawnParticles: (p: Particle[]) => this.particles.push(...p),
      onKilled:       () => this.removeEnemy(enemy),
      onTouchPlayer:  () => {
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

  // ── Enemy management ────────────────────────────────────────────────────────

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

  // ── Gate management ─────────────────────────────────────────────────────────

  private lockGates() {
    this.locked = true;
    for (const w of [this.topWall, this.bottomWall, this.leftWall, this.rightWall]) {
      if (w.gateStatus === 'open') w.gateStatus = 'locked';
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

  // ── Update / Draw ────────────────────────────────────────────────────────────

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
    for (const w of this.walls)          w.draw(ctx);
    for (const e of this.enemies)        e.draw(ctx);
    for (const b of this.bullets)        b.draw(ctx);
    for (const p of this.particles)      p.draw(ctx);
    for (const p of this.pickups)        p.draw(ctx);
    for (const d of this.damageNumbers)  d.draw(ctx);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private isOnDoorMat(obj: Rect): boolean {
    return this.doorMats.some(m => testAABB(obj.x, obj.y, obj.width, obj.height, m));
  }

  private isOnAnyWall(obj: Rect): boolean {
    return this.walls.some(w => w.blocks.some(b => testAABB(obj.x, obj.y, obj.width, obj.height, b)));
  }

  get enemyCount() { return this.enemies.length; }
}
