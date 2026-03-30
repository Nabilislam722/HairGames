import { useState, useEffect } from 'react';

const TOTAL_LEVELS = 5;

const LEVEL_INFO = [
  { name: 'Sector Alpha',      subtitle: 'The Beginning',       color: '#00ccff', bg: 'linear-gradient(135deg,#001428 0%,#000822 100%)', boss: 'VOID SENTINEL' },
  { name: 'Nebula Storm',      subtitle: 'Into the Dark',        color: '#ff6600', bg: 'linear-gradient(135deg,#1a0800 0%,#000822 100%)', boss: 'NOVA DESTROYER' },
  { name: 'Asteroid Belt',     subtitle: 'Rock & Fire',          color: '#ff44ff', bg: 'linear-gradient(135deg,#1a0018 0%,#000822 100%)', boss: 'CRYSTAL FIEND' },
  { name: 'Enemy Stronghold',  subtitle: 'Behind Enemy Lines',   color: '#ffdd00', bg: 'linear-gradient(135deg,#1a1400 0%,#000822 100%)', boss: 'WAR COLOSSUS' },
  { name: 'The Void Core',     subtitle: 'Final Showdown',       color: '#ff0044', bg: 'linear-gradient(135deg,#1a0010 0%,#000822 100%)', boss: 'VOID EMPEROR' },
];

// Pre-computed star positions — no random on render
const STARS = Array.from({ length: 120 }, (_, i) => ({
  left:    (i * 137.508) % 100,
  top:     (i * 97.31)   % 100,
  size:    i % 7 === 0 ? 2 : 1,
  opacity: 0.15 + (i % 9) * 0.09,
  delay:   (i % 5) * 0.6,
}));

function getCompletedLevels() {
  try { return JSON.parse(localStorage.getItem('voidStrikerCompletedLevels') ?? '[]'); }
  catch { return []; }
}

function getHighScore() {
  return parseInt(localStorage.getItem('voidStrikerHighScore') ?? '0');
}

export default function LevelSelect({ onSelectLevel }) {
  const [completed, setCompleted]   = useState([]);
  const [highScore, setHighScore]   = useState(0);
  const [hovering, setHovering]     = useState(null);
  const [animIn,   setAnimIn]       = useState(false);

  useEffect(() => {
    setCompleted(getCompletedLevels());
    setHighScore(getHighScore());
    // Slight delay so CSS transition fires
    const t = setTimeout(() => setAnimIn(true), 50);
    return () => clearTimeout(t);
  }, []);

  const isUnlocked = (level) => level === 1 || completed.includes(level - 1);
  const isCompleted = (level) => completed.includes(level);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'radial-gradient(ellipse at 50% 30%, #000d2e 0%, #000011 70%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Courier New', monospace",
      zIndex: 9999, overflow: 'hidden',
    }}>

      {/* Starfield */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {STARS.map((s, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${s.left}%`, top: `${s.top}%`,
            width: s.size, height: s.size,
            background: '#ffffff',
            borderRadius: '50%',
            opacity: s.opacity,
            animation: `twinkle ${2 + s.delay}s ease-in-out infinite alternate`,
            animationDelay: `${s.delay}s`,
          }} />
        ))}
      </div>

      <style>{`
        @keyframes twinkle { from { opacity: 0.1; } to { opacity: 0.9; } }
        @keyframes slideDown { from { opacity:0; transform:translateY(-24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { text-shadow: 0 0 20px #00ccff, 0 0 40px #0055ff; } 50% { text-shadow: 0 0 40px #00ccff, 0 0 80px #0055ff, 0 0 120px #0033cc; } }
        @keyframes floatCard { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .level-card:hover { transform: translateY(-6px) scale(1.03) !important; }
      `}</style>

      {/* Header */}
      <div style={{
        textAlign: 'center', marginBottom: 36,
        animation: animIn ? 'slideDown 0.5s ease forwards' : 'none',
      }}>
        <h1 style={{
          color: '#00ccff', fontSize: 44, letterSpacing: 10, margin: '0 0 6px',
          fontWeight: 'bold', textTransform: 'uppercase',
          animation: 'pulse 3s ease-in-out infinite',
        }}>VOID STRIKER</h1>
        <div style={{ color: '#4488aa', fontSize: 12, letterSpacing: 6 }}>
          ── SELECT MISSION ──
        </div>
      </div>

      {/* Level grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 220px)',
        gridTemplateRows:    'repeat(2, auto)',
        gap: 16,
        marginBottom: 32,
      }}>
        {Array.from({ length: TOTAL_LEVELS }).map((_, i) => {
          const level     = i + 1;
          const unlocked  = isUnlocked(level);
          const done      = isCompleted(level);
          const info      = LEVEL_INFO[i];
          const isHov     = hovering === level;

          return (
            <div
              key={level}
              className="level-card"
              onClick={() => unlocked && onSelectLevel(level)}
              onMouseEnter={() => setHovering(level)}
              onMouseLeave={() => setHovering(null)}
              style={{
                background: unlocked ? info.bg : '#08080f',
                border: `2px solid ${done ? '#44ff88' : unlocked ? info.color + (isHov ? 'ff' : '77') : '#222233'}`,
                borderRadius: 14,
                padding: '18px 16px 14px',
                cursor: unlocked ? 'pointer' : 'not-allowed',
                transition: 'all 0.22s cubic-bezier(.2,.8,.3,1)',
                boxShadow: isHov && unlocked ? `0 10px 40px ${info.color}44, inset 0 0 20px ${info.color}11` : 'none',
                position: 'relative',
                opacity: unlocked ? 1 : 0.35,
                minHeight: 140,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                animation: animIn ? `slideDown 0.5s ease ${0.08 * i}s both` : 'none',
              }}
            >
              {/* Completed badge */}
              {done && (
                <div style={{
                  position: 'absolute', top: 10, right: 10,
                  background: '#44ff88', color: '#001a0a',
                  fontSize: 9, fontWeight: 'bold', padding: '3px 7px',
                  borderRadius: 20, letterSpacing: 1.5,
                }}>✓ CLEARED</div>
              )}

              {/* Lock overlay */}
              {!unlocked && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 36, opacity: 0.6, borderRadius: 12,
                }}>🔒</div>
              )}

              <div style={{ opacity: unlocked ? 1 : 0.2 }}>
                <div style={{ color: info.color, fontSize: 10, letterSpacing: 4, marginBottom: 8 }}>
                  LEVEL {level}
                </div>
                <div style={{ color: '#ffffff', fontSize: 15, fontWeight: 'bold', marginBottom: 3 }}>
                  {info.name}
                </div>
                <div style={{ color: '#778899', fontSize: 11, marginBottom: 10 }}>
                  {info.subtitle}
                </div>
                <div style={{ color: info.color + 'aa', fontSize: 9, letterSpacing: 2 }}>
                  BOSS: {info.boss}
                </div>
              </div>

              {unlocked && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <div style={{
                    color: info.color, fontSize: 10, letterSpacing: 2,
                    transition: 'opacity 0.2s', opacity: isHov ? 1 : 0.5,
                  }}>
                    {isHov ? '▶ LAUNCH' : done ? 'REPLAY' : 'READY'}
                  </div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[1,2,3].map(star => (
                      <span key={star} style={{
                        fontSize: 13,
                        opacity: done ? 1 : 0.15,
                        filter: done ? `drop-shadow(0 0 5px ${info.color})` : 'none',
                        transition: 'all 0.3s',
                      }}>⭐</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* 5th card spans last col of row 2 — center it */}
        {/* Grid handles it automatically since we have 5 items in 3-col grid */}
      </div>

      {/* High score footer */}
      <div style={{
        display: 'flex', gap: 48, alignItems: 'center',
        animation: animIn ? 'slideDown 0.5s ease 0.5s both' : 'none',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#4488aa', fontSize: 10, letterSpacing: 3, marginBottom: 4 }}>HIGH SCORE</div>
          <div style={{ color: '#ffdd00', fontSize: 20, fontWeight: 'bold', letterSpacing: 2,
            textShadow: '0 0 12px #ffdd0077' }}>
            {highScore.toLocaleString()}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#4488aa', fontSize: 10, letterSpacing: 3, marginBottom: 4 }}>PROGRESS</div>
          <div style={{ color: '#44ff88', fontSize: 20, fontWeight: 'bold', letterSpacing: 2,
            textShadow: '0 0 12px #44ff8877' }}>
            {completed.length} / {TOTAL_LEVELS}
          </div>
        </div>
      </div>
    </div>
  );
}