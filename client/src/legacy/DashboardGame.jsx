import React, { useEffect, useRef, useState } from 'react';

const DashboardGame = () => {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [weaponLvl, setWeaponLvl] = useState(1);
  const [abilityReady, setAbilityReady] = useState(true);
  const [isGameOver, setIsGameOver] = useState(false);

  // Game Constants & State
  const WEAPONS = [
    { type: 0, color: '#ef4444', name: 'Twin' },
    { type: 1, color: '#4ade80', name: 'Spread' },
    { type: 2, color: '#a855f7', name: 'Plasma' }
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = window.innerHeight * 0.8;

    let animationId;
    let frames = 0;
    let enemies = [];
    let projectiles = [];
    let enemyProjectiles = [];
    let powerups = [];
    let particles = [];
    let boss = null;
    let gameState = 'PLAYING'; 
    let enemiesToSpawn = 10;
    let abilityCooldown = 0;

    // Smooth Movement Physics
    const player = {
      x: canvas.width / 2,
      y: canvas.height - 100,
      width: 40,
      height: 40,
      vx: 0,
      vy: 0,
      friction: 0.92, // The "Slower/Smooth" feel
      accel: 0.8,
      weaponType: 0,
      weaponLevel: 1,
      cooldown: 0
    };

    const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false, shift: false, space: false };

    const handleKeyDown = (e) => {
      if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
      if (e.code === 'Space') keys.space = true;
      if (e.shiftKey) keys.shift = true;
    };

    const handleKeyUp = (e) => {
      if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
      if (e.code === 'Space') keys.space = false;
      if (!e.shiftKey) keys.shift = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // --- GAME LOGIC FUNCTIONS ---

    const spawnEnemy = () => {
      enemies.push({
        x: Math.random() * (canvas.width - 40) + 20,
        y: -50,
        radius: 20,
        hp: 1 + Math.floor(level / 2),
        speed: 1.2 + (level * 0.1), // Slower, steady speed
        color: '#fb923c'
      });
    };

    const triggerNova = () => {
      if (abilityCooldown > 0) return;
      abilityCooldown = 600; // 10 seconds at 60fps
      setAbilityReady(false);
      
      // Visual Feedback
      createParticles(player.x + 20, player.y + 20, '#38bdf8', 100);
      
      // Damage all enemies
      enemies.forEach(enemy => {
        enemy.hp -= 5;
        createParticles(enemy.x, enemy.y, '#fff', 10);
      });
      enemyProjectiles = []; // Clear enemy bullets
    };

    const createParticles = (x, y, color, count = 10) => {
      for (let i = 0; i < count; i++) {
        particles.push({
          x, y, 
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 10,
          alpha: 1,
          color
        });
      }
    };

    // --- RENDER LOOP ---

    const update = () => {
      if (isGameOver) return;
      
      ctx.fillStyle = 'rgba(15, 17, 21, 0.4)'; // Dark background
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 1. Smooth Player Movement
      if (keys.w || keys.arrowup) player.vy -= player.accel;
      if (keys.s || keys.arrowdown) player.vy += player.accel;
      if (keys.a || keys.arrowleft) player.vx -= player.accel;
      if (keys.d || keys.arrowright) player.vx += player.accel;

      player.vx *= player.friction;
      player.vy *= player.friction;
      player.x += player.vx;
      player.y += player.vy;

      // Screen Boundaries
      if (player.x < 0) player.x = 0;
      if (player.x > canvas.width - player.width) player.x = canvas.width - player.width;
      if (player.y < 0) player.y = 0;
      if (player.y > canvas.height - player.height) player.y = canvas.height - player.height;

      // Ability Logic
      if (keys.shift && abilityCooldown === 0) triggerNova();
      if (abilityCooldown > 0) {
        abilityCooldown--;
        if (abilityCooldown === 0) setAbilityReady(true);
      }

      // Draw Player
      ctx.fillStyle = '#38bdf8';
      ctx.shadowBlur = 15; ctx.shadowColor = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(player.x + 20, player.y);
      ctx.lineTo(player.x + 40, player.y + 40);
      ctx.lineTo(player.x, player.y + 40);
      ctx.fill();
      ctx.shadowBlur = 0;

      // 2. Shooting
      if (keys.space && player.cooldown === 0) {
        projectiles.push({ x: player.x + 20, y: player.y, vy: -10, color: WEAPONS[player.weaponType].color });
        player.cooldown = 12;
      }
      if (player.cooldown > 0) player.cooldown--;

      projectiles.forEach((p, i) => {
        p.y += p.vy;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
        if (p.y < 0) projectiles.splice(i, 1);
      });

      // 3. Enemies
      if (frames % 100 === 0 && enemiesToSpawn > 0) {
        spawnEnemy();
        enemiesToSpawn--;
      }

      enemies.forEach((enemy, i) => {
        enemy.y += enemy.speed;
        ctx.fillStyle = enemy.color;
        ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2); ctx.fill();

        // Check Collision with Projectiles
        projectiles.forEach((p, pi) => {
          if (Math.hypot(p.x - enemy.x, p.y - enemy.y) < enemy.radius) {
            enemy.hp--;
            projectiles.splice(pi, 1);
            if (enemy.hp <= 0) {
              createParticles(enemy.x, enemy.y, enemy.color);
              if (Math.random() < 0.2) {
                powerups.push({ x: enemy.x, y: enemy.y, type: Math.floor(Math.random() * 3) });
              }
              enemies.splice(i, 1);
              setScore(s => s + 10);
            }
          }
        });

        // Player Collision
        if (Math.hypot(player.x + 20 - enemy.x, player.y + 20 - enemy.y) < enemy.radius + 15) {
          setIsGameOver(true);
        }
      });

      // 4. Powerups
      powerups.forEach((pu, i) => {
        pu.y += 2;
        ctx.fillStyle = WEAPONS[pu.type].color;
        ctx.beginPath(); ctx.arc(pu.x, pu.y, 10, 0, Math.PI * 2); ctx.fill();
        
        if (Math.hypot(player.x + 20 - pu.x, player.y + 20 - pu.y) < 25) {
            if (player.weaponType === pu.type) {
                player.weaponLevel = Math.min(5, player.weaponLevel + 1);
            } else {
                player.weaponType = pu.type;
                player.weaponLevel = 1;
            }
            setWeaponLvl(player.weaponLevel);
            powerups.splice(i, 1);
        }
      });

      // 5. Particles
      particles.forEach((part, i) => {
        part.x += part.vx;
        part.y += part.vy;
        part.alpha -= 0.02;
        ctx.globalAlpha = part.alpha;
        ctx.fillStyle = part.color;
        ctx.fillRect(part.x, part.y, 2, 2);
        ctx.globalAlpha = 1;
        if (part.alpha <= 0) particles.splice(i, 1);
      });

      frames++;
      animationId = requestAnimationFrame(update);
    };

    animationId = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isGameOver, level]);

  return (
    <div className="relative w-full flex flex-col items-center bg-[#0f1115] p-4 rounded-xl border border-white/5 font-sans">
      <div className="flex justify-between w-full max-w-[800px] mb-4">
        <div className="text-white uppercase font-bold tracking-widest">Score: <span className="text-orange-500">{score}</span></div>
        <div className="flex gap-4">
            <div className={`px-3 py-1 rounded text-xs font-bold border ${abilityReady ? 'border-cyan-500 text-cyan-500 animate-pulse' : 'border-white/10 text-white/20'}`}>
                NOVA BLAST [SHIFT]
            </div>
            <div className="text-white uppercase font-bold tracking-widest text-sm bg-white/5 px-3 py-1 rounded">Weapon Lvl: {weaponLvl}</div>
        </div>
      </div>

      <canvas ref={canvasRef} className="rounded-lg border border-white/10 cursor-none" />

      {isGameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md rounded-xl">
          <h2 className="text-5xl font-black text-red-500 mb-4">WIPED OUT</h2>
          <p className="text-white mb-8">System Reconnaissance Failed.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-10 py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-full transition-all"
          >
            REBOOT SYSTEM
          </button>
        </div>
      )}
    </div>
  );
};

export default DashboardGame;