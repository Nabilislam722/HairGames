import { CANDY_COLORS, hexAlpha } from './sprites.js';
import { clamp, ease, lerp } from './motion.js';

const MAX_PARTICLES = 1100;
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const RAINBOW = ['#ff3b6b', '#ff9a1a', '#ffd93b', '#3fe08a', '#38c6ff', '#9a6bff', '#ff5fd2'];

export const FONT_DISPLAY = "'Lilita One', 'Fredoka', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif";

const WORD_STYLES = {
  sweet: ['#fff6a8', '#ffb31a'],
  tasty: ['#ffd1ec', '#ff4fa3'],
  delicious: ['#c9fbff', '#2fc4ff'],
  divine: ['#f2d6ff', '#a24dff'],
  high: ['#fffbe0', '#ff6a2b'],
  banner: ['#fff9d6', '#ffb000'],
  rush: ['#ffe0f4', '#ff3d8b'],
  info: ['#ffffff', '#c8f4ff'],
};

/*
 * Everything that lives above the board: particles, beams, lightning, shockwaves,
 * floating text and items flying to the HUD. Positions are CSS pixels in screen space.
 */
export class Fx {
  constructor() {
    this.parts = [];
    this.beams = [];
    this.bolts = [];
    this.rings = [];
    this.flashes = [];
    this.texts = [];
    this.flyers = [];
    this.ghosts = [];
    this.bank = null;
    this.cell = 48;
    this.reduced = false;
  }

  get active() {
    return (
      this.parts.length +
        this.beams.length +
        this.bolts.length +
        this.rings.length +
        this.flashes.length +
        this.texts.length +
        this.flyers.length +
        this.ghosts.length >
      0
    );
  }

  clear() {
    this.parts.length = 0;
    this.beams.length = 0;
    this.bolts.length = 0;
    this.rings.length = 0;
    this.flashes.length = 0;
    this.texts.length = 0;
    this.flyers.length = 0;
    this.ghosts.length = 0;
  }

  budget(n) {
    const room = MAX_PARTICLES - this.parts.length;
    const scaled = this.reduced ? Math.ceil(n * 0.4) : n;
    return Math.max(0, Math.min(scaled, room));
  }

  add(p) {
    p.life = 0;
    p.vr ??= 0;
    p.rot ??= 0;
    p.drag ??= 0;
    p.g ??= 0;
    p.s0 ??= 1;
    p.s1 ??= p.s0;
    p.a0 ??= 1;
    p.delay ??= 0;
    this.parts.push(p);
    return p;
  }

  // ------------------------------------------------------------------ emitters

  // A candy bursting: its fragments tumble out with sparkles, a flash and a ring.
  burst(set, x, y, { power = 1, dirX = 0, dirY = 0, big = false, crowd = 1, ring = true } = {}) {
    const cell = this.cell;
    const color = set.color ?? CANDY_COLORS[0];
    const shardCount = this.budget(Math.max(2, Math.round(set.shards.length / Math.sqrt(crowd))));
    for (let i = 0; i < shardCount; i++) {
      const s = set.shards[i % set.shards.length];
      const a = s.angle + rand(-0.35, 0.35);
      const speed = cell * rand(3.2, 6.2) * power;
      this.add({
        kind: 'sprite',
        sprite: s,
        x: x + s.ox,
        y: y + s.oy,
        vx: Math.cos(a) * speed + dirX * cell * 4,
        vy: Math.sin(a) * speed - cell * rand(2.5, 5) * power + dirY * cell * 4,
        g: cell * 30,
        drag: 0.8,
        rot: 0,
        vr: rand(-9, 9),
        max: rand(0.55, 0.85),
        s0: 1,
        s1: 0.55,
        fade: 0.35,
      });
    }
    const dots = this.budget(Math.round((big ? 14 : 8) / Math.sqrt(crowd)));
    for (let i = 0; i < dots; i++) {
      const a = rand(0, TAU);
      const speed = cell * rand(1.5, 5) * power;
      this.add({
        kind: 'dot',
        color: i % 3 ? color.main : color.light,
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - cell,
        g: cell * 6,
        drag: 3,
        max: rand(0.35, 0.65),
        s0: rand(0.35, 0.7),
        s1: 0,
        additive: true,
      });
    }
    if (ring && (crowd < 8 || Math.random() < 0.3)) {
      this.ring(x, y, cell * 0.2, cell * (big ? 1.1 : 0.75), color.light, big ? 0.42 : 0.32, cell * 0.16);
    }
    if (crowd < 10 || Math.random() < 0.35) this.sparkles(x, y, big ? 4 : 2, cell * 0.6);
    this.flash(x, y, cell * (big ? 1.3 : 0.8), color.light, 0.16);
  }

  sparkles(x, y, n, spread, { color = null, size = 0.55, up = 1 } = {}) {
    const count = this.budget(n);
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const r = rand(0, spread);
      this.add({
        kind: 'sparkle',
        color,
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: Math.cos(a) * this.cell * rand(0.3, 1.4),
        vy: Math.sin(a) * this.cell * rand(0.3, 1.4) - this.cell * up,
        drag: 2.5,
        rot: rand(0, TAU),
        vr: rand(-4, 4),
        max: rand(0.45, 0.85),
        s0: rand(0.5, 1) * size,
        s1: 0,
        twinkle: rand(14, 24),
        additive: true,
      });
    }
  }

  crumbs(x, y, n, colors, { power = 1 } = {}) {
    const count = this.budget(n);
    const cell = this.cell;
    for (let i = 0; i < count; i++) {
      const a = rand(-Math.PI, 0) + rand(-0.4, 0.4);
      const speed = cell * rand(2, 5.5) * power;
      const size = cell * rand(0.06, 0.13);
      this.add({
        kind: 'rect',
        color: pick(colors),
        x: x + rand(-0.3, 0.3) * cell,
        y: y + rand(-0.3, 0.3) * cell,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        g: cell * 28,
        drag: 0.6,
        rot: rand(0, TAU),
        vr: rand(-12, 12),
        w: size,
        h: size * rand(0.7, 1.2),
        max: rand(0.5, 0.9),
        fade: 0.3,
      });
    }
  }

  ring(x, y, r0, r1, color, duration, width) {
    this.rings.push({ x, y, r0, r1, color, t: 0, duration, width });
  }

  flash(x, y, radius, color, duration) {
    this.flashes.push({ x, y, radius, color, t: 0, duration });
  }

  // A blast racing along a row or column in both directions from (x, y).
  beam(x, y, dir, color, reachNeg, reachPos, speed, { wide = false, delay = 0 } = {}) {
    this.beams.push({ x, y, dir, color, reachNeg, reachPos, speed, wide, t: -delay, fade: 0, lastSpark: 0 });
  }

  bolt(x0, y0, x1, y1, { delay = 0, duration = 0.32, color = null, width = 1 } = {}) {
    this.bolts.push({ x0, y0, x1, y1, t: -delay, duration, color: color ?? pick(RAINBOW), width, pts: null, regen: 0 });
  }

  explosion(x, y, radius) {
    const cell = this.cell;
    this.flash(x, y, radius * 1.6, '#fff1c2', 0.3);
    this.ring(x, y, cell * 0.3, radius * 1.2, '#ffe08a', 0.5, cell * 0.42);
    this.ring(x, y, cell * 0.2, radius * 0.9, '#ff7a1f', 0.4, cell * 0.24);
    const fire = this.budget(22);
    for (let i = 0; i < fire; i++) {
      const a = rand(0, TAU);
      const speed = (radius / 0.45) * rand(0.35, 1);
      this.add({
        kind: 'dot',
        color: pick(['#ff8a1f', '#ffd27a', '#ff5a1f', '#fff1c2']),
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        drag: 4.5,
        max: rand(0.35, 0.6),
        s0: rand(1.4, 2.4),
        s1: 0.2,
        additive: true,
      });
    }
    const smoke = this.budget(12);
    for (let i = 0; i < smoke; i++) {
      const a = rand(0, TAU);
      const speed = (radius / 0.6) * rand(0.2, 0.8);
      this.add({
        kind: 'smoke',
        x: x + Math.cos(a) * cell * 0.3,
        y: y + Math.sin(a) * cell * 0.3,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - cell * 1.5,
        drag: 3,
        max: rand(0.7, 1.1),
        s0: rand(0.8, 1.2),
        s1: rand(2, 2.8),
        a0: 0.5,
      });
    }
    this.sparkles(x, y, 10, radius * 0.6, { size: 0.8 });
  }

  // Rainbow + rainbow: the whole board lights up in waves of color.
  mega(x, y, radius) {
    const cell = this.cell;
    this.flash(x, y, radius * 1.8, '#ffffff', 0.55);
    RAINBOW.forEach((color, i) => {
      this.rings.push({ x, y, r0: cell * 0.3, r1: radius * (1.1 + i * 0.09), color, t: -i * 0.05, duration: 0.8, width: cell * 0.4 });
    });
    this.sparkles(x, y, 30, radius, { size: 1 });
  }

  // Floating text. Styles: score (small number), word (combo praise), banner (big centered message).
  text(str, x, y, { style = 'score', color = null, size = null, duration = null, delay = 0 } = {}) {
    const cell = this.cell;
    const presets = {
      score: { size: cell * 0.42, duration: 0.95 },
      bonus: { size: cell * 0.55, duration: 1.1 },
      word: { size: Math.min(cell * 1.35, 78), duration: 1.25 },
      banner: { size: Math.min(cell * 1.15, 72), duration: 1.6 },
      info: { size: Math.min(cell * 0.62, 34), duration: 1.4 },
    };
    const preset = presets[style] ?? presets.score;
    this.texts.push({
      str,
      x,
      y,
      style,
      color,
      size: size ?? preset.size,
      duration: duration ?? preset.duration,
      t: -delay,
      tilt: style === 'word' ? rand(-0.08, 0.08) : 0,
    });
  }

  // Sends a sprite along an arc to a screen point, then calls onArrive.
  flyer(sprite, x0, y0, x1, y1, { duration = 0.65, delay = 0, scale0 = 1, scale1 = 0.55, arc = 0.25, onArrive = null, trail = '#fff3b0' } = {}) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const side = Math.random() < 0.5 ? -1 : 1;
    this.flyers.push({
      sprite,
      x0,
      y0,
      x1,
      y1,
      cx: (x0 + x1) / 2 + (-dy / len) * len * arc * side,
      cy: (y0 + y1) / 2 + (dx / len) * len * arc * side - len * 0.1,
      t: -delay,
      duration,
      scale0,
      scale1,
      onArrive,
      trail,
      lastTrail: 0,
      x: x0,
      y: y0,
    });
  }

  // A sprite that pops (scales and fades) on its own, e.g. a blocker breaking.
  ghost(sprite, x, y, { duration = 0.25, s0 = 1, s1 = 1.25, a0 = 1, a1 = 0, white = null, rot = 0, delay = 0 } = {}) {
    this.ghosts.push({ sprite, white, x, y, duration, s0, s1, a0, a1, rot, t: -delay });
  }

  confettiRain(width, height, n = 140) {
    const count = this.budget(n);
    const colors = [...CANDY_COLORS.map((c) => c.main), '#38c6ff', '#3fe08a', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const size = rand(7, 13);
      this.add({
        kind: 'confetti',
        color: pick(colors),
        x: rand(0, width),
        y: rand(-height * 0.6, -20),
        vx: rand(-40, 40),
        vy: rand(80, 220),
        g: 120,
        drag: 1.2,
        rot: rand(0, TAU),
        vr: rand(-6, 6),
        w: size,
        h: size * rand(0.4, 0.7),
        flip: rand(0, TAU),
        fv: rand(6, 14),
        sway: rand(0.8, 2),
        max: rand(3.2, 4.6),
        fade: 0.2,
      });
    }
  }

  confettiBurst(x, y, n = 60) {
    const count = this.budget(n);
    const colors = [...CANDY_COLORS.map((c) => c.main), '#38c6ff', '#3fe08a'];
    for (let i = 0; i < count; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const speed = rand(380, 900);
      const size = rand(7, 12);
      this.add({
        kind: 'confetti',
        color: pick(colors),
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        g: 900,
        drag: 2.2,
        rot: rand(0, TAU),
        vr: rand(-8, 8),
        w: size,
        h: size * rand(0.4, 0.7),
        flip: rand(0, TAU),
        fv: rand(8, 16),
        sway: 0,
        max: rand(1.6, 2.4),
        fade: 0.25,
      });
    }
  }

  // ------------------------------------------------------------------ update

  update(dt) {
    const parts = this.parts;
    let w = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.g * dt;
      if (p.kind === 'confetti') {
        p.flip += p.fv * dt;
        p.x += (p.vx + Math.sin(p.flip * 0.5) * 30 * p.sway) * dt;
        p.y += Math.min(p.vy, 260) * dt;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      p.rot += p.vr * dt;
      parts[w++] = p;
    }
    parts.length = w;

    for (const b of this.beams) {
      b.t += dt;
      const reach = Math.max(b.reachNeg, b.reachPos);
      if (b.t * b.speed >= reach) b.fade += dt;
      if (b.t > 0 && !this.reduced && b.t - b.lastSpark > 0.03) {
        b.lastSpark = b.t;
        for (const side of [-1, 1]) {
          const d = Math.min(b.t * b.speed, side < 0 ? b.reachNeg : b.reachPos);
          if (d >= (side < 0 ? b.reachNeg : b.reachPos)) continue;
          const hx = b.x + (b.dir === 'h' ? side * d : 0);
          const hy = b.y + (b.dir === 'v' ? side * d : 0);
          this.sparkles(hx, hy, 1, this.cell * 0.2, { size: 0.45, up: 0.2 });
        }
      }
    }
    this.beams = this.beams.filter((b) => b.fade < 0.32);

    for (const bolt of this.bolts) {
      bolt.t += dt;
      bolt.regen -= dt;
    }
    this.bolts = this.bolts.filter((b) => b.t < b.duration);

    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.duration);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.duration);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < t.duration);
    for (const g of this.ghosts) g.t += dt;
    this.ghosts = this.ghosts.filter((g) => g.t < g.duration);

    const arrived = [];
    for (const f of this.flyers) {
      f.t += dt;
      if (f.t < 0) continue;
      const k = Math.min(1, f.t / f.duration);
      const e = ease.inOutCubic(k);
      const u = 1 - e;
      f.x = u * u * f.x0 + 2 * u * e * f.cx + e * e * f.x1;
      f.y = u * u * f.y0 + 2 * u * e * f.cy + e * e * f.y1;
      if (f.t - f.lastTrail > 0.035 && this.parts.length < MAX_PARTICLES - 50) {
        f.lastTrail = f.t;
        this.add({ kind: 'dot', color: f.trail, x: f.x, y: f.y, vx: rand(-20, 20), vy: rand(-20, 20), drag: 3, max: 0.4, s0: 0.5, s1: 0, additive: true });
      }
      if (k >= 1) arrived.push(f);
    }
    if (arrived.length) {
      this.flyers = this.flyers.filter((f) => !arrived.includes(f));
      for (const f of arrived) f.onArrive?.(f.x1, f.y1);
    }
  }

  // ------------------------------------------------------------------ draw

  draw(ctx) {
    const bank = this.bank;
    if (!bank) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) {
      const k = f.t / f.duration;
      const s = bank.dot(f.color);
      const size = f.radius * 2 * (0.6 + 0.6 * ease.outCubic(k));
      ctx.globalAlpha = (1 - k) * (1 - k) * 0.9;
      ctx.drawImage(s.canvas, f.x - size / 2, f.y - size / 2, size, size);
    }
    for (const r of this.rings) {
      if (r.t < 0) continue;
      const k = r.t / r.duration;
      const e = ease.outCubic(k);
      ctx.globalAlpha = (1 - k) * 0.95;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(0.5, r.width * (1 - k));
      ctx.beginPath();
      ctx.arc(r.x, r.y, lerp(r.r0, r.r1, e), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    this.drawBeams(ctx);
    this.drawBolts(ctx);

    for (const g of this.ghosts) {
      if (g.t < 0) continue;
      const k = g.t / g.duration;
      const e = ease.outCubic(k);
      const s = lerp(g.s0, g.s1, e);
      ctx.save();
      ctx.globalAlpha = clamp(lerp(g.a0, g.a1, e), 0, 1);
      ctx.translate(g.x, g.y);
      ctx.rotate(g.rot * e);
      ctx.scale(s, s);
      ctx.drawImage(g.sprite.canvas, -g.sprite.ax, -g.sprite.ay, g.sprite.w, g.sprite.h);
      if (g.white) {
        ctx.globalAlpha *= 1 - k;
        ctx.drawImage(g.white.canvas, -g.white.ax, -g.white.ay, g.white.w, g.white.h);
      }
      ctx.restore();
    }

    this.drawParticles(ctx);

    for (const f of this.flyers) {
      if (f.t < 0) continue;
      const k = Math.min(1, f.t / f.duration);
      const s = lerp(f.scale0, f.scale1, ease.inQuad(k)) * (1 + 0.15 * Math.sin(k * Math.PI));
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(Math.sin(k * Math.PI) * 0.4);
      ctx.scale(s, s);
      ctx.drawImage(f.sprite.canvas, -f.sprite.ax, -f.sprite.ay, f.sprite.w, f.sprite.h);
      ctx.restore();
    }

    for (const t of this.texts) if (t.t >= 0) this.drawText(ctx, t);
  }

  drawParticles(ctx) {
    const bank = this.bank;
    const cell = this.cell;
    for (const p of this.parts) {
      const k = p.life / p.max;
      let alpha = p.a0;
      if (p.fade) alpha *= k > 1 - p.fade ? (1 - k) / p.fade : 1;
      else alpha *= 1 - k * k;
      if (alpha <= 0.01) continue;
      const s = lerp(p.s0, p.s1, k);
      ctx.globalAlpha = alpha;
      if (p.kind === 'sprite') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(s, s);
        ctx.drawImage(p.sprite.canvas, -p.sprite.ax, -p.sprite.ay, p.sprite.w, p.sprite.h);
        ctx.restore();
      } else if (p.kind === 'dot') {
        ctx.globalCompositeOperation = 'lighter';
        const d = bank.dot(p.color);
        const size = cell * 0.5 * s;
        ctx.drawImage(d.canvas, p.x - size / 2, p.y - size / 2, size, size);
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.kind === 'sparkle') {
        ctx.globalCompositeOperation = 'lighter';
        const tw = 0.7 + 0.3 * Math.sin(p.life * p.twinkle);
        const size = cell * 0.9 * s * tw;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.drawImage(bank.sparkle.canvas, -size / 2, -size / 2, size, size);
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.kind === 'smoke') {
        const size = cell * s;
        ctx.globalAlpha = alpha * 0.55;
        ctx.drawImage(bank.puff.canvas, p.x - size / 2, p.y - size / 2, size, size);
      } else if (p.kind === 'rect' || p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.kind === 'confetti') ctx.scale(1, Math.cos(p.flip));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawBeams(ctx) {
    if (!this.beams.length) return;
    const cell = this.cell;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of this.beams) {
      if (b.t < 0) continue;
      const fade = 1 - b.fade / 0.32;
      const width = cell * (b.wide ? 0.95 : 0.62);
      for (const side of [-1, 1]) {
        const reach = side < 0 ? b.reachNeg : b.reachPos;
        if (reach <= 0) continue;
        const d = Math.min(b.t * b.speed, reach);
        const hx = b.x + (b.dir === 'h' ? side * d : 0);
        const hy = b.y + (b.dir === 'v' ? side * d : 0);
        const g = ctx.createLinearGradient(b.x, b.y, hx, hy);
        g.addColorStop(0, hexAlpha(b.color, 0.15 * fade));
        g.addColorStop(1, hexAlpha(b.color, 0.95 * fade));
        ctx.strokeStyle = g;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        const core = ctx.createLinearGradient(b.x, b.y, hx, hy);
        core.addColorStop(0, `rgba(255,255,255,${0.2 * fade})`);
        core.addColorStop(1, `rgba(255,255,255,${fade})`);
        ctx.strokeStyle = core;
        ctx.lineWidth = width * 0.3;
        ctx.stroke();
        if (d < reach) {
          const head = this.bank.dot('#ffffff');
          const size = cell * 1.6;
          ctx.globalAlpha = fade;
          ctx.drawImage(head.canvas, hx - size / 2, hy - size / 2, size, size);
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.restore();
  }

  drawBolts(ctx) {
    if (!this.bolts.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const b of this.bolts) {
      if (b.t < 0) continue;
      if (!b.pts || b.regen <= 0) {
        b.pts = zigzag(b.x0, b.y0, b.x1, b.y1, this.cell);
        b.regen = 0.045;
      }
      const k = b.t / b.duration;
      const alpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      const drawPath = () => {
        ctx.beginPath();
        b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      };
      ctx.globalAlpha = alpha * 0.55;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = this.cell * 0.22 * b.width;
      drawPath();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = this.cell * 0.06 * b.width;
      drawPath();
      const head = this.bank.dot(b.color);
      const size = this.cell * 1.2;
      ctx.drawImage(head.canvas, b.x1 - size / 2, b.y1 - size / 2, size, size);
    }
    ctx.restore();
  }

  drawText(ctx, t) {
    const k = t.t / t.duration;
    let scale = 1;
    let alpha = 1;
    let dy = 0;
    if (t.style === 'score' || t.style === 'bonus') {
      scale = t.t < 0.18 ? ease.outBackStrong(t.t / 0.18) : 1;
      dy = -this.cell * 0.75 * ease.outCubic(k);
      alpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    } else {
      const inT = 0.32;
      const outT = 0.28;
      if (t.t < inT) scale = ease.outBackStrong(t.t / inT);
      else if (t.t > t.duration - outT) {
        const o = (t.t - (t.duration - outT)) / outT;
        scale = 1 + 0.35 * ease.inQuad(o);
        alpha = 1 - o;
      }
      dy = -this.cell * 0.25 * k;
    }
    if (alpha <= 0 || scale <= 0.01) return;
    const size = t.size;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(t.x, t.y + dy);
    ctx.rotate(t.tilt * (1 - Math.min(1, t.t / 0.4)) + t.tilt * 0.3);
    ctx.scale(scale, scale);
    ctx.font = `${Math.round(size)}px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    let top;
    let bottom;
    if (t.style === 'score' || t.style === 'bonus') {
      const c = t.color ?? { light: '#ffffff', main: '#ffe17a' };
      top = '#ffffff';
      bottom = c.light;
    } else {
      [top, bottom] = WORD_STYLES[t.color] ?? WORD_STYLES.banner;
    }
    ctx.fillStyle = 'rgba(40, 6, 48, 0.45)';
    ctx.fillText(t.str, 0, size * 0.09);
    ctx.strokeStyle = '#3a0f45';
    ctx.lineWidth = size * (t.style === 'score' ? 0.2 : 0.17);
    ctx.strokeText(t.str, 0, 0);
    const g = ctx.createLinearGradient(0, -size * 0.45, 0, size * 0.45);
    g.addColorStop(0, top);
    g.addColorStop(0.55, bottom);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillText(t.str, 0, 0);
    if (t.style !== 'score') {
      ctx.globalAlpha = alpha * 0.55;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(1, size * 0.035);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-2000, -size, 4000, size * 0.75);
      ctx.clip();
      ctx.strokeText(t.str, 0, -size * 0.02);
      ctx.restore();
    }
    ctx.restore();
  }
}

function zigzag(x0, y0, x1, y1, cell) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const segments = Math.max(4, Math.round(len / (cell * 0.45)));
  const amp = Math.min(cell * 0.45, len * 0.12);
  const pts = [[x0, y0]];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const off = (Math.random() - 0.5) * 2 * amp * Math.sin(Math.PI * t);
    pts.push([x0 + dx * t + nx * off, y0 + dy * t + ny * off]);
  }
  pts.push([x1, y1]);
  return pts;
}
