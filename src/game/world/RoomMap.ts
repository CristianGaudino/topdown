import { Room, Direction } from './Room';
import { GunType } from '../objects/Gun';
import { PickupType } from '../objects/Pickup';

const GRID_SIZE = 6;
const TOTAL_ROOMS = 10;

type Grid = (Room | null)[][];

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down', down: 'up', left: 'right', right: 'left',
};
const DELTA: Record<Direction, [number, number]> = {
  up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1],
};

function chooseGunType(roomIndex: number, total: number, isBoss: boolean): GunType {
  if (isBoss) return 'sprinkler';
  const pct = roomIndex / total;
  if (pct < 0.2) return 'rifle';
  if (pct < 0.5) return 'smg';
  if (pct < 0.75) return 'sniper';
  return 'shotgun';
}

function chooseEnemyCount(roomIndex: number, total: number): number {
  const pct = roomIndex / total;
  if (pct < 0.1) return 1;
  if (pct < 0.3) return 2;
  if (pct < 0.6) return 3;
  return 4;
}

export interface RoomMapCallbacks {
  onEnemyKilled: (x: number, y: number, gunType: GunType, isBoss: boolean) => void;
  onPlayerDamaged: (dmg: number, x: number, y: number) => void;
  onPlayerKilled: () => void;
  onPlayerTouched: () => void;
  onPickupCollected: (type: PickupType, gunType?: GunType) => void;
}

export class RoomMap {
  private grid: Grid;
  currentRoom: Room;
  totalEnemies = 0;

  private cw: number;
  private ch: number;
  private callbacks: RoomMapCallbacks;

  constructor(cw: number, ch: number, callbacks: RoomMapCallbacks) {
    this.cw = cw;
    this.ch = ch;
    this.callbacks = callbacks;

    this.grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));

    const sr = Math.floor(GRID_SIZE / 2);
    const sc = Math.floor(GRID_SIZE / 2);
    this.grid[sr][sc] = this.makeRoom(sr, sc, 8, false, 0, TOTAL_ROOMS);
    this.currentRoom = this.grid[sr][sc]!;

    this.generate(sr, sc, TOTAL_ROOMS - 1, 1);
  }

  private makeRoom(
    row: number, col: number,
    wallCount: number, isBoss: boolean,
    roomIndex: number, total: number,
  ): Room {
    const room = new Room(row, col, this.cw, this.ch, wallCount, 'closed', 'closed', 'closed', 'closed');
    room.setCallbacks(
      this.callbacks.onEnemyKilled,
      this.callbacks.onPlayerDamaged,
      this.callbacks.onPlayerKilled,
      this.callbacks.onPlayerTouched,
      this.callbacks.onPickupCollected,
    );

    if (roomIndex > 0) {
      const count = isBoss ? 1 : chooseEnemyCount(roomIndex, total);
      const gun = chooseGunType(roomIndex, total, isBoss);
      room.spawnEnemies(count, gun, isBoss);
      this.totalEnemies += room.enemyCount;
    }

    return room;
  }

  private generate(row: number, col: number, remaining: number, roomIndex: number) {
    if (remaining <= 0) return;

    const dirs: Direction[] = ['up', 'down', 'left', 'right'];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }

    for (const dir of dirs) {
      if (remaining <= 0) break;

      const [dr, dc] = DELTA[dir];
      const nr = row + dr;
      const nc = col + dc;

      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (this.grid[nr][nc] !== null) continue;

      const isBoss = remaining === 1;
      const newRoom = this.makeRoom(nr, nc, isBoss ? 4 : 12, isBoss, roomIndex, TOTAL_ROOMS);
      this.grid[nr][nc] = newRoom;
      this.linkRooms(row, col, dir);

      remaining--;
      roomIndex++;
      this.generate(nr, nc, remaining, roomIndex);
      break;
    }

    for (const dir of dirs) {
      if (remaining <= 0) break;
      const [dr, dc] = DELTA[dir];
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (this.grid[nr][nc] !== null) continue;

      const isBoss = remaining === 1;
      const newRoom = this.makeRoom(nr, nc, isBoss ? 4 : 12, isBoss, roomIndex, TOTAL_ROOMS);
      this.grid[nr][nc] = newRoom;
      this.linkRooms(row, col, dir);
      remaining--;
      roomIndex++;
    }
  }

  private linkRooms(row: number, col: number, dir: Direction) {
    const a = this.grid[row][col]!;
    const [dr, dc] = DELTA[dir];
    const b = this.grid[row + dr][col + dc]!;
    const opp = OPPOSITE[dir];

    a.openGate(dir);
    b.openGate(opp);

    switch (dir) {
      case 'up':    a.upNeighbour    = b; b.downNeighbour  = a; break;
      case 'down':  a.downNeighbour  = b; b.upNeighbour    = a; break;
      case 'left':  a.leftNeighbour  = b; b.rightNeighbour = a; break;
      case 'right': a.rightNeighbour = b; b.leftNeighbour  = a; break;
    }
  }

  getRooms(): { room: Room; row: number; col: number }[] {
    const result: { room: Room; row: number; col: number }[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.grid[r][c]) result.push({ room: this.grid[r][c]!, row: r, col: c });
      }
    }
    return result;
  }
}
