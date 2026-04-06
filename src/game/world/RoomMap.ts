import { Room, Direction } from './Room';
import { GunType } from '../objects/Gun';

const GRID_SIZE = 6;
const TOTAL_ROOMS = 10;

type Grid = (Room | null)[][];

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down', down: 'up', left: 'right', right: 'left',
};

const DELTA: Record<Direction, [number, number]> = {
  up:    [-1,  0],
  down:  [ 1,  0],
  left:  [ 0, -1],
  right: [ 0,  1],
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

export class RoomMap {
  private grid: Grid;
  currentRoom: Room;
  totalEnemies = 0;

  private cw: number;
  private ch: number;
  private onEnemyKilled: () => void;
  private onPlayerKilled: () => void;
  private onPlayerTouched: () => void;

  constructor(
    cw: number,
    ch: number,
    onEnemyKilled: () => void,
    onPlayerKilled: () => void,
    onPlayerTouched: () => void,
  ) {
    this.cw = cw;
    this.ch = ch;
    this.onEnemyKilled = onEnemyKilled;
    this.onPlayerKilled = onPlayerKilled;
    this.onPlayerTouched = onPlayerTouched;

    this.grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));

    // Spawn room at centre
    const sr = Math.floor(GRID_SIZE / 2);
    const sc = Math.floor(GRID_SIZE / 2);
    this.grid[sr][sc] = this.makeRoom(sr, sc, 8, false, 0, TOTAL_ROOMS);
    this.currentRoom = this.grid[sr][sc]!;

    this.generate(sr, sc, TOTAL_ROOMS - 1, 1);
  }

  private makeRoom(
    row: number,
    col: number,
    wallCount: number,
    isBoss: boolean,
    roomIndex: number,
    total: number,
  ): Room {
    const room = new Room(row, col, this.cw, this.ch, wallCount, 'closed', 'closed', 'closed', 'closed');
    room.setCallbacks(
      () => { this.totalEnemies--; this.onEnemyKilled(); },
      this.onPlayerKilled,
      this.onPlayerTouched,
    );

    // Don't spawn enemies in spawn room
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
    // Shuffle
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
      const wallCount = isBoss ? 4 : 12;
      const newRoom = this.makeRoom(nr, nc, wallCount, isBoss, roomIndex, TOTAL_ROOMS);
      this.grid[nr][nc] = newRoom;

      // Link rooms
      this.linkRooms(row, col, dir);

      remaining--;
      roomIndex++;
      this.generate(nr, nc, remaining, roomIndex);
      // Update remaining after recursive call
      // (depth-first, so just break after first successful branch from here)
      break;
    }

    // Try remaining directions if not done
    for (const dir of dirs) {
      if (remaining <= 0) break;

      const [dr, dc] = DELTA[dir];
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (this.grid[nr][nc] !== null) continue;

      const isBoss = remaining === 1;
      const wallCount = isBoss ? 4 : 12;
      const newRoom = this.makeRoom(nr, nc, wallCount, isBoss, roomIndex, TOTAL_ROOMS);
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

  /** Returns all non-null rooms for minimap rendering */
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
