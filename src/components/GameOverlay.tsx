'use client';

import { GameStatus } from '@/game/Game';

interface GameOverlayProps {
  status: GameStatus;
  onRestart: () => void;
}

export default function GameOverlay({ status, onRestart }: GameOverlayProps) {
  if (status === 'playing') return null;

  const won = status === 'won';

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="text-center px-10 py-8 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-sm w-full mx-4">
        <div className="text-5xl mb-4">{won ? '🏆' : '💀'}</div>
        <h2 className="text-3xl font-bold mb-2" style={{ color: won ? '#f1c40f' : '#e74c3c' }}>
          {won ? 'You Win!' : 'Game Over'}
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          {won
            ? 'All enemies eliminated. The dungeon is clear.'
            : 'You were overwhelmed. Better luck next time.'}
        </p>
        <button
          onClick={onRestart}
          className="w-full py-3 rounded-lg font-semibold text-white transition-all duration-150 active:scale-95"
          style={{ backgroundColor: won ? '#27ae60' : '#c0392b' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Play Again
        </button>
      </div>
    </div>
  );
}
