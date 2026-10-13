import { CANDIES, Special } from '../core/pieces.js';
import { createRng } from '../core/rng.js';

// Particle and text colors for each candy: main body, light highlight, deep shade.
export const CANDY_COLORS = [
  { main: '#ff2d6f', light: '#ffa3c2', deep: '#a3003a' },
  { main: '#ffcc29', light: '#fff1a0', deep: '#d17b00' },
  { main: '#d94dff', light: '#f3b8ff', deep: '#7d1aa3' },
  { main: '#ff9a1a', light: '#ffd596', deep: '#b55400' },
  { main: '#ff86c4', light: '#ffd6ec', deep: '#8f4a2c' },
  { main: '#b5713a', light: '#ffe2b0', deep: '#5a2e14' },
];

export const NEUTRAL_COLOR = { main: '#fff4d6', light: '#ffffff', deep: '#7a3b8f' };

export const BLOCKER_COLORS = {
  ice: { main: '#9df1ff', light: '#ffffff', deep: '#3fb8d6' },
  caramel: { main: '#e09a52', light: '#ffd9a1', deep: '#8a4a1c' },
  chocolate: { main: '#7a3f1d', light: '#c47a45', deep: '#3b1a0a' },
  cage: { main: '#ff4b4b', light: '#ffffff', deep: '#b31d2a' },
};

export function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

function context(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

// A sprite stores a device-pixel canvas plus its size and anchor in CSS pixels.
function sprite(canvas, dpr, ax, ay, extra = {}) {
  return { canvas, w: canvas.width / dpr, h: canvas.height / dpr, ax: ax / dpr, ay: ay / dpr, ...extra };
}

// Draws `img` fitted inside a `box` (CSS px) with padding, without any effect applied.
function bakeClean(img, box, dpr, pad = 0.22) {
  const scale = (box * dpr) / Math.max(img.naturalWidth, img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const p = Math.ceil(box * dpr * pad);
  const canvas = createCanvas(w + p * 2, h + p * 2);
  context(canvas).drawImage(img, p, p, w, h);
  return sprite(canvas, dpr, p + w / 2, p + h / 2, { iw: w / dpr, ih: h / dpr });
}

function withShadow(clean, dpr, box, strength = 1) {
  const canvas = createCanvas(clean.canvas.width, clean.canvas.height);
  const ctx = context(canvas);
  ctx.shadowColor = `rgba(44, 8, 52, ${0.42 * strength})`;
  ctx.shadowBlur = box * dpr * 0.075;
  ctx.shadowOffsetY = box * dpr * 0.05;
  ctx.drawImage(clean.canvas, 0, 0);
  return { ...clean, canvas };
}

function tinted(clean, color) {
  const canvas = createCanvas(clean.canvas.width, clean.canvas.height);
  const ctx = context(canvas);
  ctx.drawImage(clean.canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { ...clean, canvas };
}

// A soft colored halo around the silhouette (drawn with additive blending).
function glow(clean, dpr, color, blur) {
  const extra = Math.ceil(blur * 1.6);
  const canvas = createCanvas(clean.canvas.width + extra * 2, clean.canvas.height + extra * 2);
  const ctx = context(canvas);
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = canvas.width;
  ctx.drawImage(clean.canvas, extra - canvas.width, extra);
  ctx.drawImage(clean.canvas, extra - canvas.width, extra);
  return sprite(canvas, dpr, clean.ax * dpr + extra, clean.ay * dpr + extra);
}

// Candy-cane bands across the candy, clipped to its silhouette.
function striped(clean, dpr, dir) {
  const canvas = createCanvas(clean.canvas.width, clean.canvas.height);
  const ctx = context(canvas);
  ctx.drawImage(clean.canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  const w = clean.iw * dpr;
  const h = clean.ih * dpr;
  const x0 = clean.ax * dpr - w / 2;
  const y0 = clean.ay * dpr - h / 2;
  const span = dir === 'h' ? h : w;
  const thick = span * 0.12;
  for (const t of [0.27, 0.5, 0.73]) {
    const mid = (dir === 'h' ? y0 : x0) + span * t;
    const g = dir === 'h' ? ctx.createLinearGradient(0, mid - thick / 2, 0, mid + thick / 2) : ctx.createLinearGradient(mid - thick / 2, 0, mid + thick / 2, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.97)');
    g.addColorStop(1, 'rgba(255,255,255,0.55)');
    ctx.fillStyle = g;
    if (dir === 'h') ctx.fillRect(x0, mid - thick / 2, w, thick);
    else ctx.fillRect(mid - thick / 2, y0, thick, h);
    ctx.fillStyle = 'rgba(90, 20, 70, 0.3)';
    const edge = Math.max(1, dpr * 1.1);
    if (dir === 'h') {
      ctx.fillRect(x0, mid - thick / 2 - edge, w, edge);
      ctx.fillRect(x0, mid + thick / 2, w, edge);
    } else {
      ctx.fillRect(mid - thick / 2 - edge, y0, edge, h);
      ctx.fillRect(mid + thick / 2, y0, edge, h);
    }
  }
  return { ...clean, canvas };
}

// Breaks a sprite into wedge-shaped fragments that fly apart when it bursts.
function shards(clean, dpr, count, seed) {
  const rng = createRng(seed);
  const W = clean.canvas.width;
  const H = clean.canvas.height;
  const cx = clean.ax * dpr;
  const cy = clean.ay * dpr;
  const rc = (Math.max(clean.iw, clean.ih) * dpr) / 2;
  const step = (Math.PI * 2) / count;
  const start = rng.next() * Math.PI * 2;
  const out = [];
  for (let i = 0; i < count; i++) {
    const a0 = start + i * step + (rng.next() - 0.5) * step * 0.35;
    const a1 = start + (i + 1) * step + (rng.next() - 0.5) * step * 0.35;
    const am = (a0 + a1) / 2;
    const pts = [
      [cx + (rng.next() - 0.5) * rc * 0.2, cy + (rng.next() - 0.5) * rc * 0.2],
      [cx + Math.cos(a0) * rc * 1.7, cy + Math.sin(a0) * rc * 1.7],
      [cx + Math.cos(am) * rc * 1.9, cy + Math.sin(am) * rc * 1.9],
      [cx + Math.cos(a1) * rc * 1.7, cy + Math.sin(a1) * rc * 1.7],
    ];
    const bx0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0]))));
    const by0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))));
    const bx1 = Math.min(W, Math.ceil(Math.max(...pts.map((p) => p[0]))));
    const by1 = Math.min(H, Math.ceil(Math.max(...pts.map((p) => p[1]))));
    if (bx1 - bx0 < 2 || by1 - by0 < 2) continue;
    const canvas = createCanvas(bx1 - bx0, by1 - by0);
    const ctx = context(canvas);
    ctx.translate(-bx0, -by0);
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(clean.canvas, 0, 0);
    // Anchor each fragment on its own center of mass (roughly 45% out along the wedge).
    const gx = cx + Math.cos(am) * rc * 0.45;
    const gy = cy + Math.sin(am) * rc * 0.45;
    out.push(sprite(canvas, dpr, gx - bx0, gy - by0, { ox: (gx - cx) / dpr, oy: (gy - cy) / dpr, angle: am }));
  }
  return out;
}

function radialSprite(dpr, size, stops) {
  const px = Math.ceil(size * dpr);
  const canvas = createCanvas(px, px);
  const ctx = context(canvas);
  const g = ctx.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  return sprite(canvas, dpr, px / 2, px / 2);
}

function sparkleSprite(dpr, size) {
  const px = Math.ceil(size * dpr);
  const canvas = createCanvas(px, px);
  const ctx = context(canvas);
  const c = px / 2;
  const glowGradient = ctx.createRadialGradient(c, c, 0, c, c, c);
  glowGradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  glowGradient.addColorStop(0.25, 'rgba(255,250,220,0.35)');
  glowGradient.addColorStop(1, 'rgba(255,250,220,0)');
  ctx.fillStyle = glowGradient;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  const r = c * 0.95;
  const w = c * 0.13;
  ctx.moveTo(c, c - r);
  ctx.quadraticCurveTo(c + w, c - w, c + r, c);
  ctx.quadraticCurveTo(c + w, c + w, c, c + r);
  ctx.quadraticCurveTo(c - w, c + w, c - r, c);
  ctx.quadraticCurveTo(c - w, c - w, c, c - r);
  ctx.fill();
  return sprite(canvas, dpr, c, c);
}

/*
 * Every bitmap the board needs, baked at the current cell size and pixel ratio so
 * nothing is resampled or blurred at draw time. Rebuilt when the layout changes.
 */
export class SpriteBank {
  constructor(images) {
    this.images = images;
    this.cell = 0;
    this.dpr = 0;
    this.dots = new Map();
  }

  build(cell, dpr) {
    if (Math.abs(cell - this.cell) < 0.25 && dpr === this.dpr) return false;
    this.cell = cell;
    this.dpr = dpr;
    this.dots.clear();
    const img = (key) => this.images.get(key);

    const candyBox = cell * 0.84;
    this.candies = CANDIES.map((candy, i) => {
      const clean = bakeClean(img(candy.key), candyBox, dpr);
      const stripeH = striped(clean, dpr, 'h');
      const stripeV = striped(clean, dpr, 'v');
      return {
        normal: withShadow(clean, dpr, candyBox),
        stripeH: withShadow(stripeH, dpr, candyBox),
        stripeV: withShadow(stripeV, dpr, candyBox),
        white: tinted(clean, '#ffffff'),
        glow: glow(clean, dpr, CANDY_COLORS[i].main, cell * dpr * 0.22),
        shards: shards(clean, dpr, 6, 11 + i),
        color: CANDY_COLORS[i],
      };
    });

    const specialSet = (key, box, glowColor, seed, color) => {
      const clean = bakeClean(img(key), box, dpr);
      return {
        normal: withShadow(clean, dpr, box),
        white: tinted(clean, '#ffffff'),
        glow: glow(clean, dpr, glowColor, cell * dpr * 0.28),
        shards: shards(clean, dpr, 7, seed),
        color,
      };
    };
    this.bomb = specialSet('bomb', cell * 0.9, '#ff8a1f', 31, { main: '#ff8a1f', light: '#ffd27a', deep: '#40161a' });
    this.rainbow = specialSet('rainbow-bomb', cell * 0.92, '#ffffff', 37, NEUTRAL_COLOR);

    const blockerSet = (key, box, color, seed) => {
      const clean = bakeClean(img(key), box, dpr, 0.12);
      return { normal: withShadow(clean, dpr, box, 0.6), white: tinted(clean, '#ffffff'), shards: shards(clean, dpr, 7, seed), color };
    };
    this.ice = blockerSet('ice-block', cell * 0.98, BLOCKER_COLORS.ice, 41);
    this.caramel = blockerSet('caramel-block', cell * 0.92, BLOCKER_COLORS.caramel, 43);
    this.caramelCracked = blockerSet('caramel-cracked', cell * 0.92, BLOCKER_COLORS.caramel, 47);
    this.chocolate = blockerSet('chocolate', cell * 0.94, BLOCKER_COLORS.chocolate, 53);
    this.cage = blockerSet('cane-cage', cell * 1.0, BLOCKER_COLORS.cage, 59);

    this.badge = withShadow(bakeClean(img('stopwatch'), cell * 0.42, dpr), dpr, cell * 0.42);
    this.frame = bakeClean(img('select-frame'), cell * 1.14, dpr, 0.02);
    this.sparkle = sparkleSprite(dpr, cell * 0.9);
    this.puff = radialSprite(dpr, cell, [
      [0, 'rgba(255,255,255,0.9)'],
      [0.5, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    this.shadow = radialSprite(dpr, cell, [
      [0, 'rgba(40,6,48,0.45)'],
      [0.6, 'rgba(40,6,48,0.18)'],
      [1, 'rgba(40,6,48,0)'],
    ]);
    return true;
  }

  // Visual set for a piece; `special` can differ from the model while a conversion animates.
  pieceSet(piece, special = piece.special) {
    if (special === Special.BOMB) return this.bomb;
    if (special === Special.RAINBOW) return this.rainbow;
    return this.candies[Math.max(0, piece.color)];
  }

  pieceSprite(piece, special = piece.special) {
    const set = this.pieceSet(piece, special);
    if (special === Special.STRIPE_H) return set.stripeH;
    if (special === Special.STRIPE_V) return set.stripeV;
    return set.normal;
  }

  blockerSet(blocker) {
    if (blocker.type === 'ice') return this.ice;
    if (blocker.type === 'chocolate') return this.chocolate;
    return blocker.hp >= 2 ? this.caramel : this.caramelCracked;
  }

  // Soft round glow in any color, cached per color (CSS size = one cell).
  dot(color) {
    let s = this.dots.get(color);
    if (!s) {
      s = radialSprite(this.dpr, this.cell * 0.5, [
        [0, 'rgba(255,255,255,1)'],
        [0.22, color],
        [0.5, hexAlpha(color, 0.35)],
        [1, hexAlpha(color, 0)],
      ]);
      this.dots.set(color, s);
    }
    return s;
  }
}

export function hexAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Bakes any image at a fixed size (title and map decorations).
export function bakeDecor(img, box, dpr) {
  const clean = bakeClean(img, box, dpr, 0.2);
  return withShadow(clean, dpr, box, 0.8);
}
