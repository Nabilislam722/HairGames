import { CANDIES } from '../core/pieces.js';
import { DECOR_KEYS } from './assets.js';
import { Fx } from './fx.js';
import { SpriteBank, bakeDecor } from './sprites.js';

const MAX_DPR = 2;

// Candies drifting upward behind the title and map screens.
class FloatingCandies {
  constructor(images) {
    this.images = images;
    this.keys = [...CANDIES.map((c) => c.key), ...DECOR_KEYS, 'bomb', 'rainbow-bomb'];
    this.items = [];
    this.sprites = new Map();
    this.dpr = 0;
    this.time = 0;
  }

  sprite(key, size, dpr) {
    if (dpr !== this.dpr) {
      this.sprites.clear();
      this.dpr = dpr;
    }
    const id = `${key}@${size}`;
    let s = this.sprites.get(id);
    if (!s) {
      s = bakeDecor(this.images.get(key), size, dpr);
      this.sprites.set(id, s);
    }
    return s;
  }

  reset(width, height) {
    const count = Math.round(Math.min(22, Math.max(10, (width * height) / 52000)));
    this.items = [];
    for (let i = 0; i < count; i++) this.items.push(this.spawn(width, height, Math.random() * height));
  }

  spawn(width, height, y = height + 80) {
    const depth = Math.random();
    const size = [34, 48, 64, 84][Math.min(3, Math.floor(depth * 4))];
    return {
      key: this.keys[Math.floor(Math.random() * this.keys.length)],
      size,
      x: Math.random() * width,
      y,
      speed: 14 + depth * 26,
      sway: 0.4 + Math.random() * 0.8,
      phase: Math.random() * 10,
      rot: Math.random() * 6,
      spin: (Math.random() - 0.5) * 0.6,
      alpha: 0.35 + depth * 0.55,
    };
  }

  update(dt, width, height) {
    this.time += dt;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      it.y -= it.speed * dt;
      it.rot += it.spin * dt;
      if (it.y < -it.size) this.items[i] = this.spawn(width, height);
    }
  }

  draw(ctx, dpr) {
    const sorted = [...this.items].sort((a, b) => a.size - b.size);
    for (const it of sorted) {
      const s = this.sprite(it.key, it.size, dpr);
      const x = it.x + Math.sin(this.time * it.sway + it.phase) * 18;
      ctx.globalAlpha = it.alpha;
      ctx.save();
      ctx.translate(x, it.y);
      ctx.rotate(Math.sin(it.rot) * 0.5);
      ctx.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

/*
 * Owns the two canvases (board underneath the HUD, effects above everything),
 * the frame loop, layout and screen shake.
 */
export class Stage {
  constructor({ board, effects, images, sound }) {
    this.canvas = board;
    this.fxCanvas = effects;
    this.ctx = board.getContext('2d');
    this.fxCtx = effects.getContext('2d');
    this.images = images;
    this.sound = sound;
    this.bank = new SpriteBank(images);
    this.fx = new Fx();
    this.fx.bank = this.bank;
    this.floaters = new FloatingCandies(images);
    this.scene = null;
    this.mode = 'title';
    this.paused = false;
    this.trauma = 0;
    this.time = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.layout = { bx: 0, by: 0, cs: 48 };
    this.boardArea = () => ({ x: 0, y: 0, w: this.width, h: this.height });
    this.hudPoint = () => ({ x: this.width / 2, y: 0 });
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reduced = !!motion?.matches;
    motion?.addEventListener?.('change', (e) => {
      this.reduced = e.matches;
      this.fx.reduced = e.matches;
    });
    this.fx.reduced = this.reduced;
    this.dirty = true;
    this.last = performance.now();

    const markDirty = () => (this.dirty = true);
    window.addEventListener('resize', markDirty);
    window.visualViewport?.addEventListener('resize', markDirty);
    this.bindInput();
    // Bake once so the menus have sprites before any level starts.
    this.bank.build(48, Math.min(MAX_DPR, window.devicePixelRatio || 1));
    requestAnimationFrame((t) => this.frame(t));
  }

  bindInput() {
    const c = this.canvas;
    const point = (e) => {
      const rect = c.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };
    c.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'game' || !this.scene || e.button > 0) return;
      e.preventDefault();
      c.setPointerCapture?.(e.pointerId);
      this.sound.unlock();
      this.scene.pointerDown(...point(e));
    });
    c.addEventListener('pointermove', (e) => {
      if (this.mode === 'game' && this.scene) this.scene.pointerMove(...point(e));
    });
    const up = (e) => {
      if (this.mode === 'game' && this.scene) this.scene.pointerUp(...point(e));
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'game' || !this.scene || this.paused) return;
      const target = e.target;
      if (target.closest?.('[role="dialog"], input, textarea')) return;
      // A focused button keeps Enter and Space for itself; arrows still steer the board.
      if (target.closest?.('button') && (e.code === 'Enter' || e.code === 'Space')) return;
      if (this.scene.key(e.code)) e.preventDefault();
    });
  }

  setScene(scene) {
    if (this.scene && !scene && this.mode !== 'title') {
      this.outgoing = { scene: this.scene, layout: { ...this.layout }, t: 0 };
    }
    this.scene = scene;
    if (scene) this.outgoing = null;
    this.fx.clear();
    this.dirty = true;
  }

  setMode(mode) {
    this.mode = mode;
    this.dirty = true;
  }

  shake(amount) {
    if (this.reduced) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  resize() {
    this.dirty = false;
    const width = Math.round(window.innerWidth);
    const height = Math.round(window.innerHeight);
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    if (width !== this.width || height !== this.height || dpr !== this.dpr) {
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      for (const canvas of [this.canvas, this.fxCanvas]) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      this.floaters.reset(width, height);
    }
    if (this.scene) {
      const area = this.boardArea();
      const { rows, cols } = this.scene.board;
      const cs = Math.max(24, Math.floor(Math.min(area.w / cols, area.h / rows, 88)));
      this.layout = {
        cs,
        bx: Math.round(area.x + (area.w - cs * cols) / 2),
        by: Math.round(area.y + (area.h - cs * rows) / 2),
      };
      this.fx.cell = cs;
      this.bank.build(cs, dpr);
    }
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.dirty) this.resize();
    if (!this.paused && !this.manual) this.tick(dt);
    this.draw();
  }

  // The board of a level that just ended shrinks and fades while the next screen arrives.
  drawOutgoing(ctx) {
    const out = this.outgoing;
    if (!out) return;
    const k = Math.min(1, out.t / 0.4);
    if (k >= 1) {
      this.outgoing = null;
      return;
    }
    const { bx, by, cs } = out.layout;
    const { rows, cols } = out.scene.board;
    const cx = bx + (cols * cs) / 2;
    const cy = by + (rows * cs) / 2;
    const s = 1 - 0.08 * k;
    const saved = this.layout;
    this.layout = out.layout;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    out.scene.draw(ctx);
    ctx.restore();
    ctx.globalAlpha = 1;
    this.layout = saved;
  }

  tick(dt) {
    this.time += dt;
    if (this.outgoing) this.outgoing.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    if (this.mode === 'game' && this.scene) this.scene.update(dt);
    else if (this.mode === 'title') this.floaters.update(dt, this.width, this.height);
    this.fx.update(dt);
  }

  // Test helper: steps time by hand in fixed frames, letting engine promises settle between frames.
  async advance(seconds, step = 1 / 60) {
    this.manual = true;
    for (let t = 0; t < seconds - 1e-9; t += step) {
      if (this.dirty) this.resize();
      this.tick(step);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    this.draw();
  }

  draw() {
    const { ctx, fxCtx, dpr, width, height } = this;
    const shake = this.trauma * this.trauma;
    const amp = this.layout.cs * 0.2 * shake;
    const t = this.time;
    const ox = amp * (Math.sin(t * 61.3) * 0.6 + Math.sin(t * 37.9) * 0.4);
    const oy = amp * (Math.sin(t * 53.1) * 0.6 + Math.sin(t * 29.7) * 0.4);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (this.mode === 'game' && this.scene) {
      ctx.save();
      ctx.translate(ox, oy);
      this.scene.draw(ctx);
      ctx.restore();
    } else {
      if (this.mode === 'title') this.floaters.draw(ctx, dpr);
      this.drawOutgoing(ctx);
    }

    // The effects layer is usually empty between moves; skip clearing it when nothing changed.
    const fxActive = this.fx.active;
    if (fxActive || this.fxDrawn) {
      fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fxCtx.clearRect(0, 0, width, height);
      if (fxActive) {
        fxCtx.save();
        fxCtx.translate(ox, oy);
        this.fx.draw(fxCtx);
        fxCtx.restore();
      }
      this.fxDrawn = fxActive;
    }
  }
}
