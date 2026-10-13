import { Board } from './board.js';
import { Special, createPiece, isColorless, isStriped } from './pieces.js';

// Tuned for a typical winning score around 10,000 and the highest around 15,000. The flat clear
// bonus lifts every win equally, which keeps short score levels close to big blocker boards;
// blockers and special blasts are cheap because big boards have lots of both. Score goals in
// level-data.js use these points (the clear bonus never counts toward them). After changing
// them, run `npm run stars`.
export const POINTS = Object.freeze({
  candy: 10, // per candy in a match, times the cascade number
  make: { [Special.STRIPE_H]: 20, [Special.STRIPE_V]: 20, [Special.BOMB]: 30, [Special.RAINBOW]: 40 },
  fire: 20, // setting off a special candy
  blast: 2, // per candy cleared by a special
  ice: 10,
  caramel: 20,
  caramelHit: 5,
  chocolate: 10,
  cage: 10,
  bonus: 30,
  finale: 30, // per move left when the level is won
  clear: 5000, // flat bonus for clearing a level, added when the goals are met
});

// Seconds between the beats of every effect. The headless animator uses zeros.
export const NULL_TIMING = Object.freeze({
  matchHold: 0,
  afterClear: 0,
  chainDelay: 0,
  beamStep: 0,
  bombLead: 0,
  bombStep: 0,
  zapLead: 0,
  zapStagger: 0,
  convertSettle: 0,
  convertStagger: 0,
  waveStep: 0,
  mergeTime: 0,
  finaleStagger: 0,
  finaleFlight: 0,
});

function noop() {}

// Animator that skips every animation; used by tests and the balance simulator.
export const NullAnimator = new Proxy(
  { timing: NULL_TIMING },
  {
    get(target, key) {
      if (key in target) return target[key];
      return key === 'then' ? undefined : noop;
    },
  },
);

function createGoals(level, board) {
  return level.goals.map((goal) => {
    let target;
    if (goal.type === 'score') target = goal.target;
    else if (goal.type === 'collect') target = goal.count;
    else if (goal.type === 'cage') target = board.countLocks();
    else target = board.countBlockers(goal.type);
    return { ...goal, target, left: target };
  });
}

const distance = (a, b) => Math.hypot(a.r - b.r, a.c - b.c);

/*
 * Runs the rules of a level. Every visual beat goes through `animator`, and every
 * change the HUD cares about goes through `hooks`, so the engine itself never
 * touches the screen.
 */
export class Engine {
  constructor(level, { rng, animator = NullAnimator, hooks = {} }) {
    this.level = level;
    this.rng = rng;
    this.anim = animator;
    this.hooks = hooks;
    this.board = Board.fromLevel(level, rng);
    this.moves = level.moves;
    this.score = 0;
    this.goals = createGoals(level, this.board);
    this.busy = false;
    this.over = false;
    this.result = null;
    this.stats = { swaps: 0, specials: 0, bestCascade: 0, shuffles: 0 };
    this.chocolateIdle = 0;
    // Every accepted player action, in order: [r, c, r, c] for a swap, [r, c] for a tap. With the
    // seed this is enough to replay the whole game (see replay.js).
    this.moveLog = [];
  }

  get timing() {
    return this.anim.timing;
  }

  emit(name, ...args) {
    this.hooks[name]?.(...args);
  }

  canPlay() {
    return !this.busy && !this.over;
  }

  goalsDone() {
    return this.goals.every((g) => g.left <= 0);
  }

  starsFor(score) {
    return this.level.stars.reduce((n, threshold) => n + (score >= threshold ? 1 : 0), 0);
  }

  context(swapCells = null) {
    return {
      cascade: 0,
      swapCells,
      swapDir: swapCells ? (swapCells[0].r === swapCells[1].r ? 'h' : 'v') : null,
      chocolateHit: false,
      damaged: new Set(),
    };
  }

  // ---------------------------------------------------------------- player actions

  // Swap the candy in `a` with its neighbour `b`. Resolves to false when the swap is refused.
  async trySwap(a, b) {
    if (!this.canPlay() || !this.board.canSwap(a, b)) return false;
    this.busy = true;
    try {
      const pa = a.piece;
      const pb = b.piece;
      const ctx = this.context([a, b]);
      this.board.swapPieces(a, b);
      if (isColorless(pa) || isColorless(pb) || (isStriped(pa) && isStriped(pb))) {
        this.moveLog.push([a.r, a.c, b.r, b.c]);
        await this.anim.swap(a, b, pa, pb);
        this.spendMove();
        ctx.swapCells = null;
        await this.comboSwap(a, b, pa, pb, ctx);
        await this.finishStep(ctx);
        await this.resolve(ctx);
      } else if (this.board.findMatchGroups().length) {
        this.moveLog.push([a.r, a.c, b.r, b.c]);
        await this.anim.swap(a, b, pa, pb);
        this.spendMove();
        await this.resolve(ctx);
      } else {
        this.board.swapPieces(a, b);
        await this.anim.swapBack(a, b, pa, pb);
        return false;
      }
      await this.afterMove(ctx);
      return true;
    } finally {
      this.busy = false;
    }
  }

  // Double-tapping a bomb or rainbow bomb sets it off where it stands.
  async tapActivate(cell) {
    if (!this.canPlay() || !this.board.isMovable(cell) || !isColorless(cell.piece)) return false;
    this.busy = true;
    try {
      this.moveLog.push([cell.r, cell.c]);
      const ctx = this.context();
      this.spendMove();
      await this.activate(cell.piece, cell, ctx);
      await this.finishStep(ctx);
      await this.resolve(ctx);
      await this.afterMove(ctx);
      return true;
    } finally {
      this.busy = false;
    }
  }

  spendMove() {
    this.moves--;
    this.stats.swaps++;
    this.emit('moves', this.moves, -1, null);
  }

  // ---------------------------------------------------------------- resolution

  async resolve(ctx) {
    for (let guard = 0; guard < 100; guard++) {
      const groups = this.board.findMatchGroups();
      if (!groups.length) return;
      ctx.cascade++;
      this.stats.bestCascade = Math.max(this.stats.bestCascade, ctx.cascade);
      const prefer = ctx.cascade === 1 ? ctx.swapCells : null;
      const plans = groups.map((group) => this.board.planGroup(group, prefer, ctx.swapDir));
      await this.clearMatches(plans, ctx);
      this.anim.cascade(ctx.cascade);
      this.emit('cascade', ctx.cascade);
      await this.finishStep(ctx);
    }
  }

  async finishStep(ctx) {
    for (const cell of this.board.list) if (cell.piece) cell.piece.fresh = false;
    ctx.damaged.clear();
    await this.anim.wait(this.timing.afterClear);
    await this.settle(ctx);
  }

  async settle(ctx) {
    for (let guard = 0; guard < 64; guard++) {
      const fall = this.board.gravity();
      if (fall.moves.length || fall.spawns.length) await this.anim.fall(fall, ctx);
      const slides = this.board.diagonal();
      if (!slides.length) return;
      await this.anim.slide(slides, ctx);
    }
  }

  async clearMatches(plans, ctx) {
    const timing = this.timing;
    const specials = [];
    for (const { group, special, at } of plans) {
      const striped = special === Special.STRIPE_H || special === Special.STRIPE_V;
      const made = special === Special.NONE ? null : createPiece(striped ? group.color : -1, special);
      const points = (group.cells.length * POINTS.candy + (made ? POINTS.make[special] : 0)) * ctx.cascade;
      this.addScore(points);
      this.anim.scorePopup(at ?? group.cells[Math.floor(group.cells.length / 2)], points, group.color);

      for (const cell of group.cells) {
        for (const n of this.board.neighbors(cell)) if (n.blocker) this.damageBlocker(n, ctx, true);
      }

      const gathered = [];
      group.cells.forEach((cell, order) => {
        if (cell.lock) {
          this.breakLock(cell);
          return;
        }
        const p = cell.piece;
        if (!p || p.dying) return;
        if (p.special !== Special.NONE) {
          specials.push([p, cell]);
          return;
        }
        p.dying = true;
        cell.piece = null;
        this.collect(p, cell);
        if (made) gathered.push({ piece: p, cell });
        else this.anim.pop(p, cell, { order, cause: 'match' });
      });

      if (made) {
        made.fresh = true;
        at.piece = made;
        this.stats.specials++;
        this.anim.converge(gathered, at, made);
      }
    }
    const chains = specials.map(([p, cell]) => this.activate(p, cell, ctx, { delay: timing.chainDelay }));
    await this.anim.wait(timing.matchHold);
    await Promise.all(chains);
  }

  // Applies one hit to a cell: damages a blocker, breaks a cage, sets off a special or clears a candy.
  // Resolves to the points earned directly by this hit.
  async hitCell(cell, ctx, delay = 0) {
    if (delay > 0) await this.anim.wait(delay);
    if (!cell || !cell.active) return 0;
    if (cell.blocker) {
      this.damageBlocker(cell, ctx, false);
      return 0;
    }
    if (cell.lock) {
      this.breakLock(cell);
      return 0;
    }
    const p = cell.piece;
    if (!p || p.dying || p.fresh) return 0;
    if (p.special !== Special.NONE) {
      await this.activate(p, cell, ctx, { delay: this.timing.chainDelay });
      return 0;
    }
    p.dying = true;
    cell.piece = null;
    this.collect(p, cell);
    this.anim.pop(p, cell, { cause: 'blast' });
    return POINTS.blast;
  }

  async hitAll(list, ctx, origin, color) {
    const gained = await Promise.all(list.map(([cell, delay]) => this.hitCell(cell, ctx, delay)));
    const total = gained.reduce((sum, n) => sum + n, 0);
    if (total) {
      this.addScore(total);
      this.anim.scorePopup(origin, total, color);
    }
  }

  async activate(p, cell, ctx, { delay = 0, color = null } = {}) {
    if (p.dying) return;
    p.dying = true;
    if (delay > 0) {
      // Long queues (rainbow conversions) wait quietly, then flash just before going off.
      const lead = Math.min(delay, this.timing.chainDelay);
      if (delay > lead) await this.anim.wait(delay - lead);
      this.anim.prime(p, cell);
      await this.anim.wait(lead);
    }
    if (cell.piece === p) cell.piece = null;
    this.collect(p, cell);
    this.addScore(POINTS.fire);
    if (p.special === Special.STRIPE_H) return this.fireLine(p, cell, ctx, 'h');
    if (p.special === Special.STRIPE_V) return this.fireLine(p, cell, ctx, 'v');
    if (p.special === Special.BOMB) return this.fireBomb(p, cell, ctx, p.radius || 2);
    if (p.special === Special.RAINBOW) return this.fireRainbow(p, cell, ctx, color ?? this.board.mostCommonColor());
  }

  async fireLine(p, cell, ctx, dir) {
    const { cells, rows, cols } = this.board;
    const list = [];
    if (dir === 'h') {
      for (let c = 0; c < cols; c++) if (c !== cell.c) list.push([cells[cell.r][c], Math.abs(c - cell.c)]);
    } else {
      for (let r = 0; r < rows; r++) if (r !== cell.r) list.push([cells[r][cell.c], Math.abs(r - cell.r)]);
    }
    this.anim.lineBlast(p, cell, dir);
    await this.hitAll(
      list.map(([target, d]) => [target, d * this.timing.beamStep]),
      ctx,
      cell,
      p.color,
    );
  }

  async fireCross(p, center, ctx, thick) {
    const { cells, rows, cols } = this.board;
    const delays = new Map();
    const add = (cell, d) => {
      if (!cell.active) return;
      const prev = delays.get(cell);
      if (prev === undefined || d < prev) delays.set(cell, d);
    };
    for (let k = -thick; k <= thick; k++) {
      const r = center.r + k;
      const c = center.c + k;
      if (r >= 0 && r < rows) {
        this.anim.lineBlast(p, cells[r][center.c], 'h', { wide: thick > 0 });
        for (let cc = 0; cc < cols; cc++) add(cells[r][cc], Math.abs(cc - center.c));
      }
      if (c >= 0 && c < cols) {
        this.anim.lineBlast(p, cells[center.r][c], 'v', { wide: thick > 0 });
        for (let rr = 0; rr < rows; rr++) add(cells[rr][c], Math.abs(rr - center.r));
      }
    }
    await this.hitAll(
      [...delays].map(([cell, d]) => [cell, d * this.timing.beamStep]),
      ctx,
      center,
      p.color,
    );
  }

  async fireBomb(p, cell, ctx, radius) {
    const reach = radius * radius + 1;
    const list = [];
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if ((!dr && !dc) || dr * dr + dc * dc > reach) continue;
        const target = this.board.cell(cell.r + dr, cell.c + dc);
        if (target?.active) list.push([target, this.timing.bombLead + Math.hypot(dr, dc) * this.timing.bombStep]);
      }
    }
    this.anim.explosion(p, cell, radius);
    await this.hitAll(list, ctx, cell, -1);
  }

  async fireRainbow(p, cell, ctx, color) {
    const targets = this.board
      .cellsOfColor(color)
      .filter((target) => target !== cell)
      .sort((a, b) => distance(a, cell) - distance(b, cell));
    const timing = this.timing;
    this.anim.rainbow(p, cell, targets, color);
    await this.hitAll(
      targets.map((target, i) => [target, timing.zapLead + i * timing.zapStagger]),
      ctx,
      cell,
      color,
    );
  }

  // Two specials swapped into each other combine into a bigger effect.
  async comboSwap(a, b, pa, pb, ctx) {
    const rank = (p) => (p.special === Special.RAINBOW ? 3 : p.special === Special.BOMB ? 2 : isStriped(p) ? 1 : 0);
    let x = { p: pa, cell: b };
    let y = { p: pb, cell: a };
    if (rank(pb) > rank(pa)) [x, y] = [y, x];
    const center = b;
    const timing = this.timing;
    const sx = x.p.special;
    const sy = y.p.special;

    if (sx === Special.RAINBOW && sy === Special.RAINBOW) {
      this.consume([x, y], center);
      await this.anim.wait(timing.mergeTime);
      await this.wipeBoard(center, ctx);
    } else if (sx === Special.RAINBOW && (isStriped(y.p) || sy === Special.BOMB)) {
      await this.rainbowConvert(x, y, ctx);
    } else if (sx === Special.RAINBOW) {
      await this.activate(x.p, x.cell, ctx, { color: y.p.color });
    } else if (sx === Special.BOMB && sy === Special.BOMB) {
      this.consume([x, y], center);
      await this.anim.wait(timing.mergeTime);
      await this.fireBomb(x.p, center, ctx, 3);
    } else if (sx === Special.BOMB && isStriped(y.p)) {
      this.consume([x, y], center);
      await this.anim.wait(timing.mergeTime);
      await this.fireCross(y.p, center, ctx, 1);
    } else if (sx === Special.BOMB) {
      await this.activate(x.p, x.cell, ctx);
    } else {
      this.consume([x, y], center);
      await this.anim.wait(timing.mergeTime);
      await this.fireCross(x.p, center, ctx, 0);
    }
  }

  consume(items, center) {
    for (const { p, cell } of items) {
      p.dying = true;
      if (cell.piece === p) cell.piece = null;
      this.collect(p, cell);
    }
    this.addScore(POINTS.fire * items.length);
    this.anim.merge(
      items.map((item) => item.p),
      center,
    );
  }

  // Rainbow + striped turns every candy of the striped color into striped candies.
  // Rainbow + bomb turns the most common candy into small bombs. Then they all go off.
  async rainbowConvert(rainbow, partner, ctx) {
    const timing = this.timing;
    const toBombs = partner.p.special === Special.BOMB;
    const color = toBombs ? this.board.mostCommonColor() : partner.p.color;
    rainbow.p.dying = true;
    if (rainbow.cell.piece === rainbow.p) rainbow.cell.piece = null;
    this.addScore(POINTS.fire);

    const targets = this.board
      .cellsOfColor(color)
      .filter((cell) => !cell.lock && cell.piece.special === Special.NONE)
      .sort((a, b) => distance(a, rainbow.cell) - distance(b, rainbow.cell));
    this.anim.rainbow(rainbow.p, rainbow.cell, targets, color, { convert: true });
    targets.forEach((cell, i) => {
      const p = cell.piece;
      if (toBombs) {
        p.special = Special.BOMB;
        p.radius = 1;
      } else {
        p.special = this.rng.chance(0.5) ? Special.STRIPE_H : Special.STRIPE_V;
      }
      p.fresh = true;
      this.anim.convert(p, cell, timing.zapLead + i * timing.zapStagger);
    });
    await this.anim.wait(timing.zapLead + targets.length * timing.zapStagger + timing.convertSettle);
    for (const cell of targets) if (cell.piece) cell.piece.fresh = false;

    const list = [[partner.p, partner.cell], ...targets.filter((cell) => cell.piece).map((cell) => [cell.piece, cell])];
    await Promise.all(
      list.map(([p, cell], i) => this.activate(p, cell, ctx, { delay: timing.chainDelay + i * timing.convertStagger })),
    );
  }

  async wipeBoard(center, ctx) {
    this.anim.megaWave(center);
    const list = this.board.list
      .filter((cell) => cell.active)
      .map((cell) => [cell, this.timing.waveStep * distance(cell, center)]);
    await this.hitAll(list, ctx, center, -1);
  }

  // ---------------------------------------------------------------- bookkeeping

  addScore(points) {
    if (!points) return;
    this.score += points;
    for (const goal of this.goals) if (goal.type === 'score') goal.left = Math.max(0, goal.target - this.score);
    this.emit('score', this.score, points);
  }

  progress(type, cell, detail) {
    this.goals.forEach((goal, index) => {
      if (goal.type !== type || goal.left <= 0) return;
      if (type === 'collect' && goal.color !== detail.color) return;
      goal.left--;
      this.emit('goal', index, goal, cell, detail);
    });
  }

  collect(p, cell) {
    if (p.color >= 0) this.progress('collect', cell, { piece: p, color: p.color });
    if (p.bonus) {
      this.moves += p.bonus;
      this.addScore(POINTS.bonus);
      this.anim.bonus(p, cell);
      this.emit('moves', this.moves, p.bonus, cell);
    }
  }

  damageBlocker(cell, ctx, fromMatch) {
    const blocker = cell.blocker;
    if (!blocker) return;
    if (fromMatch) {
      if (ctx.damaged.has(blocker)) return;
      ctx.damaged.add(blocker);
    }
    blocker.hp--;
    if (blocker.type === 'chocolate') ctx.chocolateHit = true;
    const destroyed = blocker.hp <= 0;
    if (destroyed) {
      cell.blocker = null;
      this.progress(blocker.type, cell, { blocker });
    }
    this.addScore(destroyed ? POINTS[blocker.type] : POINTS.caramelHit);
    this.anim.blockerHit(cell, blocker, destroyed);
  }

  breakLock(cell) {
    const lock = cell.lock;
    if (!lock) return;
    cell.lock = null;
    this.addScore(POINTS.cage);
    this.progress('cage', cell, { lock });
    this.anim.lockBreak(cell, lock);
  }

  // ---------------------------------------------------------------- end of a move

  async afterMove(ctx) {
    // Chocolate grows after two moves in a row that break none of it.
    this.chocolateIdle = ctx.chocolateHit ? 0 : this.chocolateIdle + 1;
    if (!this.goalsDone() && this.chocolateIdle >= 2 && this.board.countBlockers('chocolate') > 0) {
      this.chocolateIdle = 0;
      const spread = this.board.spreadChocolate();
      if (spread) {
        this.goals.forEach((goal, index) => {
          if (goal.type !== 'chocolate') return;
          goal.left = this.board.countBlockers('chocolate');
          this.emit('goal', index, goal, null, null);
        });
        await this.anim.chocolateSpread(spread);
      }
    }
    if (this.goalsDone()) return this.win();
    if (this.moves <= 0) return this.lose();
    if (!this.board.hasValidMove()) {
      this.stats.shuffles++;
      this.emit('shuffle');
      await this.anim.noMoves();
      await this.anim.shuffle(this.board.shuffle());
    }
  }

  // Goals met: the clear bonus, then every move left becomes a striped candy and everything
  // special goes off.
  async win() {
    this.over = true;
    this.emit('complete');
    this.addScore(POINTS.clear);
    await this.anim.levelComplete();
    const timing = this.timing;
    while (this.moves > 0) {
      const options = this.board.list.filter((cell) => this.board.isMovable(cell) && cell.piece.special === Special.NONE);
      if (!options.length) break;
      const cell = this.rng.pick(options);
      this.moves--;
      this.emit('moves', this.moves, -1, null);
      cell.piece.special = this.rng.chance(0.5) ? Special.STRIPE_H : Special.STRIPE_V;
      this.addScore(POINTS.finale);
      this.anim.finaleConvert(cell.piece, cell);
      await this.anim.wait(timing.finaleStagger);
    }
    if (this.moves > 0) {
      this.addScore(this.moves * POINTS.finale);
      this.moves = 0;
      this.emit('moves', 0, 0, null);
    }
    await this.anim.wait(timing.finaleFlight);
    for (let guard = 0; guard < 40; guard++) {
      const specials = this.board.list.filter(
        (cell) => cell.piece && !cell.piece.dying && cell.piece.special !== Special.NONE,
      );
      if (!specials.length) break;
      const ctx = this.context();
      await Promise.all(specials.map((cell, i) => this.hitCell(cell, ctx, i * timing.finaleStagger)));
      await this.finishStep(ctx);
      await this.resolve(ctx);
    }
    this.result = { win: true, score: this.score, stars: Math.max(1, this.starsFor(this.score)) };
    this.emit('win', this.result);
  }

  async lose() {
    this.over = true;
    this.result = { win: false, score: this.score, stars: 0 };
    this.emit('lose', this.result);
  }
}
