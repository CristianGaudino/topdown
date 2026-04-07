'use client';

import { GameState } from '@/game/Game';
import { GunType } from '@/game/objects/Gun';

interface HUDProps {
  state: GameState;
}

const GUN_COLORS: Record<GunType, string> = {
  rifle:     '#4a90d9',
  smg:       '#27ae60',
  sniper:    '#a0733a',
  shotgun:   '#c0392b',
  sprinkler: '#e67e22',
};

const GUN_LABELS: Record<GunType, string> = {
  rifle:     'RIFLE',
  smg:       'SMG',
  sniper:    'SNIPER',
  shotgun:   'SHOTGUN',
  sprinkler: 'SPRINKLER',
};

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

function DashIndicator({ cooldownFraction }: { cooldownFraction: number }) {
  const ready = cooldownFraction === 0;
  const readiness = 1 - cooldownFraction;

  return (
    <div className="flex items-center gap-2">
      <span className="text-white text-xs font-mono w-6">DSH</span>
      <div className="relative w-36 h-3 bg-gray-800 rounded overflow-hidden border border-gray-600">
        <div
          className="h-full rounded transition-all duration-75"
          style={{
            width: `${readiness * 100}%`,
            backgroundColor: ready ? '#8b5cf6' : '#4c1d95',
          }}
        />
      </div>
      <span
        className="text-xs font-mono w-14"
        style={{ color: ready ? '#c4b5fd' : '#6d28d9' }}
      >
        {ready ? 'READY' : '...'}
      </span>
    </div>
  );
}

function GunIndicator({ gunType }: { gunType: GunType }) {
  const color = GUN_COLORS[gunType];
  const label = GUN_LABELS[gunType];

  return (
    <div className="flex items-center gap-2">
      <span className="text-white text-xs font-mono w-6">GUN</span>
      <span
        className="text-xs font-mono font-bold px-2 py-0.5 rounded"
        style={{ color, border: `1px solid ${color}`, backgroundColor: color + '22' }}
      >
        {label}
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
        let bg = '#374151';
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
      {/* Left: health + dash + gun + enemy count */}
      <div className="flex flex-col gap-2 bg-black/50 rounded-lg px-3 py-2">
        <HealthBar current={state.heroHealth} max={state.heroMaxHealth} />
        <DashIndicator cooldownFraction={state.dashCooldownFraction} />
        <GunIndicator gunType={state.heroGun} />
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
