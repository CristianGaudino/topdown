'use client';

import dynamic from 'next/dynamic';

const GameCanvas = dynamic(() => import('./GameCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full aspect-video flex items-center justify-center bg-gray-900 text-gray-500 text-sm">
      Loading game...
    </div>
  ),
});

export default function GameLoader() {
  return <GameCanvas />;
}
