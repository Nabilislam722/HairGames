import { THEMES } from '../core/levels.js';
import { Special, isColorless } from '../core/pieces.js';
import { RAINBOW } from './fx.js';
import { Tweener, clamp, ease, lerp, spring } from './motion.js';
import { BLOCKER_COLORS, CANDY_COLORS, NEUTRAL_COLOR, createCanvas } from './sprites.js';

// Falling candies: gravity and speed limits in cells per second.
const GRAVITY = 92;
const START_SPEED = 2.6;
const MAX_SPEED = 24;

// Beats the engine waits on (seconds). Beam and bomb steps match the visual travel speed.
export const TIMING = Object.freeze({
  matchHold: 0.17,
  afterClear: 0.04,
  chainDelay: 0.09,
  beamStep: 0.026,
  bombLead: 0.15,
  bombStep: 0.05,
  zapLead: 0.36,
  zapStagger: 0.034,
  convertSettle: 0.3,
  convertStagger: 0.07,
  waveStep: 0.05,
  mergeTime: 0.22,
  finaleStagger: 0.085,
  finaleFlight: 0.55,
});

const WORDS = {
  2: ['Sweet!', 'sweet'],
  3: ['Tasty!', 'tasty'],
  4: ['Delicious!', 'delicious'],
  5: ['Divine!', 'divine'],
  7: ['Sugar High!', 'high'],
};

const HAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72"><g stroke="#3a0f45" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round" fill="#ffffff"><path d="M14.5 45.5c-3.2-3.4-8.6-2.2-8.9 2.3-.2 2.4 1.1 4.3 3 6.2l9.4 9.2c3.7 3.6 7.9 5.8 13.4 5.8h6.2c9.7 0 16.4-7.3 16.4-17V40.5c0-3-2.3-5.1-5-5.1s-5 2.2-5 5.1v-2.7c0-3-2.3-5.1-5-5.1s-5 2.2-5 5.1v-2c0-3-2.3-5.1-5-5.1-.9 0-1.7.2-2.4.6V10.6c0-3.3-2.5-5.6-5.4-5.6s-5.4 2.3-5.4 5.6v39.8z"/><path d="M33.9 37.3v8.2M43.9 40v6.5" fill="none"/></g></svg>`;

let hand = null;
function handImage() {
  if (!hand) {
    hand = new Image();
    hand.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(HAND_SVG)}`;
  }
  return hand.complete && hand.naturalWidth ? hand : null;
}

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/*
 * One level on screen: draws the board and its pieces, turns player input into
 * engine moves, and implements every animation the engine asks for.
 */
export class BoardScene {
  constructor(stage, engine, level) {
    this.stage = stage;
    this.engine = engine;
    this.board = engine.board;
    this.level = level;
    this.theme = THEMES[level.theme] ?? THEMES.berry;
    this.timing = TIMING;
    this.tw = new Tweener();
    this.views = new Map();
    this.fallers = new Set();
    this.blockerFx = new WeakMap();
    this.selected = null;
    this.selectAnim = { k: 0 };
    this.drag = null;
    this.lastTap = null;
    this.hint = null;
    this.idle = 0;
    this.time = 0;
    this.cursor = null;
    this.moveCascade = 0;
    this.actionCol = (this.board.cols - 1) / 2;
    this.recentPops = 0;
    this.cache = null;
    this.cacheKey = '';
    this.introT = -1;
    this.introLength = 0;
    this.finaleCount = 0;
    this.tutorial = level.id === 1;
    this.colTop = [];
    for (let c = 0; c < this.board.cols; c++) {
      let top = -1;
      for (let r = 0; r < this.board.rows; r++) {
        if (this.board.cells[r][c].active) {
          top = r;
          break;
        }
      }
      this.colTop.push(top);
    }
    this.sparkleTimer = 0;
  }

  get fx() {
    return this.stage.fx;
  }

  get bank() {
    return this.stage.bank;
  }

  get L() {
    return this.stage.layout;
  }

  sound(name, opts) {
    this.stage.sound.play(name, opts);
  }

  // ------------------------------------------------------------------ geometry

  sx(x) {
    return this.L.bx + (x + 0.5) * this.L.cs;
  }

  sy(y) {
    return this.L.by + (y + 0.5) * this.L.cs;
  }

  center(cell) {
    return [this.sx(cell.c), this.sy(cell.r)];
  }

  viewCenter(v) {
    return [this.sx(v.x + v.dragX), this.sy(v.y + v.dragY + v.oy)];
  }

  boardCenter() {
    return [this.L.bx + (this.board.cols * this.L.cs) / 2, this.L.by + (this.board.rows * this.L.cs) / 2];
  }

  cellAt(x, y) {
    const c = Math.floor((x - this.L.bx) / this.L.cs);
    const r = Math.floor((y - this.L.by) / this.L.cs);
    const cell = this.board.cell(r, c);
    return cell && cell.active ? cell : null;
  }

  // ------------------------------------------------------------------ views

  makeView(piece, x, y) {
    const v = {
      piece,
      x,
      y,
      scale: 1,
      rot: 0,
      alpha: 1,
      sq: 0,
      sqv: 0,
      oy: 0,
      oyv: 0,
      dragX: 0,
      dragY: 0,
      dragXv: 0,
      dragYv: 0,
      dragXT: 0,
      dragYT: 0,
      lift: 0,
      liftv: 0,
      liftT: 0,
      flash: 0,
      glow: 0,
      z: 0,
      override: null,
      fall: null,
      clip: false,
      dying: false,
      phase: Math.random() * 100,
      fuse: Math.random(),
    };
    this.views.set(piece.id, v);
    return v;
  }

  viewFor(piece, cell = null) {
    let v = this.views.get(piece.id);
    if (!v) {
      const at = cell ?? this.board.list.find((c) => c.piece === piece);
      v = this.makeView(piece, at ? at.c : 0, at ? at.r : 0);
    }
    return v;
  }

  retire(v) {
    this.views.delete(v.piece.id);
    this.fallers.delete(v);
  }

  // Squash a piece; the spring makes it jiggle back.
  kick(v, amount) {
    v.sq = amount;
    v.sqv = 0;
  }

  blockerState(blocker) {
    let st = this.blockerFx.get(blocker);
    if (!st) {
      st = { shake: 0, flash: 0, scale: 1, ox: 0, oy: 0 };
      this.blockerFx.set(blocker, st);
    }
    return st;
  }

  // ------------------------------------------------------------------ intro

  // Tiles pop in on a diagonal wave, then the candies pour in column by column.
  intro() {
    this.introT = 0;
    const { rows, cols } = this.board;
    this.introLength = (rows + cols) * 0.03 + 0.45;
    const batch = { pending: 0, resolve: null };
    const done = new Promise((resolve) => (batch.resolve = resolve));
    for (const cell of this.board.list) {
      if (!cell.piece) continue;
      const v = this.makeView(cell.piece, cell.c, cell.r - rows - 1.5);
      v.clip = true;
      v.fall = { vy: START_SPEED, toY: cell.r, delay: 0.32 + cell.c * 0.045 + (rows - 1 - cell.r) * 0.035, batch };
      batch.pending++;
      this.fallers.add(v);
    }
    for (const cell of this.board.list) {
      if (cell.blocker) {
        const st = this.blockerState(cell.blocker);
        st.scale = 0;
        this.tw.to(st, { scale: 1 }, { duration: 0.45, delay: 0.25 + (cell.r + cell.c) * 0.03, ease: ease.outBackStrong });
      }
      if (cell.lock) {
        // Cages snap shut once their candy has landed.
        const st = this.blockerState(cell.lock);
        st.scale = 0;
        const land = 0.32 + cell.c * 0.045 + (rows - 1 - cell.r) * 0.035 + Math.sqrt((2 * (rows + 1.5)) / GRAVITY);
        this.tw.to(st, { scale: 1 }, { duration: 0.4, delay: land, ease: ease.outBackStrong }).then(() => this.sound('clink'));
      }
    }
    if (!batch.pending) batch.resolve();
    this.sound('whoosh');
    return done;
  }

  // ------------------------------------------------------------------ input

  canInteract() {
    return this.engine.canPlay() && this.introT < 0 && !this.stage.paused;
  }

  pointerDown(x, y) {
    this.idle = 0;
    this.hint = null;
    this.cursor = null;
    if (!this.canInteract()) return;
    const cell = this.cellAt(x, y);
    if (!cell) {
      this.deselect();
      return;
    }
    if (!this.board.isMovable(cell)) {
      this.refuse(cell);
      return;
    }
    if (this.selected && this.selected !== cell && this.board.adjacent(this.selected, cell)) {
      const from = this.selected;
      this.deselect();
      this.requestSwap(from, cell);
      return;
    }
    const now = performance.now();
    if (this.lastTap?.cell === cell && now - this.lastTap.time < 380 && isColorless(cell.piece)) {
      this.lastTap = null;
      this.deselect();
      this.engine.tapActivate(cell);
      return;
    }
    this.lastTap = { cell, time: now };
    const wasSelected = this.selected === cell;
    if (!wasSelected) this.select(cell);
    this.drag = { cell, x0: x, y0: y, wasSelected, moved: false };
  }

  pointerMove(x, y) {
    const drag = this.drag;
    if (!drag) return;
    const piece = drag.cell.piece;
    if (!piece || !this.canInteract()) {
      this.drag = null;
      return;
    }
    const dx = (x - drag.x0) / this.L.cs;
    const dy = (y - drag.y0) / this.L.cs;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const v = this.viewFor(piece, drag.cell);
    if (Math.max(ax, ay) > 0.1) drag.moved = true;
    if (Math.max(ax, ay) > 0.42) {
      const [dr, dc] = ax > ay ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
      const target = this.board.cell(drag.cell.r + dr, drag.cell.c + dc);
      this.drag = null;
      v.dragXT = 0;
      v.dragYT = 0;
      if (target && this.board.isMovable(target)) {
        this.deselect();
        this.requestSwap(drag.cell, target);
      } else if (target?.active) {
        this.refuse(target);
      }
      return;
    }
    // Rubber band: the candy leans toward the finger before the swap commits.
    if (ax > ay) {
      v.dragXT = clamp(dx * 0.5, -0.22, 0.22);
      v.dragYT = 0;
    } else {
      v.dragYT = clamp(dy * 0.5, -0.22, 0.22);
      v.dragXT = 0;
    }
  }

  pointerUp() {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    const piece = drag.cell.piece;
    if (piece) {
      const v = this.viewFor(piece, drag.cell);
      v.dragXT = 0;
      v.dragYT = 0;
    }
    if (drag.wasSelected && !drag.moved) this.deselect();
  }

  key(code) {
    if (!this.canInteract()) return false;
    const dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    this.idle = 0;
    this.hint = null;
    if (!this.cursor) {
      this.cursor = this.selected ?? this.board.list.find((c) => this.board.isMovable(c)) ?? null;
      if (code in dirs) return true;
    }
    if (code in dirs) {
      const [dr, dc] = dirs[code];
      if (this.selected) {
        const target = this.board.cell(this.selected.r + dr, this.selected.c + dc);
        const from = this.selected;
        this.deselect();
        if (target && this.board.isMovable(target)) {
          this.cursor = target;
          this.requestSwap(from, target);
        } else if (target?.active) this.refuse(target);
        return true;
      }
      let next = this.board.cell(this.cursor.r + dr, this.cursor.c + dc);
      while (next && !next.active) next = this.board.cell(next.r + dr, next.c + dc);
      if (next) this.cursor = next;
      return true;
    }
    if (code === 'Enter' || code === 'Space') {
      const cell = this.cursor;
      if (!cell || !this.board.isMovable(cell)) return true;
      if (this.selected === cell) {
        this.deselect();
        if (isColorless(cell.piece)) this.engine.tapActivate(cell);
      } else this.select(cell);
      return true;
    }
    if (code === 'Escape' && this.selected) {
      this.deselect();
      return true;
    }
    return false;
  }

  select(cell) {
    this.deselect();
    this.selected = cell;
    const v = this.viewFor(cell.piece, cell);
    v.liftT = 1;
    this.selectAnim.k = 0;
    this.tw.to(this.selectAnim, { k: 1 }, { duration: 0.32, ease: ease.outBackStrong });
    this.sound('select');
  }

  deselect() {
    const cell = this.selected;
    if (!cell) return;
    this.selected = null;
    if (cell.piece) {
      const v = this.views.get(cell.piece.id);
      if (v) v.liftT = 0;
    }
  }

  // Shake a cell that cannot move (blocker, cage) so the tap still gets a response.
  refuse(cell) {
    if (cell.blocker) {
      const st = this.blockerState(cell.blocker);
      st.shake = 1;
    } else if (cell.piece) {
      const v = this.viewFor(cell.piece, cell);
      this.tw.run(0.3, (k) => (v.rot = Math.sin(k * Math.PI * 5) * 0.14 * (1 - k)));
    }
    this.sound('nope');
  }

  async requestSwap(a, b) {
    this.moveCascade = 0;
    this.actionCol = b.c;
    this.tutorial = false;
    await this.engine.trySwap(a, b);
    this.idle = 0;
  }

  // ------------------------------------------------------------------ animator API (called by the engine)

  wait(seconds) {
    return this.tw.wait(seconds);
  }

  // Folds any drag lean into the position so the swap starts where the candy is drawn.
  settleDrag(v) {
    v.x += v.dragX;
    v.y += v.dragY;
    v.dragX = v.dragY = v.dragXT = v.dragYT = v.dragXv = v.dragYv = 0;
  }

  async swap(a, b, pa, pb) {
    const va = this.viewFor(pa, a);
    const vb = this.viewFor(pb, b);
    this.hint = null;
    this.settleDrag(va);
    this.settleDrag(vb);
    va.liftT = 0;
    vb.liftT = 0;
    va.z = 3;
    vb.z = 2;
    this.sound('swap');
    const [ax, ay, bx, by] = [va.x, va.y, vb.x, vb.y];
    const nx = -(b.r - a.r);
    const ny = b.c - a.c;
    await this.tw.run(
      0.2,
      (k, e) => {
        const arc = Math.sin(k * Math.PI);
        va.x = lerp(ax, b.c, e) + nx * arc * 0.1;
        va.y = lerp(ay, b.r, e) + ny * arc * 0.1;
        vb.x = lerp(bx, a.c, e) - nx * arc * 0.07;
        vb.y = lerp(by, a.r, e) - ny * arc * 0.07;
        va.scale = 1 + 0.14 * arc;
        vb.scale = 1 - 0.08 * arc;
      },
      { ease: ease.inOutCubic },
    );
    va.z = vb.z = 0;
    va.scale = vb.scale = 1;
    this.kick(va, 0.13);
    this.kick(vb, 0.08);
  }

  async swapBack(a, b, pa, pb) {
    const va = this.viewFor(pa, a);
    const vb = this.viewFor(pb, b);
    this.settleDrag(va);
    this.settleDrag(vb);
    va.liftT = 0;
    va.z = 3;
    vb.z = 2;
    this.sound('swap');
    const [ax, ay, bx, by] = [va.x, va.y, vb.x, vb.y];
    await this.tw.run(
      0.17,
      (k, e) => {
        const arc = Math.sin(k * Math.PI);
        va.x = lerp(ax, b.c, e);
        va.y = lerp(ay, b.r, e);
        vb.x = lerp(bx, a.c, e);
        vb.y = lerp(by, a.r, e);
        va.scale = 1 + 0.12 * arc;
        vb.scale = 1 - 0.06 * arc;
      },
      { ease: ease.inOutQuad },
    );
    this.sound('nope');
    await this.tw.wait(0.04);
    await this.tw.run(
      0.32,
      (k, e) => {
        va.x = lerp(b.c, a.c, e);
        va.y = lerp(b.r, a.r, e);
        vb.x = lerp(a.c, b.c, e);
        vb.y = lerp(a.r, b.r, e);
        const wobble = Math.sin(k * Math.PI * 4) * 0.16 * (1 - k);
        va.rot = wobble;
        vb.rot = -wobble;
      },
      { ease: ease.outBack },
    );
    va.rot = vb.rot = 0;
    va.z = vb.z = 0;
    va.scale = vb.scale = 1;
  }

  // A candy bursting into fragments after a short swell and flash.
  pop(p, cell, { order = 0, cause = 'match' } = {}) {
    const v = this.viewFor(p, cell);
    if (v.dying) return;
    v.dying = true;
    v.z = 4;
    v.liftT = 0;
    const set = this.bank.pieceSet(p, v.override ?? p.special);
    const match = cause === 'match';
    const delay = match ? order * 0.026 : 0;
    const swell = match ? 0.075 : 0.035;
    this.tw
      .to(v, { scale: 1.22, flash: match ? 1 : 0.55 }, { duration: swell, delay, ease: ease.outQuad })
      .then(() => {
        const [x, y] = this.viewCenter(v);
        this.recentPops++;
        this.fx.burst(set, x, y, { crowd: Math.max(1, this.recentPops), power: match ? 1 : 1.2, ring: match });
        this.sound('pop', { step: Math.min(12, this.moveCascade + order) });
        return this.tw.to(v, { scale: 0, alpha: 0.3, rot: (Math.random() - 0.5) * 1.4 }, { duration: 0.12, ease: ease.inQuad });
      })
      .then(() => this.retire(v));
  }

  // Matched candies rush into one cell, which then pops out a special candy.
  converge(gathered, at, made) {
    const mv = this.makeView(made, at.c, at.r);
    mv.scale = 0;
    mv.z = 3;
    const duration = 0.21;
    for (const { piece, cell } of gathered) {
      const v = this.viewFor(piece, cell);
      v.dying = true;
      v.z = 2;
      this.tw.to(v, { x: at.c, y: at.r, scale: 0.72, flash: 0.75 }, { duration, ease: ease.inBack }).then(() => this.retire(v));
    }
    this.tw.after(duration, () => {
      const [x, y] = this.center(at);
      const set = this.bank.pieceSet(made);
      const color = set.color ?? NEUTRAL_COLOR;
      const cs = this.L.cs;
      this.fx.flash(x, y, cs * 1.5, color.light, 0.28);
      this.fx.ring(x, y, cs * 0.2, cs * 1.4, color.light, 0.5, cs * 0.22);
      this.fx.sparkles(x, y, 8, cs * 0.6);
      this.sound('special');
      mv.flash = 1;
      this.tw.to(mv, { scale: 1 }, { duration: 0.5, ease: ease.outElasticSoft });
      this.tw.to(mv, { flash: 0 }, { duration: 0.4, ease: ease.outQuad });
    });
  }

  prime(p, cell) {
    const v = this.viewFor(p, cell);
    v.z = 3;
    this.tw.to(v, { scale: 1.3, flash: 0.85 }, { duration: TIMING.chainDelay * 0.9, ease: ease.outQuad });
  }

  vanish(p) {
    const v = this.views.get(p.id);
    if (!v || v.dying) return;
    v.dying = true;
    const [x, y] = this.viewCenter(v);
    this.fx.burst(this.bank.pieceSet(p), x, y, { big: true, power: 1.2 });
    this.retire(v);
  }

  lineBlast(p, cell, dir, { wide = false } = {}) {
    this.vanish(p);
    const cs = this.L.cs;
    const [x, y] = this.center(cell);
    // Beams run to the last real cell of the line, so shaped boards keep them on the board.
    const line = dir === 'h' ? this.board.cells[cell.r] : this.board.cells.map((row) => row[cell.c]);
    const at = dir === 'h' ? cell.c : cell.r;
    const active = line.filter((c) => c.active).map((c) => (dir === 'h' ? c.c : c.r));
    const first = Math.min(at, ...active);
    const last = Math.max(at, ...active);
    const reachNeg = (at - first + 0.5) * cs;
    const reachPos = (last - at + 0.5) * cs;
    const color = p.color >= 0 ? CANDY_COLORS[p.color].main : '#ffffff';
    this.fx.beam(x, y, dir, color, reachNeg, reachPos, cs / TIMING.beamStep, { wide });
    this.fx.flash(x, y, cs * 1.4, color, 0.25);
    this.stage.shake(wide ? 0.4 : 0.22);
    this.sound('zap');
  }

  explosion(p, cell, radius) {
    const v = this.views.get(p.id);
    const lead = TIMING.bombLead;
    if (v && !v.dying) {
      v.dying = true;
      v.z = 3;
      this.tw.run(lead, (k) => {
        v.scale = 1 + 0.42 * ease.inQuad(k);
        v.rot = Math.sin(k * 42) * 0.14 * k;
        v.flash = k * 0.85;
      });
    }
    this.tw.after(lead, () => {
      const [x, y] = this.center(cell);
      if (v) {
        this.fx.burst(this.bank.bomb, x, y, { big: true, power: 1.5 });
        this.retire(v);
      }
      this.fx.explosion(x, y, this.L.cs * (radius + 0.6));
      this.stage.shake(0.35 + radius * 0.14);
      this.sound('boom');
    });
  }

  // Rainbow bomb: charges up spinning, then lightning strikes every target in turn.
  rainbow(p, cell, targets, color, { convert = false } = {}) {
    const v = this.views.get(p.id);
    const lead = TIMING.zapLead;
    const cs = this.L.cs;
    const [x0, y0] = this.center(cell);
    if (v) {
      v.dying = true;
      v.z = 3;
      this.tw.run(lead, (k) => {
        v.scale = 1 + 0.35 * ease.outCubic(k);
        v.rot = k * k * 7;
        v.glow = k;
      });
    }
    this.sound('charge');
    this.fx.ring(x0, y0, cs * 1.8, cs * 0.25, '#ffffff', lead, cs * 0.1);
    this.fx.sparkles(x0, y0, 6, cs * 0.8, { size: 0.6, up: 0 });
    targets.forEach((target, i) => {
      const delay = lead + i * TIMING.zapStagger;
      const [x1, y1] = this.center(target);
      this.fx.bolt(x0, y0, x1, y1, { delay, duration: convert ? 0.4 : 0.3, color: RAINBOW[i % RAINBOW.length] });
      this.tw.after(delay, () => {
        this.sound('zing');
        const tv = target.piece && this.views.get(target.piece.id);
        if (tv && !tv.dying) {
          tv.flash = 1;
          this.tw.to(tv, { flash: 0 }, { duration: 0.3 });
        }
      });
    });
    const end = lead + Math.max(1, targets.length) * TIMING.zapStagger + 0.1;
    this.tw.after(end, () => {
      if (v) {
        this.fx.burst(this.bank.rainbow, x0, y0, { big: true, power: 1.3 });
        this.retire(v);
      }
      RAINBOW.forEach((c, i) => this.fx.ring(x0, y0, cs * 0.2, cs * (1.2 + i * 0.12), c, 0.5, cs * 0.12));
      this.stage.shake(0.3);
    });
  }

  // A candy turned into a special by a rainbow bolt; it keeps its old look until the bolt lands.
  convert(p, cell, delay) {
    const v = this.viewFor(p, cell);
    v.override = Special.NONE;
    this.tw.after(delay, () => {
      v.override = null;
      v.flash = 1;
      v.scale = 1.4;
      this.tw.to(v, { scale: 1, flash: 0 }, { duration: 0.38, ease: ease.outBack });
      const [x, y] = this.viewCenter(v);
      this.fx.ring(x, y, this.L.cs * 0.1, this.L.cs * 0.85, '#ffffff', 0.3, this.L.cs * 0.12);
    });
  }

  // Two specials swapped together slam into one cell before their combined effect.
  merge(pieces, center) {
    const duration = TIMING.mergeTime;
    for (const p of pieces) {
      const v = this.views.get(p.id);
      if (!v) continue;
      v.dying = true;
      v.z = 4;
      this.tw.to(v, { x: center.c, y: center.r, scale: 1.35, flash: 1 }, { duration, ease: ease.inBack }).then(() => this.retire(v));
    }
    this.tw.after(duration, () => {
      const [x, y] = this.center(center);
      this.fx.flash(x, y, this.L.cs * 2.2, '#ffffff', 0.32);
      this.fx.sparkles(x, y, 10, this.L.cs);
      this.stage.shake(0.3);
      this.sound('special');
    });
  }

  blockerHit(cell, blocker, destroyed) {
    const [x, y] = this.center(cell);
    const type = blocker.type;
    const colors = BLOCKER_COLORS[type];
    if (destroyed) {
      const set = type === 'ice' ? this.bank.ice : type === 'chocolate' ? this.bank.chocolate : this.bank.caramelCracked;
      this.fx.ghost(set.normal, x, y, { duration: 0.22, s0: 1.05, s1: 1.3, white: set.white });
      this.fx.burst(set, x, y, { power: 1.1, big: true });
      this.fx.crumbs(x, y, 8, [colors.main, colors.light, colors.deep]);
      this.sound(type === 'ice' ? 'ice' : type === 'chocolate' ? 'crunch' : 'crack');
    } else {
      const st = this.blockerState(blocker);
      st.shake = 1;
      st.flash = 1;
      this.fx.crumbs(x, y, 7, [colors.main, colors.light, colors.deep]);
      this.fx.ghost(this.bank.caramel.normal, x, y, { duration: 0.2, s0: 1, s1: 1.2 });
      this.sound('crack');
    }
  }

  lockBreak(cell) {
    const [x, y] = this.center(cell);
    this.fx.ghost(this.bank.cage.normal, x, y, { duration: 0.26, s0: 1, s1: 1.35, white: this.bank.cage.white });
    this.fx.burst(this.bank.cage, x, y, { power: 1.25 });
    this.sound('clink');
    const v = cell.piece && this.views.get(cell.piece.id);
    if (v) {
      v.scale = 1.2;
      this.tw.to(v, { scale: 1 }, { duration: 0.4, ease: ease.outBack });
    }
  }

  scorePopup(cell, points, color) {
    const [x, y] = this.center(cell);
    this.fx.text(`+${points}`, x, y, { style: 'score', color: color >= 0 ? CANDY_COLORS[color] : NEUTRAL_COLOR });
  }

  cascade(n) {
    this.moveCascade = n;
    const word = WORDS[n];
    if (!word) return;
    const [x, y] = this.boardCenter();
    this.fx.text(word[0], x, y - this.L.cs * 0.6, { style: 'word', color: word[1] });
    this.fx.sparkles(x, y - this.L.cs * 0.6, 8, this.L.cs * 2);
    this.sound('combo', { level: n });
  }

  fall({ moves, spawns }) {
    const batch = { pending: 0, resolve: null };
    const done = new Promise((resolve) => (batch.resolve = resolve));
    const jitter = new Map();
    const delayFor = (c) => {
      if (!jitter.has(c)) jitter.set(c, Math.random() * 0.012);
      return Math.abs(c - this.actionCol) * 0.014 + jitter.get(c);
    };
    const add = (v, toY) => {
      v.fall = { vy: START_SPEED, toY, delay: delayFor(v.x), batch };
      batch.pending++;
      this.fallers.add(v);
    };
    for (const m of moves) {
      const v = this.viewFor(m.piece, m.from);
      v.x = m.to.c;
      add(v, m.to.r);
    }
    for (const s of spawns) {
      const v = this.makeView(s.piece, s.to.c, s.fromRow);
      v.clip = true;
      add(v, s.to.r);
    }
    if (!batch.pending) batch.resolve();
    return done;
  }

  slide(slides) {
    return Promise.all(
      slides.map(({ piece, from, to }) => {
        const v = this.viewFor(piece, from);
        return this.tw.to(v, { x: to.c, y: to.r }, { duration: 0.15, ease: ease.inQuad }).then(() => this.kick(v, 0.14));
      }),
    );
  }

  async noMoves() {
    const [x, y] = this.boardCenter();
    this.fx.text('No moves left!', x, y, { style: 'info', color: 'info', duration: 1.3 });
    await this.tw.wait(0.8);
  }

  // Everything swirls into the middle and flies back out to new spots.
  async shuffle(moves) {
    this.sound('shuffle');
    const cx = (this.board.cols - 1) / 2;
    const cy = (this.board.rows - 1) / 2;
    await Promise.all(
      moves.map(({ piece, to }, i) => {
        const v = this.viewFor(piece, to);
        const a = Math.random() * Math.PI * 2;
        return this.tw
          .to(v, { x: cx + Math.cos(a) * 0.7, y: cy + Math.sin(a) * 0.7, scale: 0.55, rot: v.rot + 4 }, { duration: 0.38, delay: i * 0.004, ease: ease.inBack })
          .then(() => this.tw.to(v, { x: to.c, y: to.r, scale: 1, rot: 0 }, { duration: 0.5, delay: Math.random() * 0.1, ease: ease.outBack }));
      }),
    );
  }

  async chocolateSpread({ from, to, eaten }) {
    const ev = this.views.get(eaten.id);
    if (ev) {
      ev.dying = true;
      this.tw.to(ev, { scale: 0, alpha: 0 }, { duration: 0.32, ease: ease.inBack }).then(() => this.retire(ev));
    }
    const st = this.blockerState(to.blocker);
    st.scale = 0.2;
    st.ox = (from.c - to.c) * 0.55;
    st.oy = (from.r - to.r) * 0.55;
    this.sound('crunch');
    await this.tw.to(st, { scale: 1, ox: 0, oy: 0 }, { duration: 0.45, ease: ease.outBack });
  }

  bonus(p, cell) {
    const [x, y] = this.center(cell);
    this.fx.sparkles(x, y, 10, this.L.cs * 0.7, { size: 0.7 });
    this.fx.text('+3 moves', x, y - this.L.cs * 0.3, { style: 'bonus', color: { light: '#bff6ff' } });
    this.sound('bonus');
  }

  async levelComplete() {
    this.deselect();
    this.hint = null;
    const [x, y] = this.boardCenter();
    this.fx.text('Level Complete!', x, y, { style: 'banner', color: 'banner', duration: 1.55 });
    this.fx.confettiBurst(x - this.L.cs * 2, y + this.L.cs * 2, 45);
    this.fx.confettiBurst(x + this.L.cs * 2, y + this.L.cs * 2, 45);
    this.sound('win');
    await this.tw.wait(1.4);
    if (this.engine.moves > 0) {
      this.fx.text('Sugar Rush!', x, y, { style: 'word', color: 'rush', duration: 1.3 });
      this.sound('combo', { level: 6 });
      await this.tw.wait(0.45);
    }
  }

  // A spark flies from the moves counter and turns a candy striped.
  finaleConvert(p, cell) {
    const v = this.viewFor(p, cell);
    v.override = Special.NONE;
    const from = this.stage.hudPoint('moves');
    const [x, y] = this.center(cell);
    const step = this.finaleCount++;
    this.fx.flyer(this.bank.sparkle, from.x, from.y, x, y, {
      duration: TIMING.finaleFlight,
      scale0: 0.8,
      scale1: 0.7,
      arc: 0.2,
      onArrive: () => {
        v.override = null;
        v.flash = 1;
        v.scale = 1.4;
        this.tw.to(v, { scale: 1, flash: 0 }, { duration: 0.35, ease: ease.outBack });
        this.fx.ring(x, y, this.L.cs * 0.1, this.L.cs * 0.9, '#fff3b0', 0.3, this.L.cs * 0.14);
        this.sound('ding', { step: step % 10 });
      },
    });
  }

  megaWave(center) {
    const [x, y] = this.center(center);
    const radius = Math.hypot(this.board.cols, this.board.rows) * this.L.cs * 0.6;
    this.fx.mega(x, y, radius);
    this.stage.shake(0.9);
    this.sound('mega');
  }

  // ------------------------------------------------------------------ update

  update(dt) {
    this.time += dt;
    this.tw.update(dt);
    this.recentPops = Math.max(0, this.recentPops - dt * 40);
    if (this.introT >= 0) {
      this.introT += dt;
      if (this.introT > this.introLength && this.fallers.size === 0) this.introT = -1;
    }

    // Falling candies: gravity, a stretch while falling, a squash and hop on landing.
    for (const v of this.fallers) {
      const f = v.fall;
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.vy = Math.min(MAX_SPEED, f.vy + GRAVITY * dt);
      v.y += f.vy * dt;
      v.sq = Math.max(-0.09, -f.vy * 0.0042);
      if (v.y >= f.toY) {
        v.y = f.toY;
        v.fall = null;
        v.clip = false;
        this.fallers.delete(v);
        const impact = f.vy;
        this.kick(v, clamp(0.05 + impact * 0.0105, 0, 0.25));
        v.oyv = -impact * 0.085;
        this.sound('land', { strength: clamp(impact / 16, 0.3, 1) });
        if (--f.batch.pending === 0) f.batch.resolve();
      }
    }

    for (const v of this.views.values()) {
      if (!v.fall) [v.sq, v.sqv] = spring(v.sq, v.sqv, 0, 360, 12, dt);
      [v.oy, v.oyv] = spring(v.oy, v.oyv, 0, 480, 19, dt);
      [v.lift, v.liftv] = spring(v.lift, v.liftv, v.liftT, 320, 17, dt);
      [v.dragX, v.dragXv] = spring(v.dragX, v.dragXv, v.dragXT, 520, 26, dt);
      [v.dragY, v.dragYv] = spring(v.dragY, v.dragYv, v.dragYT, 520, 26, dt);
    }

    for (const cell of this.board.list) {
      if (!cell.blocker) continue;
      const st = this.blockerFx.get(cell.blocker);
      if (st) {
        st.shake = Math.max(0, st.shake - dt * 3.2);
        st.flash = Math.max(0, st.flash - dt * 4);
      }
    }

    this.syncViews();
    this.updateHint(dt);
    this.ambient(dt);
  }

  // Creates views for pieces that have none (initial board) and drops stray ones.
  syncViews() {
    const onBoard = new Set();
    for (const cell of this.board.list) {
      const p = cell.piece;
      if (!p) continue;
      onBoard.add(p.id);
      if (!this.views.has(p.id)) this.makeView(p, cell.c, cell.r);
    }
    for (const v of this.views.values()) {
      if (onBoard.has(v.piece.id) || v.dying || v.fall) continue;
      v.stray = (v.stray ?? 0) + 1;
      if (v.stray > 30) this.retire(v);
    }
  }

  updateHint(dt) {
    const quiet = this.canInteract() && !this.drag && !this.selected;
    if (!quiet) {
      this.idle = 0;
      this.hint = null;
      return;
    }
    this.idle += dt;
    const wait = this.tutorial ? 1.2 : 5.5;
    if (!this.hint && this.idle > wait) {
      const moves = this.board.validMoves().sort((a, b) => b.weight - a.weight);
      if (!moves.length) return;
      const choice = moves[Math.floor(Math.random() * Math.min(3, moves.length))];
      this.hint = { a: choice.a, b: choice.b, t: 0 };
    }
    if (this.hint) this.hint.t += dt;
  }

  // Idle life: fuse sparks on bombs, glints on ice and random candies.
  ambient(dt) {
    if (this.stage.reduced) return;
    const cs = this.L.cs;
    for (const v of this.views.values()) {
      if (v.dying || v.piece.special !== Special.BOMB || v.override !== null) continue;
      v.fuse -= dt;
      if (v.fuse <= 0) {
        v.fuse = 0.06 + Math.random() * 0.08;
        const [x, y] = this.viewCenter(v);
        this.fx.add({
          kind: 'dot',
          color: Math.random() < 0.5 ? '#ffd27a' : '#ff8a1f',
          x: x + cs * 0.3,
          y: y - cs * 0.4,
          vx: (Math.random() - 0.3) * cs * 2,
          vy: -cs * (1 + Math.random() * 2),
          g: cs * 8,
          drag: 2,
          max: 0.35,
          s0: 0.35,
          s1: 0,
          additive: true,
        });
      }
    }
    this.sparkleTimer -= dt;
    if (this.sparkleTimer <= 0 && this.introT < 0) {
      this.sparkleTimer = 0.35 + Math.random() * 0.5;
      const cells = this.board.list.filter((c) => c.piece && !c.lock);
      const cell = cells[Math.floor(Math.random() * cells.length)];
      if (cell) {
        const [x, y] = this.center(cell);
        this.fx.sparkles(x + (Math.random() - 0.5) * cs * 0.4, y - cs * 0.2, 1, 0, { size: 0.5, up: 0.1 });
      }
    }
  }

  // ------------------------------------------------------------------ draw

  buildCache() {
    const { cs, bx, by } = this.L;
    const dpr = this.stage.dpr;
    const key = `${cs}|${dpr}|${bx}|${by}`;
    if (this.cacheKey === key) return;
    this.cacheKey = key;
    const { rows, cols } = this.board;
    const outline = Math.max(3, cs * 0.085);
    const margin = Math.ceil(outline + cs * 0.4);
    const W = cols * cs + margin * 2;
    const H = rows * cs + margin * 2;

    const shape = createCanvas(W * dpr, H * dpr);
    const sctx = shape.getContext('2d');
    sctx.scale(dpr, dpr);
    sctx.translate(margin, margin);
    sctx.fillStyle = this.theme.outline;
    sctx.beginPath();
    for (const cell of this.board.list) {
      if (!cell.active) continue;
      roundRect(sctx, cell.c * cs - outline, cell.r * cs - outline, cs + outline * 2, cs + outline * 2, cs * 0.2 + outline);
    }
    sctx.fill();

    const canvas = createCanvas(W * dpr, H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.save();
    ctx.shadowColor = 'rgba(40, 6, 60, 0.38)';
    ctx.shadowBlur = cs * 0.35 * dpr;
    ctx.shadowOffsetY = cs * 0.12 * dpr;
    ctx.drawImage(shape, 0, 0);
    ctx.restore();
    ctx.scale(dpr, dpr);
    ctx.translate(margin, margin);
    ctx.fillStyle = this.theme.base;
    for (const cell of this.board.list) {
      if (cell.active) ctx.fillRect(cell.c * cs - 0.5, cell.r * cs - 0.5, cs + 1, cs + 1);
    }
    const light = this.stage.images.get(this.theme.light);
    const dark = this.stage.images.get(this.theme.dark);
    const inset = Math.max(0.5, cs * 0.012);
    for (const cell of this.board.list) {
      if (!cell.active) continue;
      const img = (cell.r + cell.c) % 2 === 0 ? light : dark;
      ctx.drawImage(img, cell.c * cs + inset, cell.r * cs + inset, cs - inset * 2, cs - inset * 2);
    }
    this.cache = { canvas, x: bx - margin, y: by - margin, w: W, h: H, outline };
  }

  drawTilesIntro(ctx) {
    const { cs, bx, by } = this.L;
    const outline = Math.max(3, cs * 0.085);
    const light = this.stage.images.get(this.theme.light);
    const dark = this.stage.images.get(this.theme.dark);
    const scaleOf = (cell) => ease.outBack(clamp((this.introT - (cell.r + cell.c) * 0.03) / 0.4, 0, 1));
    ctx.fillStyle = this.theme.outline;
    for (const cell of this.board.list) {
      if (!cell.active) continue;
      const s = scaleOf(cell);
      if (s <= 0) continue;
      const cx = bx + (cell.c + 0.5) * cs;
      const cy = by + (cell.r + 0.5) * cs;
      const half = (cs / 2 + outline) * s;
      ctx.beginPath();
      roundRect(ctx, cx - half, cy - half, half * 2, half * 2, (cs * 0.2 + outline) * s);
      ctx.fill();
    }
    for (const cell of this.board.list) {
      if (!cell.active) continue;
      const s = scaleOf(cell);
      if (s <= 0) continue;
      const cx = bx + (cell.c + 0.5) * cs;
      const cy = by + (cell.r + 0.5) * cs;
      const half = (cs / 2) * s;
      ctx.fillStyle = this.theme.base;
      ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
      ctx.drawImage((cell.r + cell.c) % 2 === 0 ? light : dark, cx - half, cy - half, half * 2, half * 2);
    }
  }

  draw(ctx) {
    const { cs } = this.L;
    const t = this.time;
    if (this.introT >= 0 && this.introT < this.introLength) this.drawTilesIntro(ctx);
    else {
      this.buildCache();
      const c = this.cache;
      ctx.drawImage(c.canvas, c.x, c.y, c.w, c.h);
    }

    // Blockers
    for (const cell of this.board.list) {
      const blocker = cell.blocker;
      if (!blocker) continue;
      const set = this.bank.blockerSet(blocker);
      const st = this.blockerFx.get(blocker);
      const shake = st ? Math.sin(t * 70) * st.shake * cs * 0.05 : 0;
      const s = st ? st.scale : 1;
      if (s <= 0.01) continue;
      const x = this.sx(cell.c + (st?.ox ?? 0)) + shake;
      const y = this.sy(cell.r + (st?.oy ?? 0));
      this.drawSprite(ctx, set.normal, x, y, s, 0);
      if (st?.flash > 0.01) {
        ctx.globalAlpha = st.flash * 0.8;
        this.drawSprite(ctx, set.white, x, y, s, 0);
        ctx.globalAlpha = 1;
      }
    }

    // Hint glow under the two candies of a suggested move.
    let hintA = null;
    let hintB = null;
    let nudge = 0;
    if (this.hint && this.hint.a.piece && this.hint.b.piece) {
      hintA = this.views.get(this.hint.a.piece.id);
      hintB = this.views.get(this.hint.b.piece.id);
      const phase = this.hint.t % 1.7;
      nudge = phase < 0.7 ? Math.sin((phase / 0.7) * Math.PI * 2) * 0.075 : 0;
      const pulse = 0.35 + 0.3 * Math.sin(this.hint.t * 5);
      for (const v of [hintA, hintB]) {
        if (!v) continue;
        const set = this.bank.pieceSet(v.piece);
        if (!set.glow) continue;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pulse;
        this.drawSprite(ctx, set.glow, this.sx(v.x), this.sy(v.y), 1.05, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }

    // Pieces: the ones still entering from above are clipped to the columns.
    const list = [...this.views.values()].sort((a, b) => a.z + (a.dying ? 10 : 0) - (b.z + (b.dying ? 10 : 0)));
    const clipped = list.filter((v) => v.clip);
    if (clipped.length) {
      ctx.save();
      ctx.beginPath();
      for (let c = 0; c < this.board.cols; c++) {
        if (this.colTop[c] < 0) continue;
        const top = this.L.by + this.colTop[c] * cs;
        ctx.rect(this.L.bx + c * cs - cs * 0.2, top, cs * 1.4, this.L.by + this.board.rows * cs - top + cs);
      }
      ctx.clip();
      for (const v of clipped) this.drawPiece(ctx, v, t, 0, 0);
      ctx.restore();
    }
    for (const v of list) {
      if (v.clip) continue;
      let hx = 0;
      let hy = 0;
      if (v === hintA || v === hintB) {
        const other = v === hintA ? this.hint.b : this.hint.a;
        const self = v === hintA ? this.hint.a : this.hint.b;
        hx = (other.c - self.c) * nudge;
        hy = (other.r - self.r) * nudge;
      }
      this.drawPiece(ctx, v, t, hx, hy);
    }

    // Cages sit on top of their candy.
    for (const cell of this.board.list) {
      if (!cell.lock) continue;
      const s = this.blockerFx.get(cell.lock)?.scale ?? 1;
      if (s <= 0.01) continue;
      const [x, y] = this.center(cell);
      this.drawSprite(ctx, this.bank.cage.normal, x, y, s, 0);
    }

    // Selection frame
    if (this.selected) {
      const k = this.selectAnim.k;
      const [x, y] = this.center(this.selected);
      const s = (0.6 + 0.4 * k) * (1 + 0.035 * Math.sin(t * 6));
      ctx.globalAlpha = clamp(k * 1.5, 0, 1);
      this.drawSprite(ctx, this.bank.frame, x, y, s, 0);
      ctx.globalAlpha = 1;
    }
    if (this.cursor && this.canInteract()) {
      const [x, y] = this.center(this.cursor);
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, cs * 0.06);
      ctx.setLineDash([cs * 0.16, cs * 0.1]);
      ctx.lineDashOffset = -t * cs * 0.6;
      ctx.beginPath();
      roundRect(ctx, x - cs * 0.48, y - cs * 0.48, cs * 0.96, cs * 0.96, cs * 0.18);
      ctx.stroke();
      ctx.restore();
    }
    if (this.tutorial && this.hint) this.drawTutorialHand(ctx);
  }

  drawSprite(ctx, s, x, y, scale, rot) {
    if (rot || scale !== 1) {
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      ctx.scale(scale, scale);
      ctx.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
      ctx.restore();
    } else {
      ctx.drawImage(s.canvas, x - s.ax, y - s.ay, s.w, s.h);
    }
  }

  drawPiece(ctx, v, t, hx, hy) {
    const p = v.piece;
    const cs = this.L.cs;
    const special = v.override ?? p.special;
    const set = this.bank.pieceSet(p, special);
    const sprite = this.bank.pieceSprite(p, special);
    const x = this.sx(v.x + v.dragX + hx);
    const y = this.sy(v.y + v.dragY + v.oy + hy);
    const lift = Math.max(0, v.lift);
    const scale = v.scale * (1 + lift * 0.12);
    if (scale <= 0.01 || v.alpha <= 0.01) return;
    let rot = v.rot;
    if (special === Special.BOMB) rot += Math.sin(t * 5 + v.phase) * 0.06;
    else if (special === Special.RAINBOW) rot += Math.sin(t * 2.2 + v.phase) * 0.09;
    const sx = scale * (1 + v.sq * 0.85);
    const sy = scale * (1 - v.sq);
    const pivot = cs * 0.38;

    if (lift > 0.02) {
      const sh = this.bank.shadow;
      ctx.globalAlpha = lift * 0.55 * v.alpha;
      ctx.drawImage(sh.canvas, x - cs * 0.55, y + cs * 0.12, cs * 1.1, cs * 0.5);
    }

    // Specials glow and pulse so they stand out on a busy board.
    let glowAmount = v.glow;
    if (special !== Special.NONE) glowAmount += 0.4 + 0.25 * Math.sin(t * 4 + v.phase);
    if (glowAmount > 0.02 && !v.dying) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(glowAmount, 0, 1) * v.alpha;
      if (special === Special.RAINBOW) {
        for (let i = 0; i < 6; i++) {
          const a = t * 2.4 + (i * Math.PI) / 3;
          const d = this.bank.dot(RAINBOW[i]);
          const size = cs * 0.95 * scale;
          ctx.drawImage(d.canvas, x + Math.cos(a) * cs * 0.24 - size / 2, y + Math.sin(a) * cs * 0.24 - size / 2, size, size);
        }
      } else if (set.glow) {
        this.drawSprite(ctx, set.glow, x, y, scale * 1.04, rot);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.globalAlpha = v.alpha;
    ctx.save();
    ctx.translate(x, y + pivot);
    ctx.scale(sx, sy);
    ctx.translate(0, -pivot);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(sprite.canvas, -sprite.ax, -sprite.ay, sprite.w, sprite.h);
    if (v.flash > 0.01) {
      ctx.globalAlpha = v.alpha * Math.min(1, v.flash);
      ctx.drawImage(set.white.canvas, -set.white.ax, -set.white.ay, set.white.w, set.white.h);
    }
    ctx.restore();

    if (p.bonus && !v.dying) {
      ctx.globalAlpha = v.alpha;
      this.drawSprite(ctx, this.bank.badge, x + cs * 0.26 * scale, y + cs * 0.24 * scale, scale, Math.sin(t * 7 + v.phase) * 0.18);
    }
    ctx.globalAlpha = 1;
  }

  // Level 1 only: a glove hand demonstrates the swipe until the first move.
  drawTutorialHand(ctx) {
    const hand = handImage();
    if (!hand) return;
    const { a, b, t } = this.hint;
    const cs = this.L.cs;
    const k = (t % 1.8) / 1.8;
    const move = ease.inOutCubic(clamp((k - 0.2) / 0.45, 0, 1));
    const alpha = k < 0.12 ? k / 0.12 : k > 0.82 ? (1 - k) / 0.18 : 1;
    const press = k > 0.1 && k < 0.7 ? 0.9 : 1;
    const x = lerp(this.sx(a.c), this.sx(b.c), move);
    const y = lerp(this.sy(a.r), this.sy(b.r), move);
    if (k > 0.12 && k < 0.3) {
      const ring = (k - 0.12) / 0.18;
      ctx.save();
      ctx.globalAlpha = (1 - ring) * 0.8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, cs * 0.06);
      ctx.beginPath();
      ctx.arc(this.sx(a.c), this.sy(a.r), cs * (0.15 + ring * 0.35), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const w = cs * 0.95 * press;
    const h = (w * 72) / 64;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(-0.25);
    ctx.drawImage(hand, -w * 0.31, -h * 0.07, w, h);
    ctx.restore();
  }
}
