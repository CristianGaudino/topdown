import { Room, Direction, RoomRole, LayoutType } from './Room';
import { GunType } from '../objects/Gun';
import { PickupType } from '../objects/Pickup';

const GRID_SIZE  = 6;
const TOTAL_ROOMS = 10;

type Grid = (Room | null)[][];

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down', down: 'up', left: 'right', right: 'left',
};
const DELTA: Record<Direction, [number, number]> = {
  up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1],
};

export interface RoomMapCallbacks {
  onEnemyKilled:    (x: number, y: number, gunType: GunType, isBoss: boolean) => void;
  onPlayerDamaged:  (dmg: number, x: number, y: number) => void;
  onPlayerKilled:   () => void;
  onPlayerTouched:  () => void;
  onPickupCollected:(type: PickupType, gunType?: GunType) => void;
}

// ── Internal planning types ───────────────────────────────────────────────────

interface CellEntry {
  row: number;
  col: number;
  neighbors: Map<Direction, { row: number; col: number }>;
}

interface RoomPlan {
  cell:       CellEntry;
  distance:   number;
  role:       RoomRole;
  layout:     LayoutType;
  enemyType:  GunType | null;
  enemyCount: number;
  isBoss:     boolean;
}

// ── RoomMap ───────────────────────────────────────────────────────────────────

export class RoomMap {
  private grid: Grid;
  currentRoom: Room;
  totalEnemies = 0;

  private cw: number;
  private ch: number;
  private callbacks: RoomMapCallbacks;

  constructor(cw: number, ch: number, callbacks: RoomMapCallbacks) {
    this.cw        = cw;
    this.ch        = ch;
    this.callbacks = callbacks;
    this.grid      = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));

    const sr = Math.floor(GRID_SIZE / 2);
    const sc = Math.floor(GRID_SIZE / 2);

    // Phase 1 — build connectivity graph (no Room objects yet)
    const cells = this.buildGraph(sr, sc);

    // Phase 2 — BFS distances, role assignment, layout + enemy selection
    const plans = this.planRooms(cells, sr, sc);

    // Phase 3a — create Room objects and register them in the grid
    const roomLookup = new Map<string, Room>();
    for (const plan of plans) {
      const room = new Room(
        plan.cell.row, plan.cell.col,
        cw, ch,
        plan.role, plan.layout,
        'closed', 'closed', 'closed', 'closed',
      );
      room.setCallbacks(
        callbacks.onEnemyKilled,
        callbacks.onPlayerDamaged,
        callbacks.onPlayerKilled,
        callbacks.onPlayerTouched,
        callbacks.onPickupCollected,
      );
      this.grid[plan.cell.row][plan.cell.col] = room;
      roomLookup.set(`${plan.cell.row},${plan.cell.col}`, room);
    }

    // Phase 3b — link neighbours and open connection gates (must happen before
    // spawnEnemies so that lockGates() has gates to lock)
    for (const plan of plans) {
      const room = roomLookup.get(`${plan.cell.row},${plan.cell.col}`)!;
      for (const [dir, { row: nr, col: nc }] of plan.cell.neighbors) {
        const neighbor = roomLookup.get(`${nr},${nc}`)!;
        this.setNeighbor(room, dir, neighbor);
        room.openGate(dir);
      }
    }

    // Phase 3c — spawn enemies / initial pickups
    for (const plan of plans) {
      const room = roomLookup.get(`${plan.cell.row},${plan.cell.col}`)!;
      if (plan.enemyCount > 0 && plan.enemyType) {
        room.spawnEnemies(plan.enemyCount, plan.enemyType, plan.isBoss);
        this.totalEnemies += room.enemyCount;
      }
      if (plan.role === 'start' || plan.role === 'loot') {
        room.spawnInitialPickups();
      }
    }

    const startPlan = plans.find(p => p.role === 'start')!;
    this.currentRoom = roomLookup.get(`${startPlan.cell.row},${startPlan.cell.col}`)!;
  }

  // ── Phase 1: connectivity graph ───────────────────────────────────────────

  private buildGraph(sr: number, sc: number): Map<string, CellEntry> {
    const key   = (r: number, c: number) => `${r},${c}`;
    const cells = new Map<string, CellEntry>();

    cells.set(key(sr, sc), { row: sr, col: sc, neighbors: new Map() });

    // Growing-tree algorithm: picking a random frontier cell each time encourages
    // branching rather than a single chain.
    const frontier: Array<{ row: number; col: number }> = [{ row: sr, col: sc }];
    let remaining = TOTAL_ROOMS - 1;

    while (remaining > 0 && frontier.length > 0) {
      // Bias: 50% pick the most-recently added cell (depth-first feel),
      //       50% pick a random frontier cell (creates branching)
      const idx = Math.random() < 0.5
        ? frontier.length - 1
        : Math.floor(Math.random() * frontier.length);

      const { row, col } = frontier[idx];
      const dirs = shuffle<Direction>(['up', 'down', 'left', 'right']);

      let expanded = false;
      for (const dir of dirs) {
        const [dr, dc] = DELTA[dir];
        const nr = row + dr;
        const nc = col + dc;
        const nk = key(nr, nc);

        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
        if (cells.has(nk)) continue;

        const newCell: CellEntry = { row: nr, col: nc, neighbors: new Map() };
        cells.set(nk, newCell);

        cells.get(key(row, col))!.neighbors.set(dir, { row: nr, col: nc });
        newCell.neighbors.set(OPPOSITE[dir], { row, col });

        frontier.push({ row: nr, col: nc });
        remaining--;
        expanded = true;
        break;
      }

      if (!expanded) frontier.splice(idx, 1);
    }

    return cells;
  }

  // ── Phase 2: plan each room's role, layout, enemies ──────────────────────

  private planRooms(cells: Map<string, CellEntry>, sr: number, sc: number): RoomPlan[] {
    const key = (r: number, c: number) => `${r},${c}`;

    // BFS from start to find graph distances
    const distances = new Map<string, number>();
    distances.set(key(sr, sc), 0);
    const queue: Array<{ row: number; col: number; dist: number }> = [
      { row: sr, col: sc, dist: 0 },
    ];
    while (queue.length > 0) {
      const { row, col, dist } = queue.shift()!;
      for (const { row: nr, col: nc } of cells.get(key(row, col))!.neighbors.values()) {
        const nk = key(nr, nc);
        if (!distances.has(nk)) {
          distances.set(nk, dist + 1);
          queue.push({ row: nr, col: nc, dist: dist + 1 });
        }
      }
    }

    const maxDist = Math.max(...distances.values());

    // Dead ends: cells with exactly one neighbor (excluding start)
    const deadEnds = [...cells.entries()]
      .filter(([k, cell]) => cell.neighbors.size === 1 && k !== key(sr, sc))
      .sort((a, b) => distances.get(b[0])! - distances.get(a[0])!); // farthest first

    // Boss = farthest dead end (or just farthest room if no dead ends)
    const bossKey = deadEnds.length > 0
      ? deadEnds[0][0]
      : [...distances.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // Loot = next 1–2 dead ends after boss (safe, reward exploration)
    const lootKeys = new Set(deadEnds.slice(1, 3).map(([k]) => k));

    // Elite = 1–2 high-distance rooms that aren't already assigned
    const eliteKeys = new Set<string>();
    for (const [k, dist] of [...distances.entries()].sort((a, b) => b[1] - a[1])) {
      if (eliteKeys.size >= 2) break;
      if (k === key(sr, sc) || k === bossKey || lootKeys.has(k)) continue;
      if (dist >= maxDist * 0.55) eliteKeys.add(k);
    }

    // Assemble plans
    return [...cells.entries()].map(([k, cell]) => {
      const dist = distances.get(k) ?? 0;
      const pct  = maxDist > 0 ? dist / maxDist : 0;

      const role: RoomRole =
        k === key(sr, sc) ? 'start'  :
        k === bossKey     ? 'boss'   :
        lootKeys.has(k)   ? 'loot'   :
        eliteKeys.has(k)  ? 'elite'  :
                            'combat';

      let enemyType:  GunType | null = null;
      let enemyCount  = 0;
      let isBoss      = false;

      if (role === 'boss') {
        enemyType  = 'sprinkler';
        enemyCount = 1;
        isBoss     = true;
      } else if (role === 'combat' || role === 'elite') {
        // Scale enemy type with distance from start
        if      (pct < 0.25) { enemyType = 'rifle';   enemyCount = 1; }
        else if (pct < 0.45) { enemyType = 'smg';     enemyCount = 2; }
        else if (pct < 0.65) { enemyType = 'sniper';  enemyCount = 2; }
        else                  { enemyType = 'shotgun'; enemyCount = 3; }

        if (role === 'elite') {
          enemyCount = Math.min(enemyCount + 1, 5);
          // Upgrade to the next tougher type for elite rooms
          const tier: GunType[] = ['rifle', 'smg', 'sniper', 'shotgun'];
          const i = tier.indexOf(enemyType as GunType);
          if (i < tier.length - 1) enemyType = tier[i + 1];
        }
      }

      return {
        cell,
        distance: dist,
        role,
        layout:     this.chooseLayout(role, enemyType),
        enemyType,
        enemyCount,
        isBoss,
      };
    });
  }

  private chooseLayout(role: RoomRole, enemyType: GunType | null): LayoutType {
    if (role === 'start' || role === 'loot') return 'open';
    if (role === 'boss')                     return 'arena';

    switch (enemyType) {
      case 'sniper':  return 'bunker';
      case 'smg':     return 'corridor';
      case 'shotgun': return 'pillars';
      case 'rifle':   return Math.random() < 0.5 ? 'cross' : 'cover-field';
      default:        return 'cover-field';
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private setNeighbor(room: Room, dir: Direction, neighbor: Room) {
    switch (dir) {
      case 'up':    room.upNeighbour    = neighbor; break;
      case 'down':  room.downNeighbour  = neighbor; break;
      case 'left':  room.leftNeighbour  = neighbor; break;
      case 'right': room.rightNeighbour = neighbor; break;
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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
