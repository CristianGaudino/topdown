import { GameLoop } from './engine/GameLoop';
import { InputManager } from './engine/InputManager';
import { Hero } from './objects/Hero';
import { RoomMap } from './world/RoomMap';

export type GameStatus = 'playing' | 'won' | 'lost';

export interface GameState {
  heroHealth: number;
  heroMaxHealth: number;
  enemiesRemaining: number;
  status: GameStatus;
  currentRoomRow: number;
  currentRoomCol: number;
  mapRooms: { row: number; col: number; isCurrent: boolean; hasEnemies: boolean }[];
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

  constructor(canvas: HTMLCanvasElement, onStateChange: (state: GameState) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onStateChange = onStateChange;

    this.map = new RoomMap(
      canvas.width,
      canvas.height,
      () => this.handleEnemyKilled(),
      () => this.handlePlayerDied(),
      () => this.handlePlayerTouched(),
    );

    this.hero = new Hero(80, canvas.height / 2 - 14);
    this.wireHeroToRoom();
    this.map.currentRoom.heroPresent = this.hero;

    this.input = new InputManager(canvas);
    this.input.setShootCallback((x, y) => {
      if (this.status === 'playing') this.hero.shoot(x, y);
    });

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
    this.status = 'playing';
    this.map = new RoomMap(
      this.canvas.width,
      this.canvas.height,
      () => this.handleEnemyKilled(),
      () => this.handlePlayerDied(),
      () => this.handlePlayerTouched(),
    );
    this.hero = new Hero(80, this.canvas.height / 2 - 14);
    this.wireHeroToRoom();
    this.map.currentRoom.heroPresent = this.hero;

    this.input = new InputManager(this.canvas);
    this.input.setShootCallback((x, y) => {
      if (this.status === 'playing') this.hero.shoot(x, y);
    });

    this.loop = new GameLoop(() => this.tick());
    this.loop.start();
  }

  private wireHeroToRoom() {
    const room = this.map.currentRoom;
    this.hero.getStatics = () => room.staticColliders;
    this.hero.getEnemyTargets = () =>
      room.enemies.map(e => ({
        rect: e,
        onHit: (dmg: number) => {
          e.takeDamage(dmg);
          if (e.health <= 0) e.ctx.onKilled();
        },
      }));
    this.hero.spawnBullet = b => room.bullets.push(b);
    this.hero.spawnParticles = p => room.particles.push(...p);
  }

  private tick() {
    if (this.status !== 'playing') return;

    const room = this.map.currentRoom;
    const input = this.input.get();

    this.hero.update(input);
    this.checkRoomTransition();
    room.update(this.hero);

    this.draw();
    this.emitState();
  }

  private checkRoomTransition() {
    const h = this.hero;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const room = this.map.currentRoom;
    const BORDER = 30;

    let nextRoom = null;
    let newX = h.x;
    let newY = h.y;

    if (h.x < 0 && room.leftNeighbour) {
      nextRoom = room.leftNeighbour;
      newX = cw - BORDER - h.width - 2;
      newY = h.y;
    } else if (h.x + h.width > cw && room.rightNeighbour) {
      nextRoom = room.rightNeighbour;
      newX = BORDER + 2;
      newY = h.y;
    } else if (h.y < 0 && room.upNeighbour) {
      nextRoom = room.upNeighbour;
      newX = h.x;
      newY = ch - BORDER - h.height - 2;
    } else if (h.y + h.height > ch && room.downNeighbour) {
      nextRoom = room.downNeighbour;
      newX = h.x;
      newY = BORDER + 2;
    }

    if (nextRoom) {
      room.heroPresent = null;
      this.map.currentRoom = nextRoom;
      h.x = newX;
      h.y = newY;
      nextRoom.heroPresent = h;
      this.wireHeroToRoom();
    }
  }

  private handleEnemyKilled() {
    if (this.map.totalEnemies <= 0 && this.status === 'playing') {
      this.status = 'won';
      this.emitState();
    }
  }

  private handlePlayerDied() {
    if (this.status === 'playing') {
      this.status = 'lost';
      this.emitState();
    }
  }

  private handlePlayerTouched() {
    this.hero.takeDamage(20);
    if (this.hero.health <= 0) this.handlePlayerDied();
  }

  private draw() {
    const ctx = this.ctx;
    const room = this.map.currentRoom;

    ctx.fillStyle = '#0e7c6b';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    room.draw(ctx);
    this.hero.draw(ctx);
  }

  private emitState() {
    const rooms = this.map.getRooms();
    const cr = this.map.currentRoom;
    this.onStateChange({
      heroHealth: Math.max(0, this.hero.health),
      heroMaxHealth: this.hero.maxHealth,
      enemiesRemaining: this.map.totalEnemies,
      status: this.status,
      currentRoomRow: cr.row,
      currentRoomCol: cr.col,
      mapRooms: rooms.map(({ room, row, col }) => ({
        row,
        col,
        isCurrent: room === cr,
        hasEnemies: room.enemyCount > 0,
      })),
    });
  }
}
