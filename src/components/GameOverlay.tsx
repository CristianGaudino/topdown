'use client';

import { GameStatus, RunStats } from '@/game/Game';
import { GunType } from '@/game/objects/Gun';

interface GameOverlayProps {
  status: GameStatus;
  stats: RunStats;
  heroGun: GunType;
  heroHealth: number;
  heroMaxHealth: number;
  onRestart: () => void;
  onResume: () => void;
}

const CONTROLS = [
  { key: 'WASD', action: 'Move' },
  { key: 'Mouse', action: 'Aim' },
  { key: 'Hold LMB', action: 'Shoot' },
  { key: 'Space', action: 'Dash' },
  { key: 'Esc', action: 'Pause' },
];

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between text-sm font-mono">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-bold">{value}</span>
    </div>
  );
}

function PauseMenu({ stats, heroGun, heroHealth, heroMaxHealth, onResume, onRestart }: Omit<GameOverlayProps, 'status'>) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="px-8 py-6 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-80">
        <h2 className="text-2xl font-bold text-white text-center mb-4 font-mono tracking-widest">PAUSED</h2>

        {/* Current run stats */}
        <div className="mb-4 flex flex-col gap-1 bg-gray-800/60 rounded-lg px-4 py-3">
          <StatRow label="Health" value={`${Math.max(0, heroHealth)} / ${heroMaxHealth}`} />
          <StatRow label="Gun" value={heroGun.toUpperCase()} />
          <StatRow label="Kills" value={stats.kills} />
          <StatRow label="Damage taken" value={stats.damageTaken} />
        </div>

        {/* Controls reminder */}
        <div className="mb-5 flex flex-col gap-1 bg-gray-800/40 rounded-lg px-4 py-3">
          {CONTROLS.map(c => (
            <div key={c.key} className="flex justify-between text-xs font-mono">
              <span className="text-purple-300 font-bold">{c.key}</span>
              <span className="text-gray-400">{c.action}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onResume}
            className="w-full py-2 rounded-lg font-semibold text-white bg-purple-700 hover:bg-purple-600 transition-colors font-mono"
          >
            RESUME
          </button>
          <button
            onClick={onRestart}
            className="w-full py-2 rounded-lg font-semibold text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors font-mono text-sm"
          >
            Restart Run
          </button>
        </div>
      </div>
    </div>
  );
}

function EndScreen({ status, stats, onRestart }: { status: 'won' | 'lost'; stats: RunStats; onRestart: () => void }) {
  const won = status === 'won';
  const score = stats.kills * 100 + (won ? 500 : 0);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="text-center px-10 py-8 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-80">
        <div className="text-5xl mb-3">{won ? '🏆' : '💀'}</div>
        <h2 className="text-3xl font-bold mb-1 font-mono" style={{ color: won ? '#f1c40f' : '#e74c3c' }}>
          {won ? 'YOU WIN' : 'GAME OVER'}
        </h2>
        <p className="text-gray-500 text-xs mb-4 font-mono">
          {won ? 'All enemies eliminated.' : 'You were overwhelmed.'}
        </p>

        {/* Score */}
        <div className="text-center mb-4">
          <span className="text-3xl font-bold font-mono" style={{ color: won ? '#f1c40f' : '#e74c3c' }}>
            {score.toLocaleString()}
          </span>
          <span className="text-gray-500 text-xs font-mono ml-1">pts</span>
        </div>

        {/* Stats */}
        <div className="flex flex-col gap-1 bg-gray-800/60 rounded-lg px-4 py-3 mb-5 text-left">
          <StatRow label="Enemies killed" value={stats.kills} />
          <StatRow label="Damage taken" value={stats.damageTaken} />
          <StatRow label="Health packs" value={stats.healthPickedUp} />
          <StatRow label="Guns picked up" value={stats.gunsPickedUp} />
          {won && <StatRow label="Clear bonus" value="+500" />}
        </div>

        <button
          onClick={onRestart}
          className="w-full py-3 rounded-lg font-semibold text-white transition-all duration-150 active:scale-95 font-mono"
          style={{ backgroundColor: won ? '#27ae60' : '#c0392b' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          PLAY AGAIN
        </button>
      </div>
    </div>
  );
}

export default function GameOverlay({ status, stats, heroGun, heroHealth, heroMaxHealth, onRestart, onResume }: GameOverlayProps) {
  if (status === 'playing') return null;

  if (status === 'paused') {
    return (
      <PauseMenu
        stats={stats}
        heroGun={heroGun}
        heroHealth={heroHealth}
        heroMaxHealth={heroMaxHealth}
        onResume={onResume}
        onRestart={onRestart}
      />
    );
  }

  return <EndScreen status={status} stats={stats} onRestart={onRestart} />;
}
