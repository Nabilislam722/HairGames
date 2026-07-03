import React, { useEffect, useRef } from 'react';
import { GameEngine } from '../game/GameEngine';

export default function CanvasGame({ gameState, setGameState, setStats }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    if (!engineRef.current) {
      engineRef.current = new GameEngine(canvasRef.current, setGameState, setStats);
    }

    return () => {
      // let React handle strict mode unmounting
      if (engineRef.current && gameState === 'GAME_OVER') {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setGameState(gameState);
    }
  }, [gameState]);

  return (
    <canvas 
      ref={canvasRef}
      width={1280} 
      height={800} 
      className="block w-full h-full bg-[#0CA4FF] object-contain"
    />
  );
}
