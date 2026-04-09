'use client';

import { GameState } from '@/game/Game';
import { GunType } from '@/game/objects/Gun';
import { RoomRole } from '@/game/world/Room';

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
  const pct   = Math.max(0, Math.min(1, current / max));
  const color = pct > 0.5 ? '#27ae60' : pct > 0.25 ? '#f39c12' : '#e74c3c';

  return (
    <div className="flex items-center gap-2">
      <span className="text-white text-xs font-mono w-6">HP</span>
      <div className="relative w-36 h-3 bg-gray-800 rounded overflow-hidden border border-gray-600">
        <div className="h-full rounded transition-all duration-100" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
      </div>
      <span className="text-white text-xs font-mono w-14">{Math.max(0, current)}/{max}</span>
    </div>
  );
}

function DashIndicator({ cooldownFraction }: { cooldownFraction: number }) {
  const ready     = cooldownFraction === 0;
  const readiness = 1 - cooldownFraction;

  return (
    <div className="flex items-center gap-2">
      <span className="text-white text-xs font-mono w-6">DSH</span>
      <div className="relative w-36 h-3 bg-gray-800 rounded overflow-hidden border border-gray-600">
        <div className="h-full rounded" style={{ width: `${readiness * 100}%`, backgroundColor: ready ? '#8b5cf6' : '#6b7280' }} />
      </div>
      <span className="text-xs font-mono w-14" style={{ color: ready ? '#c4b5fd' : '#9ca3af' }}>
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
      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded"
        style={{ color, border: `1px solid ${color}`, backgroundColor: color + '22' }}>
        {label}
      </span>
    </div>
  );
}

function ShieldIndicator({ charges }: { charges: number }) {
  if (charges <= 0) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-white text-xs font-mono w-6">SHD</span>
      <div className="flex gap-1">
        {Array.from({ length: charges }).map((_, i) => (
          <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#38bdf8', boxShadow: '0 0 4px #38bdf8' }} />
        ))}
      </div>
    </div>
  );
}

function BossHealthBar({ bossHealth }: { bossHealth: NonNullable<GameState['bossHealth']> }) {
  const { current, max, phase } = bossHealth;
  const pct = Math.max(0, current / max);
  const phaseColor = phase === 3 ? '#ff4444' : phase === 2 ? '#ff8800' : '#f39c12';
  const phaseLabel = phase === 3 ? 'ENRAGED' : phase === 2 ? 'PHASE 2' : 'PHASE 1';

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none select-none">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-bold" style={{ color: phaseColor }}>★ BOSS</span>
        <span className="text-xs font-mono px-1 rounded" style={{ color: phaseColor, border: `1px solid ${phaseColor}33`, backgroundColor: phaseColor + '22' }}>
          {phaseLabel}
        </span>
      </div>
      <div className="relative w-64 h-4 bg-gray-900 rounded overflow-hidden border-2" style={{ borderColor: phaseColor + '66' }}>
        {/* Phase markers */}
        <div className="absolute inset-0 flex">
          <div style={{ width: '33.3%', borderRight: '1px solid rgba(255,255,255,0.2)' }} />
          <div style={{ width: '33.3%', borderRight: '1px solid rgba(255,255,255,0.2)' }} />
        </div>
        <div
          className="h-full rounded transition-none"
          style={{ width: `${pct * 100}%`, backgroundColor: phaseColor, opacity: 0.85 }}
        />
      </div>
      <span className="text-xs font-mono" style={{ color: phaseColor + 'cc' }}>
        {Math.max(0, current)} / {max}
      </span>
    </div>
  );
}

function roomColor(role: RoomRole, hasEnemies: boolean, isCurrent: boolean): string {
  if (isCurrent)        return '#8b5cf6';
  if (role === 'loot')  return '#0d9488';
  if (role === 'start') return '#475569';
  if (role === 'boss')  return hasEnemies ? '#dc2626' : '#92400e';
  if (role === 'elite') return hasEnemies ? '#ea580c' : '#78350f';
  return hasEnemies ? '#7f1d1d' : '#374151';
}

function Minimap({ state }: { state: GameState }) {
  const cellSize = 10;
  const gap      = 2;
  const gridSize = 6;
  const total    = gridSize * (cellSize + gap);

  return (
    <div className="relative" style={{ width: total, height: total }}>
      {state.mapRooms.map(({ row, col, isCurrent, hasEnemies, role }) => (
        <div
          key={`${row}-${col}`}
          className="absolute rounded-sm"
          style={{
            left:            col * (cellSize + gap),
            top:             row * (cellSize + gap),
            width:           cellSize,
            height:          cellSize,
            backgroundColor: roomColor(role, hasEnemies, isCurrent),
            outline:         isCurrent ? '1px solid #c4b5fd' : 'none',
          }}
        />
      ))}
    </div>
  );
}

const ROOM_NOTIF: Partial<Record<RoomRole, { text: string; color: string }>> = {
  combat: { text: 'COMBAT ROOM', color: '#e74c3c' },
  elite:  { text: '⚠ ELITE ROOM',  color: '#e67e22' },
  boss:   { text: '★ BOSS ROOM',   color: '#c0392b' },
};

function RoomNotification({ notif }: { notif: NonNullable<HUDProps['state']['roomNotif']> }) {
  const info = ROOM_NOTIF[notif.role];
  if (!info) return null;
  return (
    <div
      className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none select-none"
      style={{ opacity: notif.alpha }}
    >
      <div
        className="px-6 py-2 rounded-lg font-mono font-bold text-base tracking-widest"
        style={{ color: info.color, border: `1px solid ${info.color}55`, backgroundColor: `${info.color}22` }}
      >
        {info.text}
      </div>
    </div>
  );
}

export default function HUD({ state }: HUDProps) {
  return (
    <>
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-4 pt-3 pointer-events-none select-none">
        {/* Left: health + dash + gun + enemy count */}
        <div className="flex flex-col gap-2 bg-black/50 rounded-lg px-3 py-2">
          <HealthBar current={state.heroHealth} max={state.heroMaxHealth} />
          <DashIndicator cooldownFraction={state.dashCooldownFraction} />
          <GunIndicator gunType={state.heroGun} />
          <ShieldIndicator charges={state.shieldCharges} />
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

      {/* Centre-top: room entry notification */}
      {state.roomNotif && <RoomNotification notif={state.roomNotif} />}

      {/* Bottom-centre: boss health bar (only when fighting boss) */}
      {state.bossHealth && <BossHealthBar bossHealth={state.bossHealth} />}
    </>
  );
}
