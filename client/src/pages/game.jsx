import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gsap } from 'gsap';
import { useWeb3 } from '../lib/web3';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';
import { createInitialState, startGame, tick } from '../game/engine';
import LevelSelect from './Levelselect';
import playerSrc      from '../assets/player.png';
import playerLeftSrc  from '../assets/player_left.png';
import playerRightSrc from '../assets/player_right.png';
import enemy1Src      from '../assets/enemy1.png';
import enemy2Src      from '../assets/enemy2.png';
import bossSrc        from '../assets/boss.png';
import boss2Src       from '../assets/boss2.png';
import bulletSrc      from '../assets/bullet.png';
import bgSrc          from '../assets/bg_stars.png';
import bg2Src         from '../assets/bg2.png';
import bombSrc        from '../assets/koyala.png';

import {
  updateBgScroll, drawBackground, drawPlayer, drawEnemy, drawBullet,
  drawEnemyBullet, drawParticle, drawPowerUp, drawHUD, drawAsteroidWarning,
  drawAsteroidHUD, drawBossWarning, drawWaveClear, drawLevelWarp,
  drawMenu, drawGameOver, drawVictory,
} from '../game/renderer';
import { drawAsteroid } from '../game/asteroids';

// ─── Constants ────────────────────────────────────────────────────────────────

const WEN_PHRASES  = ['WEN', 'WEN!', 'W E N', '🚀 WEN', 'WEN 💥', 'ser WEN?', '‼ WEN ‼', 'SOON™'];
const CONFETTI_CFG = Array.from({ length: 55 }, (_, i) => ({
  id: i, left: (i * 137.5) % 100,
  color: ['#00ccff','#ffdd00','#ff44ff','#44ff88','#ff6600','#ffffff'][i % 6],
  size: 4 + (i % 4) * 3, delay: (i * 0.11) % 1.8, dur: 1.4 + (i % 5) * 1,
}));

// Font family variable for consistent design token usage
const FONT_STACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// Helpers

function loadImage(src) {
  return new Promise(r => { const img = new Image(); img.onload = img.onerror = () => r(img); img.src = src; });
}

function saveCompletedLevel(level) {
  try {
    const arr = JSON.parse(localStorage.getItem('voidStrikerCompletedLevels') ?? '[]');
    if (!arr.includes(level)) { arr.push(level); localStorage.setItem('voidStrikerCompletedLevels', JSON.stringify(arr)); }
  } catch {}
}

// Canvas WEN FX

function spawnWenTexts(enemies) {
  return enemies.filter(e => e.active).map((e, i) => ({
    x: e.x + e.width / 2, y: e.y + e.height / 2,
    vx: (Math.random() - 0.5) * 2.8, vy: -(2.8 + Math.random() * 3),
    age: 0, maxAge: 1400 + Math.random() * 700, scale: 0,
    rot: (Math.random() - 0.5) * 0.45, rotSpd: (Math.random() - 0.5) * 0.07,
    colorBase: (i * 53) % 360, wobble: Math.random() * Math.PI * 2,
    phrase: WEN_PHRASES[i % WEN_PHRASES.length],
  }));
}

function tickWenTexts(list, dt) {
  for (const w of list) {
    w.age += dt; w.x += w.vx * (dt/16); w.y += w.vy * (dt/16);
    w.vy *= 0.972; w.rot += w.rotSpd; w.wobble += dt * 0.005;
    w.scale = w.age < 180 ? w.age / 180 : 1;
  }
  return list.filter(w => w.age < w.maxAge);
}

function paintWenTexts(ctx, list) {
  for (const w of list) {
    const p = w.age / w.maxAge, alpha = p > 0.65 ? 1 - (p - 0.65) / 0.35 : 1;
    if (alpha <= 0 || w.scale < 0.02) continue;
    const fs = Math.round((19 + Math.sin(w.wobble * 1.3) * 5) * w.scale);
    if (fs < 2) continue;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(w.x + Math.sin(w.wobble) * 8, w.y);
    ctx.rotate(w.rot); ctx.scale(w.scale, w.scale);
    ctx.font = `bold ${fs}px 'Arial', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(w.phrase, 0, 0);
    const hue = (w.colorBase + w.age * 0.28) % 360;
    ctx.fillStyle = `hsl(${hue},100%,62%)`; ctx.shadowColor = `hsl(${hue},100%,62%)`; ctx.shadowBlur = 13;
    ctx.fillText(w.phrase, 0, 0); ctx.restore();
  }
}

function paintShockwaves(ctx, list) {
  for (const sw of list) {
    const p = sw.age / sw.maxAge, r = 340 * p, a = (1 - p) * 0.55;
    ctx.save();
    ctx.beginPath(); ctx.arc(sw.x, sw.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,200,0,${a})`; ctx.lineWidth = 7 * (1 - p);
    ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 22; ctx.stroke();
    if (r > 30) {
      ctx.beginPath(); ctx.arc(sw.x, sw.y, r * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,80,0,${a*0.5})`; ctx.lineWidth = 3*(1-p); ctx.shadowBlur = 8; 
      ctx.stroke(); // <-- Fixed: Added 'ctx.' prefix here
    }
    ctx.restore();
  }
}

function paintBigWen(ctx, age, maxAge) {
  if (age >= maxAge) return;
  const p = age / maxAge;
  const alpha = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
  const scale = p < 0.1  ? 0.3 + (p/0.1)*0.7 : 1 + (p-0.1)*0.22;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.fillStyle = `rgba(255,80,0,${alpha*0.14})`; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.translate(CANVAS_WIDTH/2, CANVAS_HEIGHT/2); ctx.scale(scale, scale);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const hue = (age * 0.7) % 360;
  ctx.font = 'bold 106px \'Arial\', sans-serif'; ctx.lineWidth = 9;
  ctx.strokeStyle = '#00000099'; ctx.strokeText('WEN BOOM', 0, 0);
  ctx.fillStyle = `hsl(${hue},100%,58%)`; ctx.shadowColor = `hsl(${hue},100%,58%)`; ctx.shadowBlur = 44;
  ctx.fillText('WEN BOOM', 0, 0);
  ctx.font = 'bold 25px \'Arial\', sans-serif'; ctx.shadowBlur = 16; ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
  ctx.strokeText('💥 TO THE MOON 💥', 0, 86); ctx.fillText('💥 TO THE MOON 💥', 0, 86);
  ctx.restore();
}

// ─── Score Submit Toast ───────────────────────────────────────────────────────

function ScoreToast({ status, score, error, onDismiss }) {
  const cols = { pending:'#ffdd00', success:'#00ffcc', error:'#ff4466' };
  const msgs = {
    pending: `⏳ Submitting ${score?.toLocaleString()} pts on-chain...`,
    success: `🚀 ${score?.toLocaleString()} pts secured on-chain!`,
    error:   `❌ ${error ?? 'Submission failed — score saved locally.'}`,
  };
  return (
    <motion.div
      initial={{ opacity:0, y:30, scale:0.95 }} animate={{ opacity:1, y:0, scale:1 }}
      exit={{ opacity:0, y:20, scale:0.95 }} transition={{ type:'spring', stiffness:320, damping:24 }}
      style={{
        position:'fixed', bottom:32, left:'50%', transform:'translateX(-50%)',
        background:'rgba(2, 14, 30, 0.85)', backdropFilter:'blur(12px)',
        border:`1px solid ${cols[status]}66`, borderRadius:16,
        padding:'14px 24px', fontFamily: FONT_STACK,
        color: cols[status], fontSize:13, fontWeight: 500, letterSpacing: '0.5px',
        boxShadow:`0 12px 40px rgba(0,0,0,0.7), 0 0 20px ${cols[status]}15`,
        zIndex:99999, display:'flex', alignItems:'center', gap:16,
        maxWidth:460, pointerEvents: status!=='pending' ? 'all' : 'none',
      }}
    >
      <span style={{ flex:1 }}>{msgs[status]}</span>
      {status !== 'pending' && (
        <motion.button whileHover={{ color: '#fff' }} whileTap={{ scale:0.88 }} onClick={onDismiss}
          style={{ background:'transparent', border:'none', color:'#556a80', cursor:'pointer', fontSize:16, padding:'2px 6px', display:'flex', alignItems:'center' }}
        >✕</motion.button>
      )}
    </motion.div>
  );
}

// ─── Level Complete Overlay ───────────────────────────────────────────────────

function LevelCompleteOverlay({ level, score, isConnected, submitStatus, submitError, onContinue }) {
  const refs = useRef([]);

  useEffect(() => {
    refs.current.forEach((el, i) => {
      if (!el) return;
      const c = CONFETTI_CFG[i];
      gsap.set(el, { y:-30, opacity:1, rotation:0 });
      gsap.to(el, { y: window.innerHeight+60, rotation:680+Math.random()*360, opacity:0,
        duration:c.dur, delay:c.delay, ease:'power1.in', repeat:-1, repeatDelay:Math.random()*0.4 });
    });
    return () => gsap.killTweensOf(refs.current);
  }, []);

  const card  = { hidden:{ scale:0.9,opacity:0,y:20 }, visible:{ scale:1,opacity:1,y:0, transition:{ type:'spring',stiffness:300,damping:25,delay:0.05 } } };
  const badge = { hidden:{ opacity:0,y:-8 }, visible:{ opacity:1,y:0,transition:{ delay:0.2,duration:0.3 } } };
  const titleV= { hidden:{ opacity:0,scale:0.95 }, visible:{ opacity:1,scale:1,transition:{ type:'spring',stiffness:320,damping:20,delay:0.3 } } };
  const starV = (i) => ({ hidden:{ scale:0,rotate:-30,opacity:0 }, visible:{ scale:1,rotate:0,opacity:1,transition:{ type:'spring',stiffness:400,damping:16,delay:0.45+i*0.12 } } });
  const scoreV= { hidden:{ opacity:0,y:12 }, visible:{ opacity:1,y:0,transition:{ delay:0.75,duration:0.4 } } };
  const btnV  = { hidden:{ opacity:0,y:10 }, visible:{ opacity:1,y:0,transition:{ delay:0.95,duration:0.3 } }, hover:{ scale:1.04, boxShadow:'0 0 24px rgba(0, 204, 255, 0.5)' }, tap:{ scale:0.97 } };

  const statusColor = { pending:'#ffdd00', success:'#00ffcc', error:'#ff4466' };
  const statusMsg   = submitStatus === 'pending' ? '⏳ Submitting score safely on-chain...'
    : submitStatus === 'success'                 ? '✅ Score locked permanently on-chain!'
    : submitStatus === 'error'                   ? `❌ ${submitError ?? 'Submission failed'}`
    : isConnected                                ? '🔗 Preparing transaction window...'
    : '⚠ Connect your wallet to store your highscore on-chain';

  const isPending = submitStatus === 'pending';

  return (
    <motion.div
      initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.25 }}
      style={{ position:'absolute',inset:0,zIndex:100,display:'flex',alignItems:'center',
        justifyContent:'center',background:'rgba(1, 6, 15, 0.75)', backdropFilter:'blur(10px)', fontFamily: FONT_STACK }}
    >
      {CONFETTI_CFG.map((c,i) => (
        <div key={c.id} ref={el => refs.current[i]=el}
          style={{ position:'absolute',top:0,left:`${c.left}%`,width:c.size,height:c.size,
            background:c.color,borderRadius:i%3===0?'50%':4,pointerEvents:'none' }} />
      ))}

      <motion.div variants={card} initial="hidden" animate="visible"
        style={{ background:'linear-gradient(165deg, rgba(2,18,38,0.9) 0%, rgba(1,9,20,0.95) 100%)', border:'1px solid rgba(0, 212, 255, 0.25)',
          borderRadius:28,padding:'44px 48px',textAlign:'center',
          boxShadow:'0 32px 80px rgba(0,0,0,0.8), inset 0 0 30px rgba(0,204,255,0.05)',minWidth:390,position:'relative' }}
      >
        <motion.div variants={badge} initial="hidden" animate="visible"
          style={{ display:'inline-block',background:'linear-gradient(135deg,#00aaff,#0044ff)',
            color:'#fff',fontSize:11,fontWeight:700,letterSpacing:2,
            padding:'6px 18px',borderRadius:30,marginBottom:20, boxShadow:'0 4px 14px rgba(0,170,255,0.3)' }}
        >LEVEL {level} SECURED</motion.div>

        <motion.div variants={titleV} initial="hidden" animate="visible"
          style={{ color:'#ffdd00',fontSize:44,fontWeight:900,letterSpacing:3,marginBottom:12 }}
        >
          <motion.span animate={{ textShadow:[
            '0 0 20px #ffdd00,0 0 40px #ff8800','0 0 35px #ffdd00,0 0 70px #ff8800,0 0 100px #ffaa00',
            '0 0 20px #ffdd00,0 0 40px #ff8800'] }}
            transition={{ duration:2,repeat:Infinity,ease:'easeInOut' }}
          >VICTORY</motion.span>
        </motion.div>

        <div style={{ display:'flex',justifyContent:'center',gap:14,marginBottom:28 }}>
          {[0,1,2].map(i => (
            <motion.span key={i} variants={starV(i)} initial="hidden" animate="visible"
              style={{ fontSize:38,filter:'drop-shadow(0 0 10px #ffdd00)' }}
            >⭐</motion.span>
          ))}
        </div>

        <motion.div variants={scoreV} initial="hidden" animate="visible">
          <div style={{ color:'#7f9cb3',fontSize:12,fontWeight:600,letterSpacing:2,marginBottom:6 }}>TOTAL SCORE</div>
          <div style={{ color:'#fff',fontSize:34,fontWeight:800,letterSpacing:1,marginBottom:16, textShadow:'0 2px 10px rgba(255,255,255,0.1)' }}>
            {score?.toLocaleString()}
          </div>
          
          <motion.div
            initial={{ opacity:0,y:4 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.85,duration:0.3 }}
            style={{ fontSize:12, fontWeight: 500, letterSpacing:'0.5px',marginBottom:28, padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', display: 'inline-block',
              color: statusColor[submitStatus] ?? '#627d93',
              border: `1px solid ${submitStatus ? statusColor[submitStatus] + '22' : 'transparent'}` }}
          >{statusMsg}</motion.div>
        </motion.div>

        <motion.button variants={btnV} initial="hidden" animate="visible"
          whileHover={isPending ? {} : "hover"} whileTap={isPending ? {} : "tap"}
          onClick={() => !isPending && onContinue()}
          style={{ background: isPending ? 'rgba(255,255,255,0.05)' : '#00ccff', border:'none',
            color: isPending ? '#4a6375' : '#000814', fontFamily: FONT_STACK,
            fontSize:14,fontWeight:700,letterSpacing:2,padding:'14px 38px',borderRadius:12,
            cursor:isPending?'not-allowed':'pointer',
            transition: 'background 0.2s ease, color 0.2s ease', opacity:isPending?0.5:1 }}
        >{isPending ? 'PROCESSING...' : 'RETURN TO MAP'}</motion.button>
      </motion.div>
    </motion.div>
  );
}

// ─── Loading / ESC ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',
        alignItems:'center',justifyContent:'center',gap:24 }}
    >
      <motion.div animate={{ opacity:[0.4,1,0.4] }} transition={{ duration:1.2,repeat:Infinity,ease:'easeInOut' }}
        style={{ color:'#00ccff',fontFamily: FONT_STACK, fontWeight:700, fontSize:18,letterSpacing:6 }}
      >LOADING QUANTUM ENGINE</motion.div>
      <div style={{ display:'flex',gap:10 }}>
        {[0,1,2,3,4].map(i => (
          <motion.div key={i} animate={{ scaleY:[0.3,1,0.3],opacity:[0.3,1,0.3] }}
            transition={{ duration:0.9,repeat:Infinity,delay:i*0.12,ease:'easeInOut' }}
            style={{ width:5,height:22,background:'linear-gradient(to bottom, #00ffff, #0066ff)',borderRadius:4 }} />
        ))}
      </div>
    </motion.div>
  );
}

function EscHint() {
  return (
    <motion.div initial={{ opacity:0,y:-6 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.6,duration:0.5 }}
      style={{ position:'absolute',top:16,right:20,color:'#4a6375', fontWeight: 500,
        fontSize:12,fontFamily: FONT_STACK, letterSpacing:1,pointerEvents:'none' }}
    >PRESS [ESC] MAP</motion.div>
  );
}

// ─── Main wrapper ─────────────────────────────────────────────────────────────

export default function GameWrapper() {
  const [screen,     setScreen]     = useState('levelSelect');
  const [startLevel, setStartLevel] = useState(1);

  return (
    <AnimatePresence mode="wait">
      {screen === 'levelSelect' ? (
        <motion.div key="ls" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
          transition={{ duration:0.25 }} style={{ position:'fixed',inset:0 }}>
          <LevelSelect onSelectLevel={(l) => { setStartLevel(l); setScreen('game'); }} />
        </motion.div>
      ) : (
        <motion.div key={`g${startLevel}`} initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
          transition={{ duration:0.2 }} style={{ position:'fixed',inset:0 }}>
          <GameCanvas startLevel={startLevel} onBackToMap={() => setScreen('levelSelect')} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Canvas game ──────────────────────────────────────────────────────────────

function GameCanvas({ startLevel, onBackToMap }) {
  const { address, isConnected, submitGuess } = useWeb3();

  const canvasRef     = useRef(null);
  const stateRef      = useRef(createInitialState());
  const inputRef      = useRef({ left:false,right:false,up:false,down:false,fire:false,switchWeapon:false,bomb:false });
  const assetsRef     = useRef(null);
  const tickRef       = useRef(0);
  const lastTimeRef   = useRef(0);
  const rafRef        = useRef(0);
  const bombCoolRef   = useRef(false);
  const startLevelRef = useRef(startLevel);
  const wenTextsRef   = useRef([]);
  const shockwavesRef = useRef([]);
  const bigWenRef     = useRef({ active:false, age:0, maxAge:1100 });

  // Anti-double-submission transactional barrier lock
  const hasSubmittedRef = useRef(false);

  const [loaded,            setLoaded]            = useState(false);
  const [showLevelComplete, setShowLevelComplete] = useState(false);
  const [completedLevel,    setCompletedLevel]    = useState(null);
  const [completedScore,    setCompletedScore]    = useState(0);
  const [submitStatus,      setSubmitStatus]      = useState(null);  // null|pending|success|error
  const [submitError,       setSubmitError]       = useState(null);
  const [toast,             setToast]             = useState(null);

  // Load assets
  useEffect(() => {
    Promise.all([
      loadImage(playerSrc), loadImage(playerLeftSrc), loadImage(playerRightSrc),
      loadImage(enemy1Src), loadImage(enemy2Src), loadImage(bossSrc), loadImage(boss2Src),
      loadImage(bulletSrc), loadImage(bgSrc), loadImage(bg2Src), loadImage(bombSrc),
    ]).then(([player,playerLeft,playerRight,enemy1,enemy2,boss,boss2,bullet,bg,bg2,bomb]) => {
      assetsRef.current = { player,playerLeft,playerRight,enemy1,enemy2,boss,boss2,bullet,bg,bg2,bomb };
      setLoaded(true);
    });
  }, []);

  const startOrRestartGame = useCallback(() => {
    stateRef.current = startGame(stateRef.current, startLevelRef.current);
    wenTextsRef.current = []; shockwavesRef.current = [];
    bigWenRef.current = { active:false,age:0,maxAge:1100 };
    setShowLevelComplete(false); setSubmitStatus(null); setSubmitError(null);
    hasSubmittedRef.current = false; // Reset submission execution lock barrier
  }, []);

  // ── On-chain score submission ────────────────────────────────────────────────
  const submitScore = useCallback(async (score) => {
    if (!isConnected || !address) return;
    
    // Sync block guard mechanism against Double Execution race conditions
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    const points = Math.min(Math.round(score), 65535);   // uint16 max
    setSubmitStatus('pending'); setSubmitError(null);
    try {
      const receipt = await submitGuess(points);
      if (receipt.status !== 'success') throw new Error('Transaction reverted');

      const res = await fetch('http://127.0.0.1:5000/api/points/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, txHash: receipt.transactionHash, score: points, gameId: "default_legacy" }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'API error');

      setSubmitStatus('success');
    } catch (err) {
      console.error('Score submit:', err);
      // Unlock if error is recoverable, keeping it locked prevents user loop exploitation
      setSubmitStatus('error');
      setSubmitError(err?.shortMessage ?? err?.message ?? 'Unknown error');
    }
  }, [isConnected, address, submitGuess]);

  // Kick off submission safely exactly once when overlay mounts
  useEffect(() => {
    if (showLevelComplete && completedScore > 0 && !hasSubmittedRef.current) {
      submitScore(completedScore);
    }
  }, [showLevelComplete, completedScore, submitScore]);

  // Return to map — carry status as toast if needed
  const handleReturnToMap = useCallback(() => {
    setShowLevelComplete(false);
    if (submitStatus && submitStatus !== 'success') {
      setToast({ status: submitStatus, score: completedScore, error: submitError });
    }
    onBackToMap();
  }, [onBackToMap, submitStatus, completedScore, submitError]);

  // Input handling
  useEffect(() => {
    const keyMap = { ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',
      ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',' ':'fire' };

    const onKeyDown = (e) => {
      const phase = stateRef.current.phase;
      if (e.key==='Enter' && ['menu','gameOver','victory'].includes(phase)) { startOrRestartGame(); return; }
      if (e.key==='Escape') { handleReturnToMap(); return; }
      if ((e.key==='b'||e.key==='B') && !bombCoolRef.current) {
        const st = stateRef.current;
        if (st.player?.bombCount > 0) {
          wenTextsRef.current.push(...spawnWenTexts(st.enemies ?? []));
          const px = st.player.x+st.player.width/2, py = st.player.y+st.player.height/2;
          shockwavesRef.current.push({ x:px,y:py,age:0,maxAge:520 });
          bigWenRef.current = { active:true,age:0,maxAge:1100 };
        }
        inputRef.current.bomb = true; bombCoolRef.current = true;
        setTimeout(() => { inputRef.current.bomb=false; bombCoolRef.current=false; }, 300);
        return;
      }
      const m = keyMap[e.key]; if (m) { e.preventDefault(); inputRef.current[m]=true; }
    };
    const onKeyUp = (e) => { const m=keyMap[e.key]; if(m) inputRef.current[m]=false; };
    window.addEventListener('keydown',onKeyDown); window.addEventListener('keyup',onKeyUp);
    return () => { window.removeEventListener('keydown',onKeyDown); window.removeEventListener('keyup',onKeyUp); };
  }, [startOrRestartGame, handleReturnToMap]);

  useEffect(() => { if (loaded) startOrRestartGame(); }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = (time) => {
      const dt = Math.min(lastTimeRef.current ? time-lastTimeRef.current : 16, 50);
      lastTimeRef.current = time; tickRef.current += 1;
      const state = stateRef.current, input = inputRef.current;

      if (!['menu','gameOver','victory','levelComplete'].includes(state.phase)) {
        stateRef.current = tick(state,input,dt); input.switchWeapon=false; input.bomb=false;
      }

      const s=stateRef.current, assets=assetsRef.current, t=tickRef.current;

      if (s.phase==='levelComplete' && !showLevelComplete) {
        saveCompletedLevel(s.level); setCompletedLevel(s.level);
        setCompletedScore(s.score); setShowLevelComplete(true);
      }

      wenTextsRef.current = tickWenTexts(wenTextsRef.current, dt);
      shockwavesRef.current = shockwavesRef.current.map(sw=>{sw.age+=dt;return sw;}).filter(sw=>sw.age<sw.maxAge);
      if (bigWenRef.current.active) {
        bigWenRef.current.age += dt;
        if (bigWenRef.current.age >= bigWenRef.current.maxAge) bigWenRef.current.active=false;
      }

      const basePlayer=assets.player, baseBoss=assets.boss;
      if      (input.left&&!input.right)  assets.player=assets.playerLeft;
      else if (input.right&&!input.left)  assets.player=assets.playerRight;
      if (s.level>=2) assets.boss=assets.boss2;

      updateBgScroll(dt); ctx.save();
      if (s.screenShake>0) ctx.translate((Math.random()-0.5)*s.screenShake,(Math.random()-0.5)*s.screenShake);

      drawBackground(ctx,assets);
      if (s.phase!=='menu') {
        for(const p of s.particles)    if(p.active)  drawParticle(ctx,p);
        for(const pu of s.powerUps)    if(pu.active) drawPowerUp(ctx,pu,t);
        for(const a of s.asteroids)    if(a.active)  drawAsteroid(ctx,a);
        for(const e of s.enemies)      if(e.active)  drawEnemy(ctx,e,assets,t);
        for(const b of s.enemyBullets) if(b.active)  drawEnemyBullet(ctx,b);
        for(const b of s.bullets)      if(b.active)  drawBullet(ctx,b,t);
        drawPlayer(ctx,s.player,assets,t);
        drawHUD(ctx,s,t,assets);
        if(s.phase==='asteroids') drawAsteroidHUD(ctx,s.asteroidTimer);
        paintShockwaves(ctx,shockwavesRef.current);
        paintWenTexts(ctx,wenTextsRef.current);
        if(bigWenRef.current.active) paintBigWen(ctx,bigWenRef.current.age,bigWenRef.current.maxAge);
      }

      if      (s.phase==='menu')           drawMenu(ctx,s.highScore,t);
      else if (s.phase==='asteroidWarning') drawAsteroidWarning(ctx,s.asteroidWarningTimer);
      else if (s.phase==='bossWarning')     drawBossWarning(ctx,s.bossWarningTimer);
      else if (s.phase==='waveClear')       drawWaveClear(ctx,s.wave,s.waveClearTimer);
      else if (s.phase==='levelWarp')       drawLevelWarp(ctx,s.player,assets,s.warpTimer,s.warpNextLevel,t);
      else if (s.phase==='gameOver')        drawGameOver(ctx,s.score,s.highScore,s.wave,t);
      else if (s.phase==='victory')         drawVictory(ctx,s.score,s.highScore,t);

      ctx.restore(); assets.player=basePlayer; assets.boss=baseBoss;
      rafRef.current=requestAnimationFrame(loop);
    };

    rafRef.current=requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loaded]);

  const handleCanvasClick = useCallback(() => {
    if(['menu','gameOver','victory'].includes(stateRef.current.phase)) startOrRestartGame();
  }, [startOrRestartGame]);

  return (
    <div style={{ position:'fixed',inset:0,background:'#000511',display:'flex',alignItems:'center',justifyContent:'center' }}>
      <AnimatePresence>{!loaded && <LoadingScreen key="ld" />}</AnimatePresence>
      <AnimatePresence>{loaded  && <EscHint key="esc" />}</AnimatePresence>

      <div style={{ position:'relative' }}>
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onClick={handleCanvasClick}
          style={{ display:loaded?'block':'none', imageRendering:'auto', cursor:'crosshair',
            width:'min(100vw,calc(100vh*(900/650)))', height:'min(100vh,calc(100vw*(650/900)))' }} />

        <AnimatePresence>
          {showLevelComplete && (
            <LevelCompleteOverlay key="lc"
              level={completedLevel} score={completedScore}
              isConnected={isConnected} submitStatus={submitStatus} submitError={submitError}
              onContinue={handleReturnToMap}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Persistent toast for submission that outlasts the overlay */}
      <AnimatePresence>
        {toast && (
          <ScoreToast key="toast"
            status={submitStatus ?? toast.status} score={toast.score} error={submitError ?? toast.error}
            onDismiss={() => setToast(null)}
          />
        )}
      </AnimatePresence>

      <MobileControls inputRef={inputRef} stateRef={stateRef}
        wenTextsRef={wenTextsRef} shockwavesRef={shockwavesRef} bigWenRef={bigWenRef} />
    </div>
  );
}

// ─── Mobile controls ──────────────────────────────────────────────────────────

function MobileControls({ inputRef, stateRef, wenTextsRef, shockwavesRef, bigWenRef }) {
  if (!('ontouchstart' in window)) return null;
  const press = (k, v) => { inputRef.current[k]=v; };
  const dpad = (label, key) => (
    <motion.button whileTap={{ scale:0.85, opacity:0.6 }}
      style={{ background:'rgba(255,255,255,0.06)', backdropFilter:'blur(4px)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:16,color:'#fff',
        fontFamily: FONT_STACK, fontSize:22, padding:'14px 18px', touchAction:'none',
        userSelect:'none', WebkitUserSelect:'none', cursor:'pointer' }}
      onTouchStart={()=>press(key,true)} onTouchEnd={()=>press(key,false)}
    >{label}</motion.button>
  );
  const fireWen = () => {
    const st = stateRef.current;
    if (st?.player?.bombCount>0) {
      wenTextsRef.current.push(...spawnWenTexts(st.enemies??[]));
      const px=st.player.x+st.player.width/2, py=st.player.y+st.player.height/2;
      shockwavesRef.current.push({x:px,y:py,age:0,maxAge:520});
      bigWenRef.current={active:true,age:0,maxAge:1100};
    }
    press('bomb',true); setTimeout(()=>press('bomb',false),300);
  };
  return (
    <div style={{ position:'fixed',bottom:24,left:0,right:0,display:'flex',
      justifyContent:'space-between',padding:'0 24px',pointerEvents:'none',zIndex:10000 }}>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3,58px)',gridTemplateRows:'repeat(2,58px)',gap:8,pointerEvents:'all' }}>
        <div/>{dpad('▲','up')}<div/>
        {dpad('◀','left')}{dpad('▼','down')}{dpad('▶','right')}
      </div>
      <div style={{ display:'flex',flexDirection:'column',gap:12,pointerEvents:'all' }}>
        <motion.button whileTap={{ scale:0.85 }}
          style={{ background:'rgba(255, 68, 0, 0.3)', backdropFilter:'blur(4px)', border:'1px solid rgba(255,68,0,0.5)', borderRadius:16,color:'#fff',
            fontFamily: FONT_STACK, fontSize:22, padding:'14px 18px', touchAction:'none',
            userSelect:'none', WebkitUserSelect:'none', cursor:'pointer', boxShadow:'0 0 15px rgba(255,68,0,0.2)' }}
          onTouchStart={()=>press('fire',true)} onTouchEnd={()=>press('fire',false)}
        >🔥</motion.button>
        <motion.button whileTap={{ scale:0.8 }} transition={{ duration:0.2 }} onTouchStart={fireWen}
          style={{ background:'linear-gradient(135deg, rgba(255,68,0,0.6), rgba(255,0,153,0.6))', backdropFilter:'blur(4px)', border:'1px solid #ffaa00',
            borderRadius:16, color:'#ffdd00', fontFamily: FONT_STACK, fontSize:12, fontWeight:'bold',
            letterSpacing:1, padding:'10px 14px', lineHeight:1.3, touchAction:'none',
            userSelect:'none', WebkitUserSelect:'none', cursor:'pointer',
            textShadow:'0 0 8px #ff4400', boxShadow:'0 0 20px rgba(255,68,0,0.3)' }}
        >💥{'\n'}WEN</motion.button>
      </div>
    </div>
  );
}