import React from 'react';

export default function HUD({ stats, variant = 'overlay' }) {
  const isBar = variant === 'bar';

  return (
    <div
      className={
        isBar
          ? "w-full px-4 py-2 flex justify-between items-center text-white text-xs sm:text-sm bg-black/40 backdrop-blur-sm"
          : "absolute top-0 left-0 w-full p-6 flex justify-between items-start pointer-events-none text-white text-xs sm:text-sm z-10 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]"
      }
    >
      <div className="flex flex-col space-y-1 sm:space-y-4">
        <div className="text-yellow-400 tracking-widest text-sm sm:text-lg drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]">LEVEL {stats.level}</div>
        <div className="text-blue-300 tracking-wider">SCORE: {stats.score}</div>
      </div>

      <div className="flex flex-col space-y-1 sm:space-y-4 items-end">
        <div className="flex space-x-1 items-center">
          <span className="text-red-400 tracking-wider mr-2 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]">LIVES:</span>
          {Array.from({ length: Math.max(0, stats.lives) }).map((_, i) => (
            <span key={i} className="text-sm sm:text-lg leading-none">❤️</span>
          ))}
        </div>
        <div className="text-green-300 tracking-wider">
          FISH: {stats.fishCollected} / {stats.fishRequired}
        </div>
      </div>
    </div>
  );
}