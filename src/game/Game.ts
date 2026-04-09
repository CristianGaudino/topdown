import { GameLoop } from './engine/GameLoop';
import { InputManager, VirtualInput } from './engine/InputManager';
import { Hero, HeroUpgradeType } from './objects/Hero';
import { RoomMap } from './world/RoomMap';
import { GunType } from './objects/Gun';
import { PickupType } from './objects/Pickup';
import { RoomRole } from './world/Room';

export type GameStatus = 'playing' | 'paused' | 'won' | 'lost' | 'upgrade';

export interface RunStats {
  kills: number;
  damageTaken: number;
  healthPickedUp: number;
  gunsPickedUp: number;
  shotsFired: number;
  shotsHit: number;
}

export interface UpgradeOption {
  type: HeroUpgradeType;
  label: string;
  description: string;
  icon: string;
}

export interface GameState {
  heroHealth: number;
  heroMaxHealth: number;
  heroX: number;       // canvas-space, used by mobile aim
  heroY: number;
  heroGun: GunType;
  enemiesRemaining: number;
  status: GameStatus;
  currentRoomRow: number;
  currentRoomCol: number;
  mapRooms: { row: number; col: number; isCurrent: boolean; hasEnemies: boolean; role: RoomRole }[];
  dashCooldownFraction: number;
  stats: RunStats;
  pendingUpgrades: UpgradeOption[] | null;
  bossHealth: { current: number; max: number; phase: 1 | 2 | 3 } | null;
}

const HEAL_AMOUNT = 30;

const UPGRADE_POOL: UpgradeOption[] = [
  { type: 'maxHealth',    label: 'Reinforced',    description: '+25 max HP, restored for 25', icon: '❤' },
  { type: 'dashCooldown', label: 'Swift Feet',     description: 'Dash cooldown −30%',          icon: '⚡' },
  { type: 'damage',       label: 'High Caliber',   description: '+25% bullet damage',          icon: '💥' },
  { type: 'fireRate',     label: 'Rapid Fire',      description: '+20% fire rate',              icon: '🔫' },
  { type: 'moveSpeed',    label: 'Adrenaline',      description: '+0.5 movement speed',         icon: '👟' },
];

function generateUpgrades(): UpgradeOption[] {
  const pool = [...UPGRADE_POOL].sort(() => Math.random() - 0.5);
  return pool.slice(0, 3);
}

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop: GameLoop;
  private input: InputManager;
  private hero: Hero;
  private map: RoomMap;
  private status: GameStatus = 'playing';
  private onStateChange: (state: GameState) => void;
  private stats: RunStats = { kills: 0, damageTaken: 0, healthPickedUp: 0, gunsPickedUp: 0, shotsFired: 0, shotsHit: 0 };
  private shakeIntensity = 0;
  private shakeDuration  = 0;
  private flashTimer     = 0;
  private pendingUpgrades: UpgradeOption[] | null = null;

  constructor(canvas: HTMLCanvasElement, onStateChange: (state: GameState) => void) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d')!;
    this.onStateChange = onStateChange;

    this.map = new RoomMap(canvas.width, canvas.height, {
      onEnemyKilled:     (x, y, gunType, isBoss) => this.handleEnemyKilled(x, y, gunType, isBoss),
      onPlayerDamaged:   (dmg, x, y)             => this.handlePlayerDamaged(dmg, x, y),
      onPlayerKilled:    ()                        => this.handlePlayerDied(),
      onPlayerTouched:   ()                        => {},
      onPickupCollected: (type, gunType)           => this.handlePickupCollected(type, gunType),
    });

    this.hero = new Hero(80, canvas.height / 2 - 14);
    this.wireHeroToRoom();
    this.map.currentRoom.heroPresent = this.hero;
    this.map.currentRoom.visited     = true;

    this.input = new InputManager(canvas);
    this.input.setPauseCallback(() => this.togglePause());

    this.loop = new GameLoop(() => this.tick());
  }

  start() {
    this.loop.start();
  }

  stop() {
    this.loop.stop();
    this.input.destroy();
  }

  restart() {
    this.stop();
    this.status         = 'playing';
    this.pendingUpgrades = null;
    this.stats           = { kills: 0, damageTaken: 0, healthPickedUp: 0, gunsPickedUp: 0, shotsFired: 0, shotsHit: 0 };

    this.map = new RoomMap(this.canvas.width, this.canvas.height, {
      onEnemyKilled:     (x, y, gunType, isBoss) => this.handleEnemyKilled(x, y, gunType, isBoss),
      onPlayerDamaged:   (dmg, x, y)             => this.handlePlayerDamaged(dmg, x, y),
      onPlayerKilled:    ()                        => this.handlePlayerDied(),
      onPlayerTouched:   ()                        => {},
      onPickupCollected: (type, gunType)           => this.handlePickupCollected(type, gunType),
    });

    this.hero = new Hero(80, this.canvas.height / 2 - 14);
    this.wireHeroToRoom();
    this.map.currentRoom.heroPresent = this.hero;
    this.map.currentRoom.visited     = true;
    this.flashTimer = 0;

    this.input = new InputManager(this.canvas);
    this.input.setPauseCallback(() => this.togglePause());

    this.loop = new GameLoop(() => this.tick());
    this.loop.start();
  }

  resume() {
    if (this.status === 'paused') {
      this.status = 'playing';
      this.emitState();
    }
  }

  pause() {
    if (this.status === 'playing') {
      this.status = 'paused';
      this.emitState();
    }
  }

  /** Called every frame by MobileControls to inject joystick/button state. */
  setVirtualInput(v: Partial<VirtualInput>) {
    this.input.setVirtual(v);
  }

  /** Called by GameCanvas when player clicks an upgrade card in the loot room overlay. */
  selectUpgrade(index: number) {
    if (this.status !== 'upgrade' || !this.pendingUpgrades) return;
    const chosen = this.pendingUpgrades[index];
    if (!chosen) return;
    this.hero.applyUpgrade(chosen.type);
    this.pendingUpgrades = null;
    this.status = 'playing';
    this.emitState();
  }

  private togglePause() {
    if (this.status === 'playing') {
      this.status = 'paused';
      this.emitState();
    } else if (this.status === 'paused') {
      this.status = 'playing';
      this.emitState();
    }
  }

  private wireHeroToRoom() {
    const room = this.map.currentRoom;
    this.hero.getStatics      = () => room.staticColliders;
    this.hero.getEnemyTargets = () =>
      room.enemies.map(e => ({
        rect: e,
        onHit: (dmg: number, x: number, y: number) => {
          this.stats.shotsHit++;
          e.takeDamage(dmg);
          room.spawnDamageNumber(x, y, dmg, false);
          if (e.health <= 0) e.ctx.onKilled();
        },
      }));
    this.hero.spawnBullet    = b => { this.stats.shotsFired++; room.bullets.push(b); };
    this.hero.spawnParticles = p => room.particles.push(...p);
  }

  private tick() {
    if (this.status !== 'playing') return;

    const room  = this.map.currentRoom;
    const input = this.input.get();

    this.hero.update(input);
    this.checkRoomTransition();
    room.update(this.hero);

    this.draw();
    this.emitState();
  }

  private checkRoomTransition() {
    const h      = this.hero;
    const cw     = this.canvas.width;
    const ch     = this.canvas.height;
    const room   = this.map.currentRoom;
    const BORDER = 30;

    let nextRoom = null;
    let newX = h.x;
    let newY = h.y;

    if      (h.x < 0               && room.leftNeighbour)  { nextRoom = room.leftNeighbour;  newX = cw - BORDER - h.width - 2; }
    else if (h.x + h.width > cw    && room.rightNeighbour) { nextRoom = room.rightNeighbour; newX = BORDER + 2; }
    else if (h.y < 0               && room.upNeighbour)    { nextRoom = room.upNeighbour;    newY = ch - BORDER - h.height - 2; }
    else if (h.y + h.height > ch   && room.downNeighbour)  { nextRoom = room.downNeighbour;  newY = BORDER + 2; }

    if (nextRoom) {
      const isFirstVisit = !nextRoom.visited;
      room.heroPresent = null;
      this.map.currentRoom = nextRoom;
      h.x = newX;
      h.y = newY;
      nextRoom.heroPresent = h;
      nextRoom.visited     = true;
      this.flashTimer      = 10;
      this.wireHeroToRoom();

      // Show upgrade picker on first visit to a loot room
      if (isFirstVisit && nextRoom.role === 'loot') {
        this.pendingUpgrades = generateUpgrades();
        this.status          = 'upgrade';
        this.emitState();
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleEnemyKilled(_x: number, _y: number, _gunType: GunType, _isBoss: boolean) {
    this.stats.kills++;
    this.map.totalEnemies--;
    if (this.map.totalEnemies <= 0 && this.status === 'playing') {
      this.status = 'won';
      this.emitState();
    }
  }

  private handlePlayerDamaged(dmg: number, x: number, y: number) {
    this.stats.damageTaken += dmg;
    this.map.currentRoom.spawnDamageNumber(x, y, dmg, false);
    this.shakeIntensity = Math.min(10, 3 + dmg * 0.15);
    this.shakeDuration  = Math.round(8 + dmg * 0.2);
    this.hero.applyKnockback(x, y);
  }

  private handlePlayerDied() {
    if (this.status === 'playing') {
      this.status = 'lost';
      this.emitState();
    }
  }

  private handlePickupCollected(type: PickupType, gunType?: GunType) {
    if (type === 'health') {
      const healed = Math.min(HEAL_AMOUNT, this.hero.maxHealth - this.hero.health);
      this.hero.health = Math.min(this.hero.maxHealth, this.hero.health + HEAL_AMOUNT);
      this.stats.healthPickedUp++;
      if (healed > 0) {
        const m = this.hero.middle;
        this.map.currentRoom.spawnDamageNumber(m.x, m.y - 20, healed, true);
      }
    } else if (type === 'gun' && gunType) {
      this.hero.equipGun(gunType);
      this.stats.gunsPickedUp++;
    }
    this.emitState();
  }

  private draw() {
    const ctx  = this.ctx;
    const room = this.map.currentRoom;

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeDuration > 0) {
      shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeDuration--;
      this.shakeIntensity *= 0.88;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    ctx.fillStyle = '#0e7c6b';
    ctx.fillRect(-10, -10, this.canvas.width + 20, this.canvas.height + 20);

    room.draw(ctx);
    this.hero.draw(ctx);

    // Low-health vignette
    const healthPct = this.hero.health / this.hero.maxHealth;
    if (healthPct < 0.4) {
      const intensity = (0.4 - healthPct) / 0.4;
      const pulse     = (Math.sin(Date.now() * 0.004) + 1) / 2;
      const alpha     = intensity * (0.15 + pulse * 0.25);
      const grad      = ctx.createRadialGradient(
        this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.2,
        this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.8,
      );
      grad.addColorStop(0, 'rgba(180,0,0,0)');
      grad.addColorStop(1, `rgba(180,0,0,${alpha.toFixed(2)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Room transition flash
    if (this.flashTimer > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(this.flashTimer / 10) * 0.45})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.flashTimer--;
    }

    ctx.restore();
  }

  private emitState() {
    const rooms = this.map.getRooms();
    const cr    = this.map.currentRoom;

    // Find boss enemy in current room (for boss health bar)
    const bossEnemy = cr.enemies.find(e => e.isBoss) ?? null;

    this.onStateChange({
      heroHealth:       Math.max(0, this.hero.health),
      heroMaxHealth:    this.hero.maxHealth,
      heroX:            this.hero.middle.x,
      heroY:            this.hero.middle.y,
      heroGun:          this.hero.currentGunType,
      enemiesRemaining: Math.max(0, this.map.totalEnemies),
      status:           this.status,
      currentRoomRow:   cr.row,
      currentRoomCol:   cr.col,
      mapRooms: rooms
        .filter(({ room }) => room.visited)
        .map(({ room, row, col }) => ({
          row,
          col,
          isCurrent:  room === cr,
          hasEnemies: room.enemyCount > 0,
          role:       room.role,
        })),
      dashCooldownFraction: this.hero.dashCooldownFraction,
      stats:           { ...this.stats },
      pendingUpgrades: this.pendingUpgrades,
      bossHealth:      bossEnemy
        ? { current: bossEnemy.health, max: bossEnemy.profile.maxHealth, phase: bossEnemy.bossPhase }
        : null,
    });
  }
}
