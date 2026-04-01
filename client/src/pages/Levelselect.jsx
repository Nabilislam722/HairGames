import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gsap } from 'gsap';

const TOTAL_LEVELS = 5;

const LEVEL_INFO = [
  { name: 'Sector Alpha',     subtitle: 'The Beginning',      color: '#00ccff', accent: '#003366', boss: 'VOID SENTINEL'  },
  { name: 'Nebula Storm',     subtitle: 'Into the Dark',      color: '#ff6600', accent: '#331400', boss: 'NOVA DESTROYER' },
  { name: 'Asteroid Belt',    subtitle: 'Rock & Fire',        color: '#cc44ff', accent: '#220033', boss: 'CRYSTAL FIEND'  },
  { name: 'Enemy Stronghold', subtitle: 'Behind Enemy Lines', color: '#ffdd00', accent: '#332200', boss: 'WAR COLOSSUS'   },
  { name: 'The Void Core',    subtitle: 'Final Showdown',     color: '#ff0055', accent: '#330011', boss: 'VOID EMPEROR'   },
];

// Pre-computed star positions — no random on render
const STARS = Array.from({ length: 130 }, (_, i) => ({
  left:    (i * 137.508) % 100,
  top:     (i * 97.31)   % 100,
  size:    i % 7 === 0 ? 2 : 1,
  opacity: 0.1 + (i % 9) * 0.08,
  dur:     2 + (i % 5) * 0.5,
  delay:   (i % 7) * 0.4,
}));

function getCompletedLevels() {
  try { return JSON.parse(localStorage.getItem('voidStrikerCompletedLevels') ?? '[]'); }
  catch { return []; }
}

function getHighScore() {
  return parseInt(localStorage.getItem('voidStrikerHighScore') ?? '0');
}

// ─── Starfield (GSAP twinkle) ─────────────────────────────────────────────────

function Starfield() {
  const containerRef = useRef(null);

  useEffect(() => {
    const els = containerRef.current?.querySelectorAll('.star') ?? [];
    els.forEach((el, i) => {
      const s = STARS[i];
      gsap.to(el, {
        opacity: s.opacity * 0.15,
        duration: s.dur,
        delay: s.delay,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    });
    return () => gsap.killTweensOf(els);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {STARS.map((s, i) => (
        <div
          key={i}
          className="star"
          style={{
            position: 'absolute',
            left: `${s.left}%`, top: `${s.top}%`,
            width: s.size, height: s.size,
            background: '#ffffff', borderRadius: '50%',
            opacity: s.opacity,
          }}
        />
      ))}
    </div>
  );
}

// ─── Level card ───────────────────────────────────────────────────────────────

function LevelCard({ level, info, unlocked, completed, onClick, index }) {
  const [hovered, setHovered] = useState(false);

  const card = {
    hidden:  { opacity: 0, y: 28, scale: 0.93 },
    visible: {
      opacity: 1, y: 0, scale: 1,
      transition: { type: 'spring', stiffness: 200, damping: 22, delay: index * 0.07 },
    },
  };

  const glow = hovered && unlocked
    ? `0 12px 44px ${info.color}44, inset 0 0 22px ${info.color}10`
    : 'none';

  return (
    <motion.div
      variants={card}
      whileHover={unlocked ? { y: -7, scale: 1.04 } : {}}
      whileTap={unlocked   ? { scale: 0.97 }         : {}}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onClick={() => unlocked && onClick(level)}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{
        background:   unlocked
          ? `linear-gradient(140deg, ${info.accent} 0%, #000d22 100%)`
          : '#08080f',
        border:       `2px solid ${completed ? '#44ff88' : unlocked ? info.color + (hovered ? 'cc' : '55') : '#1a1a2e'}`,
        borderRadius: 14,
        padding:      '18px 16px 14px',
        cursor:       unlocked ? 'pointer' : 'not-allowed',
        opacity:      unlocked ? 1 : 0.32,
        position:     'relative',
        minHeight:    145,
        display:      'flex', flexDirection: 'column', justifyContent: 'space-between',
        boxShadow:    glow,
        transition:   'box-shadow 0.22s, border-color 0.18s',
      }}
    >
      {/* Cleared badge */}
      <AnimatePresence>
        {completed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, rotate: -15 }}
            animate={{ opacity: 1, scale: 1,   rotate: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 18, delay: index * 0.07 + 0.3 }}
            style={{
              position: 'absolute', top: 9, right: 9,
              background: '#44ff88', color: '#001a0a',
              fontSize: 8, fontWeight: 'bold',
              padding: '3px 8px', borderRadius: 20, letterSpacing: 1.5,
            }}
          >✓ CLEARED</motion.div>
        )}
      </AnimatePresence>

      {/* Lock */}
      {!unlocked && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 34, opacity: 0.55, borderRadius: 12,
        }}>🔒</div>
      )}

      <div style={{ opacity: unlocked ? 1 : 0.15 }}>
        <div style={{ color: info.color, fontSize: 9, letterSpacing: 4, marginBottom: 8 }}>
          LEVEL {level}
        </div>
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 2 }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <motion.div
            animate={{ opacity: hovered ? 1 : 0.45 }}
            style={{ color: info.color, fontSize: 10, letterSpacing: 2 }}
          >
            {hovered ? '▶ LAUNCH' : completed ? 'REPLAY' : 'READY'}
          </motion.div>
          <div style={{ display: 'flex', gap: 3 }}>
            {[0, 1, 2].map(s => (
              <motion.span
                key={s}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: completed ? 1 : 0.12, scale: 1 }}
                transition={{ delay: index * 0.07 + 0.4 + s * 0.1, type: 'spring', stiffness: 300 }}
                style={{
                  fontSize: 13,
                  filter: completed ? `drop-shadow(0 0 5px ${info.color})` : 'none',
                }}
              >⭐</motion.span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main LevelSelect ─────────────────────────────────────────────────────────

export default function LevelSelect({ onSelectLevel }) {
  const [completed, setCompleted] = useState([]);
  const [highScore, setHighScore] = useState(0);
  const titleRef = useRef(null);

  useEffect(() => {
    setCompleted(getCompletedLevels());
    setHighScore(getHighScore());
  }, []);

  // GSAP shimmer on title
  useEffect(() => {
    if (!titleRef.current) return;
    gsap.to(titleRef.current, {
      textShadow: '0 0 50px #00ccff, 0 0 100px #0055ff',
      duration: 1.6,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
    return () => gsap.killTweensOf(titleRef.current);
  }, []);

  const isUnlocked  = (l) => l === 1 || completed.includes(l - 1);
  const isCompleted = (l) => completed.includes(l);

  const container = {
    hidden:  {},
    visible: { transition: { staggerChildren: 0.07 } },
  };

  const headerItem = {
    hidden:  { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'radial-gradient(ellipse at 50% 28%, #000e2e 0%, #000011 72%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Courier New', monospace",
      overflow: 'hidden',
    }}>
      <Starfield />

      {/* Header */}
      <motion.div
        variants={container} initial="hidden" animate="visible"
        style={{ textAlign: 'center', marginBottom: 32 }}
      >
        <motion.h1
          variants={headerItem}
          ref={titleRef}
          style={{
            color: '#00ccff', fontSize: 42, letterSpacing: 10,
            margin: '0 0 6px', fontWeight: 'bold',
            textShadow: '0 0 20px #00ccff, 0 0 40px #0055ff',
          }}
        >VOID STRIKER</motion.h1>

        <motion.div
          variants={headerItem}
          style={{ color: '#335566', fontSize: 11, letterSpacing: 6 }}
        >── SELECT MISSION ──</motion.div>
      </motion.div>

      {/* Grid */}
      <motion.div
        variants={container} initial="hidden" animate="visible"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 215px)',
          gridTemplateRows: 'repeat(2, auto)',
          gap: 14, marginBottom: 30,
        }}
      >
        {Array.from({ length: TOTAL_LEVELS }).map((_, i) => (
          <LevelCard
            key={i + 1}
            level={i + 1}
            info={LEVEL_INFO[i]}
            index={i}
            unlocked={isUnlocked(i + 1)}
            completed={isCompleted(i + 1)}
            onClick={onSelectLevel}
          />
        ))}
      </motion.div>

      {/* Footer stats */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.45 }}
        style={{ display: 'flex', gap: 48, alignItems: 'center' }}
      >
        {[
          { label: 'HIGH SCORE', value: highScore.toLocaleString(), color: '#ffdd00', glow: '#ffdd0055' },
          { label: 'PROGRESS',   value: `${completed.length} / ${TOTAL_LEVELS}`, color: '#44ff88', glow: '#44ff8855' },
        ].map(({ label, value, color, glow }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ color: '#445566', fontSize: 10, letterSpacing: 3, marginBottom: 4 }}>{label}</div>
            <motion.div
              animate={{ textShadow: [`0 0 10px ${glow}`, `0 0 22px ${color}88`, `0 0 10px ${glow}`] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ color, fontSize: 20, fontWeight: 'bold', letterSpacing: 2 }}
            >{value}</motion.div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}