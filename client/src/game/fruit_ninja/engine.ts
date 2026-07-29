import type {
  FlyingObject,
  GameState,
  Particle,
  SliceSegment,
  FloatScore,
  Vec2,
  LevelConfig,
  AbilityType,
  ActiveAbility,
} from "./types";
import { FRUITS, BOMB, ABILITY_FRUITS, randomFruit } from "./fruits";

let idCounter = 1;
const nextId = () => idCounter++;

const GRAVITY = 0.42;
const FLY_GRAVITY = 0.06;

const FRENZY_DURATION = 6;
const FRENZY_GRACE_DURATION = 1.5;
const POINT_LOCK_DURATION = 10;
const MULTIPLIER_DURATION = 8;

const LEVELS: LevelConfig[] = [
  { level: 1, label: "Orchard", targetScore: 200, spawnIntervalStart: 1.25, maxDifficulty: 2, bombChanceMax: 0.05, abilityChance: 0, allowFrenzy: false, allowGlitch: false },
  { level: 2, label: "Citrus Grove", targetScore: 300, spawnIntervalStart: 1.1, maxDifficulty: 3.5, bombChanceMax: 0.08, abilityChance: 0, allowFrenzy: false, allowGlitch: false },
  { level: 3, label: "Tropic Storm", targetScore: 500, spawnIntervalStart: 0.95, maxDifficulty: 5, bombChanceMax: 0.11, abilityChance: 0.04, allowFrenzy: false, allowGlitch: false },
  { level: 4, label: "Berry Blitz", targetScore: 700, spawnIntervalStart: 0.82, maxDifficulty: 6.5, bombChanceMax: 0.13, abilityChance: 0.05, allowFrenzy: false, allowGlitch: false },
  { level: 5, label: "Dragon's Den", targetScore: 1500, spawnIntervalStart: 0.72, maxDifficulty: 8, bombChanceMax: 0.15, abilityChance: 0.2, allowFrenzy: true, allowGlitch: true },
  { level: 6, label: "Mango Mayhem", targetScore: 980, spawnIntervalStart: 0.3, maxDifficulty: 9, bombChanceMax: 0.17, abilityChance: 0.07, allowFrenzy: true, allowGlitch: true },
  { level: 7, label: "Pomelo Paradise", targetScore: 1280, spawnIntervalStart: 0.6, maxDifficulty: 11, bombChanceMax: 0.2, abilityChance: 0.08, allowFrenzy: true, allowGlitch: true },
  { level: 8, label: "Lychee Labyrinth", targetScore: 1620, spawnIntervalStart: 0.56, maxDifficulty: 11, bombChanceMax: 0.21, abilityChance: 0.08, allowFrenzy: true, allowGlitch: true },
  { level: 9, label: "Coconut Cove", targetScore: 2000, spawnIntervalStart: 0.52, maxDifficulty: 12, bombChanceMax: 0.25, abilityChance: 0.1, allowFrenzy: true, allowGlitch: true },
  { level: 10, label: "Fruit Frenzy", targetScore: 2500, spawnIntervalStart: 0.48, maxDifficulty: 13, bombChanceMax: 0.2, abilityChance: 0.2, allowFrenzy: true, allowGlitch: true },
];

export function getLevelConfig(level: number): LevelConfig {
  return LEVELS[Math.min(level - 1, LEVELS.length - 1)];
}

export function getTotalLevels(): number {
  return LEVELS.length;
}

export function createInitialState(best: number): GameState {
  return {
    phase: "menu",
    score: 0,
    fruitsSliced: 0,
    best,
    lives: 3,
    combo: 0,
    comboTimer: 0,
    objects: [],
    particles: [],
    segments: [],
    floats: [],
    spawnTimer: 0,
    spawnInterval: 1.25,
    elapsed: 0,
    difficulty: 0,
    shake: 0,
    level: 1,
    levelScore: 0,
    frenzyTimer: 0,
    frenzySpawner: 0,
    frenzyGraceTimer: 0,
    pointLockTimer: 0,
    multiplier: 1,
    multiplierTimer: 0,
    activeAbilities: [],
    glitchFlash: 0,
  };
}

export function resetForPlay(s: GameState): GameState {
  const cfg = getLevelConfig(1);
  return {
    ...s,
    phase: "playing",
    score: 0,
    fruitsSliced: 0,
    lives: 3,
    combo: 0,
    comboTimer: 0,
    objects: [],
    particles: [],
    segments: [],
    floats: [],
    spawnTimer: 0.6,
    spawnInterval: cfg.spawnIntervalStart,
    elapsed: 0,
    difficulty: 0,
    shake: 0,
    level: 1,
    levelScore: 0,
    frenzyTimer: 0,
    frenzySpawner: 0,
    frenzyGraceTimer: 0,
    pointLockTimer: 0,
    multiplier: 1,
    multiplierTimer: 0,
    activeAbilities: [],
    glitchFlash: 0,
  };
}

export function continueAfterLevelUp(s: GameState): GameState {
  const cfg = getLevelConfig(s.level + 1);
  return {
    ...s,
    phase: "playing",
    objects: [],
    particles: [],
    segments: [],
    floats: [],
    spawnTimer: 0.8,
    spawnInterval: cfg.spawnIntervalStart,
    elapsed: 0,
    difficulty: 0,
    level: s.level + 1,
    levelScore: 0,
    frenzyTimer: 0,
    frenzySpawner: 0,
    frenzyGraceTimer: 0,
    pointLockTimer: 0,
    multiplier: 1,
    multiplierTimer: 0,
    activeAbilities: [],
    glitchFlash: 0,
  };
}

// Fruit art (radii in fruits.ts) was sized for a wide desktop canvas. On a
// narrow phone canvas that same pixel radius eats a much bigger share of the
// screen, so we scale it down below a reference width — and never scale up,
// so desktop rendering (which is already correct) is untouched.
const SIZE_REFERENCE_WIDTH = 640;
const MIN_SIZE_SCALE = 0.6;

function getSizeScale(w: number) {
  return Math.min(1, Math.max(MIN_SIZE_SCALE, w / SIZE_REFERENCE_WIDTH));
}

function spawnTrajectory(w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2;
  const margin = 80;
  const rx = w / 2 + margin;
  const ry = h / 2 + margin;
  const spawnAngle = Math.random() * Math.PI * 2;
  const x = cx + Math.cos(spawnAngle) * rx;
  const y = cy + Math.sin(spawnAngle) * ry;
  const targetX = cx + (Math.random() - 0.5) * w * 0.35;
  const targetY = cy + (Math.random() - 0.5) * h * 0.35;
  const dist = Math.hypot(targetX - x, targetY - y);
  const tFlight = Math.max(80, Math.min(120, dist / 5));
  const vx = (targetX - x) / tFlight;
  const vy = (targetY - y - 0.5 * FLY_GRAVITY * tFlight * tFlight) / tFlight;
  return { x, y, vx, vy };
}

function spawnObject(s: GameState, w: number, h: number): FlyingObject {
  const cfg = getLevelConfig(s.level);
  const bombChance = Math.min(cfg.bombChanceMax, 0.04 + s.difficulty * 0.015);
  // No bombs while Frenzy is active OR during its grace tail — the shower's
  // clutter is exactly when a surprise bomb would be least fair to punish.
  const isBomb =
    s.frenzyTimer <= 0 &&
    s.frenzyGraceTimer <= 0 &&
    Math.random() < bombChance &&
    s.elapsed > 2.5;
  const traj = spawnTrajectory(w, h);
  const sizeScale = getSizeScale(w);

  if (isBomb) {
    return {
      id: nextId(),
      kind: BOMB,
      isBomb: true,
      isAbility: false,
      pos: { x: traj.x, y: traj.y },
      vel: { x: traj.vx, y: traj.vy },
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.12,
      radius: BOMB.radius * sizeScale,
      sliced: false,
    };
  }

  // ability fruit roll
  if (cfg.abilityChance > 0 && Math.random() < cfg.abilityChance && s.elapsed > 4) {
    const pool = ABILITY_FRUITS.filter((a) => {
      if (a.ability === "frenzy") return cfg.allowFrenzy;
      if (a.ability === "glitch") return cfg.allowGlitch;
      return true; // golden, multiplier, hair, hemi always allowed once abilities are on
    });
    if (pool.length > 0) {
      const k = pool[Math.floor(Math.random() * pool.length)];
      return {
        id: nextId(),
        kind: k,
        isBomb: false,
        isAbility: true,
        pos: { x: traj.x, y: traj.y },
        vel: { x: traj.vx, y: traj.vy },
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.12,
        radius: k.radius * sizeScale,
        sliced: false,
      };
    }
  }

  const fruit = randomFruit();
  return {
    id: nextId(),
    kind: fruit,
    isBomb: false,
    isAbility: false,
    pos: { x: traj.x, y: traj.y },
    vel: { x: traj.vx, y: traj.vy },
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.12,
    radius: fruit.radius * sizeScale,
    sliced: false,
  };
}

function spawnJuice(s: GameState, x: number, y: number, color: string, n: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 5;
    s.particles.push({
      id: nextId(),
      pos: { x, y },
      vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp - 1 },
      life: 0.6 + Math.random() * 0.5,
      maxLife: 1.1,
      color,
      size: 3 + Math.random() * 4,
      kind: "juice",
    });
  }
}

function spawnSparks(s: GameState, x: number, y: number) {
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 7;
    s.particles.push({
      id: nextId(),
      pos: { x, y },
      vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp },
      life: 0.4 + Math.random() * 0.4,
      maxLife: 0.8,
      color: Math.random() < 0.5 ? "#ffd54f" : "#ff7043",
      size: 2 + Math.random() * 2,
      kind: "spark",
    });
  }
  for (let i = 0; i < 8; i++) {
    s.particles.push({
      id: nextId(),
      pos: { x, y },
      vel: { x: (Math.random() - 0.5) * 2, y: -Math.random() * 2 },
      life: 0.6 + Math.random() * 0.5,
      maxLife: 1.1,
      color: "#424242",
      size: 8 + Math.random() * 8,
      kind: "smoke",
    });
  }
}

function addFloat(
  s: GameState,
  x: number,
  y: number,
  text: string,
  color: string,
  big = false,
) {
  s.floats.push({
    id: nextId(),
    pos: { x, y },
    text,
    life: big ? 1.1 : 0.8,
    maxLife: big ? 1.1 : 0.8,
    color,
    big,
  });
}

function addAbilityActive(s: GameState, type: AbilityType, duration: number) {
  const existing = s.activeAbilities.find((a) => a.type === type);
  if (existing) {
    existing.timeLeft = duration;
    existing.duration = duration;
  } else {
    s.activeAbilities.push({ type, timeLeft: duration, duration });
  }
}

function removeAbilityActive(s: GameState, type: AbilityType) {
  s.activeAbilities = s.activeAbilities.filter((a) => a.type !== type);
}

function triggerFrenzy(s: GameState) {
  s.frenzyTimer = FRENZY_DURATION;
  s.frenzySpawner = 0;
  addAbilityActive(s, "frenzy", FRENZY_DURATION);
  addFloat(s, s.objects[0]?.pos.x ?? 200, 120, "FRUIT FRENZY!", "#ff80ab", true);
}

function triggerGlitch(s: GameState, x: number, y: number) {
  s.pointLockTimer = POINT_LOCK_DURATION;
  s.glitchFlash = 1;
  addAbilityActive(s, "glitch", POINT_LOCK_DURATION);
  addFloat(s, x, y - 40, "GLITCH! Points locked", "#7c4dff", true);
}

function triggerMultiplier(s: GameState, x: number, y: number) {
  s.multiplier = 2;
  s.multiplierTimer = MULTIPLIER_DURATION;
  addAbilityActive(s, "multiplier", MULTIPLIER_DURATION);
  addFloat(s, x, y - 40, "2x SCORE!", "#4db6ac", true);
}

function triggerGolden(s: GameState, x: number, y: number, points: number) {
  addFloat(s, x, y - 40, `+${points} GOLDEN!`, "#ffca28", true);
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 6;
    s.particles.push({
      id: nextId(),
      pos: { x, y },
      vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp - 1 },
      life: 0.8 + Math.random() * 0.6,
      maxLife: 1.4,
      color: "#ffca28",
      size: 3 + Math.random() * 4,
      kind: "spark",
    });
  }
}

// Instant flat-bonus ability fruits, same shape as triggerGolden — no timed
// effect, just points + a themed burst. Adjust point values / copy in
// fruits.ts (ABILITY_FRUITS) if you want these to feel bigger or smaller.
function triggerHairBonus(s: GameState, x: number, y: number, points: number) {
  addFloat(s, x, y - 40, `+${points} $HAIR!`, "#FF9800", true);
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 5;
    s.particles.push({
      id: nextId(),
      pos: { x, y },
      vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp - 1 },
      life: 0.7 + Math.random() * 0.5,
      maxLife: 1.2,
      color: "#FF9800",
      size: 3 + Math.random() * 3,
      kind: "spark",
    });
  }
}

function triggerHemiBoost(s: GameState, x: number, y: number, points: number) {
  addFloat(s, x, y - 40, `+${points} HEMI BOOST!`, "#FF5722", true);
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 5;
    s.particles.push({
      id: nextId(),
      pos: { x, y },
      vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp - 1 },
      life: 0.7 + Math.random() * 0.5,
      maxLife: 1.2,
      color: "#FF5722",
      size: 3 + Math.random() * 3,
      kind: "spark",
    });
  }
}

function sliceObject(s: GameState, o: FlyingObject, sliceDir: Vec2) {
  if (o.sliced) return;
  o.sliced = true;

  if (o.isBomb) {
    spawnSparks(s, o.pos.x, o.pos.y);
    s.lives = 0;
    s.phase = "over";
    s.shake = 0.9;
    s.best = Math.max(s.best, s.score);
    return;
  }
  s.fruitsSliced += 1;
  const k = o.kind as { color: string; points: number };
  spawnJuice(s, o.pos.x, o.pos.y, k.color, 14);

  const perp = { x: -sliceDir.y, y: sliceDir.x };
  const pl = Math.hypot(perp.x, perp.y) || 1;
  perp.x /= pl;
  perp.y /= pl;
  const push = 3.5;
  o.halves = {
    a: {
      pos: { ...o.pos },
      vel: { x: o.vel.x + perp.x * push, y: o.vel.y + perp.y * push },
      angle: o.angle,
      spin: o.spin + 0.05,
    },
    b: {
      pos: { ...o.pos },
      vel: { x: o.vel.x - perp.x * push, y: o.vel.y - perp.y * push },
      angle: o.angle + Math.PI,
      spin: o.spin - 0.05,
    },
  };

  // Ability fruit effects
  if (o.isAbility) {
    const ak = o.kind as { ability: AbilityType; points: number };
    switch (ak.ability) {
      case "frenzy":
        triggerFrenzy(s);
        break;
      case "glitch":
        triggerGlitch(s, o.pos.x, o.pos.y);
        break;
      case "multiplier":
        triggerMultiplier(s, o.pos.x, o.pos.y);
        break;
      case "golden":
        triggerGolden(s, o.pos.x, o.pos.y, ak.points);
        break;
      case "hair":
        triggerHairBonus(s, o.pos.x, o.pos.y, ak.points);
        break;
      case "hemi":
        triggerHemiBoost(s, o.pos.x, o.pos.y, ak.points);
        break;
    }
  }

  s.combo += 1;
  s.comboTimer = 0.6;
  const base = k.points;
  let gained = base;
  if (s.combo >= 2) gained += s.combo;
  gained = Math.round(gained * s.multiplier);

  // point lock: score doesn't increase
  if (s.pointLockTimer > 0) {
    gained = 0;
  }

  s.score += gained;
  // Frenzy-shower fruit is a pure bonus: it pads the score but never counts
  // toward the current level's target, so it can't be used to rush a level up.
  if (!o.frenzy) {
    s.levelScore += gained;
  }
  if (gained > 0) {
    addFloat(s, o.pos.x, o.pos.y - o.radius, `+${gained}`, "#fffde7");
  }
  if (s.combo >= 3) {
    addFloat(s, o.pos.x, o.pos.y - o.radius - 28, `Combo x${s.combo}!`, "#ffd54f", true);
  }

  const cfg = getLevelConfig(s.level);
  // Don't cut a Frenzy shower short — if the target's already hit mid-frenzy,
  // the level-up fires once the timer runs out instead (see updateGame),
  // so the player gets the full window to farm bonus fruit.
  if (s.levelScore >= cfg.targetScore && s.phase === "playing" && s.frenzyTimer <= 0) {
    s.phase = "levelup";
    s.best = Math.max(s.best, s.score);
  }
}

export function addSlicePoint(s: GameState, p: Vec2) {
  if (s.phase !== "playing") return;
  const last = s.segments[s.segments.length - 1];
  if (last) {
    const d = Math.hypot(p.x - last.b.x, p.y - last.b.y);
    if (d < 4) return;
    s.segments.push({ a: { ...last.b }, b: { ...p }, life: 0.18, maxLife: 0.18 });
  } else {
    s.segments.push({ a: { ...p }, b: { ...p }, life: 0.18, maxLife: 0.18 });
  }

  if (!last) return;
  const a = last.b;
  const b = p;
  const dir = { x: b.x - a.x, y: b.y - a.y };
  const dl = Math.hypot(dir.x, dir.y) || 1;
  const norm = { x: dir.x / dl, y: dir.y / dl };
  for (const o of s.objects) {
    if (o.sliced) continue;
    const toObj = { x: o.pos.x - a.x, y: o.pos.y - a.y };
    const proj = toObj.x * norm.x + toObj.y * norm.y;
    const clamped = Math.max(0, Math.min(dl, proj));
    const closest = { x: a.x + norm.x * clamped, y: a.y + norm.y * clamped };
    const dist = Math.hypot(o.pos.x - closest.x, o.pos.y - closest.y);
    if (dist < o.radius) {
      sliceObject(s, o, norm);
    }
  }
}

export function endStroke(s: GameState) {
  s.combo = 0;
  s.comboTimer = 0;
}

export function updateGame(
  s: GameState,
  dt: number,
  w: number,
  h: number,
): GameState {
  // particles/floats/segments always update
  const updateCosmetics = () => {
    s.particles = s.particles.filter((p) => {
      p.vel.y += GRAVITY * dt * 30 * (p.kind === "smoke" ? -0.3 : 1);
      p.pos.x += p.vel.x * dt * 60;
      p.pos.y += p.vel.y * dt * 60;
      p.life -= dt;
      return p.life > 0;
    });
    s.segments = s.segments.filter((seg) => {
      seg.life -= dt;
      return seg.life > 0;
    });
    s.floats = s.floats.filter((f) => {
      f.pos.y -= dt * 40;
      f.life -= dt;
      return f.life > 0;
    });
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 3);
    if (s.glitchFlash > 0) s.glitchFlash = Math.max(0, s.glitchFlash - dt * 2);
  };

  if (s.phase !== "playing") {
    updateCosmetics();
    return s;
  }

  const cfg = getLevelConfig(s.level);
  s.elapsed += dt;
  s.difficulty = Math.min(cfg.maxDifficulty, s.elapsed / 10);
  s.spawnInterval = Math.max(0.4, cfg.spawnIntervalStart - s.difficulty * 0.06);

  // ability timers
  if (s.frenzyTimer > 0) {
    s.frenzyTimer -= dt;
    s.frenzySpawner -= dt;
    if (s.frenzySpawner <= 0) {
      // shower of fruits — no damage on miss during frenzy, and no bombs (see spawnObject)
      const n = 2 + Math.floor(Math.random() * 2);
      const sizeScale = getSizeScale(w);
      for (let i = 0; i < n; i++) {
        const f = randomFruit();
        const traj = spawnTrajectory(w, h);
        s.objects.push({
          id: nextId(),
          kind: f,
          isBomb: false,
          isAbility: false,
          pos: { x: traj.x, y: traj.y },
          vel: { x: traj.vx, y: traj.vy },
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.12,
          radius: f.radius * sizeScale,
          sliced: false,
          frenzy: true,
        });
      }
      s.frenzySpawner = 0.35;
    }
    if (s.frenzyTimer <= 0) {
      s.frenzyTimer = 0;
      removeAbilityActive(s, "frenzy");
      // Shower just stopped — start the grace window rather than cutting
      // forgiveness off immediately (see FRENZY_GRACE_DURATION).
      s.frenzyGraceTimer = FRENZY_GRACE_DURATION;
      // Target was already hit during the frenzy window — advance now that it's over.
      if (s.levelScore >= cfg.targetScore && s.phase === "playing") {
        s.phase = "levelup";
        s.best = Math.max(s.best, s.score);
      }
    }
  } else if (s.frenzyGraceTimer > 0) {
    s.frenzyGraceTimer = Math.max(0, s.frenzyGraceTimer - dt);
  }

  if (s.pointLockTimer > 0) {
    s.pointLockTimer -= dt;
    if (s.pointLockTimer <= 0) {
      s.pointLockTimer = 0;
      removeAbilityActive(s, "glitch");
      addFloat(s, w / 2, h * 0.3, "Points restored!", "#7c4dff", true);
    }
  }

  if (s.multiplierTimer > 0) {
    s.multiplierTimer -= dt;
    if (s.multiplierTimer <= 0) {
      s.multiplier = 1;
      s.multiplierTimer = 0;
      removeAbilityActive(s, "multiplier");
    }
  }

  // update activeAbilities timers
  for (const a of s.activeAbilities) {
    a.timeLeft = Math.max(0, a.timeLeft - dt);
  }

  s.spawnTimer -= dt;
  if (s.spawnTimer <= 0) {
    const count = Math.random() < 0.2 + s.difficulty * 0.03 ? 2 : 1;
    for (let i = 0; i < count; i++) s.objects.push(spawnObject(s, w, h));
    s.spawnTimer = s.frenzyTimer > 0 ? s.spawnInterval * 0.5 : s.spawnInterval;
  }

  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 3);

  if (s.comboTimer > 0) {
    s.comboTimer -= dt;
    if (s.comboTimer <= 0) s.combo = 0;
  }

  const survivors: FlyingObject[] = [];
  for (const o of s.objects) {
    if (o.sliced && o.halves) {
      for (const key of ["a", "b"] as const) {
        const half = o.halves[key];
        half.vel.y += GRAVITY * dt * 60;
        half.pos.x += half.vel.x * dt * 60;
        half.pos.y += half.vel.y * dt * 60;
        half.angle += half.spin * dt * 60;
      }
      if (o.halves.a.pos.y < h + 120 && o.halves.b.pos.y < h + 120) {
        survivors.push(o);
      }
      continue;
    }

    if (o.sliced && o.isBomb) {
      o.vel.y += GRAVITY * dt * 60;
      o.pos.y += o.vel.y * dt * 60;
      if (o.pos.y < h + 120) survivors.push(o);
      continue;
    }

    o.vel.y += FLY_GRAVITY * dt * 60;
    o.pos.x += o.vel.x * dt * 60;
    o.pos.y += o.vel.y * dt * 60;
    o.angle += o.spin * dt * 60;

    const offScreen =
      o.pos.y > h + 100 ||
      o.pos.x < -100 ||
      o.pos.x > w + 100 ||
      o.pos.y < -100;
    if (offScreen) {
      // Frenzy (plus its grace tail) is a fully safe window. Forgive a miss
      // if: the object is shower fruit (o.frenzy — still falling even after
      // the timer hit 0), OR frenzy is *currently* active, OR we're still
      // inside the post-shower grace period. That last case is what fixes
      // the instant-death-right-after-shower bug: leftover shower fruit and
      // clutter get a beat to clear before misses start costing lives again.
      const frenzyForgiven = o.frenzy || s.frenzyTimer > 0 || s.frenzyGraceTimer > 0;
      if (!o.sliced && !o.isBomb && !o.isAbility && !frenzyForgiven) {
        s.lives -= 1;
        s.shake = 0.4;
        addFloat(s, w / 2, h * 0.7, "Missed!", "#ff5252");
        if (s.lives <= 0) {
          s.phase = "over";
          s.best = Math.max(s.best, s.score);
        }
      }
      continue;
    }
    survivors.push(o);
  }
  s.objects = survivors;

  updateCosmetics();
  return s;
}