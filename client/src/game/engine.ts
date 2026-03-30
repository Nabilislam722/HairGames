import type { GameState, Player, Enemy, Bullet, EnemyBullet, Particle, PowerUp } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_MAX_HP, PLAYER_MAX_SHIELD, WEAPONS } from './constants';
import { createBullets, upgradeWeapon, switchWeapon } from './weapons';
import {
  spawnWave, spawnBoss, updateEnemy, enemyShoot, spawnDropParticles,
  updateHomingBullet, tickLaser, laserHitsPlayer,
} from './enemies';
import { maybeDropPowerUp } from './powerups';
import { spawnAsteroidWave, updateAsteroids, spawnAsteroidDebris, createAsteroid } from './asteroids';
import { TOTAL_LEVELS, WAVES_PER_LEVEL } from './constants';

const ASTEROID_PHASE_DURATION = 18000;

export function createInitialState(): GameState {
  return {
    phase: 'menu',
    score: 0,
    level: 1,
    wave: 1,
    highScore: parseInt(localStorage.getItem('voidStrikerHighScore') ?? '0'),
    player: createPlayer(),
    enemies: [],
    bullets: [],
    enemyBullets: [],
    particles: [],
    powerUps: [],
    asteroids: [],
    screenShake: 0,
    bossWarningTimer: 0,
    waveClearTimer: 0,
    asteroidTimer: 0,
    asteroidWarningTimer: 0,
    asteroidSpawnTimer: 0,
    warpTimer: 0,
    warpNextLevel: 1,
    levelCompleteTimer: 0,
  };
}

export function createPlayer(): Player {
  return {
    x: CANVAS_WIDTH / 2 - 38,
    y: CANVAS_HEIGHT - 120,
    width: 76,
    height: 90,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    shield: 0,
    maxShield: PLAYER_MAX_SHIELD,
    speed: 5,
    invincible: false,
    invincibleTimer: 0,
    weapon: { ...WEAPONS.laser },
    fireTimer: 0,
    bombCount: 2,
    active: true,
  };
}

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
  switchWeapon: boolean;
  bomb: boolean;
}

export function startGame(state: GameState, startLevel = 1): GameState {
  return {
    ...createInitialState(),
    phase: 'wave' as const,
    highScore: state.highScore,
    level: startLevel,
    wave: 1,
    enemies: spawnWave(startLevel, 1),
  };
}

export function tick(state: GameState, input: InputState, dt: number): GameState {
  if (
    state.phase === 'menu'         ||
    state.phase === 'gameOver'     ||
    state.phase === 'victory'      ||
    state.phase === 'levelComplete'
  ) {
    return state;
  }

  let s = { ...state };
  s.player       = { ...s.player };
  s.enemies      = [...(s.enemies      ?? [])];
  s.bullets      = [...(s.bullets      ?? [])];
  s.enemyBullets = [...(s.enemyBullets ?? [])];
  s.particles    = [...(s.particles    ?? [])];
  s.powerUps     = [...(s.powerUps     ?? [])];
  s.asteroids    = [...(s.asteroids    ?? [])];
  s.asteroidTimer        = s.asteroidTimer        ?? 0;
  s.asteroidWarningTimer = s.asteroidWarningTimer ?? 0;
  s.asteroidSpawnTimer   = s.asteroidSpawnTimer   ?? 0;
  s.level = s.level ?? 1;
  s.wave  = s.wave  ?? 1;

  s.screenShake = Math.max(0, s.screenShake - dt * 0.06);

  // ── ASTEROID WARNING ──────────────────────────────────────────────────────
  if (s.phase === 'asteroidWarning') {
    s.asteroidWarningTimer -= dt;
    updateParticles(s.particles, dt);
    if (s.asteroidWarningTimer <= 0) {
      s.phase              = 'asteroids';
      s.asteroidTimer      = ASTEROID_PHASE_DURATION;
      s.asteroidSpawnTimer = 0;
      s.asteroids          = spawnAsteroidWave(s.level);
    }
    return s;
  }

  // ── ASTEROID PHASE ────────────────────────────────────────────────────────
  if (s.phase === 'asteroids') {
    s.asteroidTimer      -= dt;
    s.asteroidSpawnTimer -= dt;

    if (s.asteroidSpawnTimer <= 0 && s.asteroidTimer > 3000) {
      s.asteroidSpawnTimer = Math.max(1200, 2500 - s.level * 200);
      s.asteroids = [...s.asteroids, createAsteroid(s.level)];
    }

    movePlayer(s.player, input, dt);
    s.player.fireTimer -= dt;
    if (input.fire && s.player.fireTimer <= 0) {
      s.player.fireTimer = s.player.weapon.fireRate;
      s.bullets = [...s.bullets, ...createBullets(s.player)];
    }

    if (input.bomb && s.player.bombCount > 0) {
      s.player.bombCount -= 1;
      for (const a of s.asteroids) a.hp = 0;
      s.screenShake = 25;
    }

    tickInvincible(s.player, dt);
    s.bullets = updateBullets(s.bullets, dt);
    updateAsteroids(s.asteroids, dt);

    for (const b of s.bullets) {
      if (!b.active) continue;
      for (const a of s.asteroids) {
        if (!a.active) continue;
        if (circleRectsOverlap(b, a)) {
          b.active = false;
          a.hp    -= b.damage;
          s.particles = [...s.particles, ...makeHitSpark(b.x + b.width / 2, b.y + b.height / 2, '#ffaa55')];
          if (a.hp <= 0) {
            a.active = false;
            s.score += Math.floor(a.size * 3 + s.level * 10);
            s.particles = [...s.particles, ...spawnAsteroidDebris(a)];
            s.screenShake = Math.max(s.screenShake, a.size > 30 ? 8 : 4);
            if (a.size > 30 && Math.random() < 0.2) {
              const pu = maybeDropPowerUp(a.x + a.width / 2, a.y + a.height / 2, false, s.score);
              if (pu) s.powerUps = [...s.powerUps, pu];
            }
          }
          break;
        }
      }
    }

    for (const a of s.asteroids) {
      if (!a.active) continue;
      if (!s.player.invincible && circleRectsOverlap(a, {
        x: s.player.x + 10, y: s.player.y + 10,
        width: s.player.width - 20, height: s.player.height - 20, size: 8,
      })) {
        a.active = false;
        s.particles = [...s.particles, ...spawnAsteroidDebris(a)];
        let dmg = Math.floor(a.size * 0.8);
        if (s.player.shield > 0) {
          const absorbed = Math.min(s.player.shield, dmg);
          s.player.shield -= absorbed; dmg -= absorbed;
        }
        if (dmg > 0) {
          s.player.hp -= dmg;
          s.player.invincible = true; s.player.invincibleTimer = 1500;
          s.screenShake = Math.max(s.screenShake, 10);
        }
      }
    }

    tickPowerUps(s, dt);
    updateParticles(s.particles, dt);
    s.bullets   = s.bullets.filter(b => b.active);
    s.asteroids = s.asteroids.filter(a => a.active);
    s.particles = s.particles.filter(p => p.active);
    s.powerUps  = s.powerUps.filter(p => p.active);

    if (playerDead(s)) return gameOverState(s);

    if (s.asteroidTimer <= 0) {
      s.asteroids        = [];
      s.phase            = 'bossWarning';
      s.bossWarningTimer = 3000;
    }
    return s;
  }

  // ── BOSS WARNING ──────────────────────────────────────────────────────────
  if (s.phase === 'bossWarning') {
    s.bossWarningTimer -= dt;
    if (s.bossWarningTimer <= 0) {
      s.phase   = 'boss';
      s.enemies = [spawnBoss(s.level)];
    }
    return s;
  }

  // ── LEVEL WARP ────────────────────────────────────────────────────────────
  if (s.phase === 'levelWarp') {
    s.warpTimer -= dt;
    updateParticles(s.particles, dt);
    s.particles = s.particles.filter(p => p.active);
    if (s.warpTimer <= 0) {
      s.level      = s.warpNextLevel;
      s.wave       = 0;
      s.phase      = 'waveClear';
      s.waveClearTimer = 2000;
      s.player.bombCount = Math.min(s.player.bombCount + 2, 5);
      s.player.x = CANVAS_WIDTH / 2 - s.player.width / 2;
      s.player.y = CANVAS_HEIGHT - 120;
    }
    return s;
  }

  // ── WAVE CLEAR ────────────────────────────────────────────────────────────
  if (s.phase === 'waveClear') {
    s.waveClearTimer -= dt;
    updateParticles(s.particles, dt);
    if (s.waveClearTimer <= 0) {
      s.wave += 1;
      s.phase   = 'wave';
      s.enemies = spawnWave(s.level, s.wave);
      s.player.bombCount = Math.min(s.player.bombCount + 1, 5);
    }
    return s;
  }

  // ── ACTIVE WAVE / BOSS ────────────────────────────────────────────────────
  movePlayer(s.player, input, dt);

  s.player.fireTimer -= dt;
  if (input.fire && s.player.fireTimer <= 0) {
    s.player.fireTimer = s.player.weapon.fireRate;
    s.bullets = [...s.bullets, ...createBullets(s.player)];
  }

  if (input.bomb && s.player.bombCount > 0) {
    s.player.bombCount -= 1;
    s.enemyBullets = s.enemyBullets.map(b => ({ ...b, active: false }));
    const BOMB_DMG = 35;
    for (const e of s.enemies) {
      if (!e.active) continue;
      if (e.type !== 'boss') {
        e.hp -= BOMB_DMG;
        s.particles = [...s.particles, ...makeHitSpark(e.x + e.width / 2, e.y + e.height / 2, '#ff8800')];
        if (e.hp <= 0) {
          e.active = false;
          s.score += e.scoreValue;
          s.particles = [...s.particles, ...spawnDropParticles(e.x + e.width / 2, e.y + e.height / 2)];
          const pu = maybeDropPowerUp(e.x + e.width / 2, e.y + e.height / 2, false, s.score);
          if (pu) s.powerUps = [...s.powerUps, pu];
        }
      } else {
        e.hp -= 20;
        s.particles = [...s.particles, ...makeHitSpark(e.x + e.width / 2, e.y + e.height / 2, '#ff4400')];
      }
    }
    s.screenShake = 30;
  }

  tickInvincible(s.player, dt);
  s.bullets      = updateBullets(s.bullets, dt);
  s.enemyBullets = updateEnemyBullets(
    s.enemyBullets, dt,
    s.player.x + s.player.width  / 2,
    s.player.y + s.player.height / 2,
  );

  for (const e of s.enemies) {
    if (!e.active) continue;
    updateEnemy(e, dt, s.player.x + s.player.width / 2, s.player.y + s.player.height / 2);

    if (e.type === 'boss') {
      const ratio  = e.hp / e.maxHp;
      e.phase      = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
      e.enrageMode = ratio < 0.2;
    }

    e.shootTimer -= dt;
    const shootInt = e.enrageMode ? e.shootInterval * 0.55 : e.shootInterval;
    if (e.shootTimer <= 0 && !e.entering) {
      e.shootTimer = shootInt * (0.75 + Math.random() * 0.5);
      const newBullets = enemyShoot(e, s.player.x + s.player.width / 2, s.player.y);
      s.enemyBullets = [...s.enemyBullets, ...newBullets];
    }
  }

  // Player bullets vs enemies
  for (const b of s.bullets) {
    if (!b.active) continue;
    for (const e of s.enemies) {
      if (!e.active) continue;
      if (rectsOverlap(b, e)) {
        b.active = false;
        e.hp    -= b.damage;
        s.particles = [...s.particles, ...makeHitSpark(b.x + b.width / 2, b.y + b.height / 2, b.color)];
        if (e.hp <= 0) {
          e.active = false;
          s.score += e.scoreValue;
          s.screenShake = Math.max(s.screenShake, e.type === 'boss' ? 20 : 5);
          s.particles = [...s.particles, ...spawnDropParticles(e.x + e.width / 2, e.y + e.height / 2)];
          const pu = maybeDropPowerUp(e.x + e.width / 2, e.y + e.height / 2, e.type === 'boss', s.score);
          if (pu) s.powerUps = [...s.powerUps, pu];
        }
        break;
      }
    }
  }

  // Enemy bullets (and lasers) vs player
  const px = s.player.x + 8,  py = s.player.y + 8;
  const pw = s.player.width - 16, ph = s.player.height - 16;

  for (const b of s.enemyBullets) {
    if (!b.active) continue;

    // ── Laser beam — continuous damage per frame ──────────────────────────
    if (b.isLaser) {
      if (!s.player.invincible && laserHitsPlayer(b, px, py, pw, ph)) {
        // Small damage per tick so beam feels like continuous burn
        const dmgPerTick = Math.ceil(b.damage * 0.06);
        let dmg = dmgPerTick;
        if (s.player.shield > 0) {
          const absorbed = Math.min(s.player.shield, dmg);
          s.player.shield -= absorbed; dmg -= absorbed;
        }
        if (dmg > 0) {
          s.player.hp -= dmg;
          s.player.invincible    = true;
          s.player.invincibleTimer = 120;   // short window → continuous burn
          s.screenShake = Math.max(s.screenShake, 3);
        }
      }
      continue;
    }

    // ── Normal / homing bullet ────────────────────────────────────────────
    if (!s.player.invincible && rectsOverlap(b, { x: px, y: py, width: pw, height: ph, active: true })) {
      b.active = false;
      let dmg  = b.damage;
      if (s.player.shield > 0) {
        const absorbed = Math.min(s.player.shield, dmg);
        s.player.shield -= absorbed; dmg -= absorbed;
      }
      if (dmg > 0) {
        s.player.hp -= dmg;
        s.player.invincible    = true;
        s.player.invincibleTimer = 1200;
        s.screenShake = Math.max(s.screenShake, 8);
      }
      s.particles = [...s.particles, ...makeHitSpark(b.x + b.width / 2, b.y + b.height / 2, '#ff4444')];
    }
  }

  // Enemies touching player
  for (const e of s.enemies) {
    if (!e.active || e.entering) continue;
    if (!s.player.invincible && rectsOverlap(e, { x: px, y: py, width: pw, height: ph, active: true })) {
      if (e.type !== 'boss') {
        e.active = false;
        s.score += Math.floor(e.scoreValue / 2);
        s.particles = [...s.particles, ...spawnDropParticles(e.x + e.width / 2, e.y + e.height / 2)];
      }
      let dmg = 25;
      if (s.player.shield > 0) {
        const absorbed = Math.min(s.player.shield, dmg);
        s.player.shield -= absorbed; dmg -= absorbed;
      }
      if (dmg > 0) {
        s.player.hp -= dmg;
        s.player.invincible    = true;
        s.player.invincibleTimer = 1500;
        s.screenShake = Math.max(s.screenShake, 10);
      }
    }
  }

  tickPowerUps(s, dt);
  updateParticles(s.particles, dt);

  s.bullets      = s.bullets.filter(b => b.active);
  s.enemyBullets = s.enemyBullets.filter(b => b.active);
  s.enemies      = s.enemies.filter(e => e.active);
  s.particles    = s.particles.filter(p => p.active);
  s.powerUps     = s.powerUps.filter(p => p.active);

  if (playerDead(s)) return gameOverState(s);

  // ── Wave / boss clear check ────────────────────────────────────────────────
  if (s.enemies.length === 0) {
    if (s.phase === 'boss') {
      if (s.level >= TOTAL_LEVELS) {
        s.phase = 'victory';
        saveHighScore(s);
      } else {
        // Level complete — Game.jsx detects this phase, shows overlay & saves progress
        s.phase             = 'levelComplete';
        s.levelCompleteTimer = 0;
        s.player.hp         = Math.min(s.player.maxHp,     s.player.hp + 30);
        s.player.shield     = Math.min(s.player.maxShield, s.player.shield + 20);
        s.player.bombCount  = Math.min(s.player.bombCount + 2, 5);
        saveHighScore(s);
      }
    } else {
      if (s.wave >= WAVES_PER_LEVEL) {
        // Even levels get an asteroid field before the boss
        if (s.level % 2 === 0) {
          s.phase                = 'asteroidWarning';
          s.asteroidWarningTimer = 2800;
        } else {
          s.phase            = 'bossWarning';
          s.bossWarningTimer = 3000;
        }
      } else {
        s.phase          = 'waveClear';
        s.waveClearTimer = 1800;
      }
    }
  }

  return s;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function movePlayer(player: Player, input: InputState, dt: number) {
  const speed = player.speed * (dt / 16);
  if (input.left)  player.x = Math.max(0,                          player.x - speed);
  if (input.right) player.x = Math.min(CANVAS_WIDTH - player.width, player.x + speed);
  if (input.up)    player.y = Math.max(40,                          player.y - speed);
  if (input.down)  player.y = Math.min(CANVAS_HEIGHT - player.height - 5, player.y + speed);
}

function tickInvincible(player: Player, dt: number) {
  if (player.invincible) {
    player.invincibleTimer -= dt;
    if (player.invincibleTimer <= 0) player.invincible = false;
  }
}

function updateBullets(bullets: Bullet[], dt: number): Bullet[] {
  for (const b of bullets) {
    if (!b.active) continue;
    b.x += b.vx * (dt / 16);
    b.y += b.vy * (dt / 16);
    if (b.y < -40 || b.y > CANVAS_HEIGHT + 40 || b.x < -50 || b.x > CANVAS_WIDTH + 50) b.active = false;
  }
  return bullets;
}

function updateEnemyBullets(
  bullets: EnemyBullet[], dt: number,
  playerX: number, playerY: number
): EnemyBullet[] {
  for (const b of bullets) {
    if (!b.active) continue;

    if (b.isLaser) {
      tickLaser(b, dt);
      continue;
    }

    if (b.isHoming) {
      updateHomingBullet(b, playerX, playerY);
    }

    b.x += b.vx * (dt / 16);
    b.y += b.vy * (dt / 16);
    if (b.y > CANVAS_HEIGHT + 40 || b.y < -40 || b.x < -80 || b.x > CANVAS_WIDTH + 80) {
      b.active = false;
    }
  }
  return bullets;
}

function updateParticles(particles: Particle[], dt: number) {
  for (const p of particles) {
    if (!p.active) continue;
    p.x  += p.vx * (dt / 16);
    p.y  += p.vy * (dt / 16);
    p.vx *= 0.96; p.vy *= 0.96;
    p.life += dt;
    if (p.life >= p.maxLife) p.active = false;
  }
}

function tickPowerUps(s: GameState, dt: number) {
  for (const pu of s.powerUps) {
    if (!pu.active) continue;
    pu.y         += pu.vy;
    pu.angle     += 0.04;
    pu.glowTimer += dt;
    if (pu.y > CANVAS_HEIGHT + 50) { pu.active = false; continue; }
    if (rectsOverlap(pu, { x: s.player.x + 4, y: s.player.y + 4, width: s.player.width - 8, height: s.player.height - 8, active: true })) {
      applyPowerUp(s, pu);
      pu.active = false;
    }
  }
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function circleRectsOverlap(
  bullet:   { x: number; y: number; width: number; height: number },
  asteroid: { x: number; y: number; width: number; height: number; size: number }
): boolean {
  const acx = asteroid.x + asteroid.width  / 2;
  const acy = asteroid.y + asteroid.height / 2;
  const bcx = bullet.x   + bullet.width    / 2;
  const bcy = bullet.y   + bullet.height   / 2;
  const dx = acx - bcx, dy = acy - bcy;
  return Math.sqrt(dx * dx + dy * dy) < asteroid.size + Math.max(bullet.width, bullet.height) / 2;
}

function applyPowerUp(state: GameState, pu: PowerUp) {
  switch (pu.type) {
    case 'weaponUpgrade':
      state.player.weapon = upgradeWeapon(state.player.weapon);
      spawnUpgradeParticles(state);
      break;
    case 'weaponSwitch':
      if (pu.weaponType) state.player.weapon = switchWeapon(state.player.weapon.type, pu.weaponType);
      spawnUpgradeParticles(state);
      break;
    case 'health':
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 30);
      break;
    case 'shield':
      state.player.shield = Math.min(state.player.maxShield, state.player.shield + state.player.maxShield);
      break;
    case 'bomb':
      state.player.bombCount = Math.min(state.player.bombCount + 1, 5);
      break;
  }
}

function spawnUpgradeParticles(state: GameState) {
  for (let i = 0; i < 25; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    state.particles.push({
      x: state.player.x + state.player.width  / 2,
      y: state.player.y + state.player.height / 2,
      width: 2, height: 2,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0, maxLife: 500,
      color: '#ffdd00', size: 3 + Math.random() * 4,
      alpha: 1, active: true,
    });
  }
}

function makeHitSpark(x: number, y: number, color: string): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    particles.push({
      x, y, width: 2, height: 2,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0, maxLife: 200 + Math.random() * 200,
      color, size: 1 + Math.random() * 3, alpha: 1, active: true,
    });
  }
  return particles;
}

function playerDead(s: GameState): boolean { return s.player.hp <= 0; }

function gameOverState(s: GameState): GameState {
  s.player.hp = 0;
  s.phase     = 'gameOver';
  saveHighScore(s);
  return s;
}

function saveHighScore(s: GameState) {
  if (s.score > s.highScore) {
    s.highScore = s.score;
    localStorage.setItem('voidStrikerHighScore', String(s.score));
  }
}