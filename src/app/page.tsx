import GameLoader from '@/components/GameLoader';

export default function Page() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0f] px-4 py-8">
      {/* Title */}
      <div className="mb-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Topdown Shooter
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          WASD to move &nbsp;·&nbsp; Click to shoot &nbsp;·&nbsp; Clear all rooms to win
        </p>
      </div>

      {/* Game */}
      <div className="w-full max-w-5xl border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
        <GameLoader />
      </div>
    </main>
  );
}
