'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Game, GameState } from '@/game/Game';
import HUD from './HUD';
import GameOverlay from './GameOverlay';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 675;

const DEFAULT_STATE: GameState = {
  heroHealth: 100,
  heroMaxHealth: 100,
  heroGun: 'rifle',
  enemiesRemaining: 0,
  status: 'playing',
  currentRoomRow: 2,
  currentRoomCol: 2,
  mapRooms: [{ row: 2, col: 2, isCurrent: true, hasEnemies: false, role: 'start' as const }],
  dashCooldownFraction: 0,
  stats: { kills: 0, damageTaken: 0, healthPickedUp: 0, gunsPickedUp: 0, shotsFired: 0, shotsHit: 0 },
};

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [gameState, setGameState] = useState<GameState>(DEFAULT_STATE);

  const initGame = useCallback(() => {
    if (!canvasRef.current) return;
    gameRef.current?.stop();
    const g = new Game(canvasRef.current, setGameState);
    gameRef.current = g;
    g.start();
  }, []);

  useEffect(() => {
    initGame();
    return () => {
      gameRef.current?.stop();
    };
  }, [initGame]);

  const handleRestart = useCallback(() => {
    gameRef.current?.restart();
  }, []);

  const handleResume = useCallback(() => {
    gameRef.current?.resume();
  }, []);

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-full block cursor-crosshair"
        style={{ imageRendering: 'pixelated' }}
      />
      <HUD state={gameState} />
      <GameOverlay
        status={gameState.status}
        stats={gameState.stats}
        heroGun={gameState.heroGun}
        heroHealth={gameState.heroHealth}
        heroMaxHealth={gameState.heroMaxHealth}
        onRestart={handleRestart}
        onResume={handleResume}
      />
    </div>
  );
}
