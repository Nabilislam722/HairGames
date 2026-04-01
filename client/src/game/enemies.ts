import type { Enemy, EnemyBullet, Particle, EnemyType } from './types';
import { ENEMY_CONFIGS } from './constants';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

// ─── Formation helpers ────────────────────────────────────────────────────────

type FormationSlot = { x: number; y: number; type: EnemyType };

function clampSlots(slots: FormationSlot[]): FormationSlot[] {
  const MAX_Y = CANVAS_HEIGHT * 0.50;
  const MARGIN_X = 70;
  return slots.map(slot => ({
    ...slot,
    x: Math.max(MARGIN_X, Math.min(CANVAS_WIDTH - MARGIN_X, slot.x)),
    y: Math.max(60, Math.min(MAX_Y, slot.y)),
  }));
}

function formationGrid(cols: number, rows: number, spacingX = 70, spacingY = 60): FormationSlot[] {
  const slots: FormationSlot[] = [];
  const startX = (CANVAS_WIDTH - (cols - 1) * spacingX) / 2;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      slots.push({ x: startX + c * spacingX, y: 80 + r * spacingY, type: r === 0 ? 'fighter' : 'drone' });
  return slots;
}

function formationV(size: number): FormationSlot[] {
  const slots: FormationSlot[] = [];
  const cx = CANVAS_WIDTH / 2;
  for (let i = 0; i < size; i++) {
    const left = i % 2 === 0;
    const row = Math.floor(i / 2);
    slots.push({ x: cx + (left ? -(row + 1) : (row + 1)) * 65, y: 80 + row * 55, type: row === 0 ? 'fighter' : 'drone' });
  }
  slots.push({ x: cx, y: 80 + Math.floor(size / 2) * 55 + 55, type: 'drone' });
  return slots;
}

function formationDiamond(count: number): FormationSlot[] {
  const slots: FormationSlot[] = [];
  const cx = CANVAS_WIDTH / 2, cy = 160;
  const rings = Math.ceil(Math.sqrt(count / Math.PI));
  let added = 0;
  slots.push({ x: cx, y: cy, type: 'fighter' }); added++;
  for (let r = 1; r <= rings && added < count; r++) {
    const perRing = r * 4;
    for (let i = 0; i < perRing && added < count; i++) {
      const angle = (Math.PI * 2 * i) / perRing;
      slots.push({ x: cx + Math.cos(angle) * r * 65, y: cy + Math.sin(angle) * r * 45, type: r === 1 ? 'fighter' : 'drone' });
      added++;
    }
  }
  return slots;
}

function formationTwoColumns(count: number): FormationSlot[] {
  const slots: FormationSlot[] = [];
  const half = Math.ceil(count / 2);
  for (let i = 0; i < half; i++)
    slots.push({ x: CANVAS_WIDTH * 0.28, y: 70 + i * 62, type: i === 0 ? 'fighter' : 'drone' });
  for (let i = 0; i < count - half; i++)
    slots.push({ x: CANVAS_WIDTH * 0.72, y: 70 + i * 62, type: i === 0 ? 'fighter' : 'drone' });
  return slots;
}

function formationStaircase(count: number): FormationSlot[] {
  const slots: FormationSlot[] = [];
  const cols = Math.ceil(count / 2);
  const spacingX = (CANVAS_WIDTH - 160) / Math.max(1, cols - 1);
  for (let i = 0; i < count; i++) {
    const row = i % 2, col = Math.floor(i / 2);
    slots.push({ x: 80 + col * spacingX, y: Math.min(80 + row * 62 + col * 8, CANVAS_HEIGHT * 0.42), type: row === 0 ? 'fighter' : 'drone' });
  }
  return slots;
}

function formationCircle(count: number): FormationSlot[] {
  const slots: FormationSlot[] = [];
  const cx = CANVAS_WIDTH / 2, cy = 180, r = 130;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    slots.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r * 0.6, type: i % 3 === 0 ? 'fighter' : 'drone' });
  }
  return slots;
}

function formationArrow(count: number): FormationSlot[] {
  const slots: FormationSlot[] = [];
  const cx = CANVAS_WIDTH / 2;
  let added = 0;
  for (let r = 0; r < Math.ceil(count / 3) && added < count; r++) {
    const cols = r * 2 + 1;
    const startX = cx - r * 65;
    for (let c = 0; c < cols && added < count; c++) {
      slots.push({ x: startX + c * 65, y: 70 + r * 60, type: r === 0 ? 'fighter' : 'drone' });
      added++;
    }
  }
  return slots;
}

function formationWave(count: number): FormationSlot[] {
  const slots: FormationSlot[] = [];
  const cols = Math.ceil(count / 2);
  const spacingX = (CANVAS_WIDTH - 160) / Math.max(1, cols - 1);
  for (let i = 0; i < count; i++) {
    const row = i % 2, col = Math.floor(i / 2);
    const waveOffset = Math.sin((col / Math.max(1, cols - 1)) * Math.PI) * 50;
    slots.push({ x: 80 + col * spacingX, y: 70 + row * 65 + waveOffset, type: row === 0 ? 'fighter' : 'drone' });
  }
  return slots;
}

const FORMATIONS = [
  (n: number) => formationGrid(Math.min(5, Math.ceil(Math.sqrt(n))), Math.ceil(n / Math.min(5, Math.ceil(Math.sqrt(n))))),
  (n: number) => formationV(n - 1),
  (n: number) => formationDiamond(n),
  (n: number) => formationTwoColumns(n),
  (n: number) => formationStaircase(n),
  (n: number) => formationCircle(n),
  (n: number) => formationArrow(n),
  (n: number) => formationWave(n),
];

// ─── Entry paths ──────────────────────────────────────────────────────────────

function makeEntryPath(idx: number, total: number, targetX: number, targetY: number) {
  const sides = ['top', 'left', 'right', 'top-left', 'top-right'];
  const side = sides[Math.floor(Math.abs(Math.sin(total * 7)) * sides.length) % sides.length];
  const t = idx / Math.max(1, total - 1);
  let startX: number, startY: number, ctrlX: number, ctrlY: number;

  if (side === 'top') {
    startX = targetX + (Math.random() - 0.5) * 200; startY = -80;
    ctrlX = CANVAS_WIDTH / 2 + (Math.random() - 0.5) * 300; ctrlY = CANVAS_HEIGHT * 0.25;
  } else if (side === 'left') {
    startX = -80; startY = 60 + t * 150;
    ctrlX = CANVAS_WIDTH * 0.35; ctrlY = 60;
  } else if (side === 'right') {
    startX = CANVAS_WIDTH + 80; startY = 60 + t * 150;
    ctrlX = CANVAS_WIDTH * 0.65; ctrlY = 60;
  } else if (side === 'top-left') {
    startX = -80; startY = -80;
    ctrlX = CANVAS_WIDTH * 0.3; ctrlY = CANVAS_HEIGHT * 0.12;
  } else {
    startX = CANVAS_WIDTH + 80; startY = -80;
    ctrlX = CANVAS_WIDTH * 0.7; ctrlY = CANVAS_HEIGHT * 0.12;
  }
  return { startX, startY, ctrlX, ctrlY };
}

// ─── Spawn wave ───────────────────────────────────────────────────────────────

export function spawnWave(level: number, subWave: number): Enemy[] {
  const count = Math.min(8 + level * 3 + subWave * 2, 20);
  const formIdx = Math.floor(Math.random() * FORMATIONS.length);
  const slots = clampSlots(FORMATIONS[formIdx](count));
  const shootBase = 3800 - level * 200 - subWave * 100;

  return slots.map((slot, i) => {
    const type = slot.type as EnemyType;
    const cfg = ENEMY_CONFIGS[type];
    const delay = i * 80;
    const { startX, startY, ctrlX, ctrlY } = makeEntryPath(i, slots.length, slot.x, slot.y);
    return {
      x: startX, y: startY,
      width: cfg.width, height: cfg.height,
      hp: cfg.maxHp + level * 10, maxHp: cfg.maxHp + level * 10,
      speed: cfg.speed + level * 0.15,
      scoreValue: cfg.scoreValue,
      movePattern: type === 'fighter' ? 'zigzag' : 'formation',
      shootTimer: delay + 1500 + Math.random() * 1000,
      shootInterval: Math.max(1500, shootBase + Math.random() * 400),
      active: true, type,
      formationIndex: i,
      baseX: slot.x, baseY: slot.y,
      angle: 0,
      entering: true, entryProgress: 0, entryDelay: delay,
      entryStartX: startX, entryStartY: startY,
      entryCtrlX: ctrlX, entryCtrlY: ctrlY,
    };
  });
}

// ─── Spawn boss ───────────────────────────────────────────────────────────────

export function spawnBoss(level: number): Enemy {
  const cfg = ENEMY_CONFIGS.boss;
  const bossHp = cfg.maxHp + (level - 1) * 4000;
  const cx = CANVAS_WIDTH / 2 - cfg.width / 2;
  return {
    x: cx, y: -cfg.height,
    width: cfg.width, height: cfg.height,
    hp: bossHp, maxHp: bossHp,
    speed: cfg.speed,
    scoreValue: cfg.scoreValue + (level - 1) * 1500,
    movePattern: 'boss',
    shootTimer: 0,
    shootInterval: Math.max(800, cfg.shootInterval - (level - 1) * 80),
    active: true,
    type: 'boss',
    angle: 0,
    phase: 1,
    baseX: cx, baseY: 60,
    bossLevel: level,        // ← which level this boss is
    spiralAngle: 0,          // ← persistent angle for spiral attack
    entering: true, entryProgress: 0, entryDelay: 0,
    entryStartX: cx, entryStartY: -cfg.height,
    entryCtrlX: cx, entryCtrlY: -cfg.height,
  };
}

// ─── Bezier ───────────────────────────────────────────────────────────────────

function bezier(t: number, p0: number, p1: number, p2: number): number {
  return (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
}

// ─── Update enemy ─────────────────────────────────────────────────────────────

export function updateEnemy(enemy: Enemy, dt: number, playerX: number, playerY: number): void {
  if (!enemy.active) return;

  if (enemy.entering) {
    if (enemy.entryDelay > 0) { enemy.entryDelay -= dt; return; }
    const entrySpeed = 0.0012 + (enemy.type === 'boss' ? 0.0004 : 0);
    enemy.entryProgress = Math.min(1, enemy.entryProgress + dt * entrySpeed);
    const t = easingOutBack(enemy.entryProgress);
    enemy.x = bezier(t, enemy.entryStartX, enemy.entryCtrlX, enemy.baseX ?? enemy.x);
    enemy.y = bezier(t, enemy.entryStartY, enemy.entryCtrlY, enemy.baseY ?? enemy.y);
    if (enemy.entryProgress >= 1) {
      enemy.entering = false;
      enemy.x = enemy.baseX ?? enemy.x;
      enemy.y = enemy.baseY ?? enemy.y;
    }
    return;
  }

  enemy.angle = (enemy.angle ?? 0) + dt * 0.001;

  switch (enemy.movePattern) {
    case 'formation': {
      const tx = (enemy.baseX ?? enemy.x) + Math.sin(enemy.angle!) * 38;
      const ty = enemy.baseY ?? 120;
      enemy.x += (tx - enemy.x) * 0.04;
      enemy.y += (ty - enemy.y) * 0.04;
      break;
    }
    case 'zigzag': {
      const tx = (enemy.baseX ?? CANVAS_WIDTH / 2) + Math.sin(enemy.angle! * 1.4) * 110;
      const ty = (enemy.baseY ?? 100) + Math.sin(enemy.angle! * 0.7) * 18;
      enemy.x += (tx - enemy.x) * 0.025;
      enemy.y += (ty - enemy.y) * 0.025;
      break;
    }
    case 'boss': {
      const ty = enemy.baseY ?? 60;
      if (enemy.y < ty) enemy.y += enemy.speed * 1.5;
      const range = enemy.enrageMode ? 380 : 280;
      const tx = CANVAS_WIDTH / 2 - enemy.width / 2 + Math.sin(enemy.angle! * 0.6) * range;
      enemy.x += (tx - enemy.x) * 0.025;
      // Advance spiral angle every frame
      if (enemy.spiralAngle !== undefined) enemy.spiralAngle += dt * 0.004;
      break;
    }
  }
}

function easingOutBack(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ─── Boss shooting — unique pattern per level ─────────────────────────────────

export function enemyShoot(enemy: Enemy, playerX: number, playerY: number): EnemyBullet[] {
  if (enemy.entering) return [];

  const bullets: EnemyBullet[] = [];
  const cx = enemy.x + enemy.width / 2;
  const cy = enemy.y + enemy.height;

  // ── Minions ────────────────────────────────────────────────────────────────
  if (enemy.type === 'drone') {
    bullets.push(makeBullet(cx - 3, cy, 0, 4.5, 10, '#ff4444'));
    return bullets;
  }

  if (enemy.type === 'fighter') {
    const dx = playerX - cx, dy = playerY - cy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    bullets.push(makeBullet(cx - 3, cy, (dx / len) * 5, (dy / len) * 5, 14, '#ff6600'));
    return bullets;
  }

  // ── BOSS — pick pattern by bossLevel ──────────────────────────────────────
  const bossLvl = enemy.bossLevel ?? 1;
  const phase = enemy.phase ?? 1;
  const enrage = enemy.enrageMode ?? false;

  switch (bossLvl) {

    // ── LEVEL 1: VOID SENTINEL — aimed + radial spray ─────────────────────
    case 1: {
      // Aimed homing shot
      const dx = playerX - cx, dy = playerY - cy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      bullets.push(makeBullet(cx - 5, cy, (dx / len) * 6.5, (dy / len) * 6.5, 18, '#ff0044', 10, 16));

      // Phase 2: 8-way radial burst
      if (phase >= 2 || enrage) {
        const count = enrage ? 12 : 8;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 * i) / count;
          bullets.push(makeBullet(cx - 4, cy, Math.cos(angle) * 4, Math.sin(angle) * 4, 12, '#ff3300', 8, 12));
        }
      }
      // Phase 3: triple aimed
      if (phase >= 3 || enrage) {
        for (let s = -1; s <= 1; s++) {
          const a = Math.atan2(playerY - cy, playerX - cx) + s * 0.25;
          bullets.push(makeBullet(cx - 3, cy, Math.cos(a) * 5.5, Math.sin(a) * 5.5, 10, '#ff6600', 6, 10));
        }
      }
      break;
    }

    // ── LEVEL 2: NOVA DESTROYER — laser beam sweep ────────────────────────
    case 2: {
      const base = enemy.angle ?? 0;

      // MAIN sweeping laser (slightly stronger motion)
      const sweepAngle = (Math.PI / 2) + Math.sin(base * 1.0) * 0.7;
      bullets.push(
        makeLaser(cx, cy, sweepAngle, 700, '#ff2200', 18, 22, 400, 500)
      );

      // ── PHASE 1 (Improved) ───────────────────────────
      // Secondary sweep (makes dodging tighter)
      bullets.push(
        makeLaser(
          cx,
          cy,
          sweepAngle + 0.15,
          550,
          '#ff5500',
          10,
          16
        )
      );

      // Slow rotating cross (adds movement pressure)
      const rot = base * 0.35;
      bullets.push(makeLaser(cx, cy, rot, 400, '#ff8800', 8, 12));
      bullets.push(makeLaser(cx, cy, rot + Math.PI / 2, 400, '#ff8800', 8, 12));

      // Occasional aimed shot (prevents camping)
      if ((enemy.tick ?? 0) % 25 === 0) {
        const dx = playerX - cx, dy = playerY - cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;

        bullets.push(
          makeBullet(
            cx,
            cy,
            (dx / len) * 5,
            (dy / len) * 5,
            12,
            '#ff3300',
            6,
            12
          )
        );
      }

      // ── PHASE 2 ──────────────────────────────────────
      if (phase >= 2 || enrage) {
        // ONLY spawn every ~1 second (VERY IMPORTANT)
        if ((enemy.tick ?? 0) % 60 === 0) {

          const base = enemy.angle ?? 0;
          const beams = 3;

          for (let i = 0; i < beams; i++) {
            const a = base * 0.6 + (Math.PI * 2 * i) / beams;

            bullets.push(
              makeLaser(
                cx,
                cy,
                a,
                1000,        // whole map
                '#ff0000',
                26,
                30,
                600,         // stays longer
                800          // LONG CHARGE → cinematic
              )
            );
          }
        }

        const rot = base * 0.5;
        bullets.push(makeLaser(cx, cy, rot, 500, '#ff8800', 10, 16));
        bullets.push(makeLaser(cx, cy, rot + Math.PI / 2, 500, '#ff8800', 10, 16));
      }

      // ── PHASE 3 ──────────────────────────────────────
      if (phase >= 3 || enrage) {

        const sweepAngle2 = (Math.PI / 2) - Math.sin(base * 0.8) * 0.6;
        bullets.push(makeLaser(cx, cy, sweepAngle2, 650, '#ff0066', 12, 18));

        const rays = enrage ? 10 : 6;
        for (let i = 0; i < rays; i++) {
          const angle = (Math.PI * 2 * i) / rays + base * 0.3;
          bullets.push(makeLaser(cx, cy, angle, 450, '#ff0033', 8, 12));
        }

        const miniCount = 4;
        for (let i = 0; i < miniCount; i++) {
          const a = base * 1.5 + (Math.PI * 2 * i) / miniCount;
          bullets.push(makeLaser(cx, cy, a, 300, '#ffaa00', 6, 10));
        }
      }

      // ── ENRAGE ───────────────────────────────────────
      if (enrage) {
        const dx = playerX - cx, dy = playerY - cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;

        bullets.push(
          makeBullet(cx, cy, (dx / len) * 6, (dy / len) * 6, 14, '#ff4400', 8, 14)
        );

        for (let i = 0; i < 2; i++) {
          const randAngle = Math.random() * Math.PI * 2;
          bullets.push(makeLaser(cx, cy, randAngle, 400, '#ff0000', 8, 12));
        }
      }

      break;
    }

    // ── LEVEL 3: CRYSTAL FIEND — spiral bullet hell ───────────────────────
    case 3: {
      const spiralArms = phase >= 3 ? 5 : phase >= 2 ? 4 : 3;
      const spiralA = enemy.spiralAngle ?? 0;
      for (let arm = 0; arm < spiralArms; arm++) {
        const angle = spiralA + (Math.PI * 2 * arm) / spiralArms;
        const speed = enrage ? 5.5 : 4;
        bullets.push(makeBullet(cx, cy, Math.cos(angle) * speed, Math.sin(angle) * speed, 14, '#cc00ff', 8, 8));
      }
      // Aimed shot on top
      if (phase >= 2 || enrage) {
        const dx = playerX - cx, dy = playerY - cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        bullets.push(makeBullet(cx, cy, (dx / len) * 6, (dy / len) * 6, 16, '#ff00ff', 10, 14));
      }
      // Ring burst on phase 3
      if (phase >= 3 || enrage) {
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 * i) / 6 + spiralA * 0.5;
          bullets.push(makeBullet(cx, cy, Math.cos(a) * 3, Math.sin(a) * 3, 10, '#aa44ff', 6, 6));
        }
      }
      break;
    }

    // ── LEVEL 4: WAR COLOSSUS — homing missiles + barrage ─────────────────
    case 4: {
      // Homing missiles (slow but track player)
      const missileCount = phase >= 3 ? 3 : phase >= 2 ? 2 : 1;
      const spread = 0.3;
      for (let m = 0; m < missileCount; m++) {
        const baseAngle = Math.atan2(playerY - cy, playerX - cx);
        const angle = baseAngle + (m - Math.floor(missileCount / 2)) * spread;
        bullets.push({
          x: cx - 5, y: cy,
          width: 10, height: 20,
          vx: Math.cos(angle) * 3.5,
          vy: Math.sin(angle) * 3.5,
          damage: 22,
          color: '#ffff00',
          isHoming: true,
          homingStrength: 0.06,
          active: true,
        });
      }
      // Horizontal barrage
      if (phase >= 2 || enrage) {
        const shots = enrage ? 7 : 5;
        for (let i = 0; i < shots; i++) {
          const xOffset = (i - Math.floor(shots / 2)) * 70;
          bullets.push(makeBullet(cx + xOffset - 3, cy, 0, 6, 12, '#ff8800', 6, 14));
        }
      }
      // Side lasers on phase 3
      if (phase >= 3 || enrage) {
        bullets.push(makeLaser(cx, cy, Math.PI * 0.5 - 0.15, 400, '#ffaa00', 10, 14));
        bullets.push(makeLaser(cx, cy, Math.PI * 0.5 + 0.15, 400, '#ffaa00', 10, 14));
      }
      break;
    }

    // ── LEVEL 5: VOID EMPEROR — chaos (all patterns combined) ─────────────
    default: {
      const spiralA = enemy.spiralAngle ?? 0;

      // Spiral arms (6)
      const arms = enrage ? 8 : 6;
      for (let arm = 0; arm < arms; arm++) {
        const angle = spiralA + (Math.PI * 2 * arm) / arms;
        bullets.push(makeBullet(cx, cy, Math.cos(angle) * 5, Math.sin(angle) * 5, 14, '#ff0099', 8, 8));
      }

      // Sweeping laser beams (2)
      const laserAngle = (Math.PI / 2) + Math.sin((enemy.angle ?? 0) * 1.2) * 0.9;
      bullets.push(makeLaser(cx, cy, laserAngle, 600, '#ff0000', 20, 22));
      bullets.push(makeLaser(cx, cy, laserAngle + Math.PI, 600, '#ff0000', 20, 22));

      // Aimed homing shots
      const dx = playerX - cx, dy = playerY - cy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      bullets.push({
        x: cx - 5, y: cy, width: 10, height: 18,
        vx: (dx / len) * 7, vy: (dy / len) * 7,
        damage: 20, color: '#ff2200',
        isHoming: true, homingStrength: 0.04,
        active: true,
      });

      // Ring burst
      const ringCount = enrage ? 16 : 10;
      for (let i = 0; i < ringCount; i++) {
        const a = (Math.PI * 2 * i) / ringCount + spiralA * 0.3;
        bullets.push(makeBullet(cx, cy, Math.cos(a) * 3.5, Math.sin(a) * 3.5, 10, '#cc00ff', 6, 6));
      }
      break;
    }
  }

  return bullets;
}

// ─── Bullet factories ─────────────────────────────────────────────────────────

function makeBullet(
  x: number, y: number,
  vx: number, vy: number,
  damage: number,
  color: string,
  w = 6, h = 12
): EnemyBullet {
  return { x: x - w / 2, y, width: w, height: h, vx, vy, damage, color, active: true };
}

function makeLaser(
  originX: number,
  originY: number,
  angle: number,
  length: number,
  color: string,
  width: number,
  damage: number,
  lifetime = 420,
  chargeTime = 0
): EnemyBullet {
  return {
    x: originX,
    y: originY,
    width,
    height: length,
    vx: 0,
    vy: 0,
    damage,
    color,

    isLaser: true,
    laserAngle: angle,
    laserLength: length,
    laserWidth: width,

    lifetime,
    maxLifetime: lifetime,

    chargeTime,
    isCharging: chargeTime > 0,

    active: true,
  };
}


export function updateHomingBullet(b: EnemyBullet, playerX: number, playerY: number) {
  if (!b.isHoming) return;
  const dx = playerX - b.x;
  const dy = playerY - b.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const str = b.homingStrength ?? 0.05;
  b.vx += (dx / len) * str;
  b.vy += (dy / len) * str;
  // Cap speed
  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (speed > 6) { b.vx = (b.vx / speed) * 6; b.vy = (b.vy / speed) * 6; }
}

// ─── Laser lifetime tick ──────────────────────────────────────────────────────
// Call this in engine.ts updateEnemyBullets

export function tickLaser(b: EnemyBullet, dt: number) {
  if (!b.isLaser) return;

  if (b.chargeTime && b.chargeTime > 0) {
    b.chargeTime -= dt;

    // Still charging → don't damage
    if (b.chargeTime > 0) {
      b.isCharging = true;
      return;
    }

    // FIRE 🔥
    b.isCharging = false;
  }

  if (b.lifetime !== undefined) {
    b.lifetime -= dt;
    if (b.lifetime <= 0) b.active = false;
  }
}

// ─── Laser collision ─────────────────────────────────────────────────────────
// Returns true if the player rect intersects this laser beam

export function laserHitsPlayer(
  laser: EnemyBullet,
  px: number, py: number, pw: number, ph: number
): boolean {
  if (laser.isCharging) return false;
  const angle = laser.laserAngle ?? 0;
  const length = laser.laserLength ?? 400;
  const bw = (laser.laserWidth ?? 10) / 2;
  const ox = laser.x, oy = laser.y;
  const ex = ox + Math.cos(angle) * length;
  const ey = oy + Math.sin(angle) * length;

  // Project player center onto laser segment, check distance < beam half-width
  const pcx = px + pw / 2, pcy = py + ph / 2;
  const ldx = ex - ox, ldy = ey - oy;
  const llen = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
  const t = Math.max(0, Math.min(1, ((pcx - ox) * ldx + (pcy - oy) * ldy) / (llen * llen)));
  const clx = ox + t * ldx, cly = oy + t * ldy;
  const dist = Math.sqrt((pcx - clx) ** 2 + (pcy - cly) ** 2);
  return dist < bw + Math.max(pw, ph) * 0.35;
}

// ─── Particles ────────────────────────────────────────────────────────────────

export function spawnDropParticles(x: number, y: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < 18; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 5;
    const colors = ['#ff4400', '#ff8800', '#ffcc00', '#ffffff', '#ff0044'];
    particles.push({
      x, y, width: 2, height: 2,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0, maxLife: 400 + Math.random() * 400,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 2 + Math.random() * 4, alpha: 1, active: true,
    });
  }
  return particles;
}