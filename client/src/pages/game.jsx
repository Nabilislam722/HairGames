import { useEffect, useRef, useState, useCallback } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';
import { createInitialState, startGame, tick } from '../game/engine';
import LevelSelect from './Levelselect';
import playerSrc     from '../assets/player.png';
import playerLeftSrc from '../assets/player_left.png';
import playerRightSrc from '../assets/player_right.png';
import enemy1Src     from '../assets/enemy1.png';
import enemy2Src     from '../assets/enemy2.png';
import bossSrc       from '../assets/boss.png';
import boss2Src      from '../assets/boss2.png';   // ← new boss for level 2+
import bulletSrc     from '../assets/bullet.png';
import bgSrc         from '../assets/bg_stars.png';
import bg2Src        from '../assets/bg2.png';

import {
  updateBgScroll, drawBackground, drawPlayer, drawEnemy, drawBullet,
  drawEnemyBullet, drawParticle, drawPowerUp, drawHUD, drawAsteroidWarning,
  drawAsteroidHUD, drawBossWarning, drawWaveClear, drawLevelWarp,
  drawMenu, drawGameOver, drawVictory,
} from '../game/renderer';
import { drawAsteroid } from '../game/asteroids';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = src;
  });
}

function saveCompletedLevel(level) {
  try {
    const existing = JSON.parse(localStorage.getItem('voidStrikerCompletedLevels') ?? '[]');
    if (!existing.includes(level)) {
      existing.push(level);
      localStorage.setItem('voidStrikerCompletedLevels', JSON.stringify(existing));
    }
  } catch {}
}

// ─── Level Complete Overlay ───────────────────────────────────────────────────

const CONFETTI_ITEMS = Array.from({ length: 60 }, (_, i) => ({
  left:   (i * 137.5) % 100,
  delay:  (i * 0.13) % 2,
  dur:    1.5 + (i % 5) * 0.4,
  color:  ['#00ccff','#ffdd00','#ff44ff','#44ff88','#ff6600'][i % 5],
  size:   4 + (i % 4) * 3,
}));

function LevelCompleteOverlay({ level, score, onContinue }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 80); return () => clearTimeout(t); }, []);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,5,20,0.88)',
      fontFamily: "'Courier New', monospace",
      transition: 'opacity 0.4s',
      opacity: visible ? 1 : 0,
    }}>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.4); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes starPop {
          0%   { transform: scale(0) rotate(-30deg); opacity:0; }
          60%  { transform: scale(1.3) rotate(10deg); opacity:1; }
          100% { transform: scale(1) rotate(0deg); opacity:1; }
        }
        @keyframes shimmer {
          0%,100% { text-shadow: 0 0 20px #ffdd00, 0 0 40px #ff8800; }
          50%      { text-shadow: 0 0 40px #ffdd00, 0 0 80px #ff8800, 0 0 120px #ffaa00; }
        }
        @keyframes btnPulse {
          0%,100% { box-shadow: 0 0 12px #00ccff88; }
          50%      { box-shadow: 0 0 28px #00ccffcc, 0 0 50px #00ccff44; }
        }
      `}</style>

      {/* Confetti */}
      {CONFETTI_ITEMS.map((c, i) => (
        <div key={i} style={{
          position: 'absolute', top: 0,
          left: `${c.left}%`,
          width: c.size, height: c.size,
          background: c.color,
          borderRadius: i % 3 === 0 ? '50%' : 2,
          animation: `confettiFall ${c.dur}s ${c.delay}s ease-in infinite`,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Card */}
      <div style={{
        background: 'linear-gradient(160deg, #001428 0%, #000d22 100%)',
        border: '2px solid #00ccff66',
        borderRadius: 20,
        padding: '48px 56px',
        textAlign: 'center',
        animation: 'scaleIn 0.4s cubic-bezier(.2,.8,.3,1) forwards',
        boxShadow: '0 20px 80px #00000088, inset 0 0 40px #00ccff08',
        minWidth: 380,
      }}>
        {/* Badge */}
        <div style={{
          display: 'inline-block',
          background: 'linear-gradient(135deg, #00aaff, #0044ff)',
          color: '#ffffff', fontSize: 10, fontWeight: 'bold',
          letterSpacing: 3, padding: '4px 16px', borderRadius: 20,
          marginBottom: 20,
        }}>LEVEL {level} COMPLETE</div>

        {/* Title */}
        <div style={{
          color: '#ffdd00', fontSize: 40, fontWeight: 'bold',
          letterSpacing: 4, marginBottom: 8,
          animation: 'shimmer 2s ease-in-out infinite',
        }}>VICTORY!</div>

        {/* Stars */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 28 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              fontSize: 36,
              animation: `starPop 0.5s ${0.3 + i * 0.15}s cubic-bezier(.2,.8,.3,1) both`,
              filter: 'drop-shadow(0 0 8px #ffdd00)',
            }}>⭐</span>
          ))}
        </div>

        {/* Score */}
        <div style={{ color: '#aabbcc', fontSize: 13, letterSpacing: 2, marginBottom: 6 }}>
          SCORE EARNED
        </div>
        <div style={{
          color: '#ffffff', fontSize: 28, fontWeight: 'bold',
          letterSpacing: 2, marginBottom: 32,
        }}>
          {score.toLocaleString()}
        </div>

        {/* Continue button */}
        <button
          onClick={onContinue}
          style={{
            background: 'transparent',
            border: '2px solid #00ccff',
            color: '#00ccff',
            fontFamily: "'Courier New', monospace",
            fontSize: 14, fontWeight: 'bold',
            letterSpacing: 4, padding: '14px 36px',
            borderRadius: 8, cursor: 'pointer',
            animation: 'btnPulse 2s ease-in-out infinite',
            transition: 'background 0.2s, color 0.2s',
          }}
          onMouseEnter={e => { e.target.style.background = '#00ccff'; e.target.style.color = '#000011'; }}
          onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = '#00ccff'; }}
        >
          ▶ RETURN TO MAP
        </button>
      </div>
    </div>
  );
}

// ─── Main wrapper — controls which screen is visible ─────────────────────────

export default function GameWrapper() {
  const [screen,     setScreen]     = useState('levelSelect'); // 'levelSelect' | 'game'
  const [startLevel, setStartLevel] = useState(1);

  const handleSelectLevel = (level) => {
    setStartLevel(level);
    setScreen('game');
  };

  const handleBackToMap = () => {
    setScreen('levelSelect');
  };

  if (screen === 'levelSelect') {
    return <LevelSelect onSelectLevel={handleSelectLevel} />;
  }

  return (
    <GameCanvas
      key={startLevel}              // remount canvas when level changes
      startLevel={startLevel}
      onBackToMap={handleBackToMap}
    />
  );
}

// ─── Canvas game ─────────────────────────────────────────────────────────────

function GameCanvas({ startLevel, onBackToMap }) {
  const canvasRef      = useRef(null);
  const stateRef       = useRef(createInitialState());
  const inputRef       = useRef({
    left: false, right: false, up: false, down: false,
    fire: false, switchWeapon: false, bomb: false,
  });
  const assetsRef      = useRef(null);
  const tickRef        = useRef(0);
  const lastTimeRef    = useRef(0);
  const rafRef         = useRef(0);
  const bombCoolRef    = useRef(false);
  const startLevelRef  = useRef(startLevel);
  const [loaded, setLoaded]                       = useState(false);
  const [showLevelComplete, setShowLevelComplete] = useState(false);
  const [completedLevel,    setCompletedLevel]    = useState(null);
  const [completedScore,    setCompletedScore]    = useState(0);

  // Load assets
  useEffect(() => {
    Promise.all([
      loadImage(playerSrc),
      loadImage(playerLeftSrc),
      loadImage(playerRightSrc),
      loadImage(enemy1Src),
      loadImage(enemy2Src),
      loadImage(bossSrc),
      loadImage(boss2Src),
      loadImage(bulletSrc),
      loadImage(bgSrc),
      loadImage(bg2Src),
    ]).then(([player, playerLeft, playerRight, enemy1, enemy2, boss, boss2, bullet, bg, bg2]) => {
      assetsRef.current = { player, playerLeft, playerRight, enemy1, enemy2, boss, boss2, bullet, bg, bg2 };
      setLoaded(true);
    });
  }, []);

  const startOrRestartGame = useCallback(() => {
    stateRef.current = startGame(stateRef.current, startLevelRef.current);
    setShowLevelComplete(false);
  }, []);

  // Input handling
  useEffect(() => {
    const keyMap = {
      ArrowLeft: 'left',  a: 'left',  A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
      ArrowUp:   'up',    w: 'up',    W: 'up',
      ArrowDown: 'down',  s: 'down',  S: 'down',
      ' ': 'fire',
    };

    const onKeyDown = (e) => {
      const phase = stateRef.current.phase;
      if (e.key === 'Enter') {
        if (phase === 'menu' || phase === 'gameOver' || phase === 'victory') startOrRestartGame();
        return;
      }
      if (e.key === 'Escape') { onBackToMap(); return; }
      if (e.key === 'b' || e.key === 'B') {
        if (!bombCoolRef.current) {
          inputRef.current.bomb = true;
          bombCoolRef.current   = true;
          setTimeout(() => { inputRef.current.bomb = false; bombCoolRef.current = false; }, 300);
        }
        return;
      }
      const mapped = keyMap[e.key];
      if (mapped) { e.preventDefault(); inputRef.current[mapped] = true; }
    };

    const onKeyUp = (e) => {
      const mapped = keyMap[e.key];
      if (mapped) inputRef.current[mapped] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
    };
  }, [startOrRestartGame, onBackToMap]);

  // Start game at the chosen level once assets are loaded
  useEffect(() => {
    if (!loaded) return;
    startOrRestartGame();
  }, [loaded]);   // only on first load

  // Game loop
  useEffect(() => {
    if (!loaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = (time) => {
      const dt = Math.min(lastTimeRef.current ? time - lastTimeRef.current : 16, 50);
      lastTimeRef.current = time;
      tickRef.current += 1;

      const state = stateRef.current;
      const input = inputRef.current;

      const inactive = ['menu','gameOver','victory','levelComplete'];
      if (!inactive.includes(state.phase)) {
        stateRef.current = tick(state, input, dt);
        input.switchWeapon = false;
        input.bomb = false;
      }

      const s      = stateRef.current;
      const assets = assetsRef.current;
      const t      = tickRef.current;

      // ── Detect level complete (boss killed) ──────────────────
      if (s.phase === 'levelComplete' && !showLevelComplete) {
        saveCompletedLevel(s.level);
        setCompletedLevel(s.level);
        setCompletedScore(s.score);
        setShowLevelComplete(true);
      }

      // ── Swap player sprite by direction ─────────────────────
      const basePlayer = assets.player;
      if (input.left && !input.right)       assets.player = assets.playerLeft;
      else if (input.right && !input.left)  assets.player = assets.playerRight;

      // ── Swap boss sprite by level ────────────────────────────
      const baseBoss = assets.boss;
      if (s.level >= 2) assets.boss = assets.boss2;

      updateBgScroll(dt);
      ctx.save();
      if (s.screenShake > 0) {
        ctx.translate(
          (Math.random() - 0.5) * s.screenShake,
          (Math.random() - 0.5) * s.screenShake,
        );
      }

      drawBackground(ctx, assets);

      if (s.phase !== 'menu') {
        for (const p  of s.particles)   if (p.active)  drawParticle(ctx, p);
        for (const pu of s.powerUps)    if (pu.active) drawPowerUp(ctx, pu, t);
        for (const a  of s.asteroids)   if (a.active)  drawAsteroid(ctx, a);
        for (const e  of s.enemies)     if (e.active)  drawEnemy(ctx, e, assets, t);
        for (const b  of s.enemyBullets) if (b.active) drawEnemyBullet(ctx, b);
        for (const b  of s.bullets)     if (b.active)  drawBullet(ctx, b, t);
        drawPlayer(ctx, s.player, assets, t);
        drawHUD(ctx, s, t);
        if (s.phase === 'asteroids') drawAsteroidHUD(ctx, s.asteroidTimer);
      }

      if      (s.phase === 'menu')            drawMenu(ctx, s.highScore, t);
      else if (s.phase === 'asteroidWarning') drawAsteroidWarning(ctx, s.asteroidWarningTimer);
      else if (s.phase === 'bossWarning')     drawBossWarning(ctx, s.bossWarningTimer);
      else if (s.phase === 'waveClear')       drawWaveClear(ctx, s.wave, s.waveClearTimer);
      else if (s.phase === 'levelWarp')       drawLevelWarp(ctx, s.player, assets, s.warpTimer, s.warpNextLevel, t);
      else if (s.phase === 'gameOver')        drawGameOver(ctx, s.score, s.highScore, s.wave, t);
      else if (s.phase === 'victory')         drawVictory(ctx, s.score, s.highScore, t);

      ctx.restore();

      // Restore swapped sprites
      assets.player = basePlayer;
      assets.boss   = baseBoss;

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loaded]);

  const handleCanvasClick = useCallback(() => {
    const phase = stateRef.current.phase;
    if (phase === 'menu' || phase === 'gameOver' || phase === 'victory') startOrRestartGame();
  }, [startOrRestartGame]);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#000011',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      {!loaded && (
        <div style={{ color: '#00ccff', fontFamily: 'monospace', fontSize: 24 }}>
          Loading...
        </div>
      )}

      {/* ESC hint */}
      {loaded && (
        <div style={{
          position: 'absolute', top: 10, right: 14,
          color: '#334455', fontSize: 11, fontFamily: 'monospace',
          letterSpacing: 1, pointerEvents: 'none',
        }}>ESC — level map</div>
      )}

      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleCanvasClick}
          style={{
            display: loaded ? 'block' : 'none',
            imageRendering: 'auto',
            cursor: 'crosshair',
            width:  'min(100vw, calc(100vh * (900 / 650)))',
            height: 'min(100vh, calc(100vw * (650 / 900)))',
          }}
        />

        {/* Level complete overlay rendered over canvas */}
        {showLevelComplete && (
          <LevelCompleteOverlay
            level={completedLevel}
            score={completedScore}
            onContinue={onBackToMap}
          />
        )}
      </div>

      <MobileControls inputRef={inputRef} onStart={startOrRestartGame} stateRef={stateRef} />
    </div>
  );
}

// ─── Mobile controls ─────────────────────────────────────────────────────────

function MobileControls({ inputRef, onStart, stateRef }) {
  const isMobile = 'ontouchstart' in window;
  if (!isMobile) return null;

  const press = (key, val) => { inputRef.current[key] = val; };

  const btnStyle = (color = '#ffffff22') => ({
    background: color,
    border: '2px solid #ffffff44',
    borderRadius: 12, color: '#ffffff',
    fontFamily: 'monospace', fontSize: 20,
    padding: '16px 20px',
    touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
  });

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: 0, right: 0,
      display: 'flex', justifyContent: 'space-between',
      padding: '0 20px', pointerEvents: 'none', zIndex: 10000,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,56px)', gridTemplateRows: 'repeat(2,56px)', gap: 6, pointerEvents: 'all' }}>
        <div />
        <button style={btnStyle()} onTouchStart={() => press('up',    true)} onTouchEnd={() => press('up',    false)}>▲</button>
        <div />
        <button style={btnStyle()} onTouchStart={() => press('left',  true)} onTouchEnd={() => press('left',  false)}>◀</button>
        <button style={btnStyle()} onTouchStart={() => press('down',  true)} onTouchEnd={() => press('down',  false)}>▼</button>
        <button style={btnStyle()} onTouchStart={() => press('right', true)} onTouchEnd={() => press('right', false)}>▶</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'all' }}>
        <button style={btnStyle('#ff440066')} onTouchStart={() => press('fire', true)}  onTouchEnd={() => press('fire', false)}>🔥</button>
        <button style={btnStyle('#ff660044')} onTouchStart={() => { press('bomb', true); setTimeout(() => press('bomb', false), 300); }}>💣</button>
      </div>
    </div>
  );
}