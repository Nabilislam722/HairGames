import React, { useState } from "react";
import CanvasGame from "../components/CanvasGame";
import HUD from "../components/HUD";
import { initAudio, playClickSound, playHoverSound } from "../game/audio";

export default function FishingGame() {
  const [gameState, setGameState] = useState("START");
  const [stats, setStats] = useState({
    level: 1,
    lives: 3,
    score: 0,
    fishCollected: 0,
    fishRequired: 20,
    totalFish: 0,
    maxLevelReached: 1,
  });

  const handleStart = () => {
    initAudio();
    playClickSound();
    setGameState("PLAYING");
  };

  return (
    <div className="relative w-full h-screen bg-gray-900 flex items-center justify-center overflow-hidden font-sans">
      {/* Game Canvas Container */}
      <div 
        className="relative shadow-[0_0_50px_rgba(0,0,0,0.8)] bg-black border-4 border-white/20 overflow-hidden shrink-0"
        style={{ aspectRatio: "16/10", height: "100%", maxHeight: "800px", maxWidth: "100%" }}
      >
        <CanvasGame
          gameState={gameState}
          setGameState={setGameState}
          setStats={setStats}
        />

        {gameState === "PLAYING" && <HUD stats={stats} />}

        {gameState === "START" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 text-center">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-indigo-500 via-purple-400 to-orange-400"></div>
            <div className="absolute bottom-0 left-0 w-full h-1/2 bg-[#0CA4FF]"></div>
            <div className="absolute top-[50%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-white rounded-full"></div>

            <div className="relative z-20 flex flex-col items-center pt-12">
              <h1 className="text-[54px] font-sans font-bold text-[#23356A] mb-4 leading-tight drop-shadow-[4px_4px_0_#fff]">
                FISHING
              </h1>
              <h1 className="text-[54px] font-sans font-bold text-[#23356A] mb-12 leading-tight drop-shadow-[4px_4px_0_#fff]">
                PARTY
              </h1>

              <div className="bg-black/60 p-6 border-4 border-[#1e3799] mt-8 mb-8 max-w-lg">
                <p className="text-white text-xs sm:text-sm leading-relaxed text-left">
                  <span className="text-yellow-400 block mb-2">
                    - NAVIGATE using WASD
                  </span>
                  <span className="text-blue-300 block mb-2">
                    - CATCH target fish for points
                  </span>
                  <span className="text-red-400 block mb-2">
                    - AVOID dangerous sea creatures
                  </span>
                  <span className="text-green-300 block">
                    - COMPLETE all 5 levels to win
                  </span>
                </p>
              </div>

              <button
                onClick={handleStart}
                onMouseEnter={playHoverSound}
                className="px-8 py-4 bg-yellow-400 text-[#1e3799] hover:bg-yellow-300 transition-colors text-sm uppercase cursor-pointer animate-pulse border-4 border-white shadow-[4px_4px_0_rgba(0,0,0,0.5)]"
              >
                START GAME
              </button>
            </div>
          </div>
        )}

        {gameState === "GAME_OVER" && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-white z-10 text-center">
            <h2 className="text-[48px] text-red-500 mb-8 drop-shadow-[3px_3px_0_#fff]">
              GAME OVER
            </h2>
            <div className="space-y-4 mb-10 text-sm bg-gray-800/80 p-8 border-4 border-red-500 w-full max-w-sm">
              <p className="flex justify-between">
                <span>Final Score:</span>{" "}
                <span className="text-yellow-400">{stats.score}</span>
              </p>
              <p className="flex justify-between">
                <span>Total Fish:</span>{" "}
                <span className="text-blue-300">{stats.totalFish}</span>
              </p>
              <p className="flex justify-between">
                <span>Highest Level:</span>{" "}
                <span className="text-green-400">{stats.maxLevelReached}</span>
              </p>
            </div>
            <button
              onClick={handleStart}
              onMouseEnter={playHoverSound}
              className="px-6 py-4 bg-white text-red-600 hover:bg-gray-200 transition-colors text-sm uppercase cursor-pointer border-4 border-red-600 shadow-[4px_4px_0_rgba(0,0,0,0.5)]"
            >
              Play Again
            </button>
          </div>
        )}

        {gameState === "VICTORY" && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-white z-10 text-center px-4">
            <h2 className="text-[40px] text-yellow-400 mb-6 drop-shadow-[2px_2px_0_#fff] leading-tight">
              CONGRATULATIONS!
            </h2>
            <p className="text-blue-300 mb-8 text-sm uppercase tracking-widest drop-shadow-md">
              You Finished the Adventure!
            </p>
            <div className="space-y-4 mb-10 text-sm bg-[#1e3799]/80 p-8 border-4 border-yellow-400 w-full max-w-sm">
              <p className="flex justify-between">
                <span>Final Score:</span>{" "}
                <span className="text-yellow-400">{stats.score}</span>
              </p>
              <p className="flex justify-between">
                <span>Total Fish:</span>{" "}
                <span className="text-white">{stats.totalFish}</span>
              </p>
              <p className="text-green-300 mt-4 text-xs text-center border-t border-[#1e3799] pt-4">
                All 5 Levels Cleared!
              </p>
            </div>
            <button
              onClick={handleStart}
              onMouseEnter={playHoverSound}
              className="px-6 py-4 bg-yellow-400 text-[#1e3799] hover:bg-yellow-300 transition-colors text-sm uppercase cursor-pointer shadow-[4px_4px_0_rgba(255,255,255,0.5)] border-4 border-white"
            >
              Play Again
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
