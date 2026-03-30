import type { Asteroid, Particle } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

const ASTEROID_COLORS = [
  '#888877', '#776655', '#998866', '#aaa099', '#554433', '#887766',
];

export function spawnAsteroidWave(wave: number): Asteroid[] {
  const count = 12 + wave * 4;
  const asteroids: Asteroid[] = [];
  for (let i = 0; i < count; i++) {
    asteroids.push(createAsteroid(wave));
  }
  return asteroids;
}

export function createAsteroid(wave: number): Asteroid {
  const size = 18 + Math.random() * 36;
  const side = Math.floor(Math.random() * 3); // 0=top, 1=left, 2=right
  let x: number, y: number, vx: number, vy: number;

  if (side === 0) {
    x = Math.random() * CANVAS_WIDTH;
    y = -size * 2;
    vx = (Math.random() - 0.5) * 2.5;
    vy = 1.5 + Math.random() * 2.5;
  } else if (side === 1) {
    x = -size * 2;
    y = Math.random() * (CANVAS_HEIGHT * 0.6);
    vx = 1.5 + Math.random() * 2;
    vy = 1 + Math.random() * 2;
  } else {
    x = CANVAS_WIDTH + size * 2;
    y = Math.random() * (CANVAS_HEIGHT * 0.6);
    vx = -(1.5 + Math.random() * 2);
    vy = 1 + Math.random() * 2;
  }

  // Scale with wave
  vy += wave * 0.15;
  const hp = Math.floor(size * 1.2) + wave * 3;

  return {
    x, y,
    width: size * 2,
    height: size * 2,
    active: true,
    vx,
    vy,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.04,
    hp,
    maxHp: hp,
    size,
    color: ASTEROID_COLORS[Math.floor(Math.random() * ASTEROID_COLORS.length)],
  };
}

export function updateAsteroids(asteroids: Asteroid[], dt: number): void {
  for (const a of asteroids) {
    if (!a.active) continue;
    a.x += a.vx * (dt / 16);
    a.y += a.vy * (dt / 16);
    a.angle += a.spin;
    if (
      a.y > CANVAS_HEIGHT + a.size * 3 ||
      a.x < -a.size * 4 ||
      a.x > CANVAS_WIDTH + a.size * 4
    ) {
      a.active = false;
    }
  }
}

export function drawAsteroid(ctx: CanvasRenderingContext2D, a: Asteroid) {
  const cx = a.x + a.width / 2;
  const cy = a.y + a.height / 2;
  const r = a.size;
  const hp_ratio = a.hp / a.maxHp;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a.angle);

  // Build a jagged polygon
  const points = 10;
  const jitter = 0.28;
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const angle = (Math.PI * 2 * i) / points;
    const rad = r * (1 - jitter + jitter * ((i * 17) % 7) / 6);
    const px = Math.cos(angle) * rad;
    const py = Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  // Fill with gradient
  const grad = ctx.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
  grad.addColorStop(0, lighten(a.color, 40));
  grad.addColorStop(0.6, a.color);
  grad.addColorStop(1, darken(a.color, 40));
  ctx.fillStyle = grad;
  ctx.fill();

  // Crack lines when damaged
  if (hp_ratio < 0.6) {
    ctx.strokeStyle = darken(a.color, 60);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.3);
    ctx.lineTo(r * 0.4, r * 0.1);
    ctx.stroke();
  }
  if (hp_ratio < 0.3) {
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 0.4);
    ctx.lineTo(-r * 0.3, r * 0.3);
    ctx.stroke();
    // Glow when near death
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur = 10;
  }

  // Outline
  ctx.strokeStyle = darken(a.color, 30);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const angle = (Math.PI * 2 * i) / points;
    const rad = r * (1 - jitter + jitter * ((i * 17) % 7) / 6);
    const px = Math.cos(angle) * rad;
    const py = Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

export function spawnAsteroidDebris(a: Asteroid): Particle[] {
  const particles: Particle[] = [];
  const cx = a.x + a.width / 2;
  const cy = a.y + a.height / 2;
  const count = 8 + Math.floor(a.size / 8);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 5;
    particles.push({
      x: cx + (Math.random() - 0.5) * a.size,
      y: cy + (Math.random() - 0.5) * a.size,
      width: 2, height: 2,
      vx: Math.cos(angle) * speed + a.vx * 0.3,
      vy: Math.sin(angle) * speed + a.vy * 0.3,
      life: 0,
      maxLife: 500 + Math.random() * 600,
      color: i % 3 === 0 ? '#ff8844' : i % 3 === 1 ? '#ffcc55' : a.color,
      size: 2 + Math.random() * (a.size / 6),
      alpha: 1,
      active: true,
    });
  }
  return particles;
}

function lighten(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `rgb(${r},${g},${b})`;
}

function darken(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `rgb(${r},${g},${b})`;
}
