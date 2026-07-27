import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { GameEngine } from '../game/GameEngine';

const CanvasGame = forwardRef(function CanvasGame({ gameState, setGameState, setStats }, ref) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (!engineRef.current) {
      engineRef.current = new GameEngine(canvasRef.current, setGameState, setStats);
      
      const isMobileDevice = window.innerWidth <= 768 || 'ontouchstart' in window;
      engineRef.current.setIsMobile(isMobileDevice);
    }

    return () => {
      // let React handle strict mode unmounting
      if (engineRef.current && gameState === 'GAME_OVER') {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setGameState(gameState);
    }
  }, [gameState]);

  useImperativeHandle(ref, () => ({
    setMoveVector(x, y) {
      if (engineRef.current) engineRef.current.setMoveVector(x, y);
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full bg-[#0CA4FF]"
      style={{ touchAction: 'none' }}
    />
  );
});

export default CanvasGame;