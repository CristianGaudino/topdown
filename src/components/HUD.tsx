'use client';

import { GameState } from '@/game/Game';

interface HUDProps {
  state: GameState;
}

function HealthBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, Math.min(1, current / max));
  const color = pct > 0.5 ? '#27ae60' : pct > 0.25 ? '#f39c12' : '#e74c3c';

  return (
    <div className="flex items-center gap-2">
      <span className="text-white text-xs font-mono w-6">HP</span>
      <div className="relative w-36 h-3 bg-gray-800 rounded overflow-hidden border border-gray-600">
        <div
          className="h-full rounded transition-all duration-100"
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-white text-xs font-mono w-14">
        {Math.max(0, current)}/{max}
      </span>
    </div>
  );
}

function Minimap({ state }: { state: GameState }) {
  const cellSize = 10;
  const gap = 2;
  const gridSize = 6;
  const totalSize = gridSize * (cellSize + gap);

  return (
    <div className="relative" style={{ width: totalSize, height: totalSize }}>
      {state.mapRooms.map(({ row, col, isCurrent, hasEnemies }) => {
        const x = col * (cellSize + gap);
        const y = row * (cellSize + gap);
        let bg = '#374151'; // visited, no enemies
        if (hasEnemies) bg = '#7f1d1d';
        if (isCurrent) bg = '#8b5cf6';

        return (
          <div
            key={`${row}-${col}`}
            className="absolute rounded-sm"
            style={{
              left: x,
              top: y,
              width: cellSize,
              height: cellSize,
              backgroundColor: bg,
              outline: isCurrent ? '1px solid #c4b5fd' : 'none',
            }}
          />
        );
      })}
    </div>
  );
}

export default function HUD({ state }: HUDProps) {
  return (
    <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-4 pt-3 pointer-events-none select-none">
      {/* Left: health + enemy count */}
      <div className="flex flex-col gap-2 bg-black/50 rounded-lg px-3 py-2">
        <HealthBar current={state.heroHealth} max={state.heroMaxHealth} />
        <div className="flex items-center gap-2">
          <span className="text-white text-xs font-mono w-6">☠</span>
          <span className="text-red-400 text-xs font-mono">
            {state.enemiesRemaining} {state.enemiesRemaining === 1 ? 'enemy' : 'enemies'} remaining
          </span>
        </div>
      </div>

      {/* Right: minimap */}
      <div className="bg-black/50 rounded-lg p-2">
        <Minimap state={state} />
      </div>
    </div>
  );
}
