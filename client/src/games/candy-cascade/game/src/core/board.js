import { Special, createPiece, isColorless, isStriped } from './pieces.js';

// Chance that a new candy takes a color which finishes a line where it lands, when one exists.
// Higher means more chain reactions from refills, which makes levels easier. At most
// CASCADE_ASSISTS_PER_REFILL candies per refill are helped, so chains stay short and the
// board never plays itself.
export const CASCADE_CHANCE = 0.5;
export const CASCADE_ASSISTS_PER_REFILL = 1;

const NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/*
 * Layout legend (one character per cell):
 *   .  no cell (hole)          o  candy
 *   I  ice block (1 hit)        C  caramel block (2 hits)    c  cracked caramel (1 hit)
 *   H  chocolate (spreads)      L  candy locked in a cane cage
 *   B  bomb      R  rainbow bomb      -  horizontal striped candy     |  vertical striped candy
 */
export class Board {
  constructor(rows, cols, rng, colors) {
    this.rows = rows;
    this.cols = cols;
    this.rng = rng;
    this.colors = colors;
    this.bonusChance = 0;
    this.maxBonus = 0;
    this.cascadeChance = 0;
    this.assistsLeft = 0;
    this.cells = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({ r, c, active: false, piece: null, blocker: null, lock: null, spawner: false });
      }
      this.cells.push(row);
    }
    this.list = this.cells.flat();
  }

  static fromLevel(level, rng) {
    const rows = level.layout.length;
    const cols = Math.max(...level.layout.map((line) => line.length));
    const board = new Board(rows, cols, rng, level.colors);
    board.bonusChance = level.bonusChance ?? 0;
    board.maxBonus = level.maxBonus ?? 0;
    board.cascadeChance = level.cascadeChance ?? CASCADE_CHANCE;

    const presets = new Map();
    for (const cell of board.list) {
      const ch = level.layout[cell.r][cell.c] ?? '.';
      if (ch === '.' || ch === ' ') continue;
      cell.active = true;
      if (ch === 'I') cell.blocker = { type: 'ice', hp: 1 };
      else if (ch === 'C') cell.blocker = { type: 'caramel', hp: 2 };
      else if (ch === 'c') cell.blocker = { type: 'caramel', hp: 1 };
      else if (ch === 'H') cell.blocker = { type: 'chocolate', hp: 1 };
      else if (ch === 'L') cell.lock = { type: 'cage' };
      else if (ch === 'B') presets.set(cell, Special.BOMB);
      else if (ch === 'R') presets.set(cell, Special.RAINBOW);
      else if (ch === '-') presets.set(cell, Special.STRIPE_H);
      else if (ch === '|') presets.set(cell, Special.STRIPE_V);
    }
    // New candies enter at the top active cell of every column.
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (board.cells[r][c].active) {
          board.cells[r][c].spawner = true;
          break;
        }
      }
    }
    board.fillInitial(presets);
    return board;
  }

  // ---------------------------------------------------------------- queries

  cell(r, c) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols ? this.cells[r][c] : null;
  }

  neighbors(cell) {
    const out = [];
    for (const [dr, dc] of NEIGHBORS) {
      const n = this.cell(cell.r + dr, cell.c + dc);
      if (n && n.active) out.push(n);
    }
    return out;
  }

  isOpen(cell) {
    return !!cell && cell.active && !cell.blocker;
  }

  // Fixed cells stop falling candies: blockers and caged candies.
  isFixed(cell) {
    return !!cell.blocker || (!!cell.lock && !!cell.piece);
  }

  isMovable(cell) {
    return !!cell && cell.active && !cell.blocker && !cell.lock && !!cell.piece && !cell.piece.dying;
  }

  adjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  canSwap(a, b) {
    return this.adjacent(a, b) && this.isMovable(a) && this.isMovable(b);
  }

  swapPieces(a, b) {
    const t = a.piece;
    a.piece = b.piece;
    b.piece = t;
  }

  colorAt(r, c) {
    const cell = this.cell(r, c);
    if (!cell || !cell.active || cell.blocker || !cell.piece || cell.piece.dying) return -1;
    return cell.piece.color;
  }

  countBlockers(type) {
    return this.list.reduce((n, cell) => n + (cell.blocker?.type === type ? 1 : 0), 0);
  }

  countLocks() {
    return this.list.reduce((n, cell) => n + (cell.lock ? 1 : 0), 0);
  }

  countBonus() {
    return this.list.reduce((n, cell) => n + (cell.piece?.bonus ? 1 : 0), 0);
  }

  // Cells holding live pieces of the given color (normal or striped), locked ones included.
  cellsOfColor(color) {
    return this.list.filter((cell) => cell.piece && !cell.piece.dying && !cell.blocker && cell.piece.color === color && color >= 0);
  }

  mostCommonColor() {
    const counts = new Array(this.colors).fill(0);
    for (const cell of this.list) {
      const p = cell.piece;
      if (p && !p.dying && !cell.blocker && p.color >= 0) counts[p.color]++;
    }
    const best = Math.max(...counts);
    if (best === 0) return -1;
    const tied = counts.map((n, i) => (n === best ? i : -1)).filter((i) => i >= 0);
    return this.rng.pick(tied);
  }

  // ---------------------------------------------------------------- setup

  fillInitial(presets = new Map()) {
    for (let attempt = 0; attempt < 80; attempt++) {
      for (const cell of this.list) {
        if (!this.isOpen(cell)) {
          cell.piece = null;
          continue;
        }
        const special = presets.get(cell) ?? Special.NONE;
        if (special === Special.BOMB || special === Special.RAINBOW) {
          cell.piece = createPiece(-1, special);
        } else {
          cell.piece = createPiece(this.pickColor(cell.r, cell.c), special);
        }
      }
      if (this.findMatchGroups().length === 0 && this.hasValidMove()) return;
    }
  }

  // A color that does not complete a line with the two candies to the left or above.
  pickColor(r, c) {
    const banned = new Set();
    const left1 = this.colorAt(r, c - 1);
    if (left1 >= 0 && left1 === this.colorAt(r, c - 2)) banned.add(left1);
    const up1 = this.colorAt(r - 1, c);
    if (up1 >= 0 && up1 === this.colorAt(r - 2, c)) banned.add(up1);
    const options = [];
    for (let k = 0; k < this.colors; k++) if (!banned.has(k)) options.push(k);
    return this.rng.pick(options);
  }

  spawnPiece(cell = null) {
    const piece = createPiece(this.spawnColor(cell));
    if (this.bonusChance > 0 && this.countBonus() < this.maxBonus && this.rng.chance(this.bonusChance)) {
      piece.bonus = 3;
    }
    return piece;
  }

  spawnColor(cell) {
    if (cell && this.cascadeChance > 0 && this.assistsLeft > 0) {
      const options = this.chainColors(cell.r, cell.c);
      if (options.length && this.rng.chance(this.cascadeChance)) {
        this.assistsLeft--;
        return this.rng.pick(options);
      }
    }
    return this.rng.int(this.colors);
  }

  // Colors that would complete a line of three at (r, c). Only settled neighbours count: the
  // column is filled bottom-up and columns left to right, so those below and to the left.
  chainColors(r, c) {
    const out = new Set();
    const below = this.colorAt(r + 1, c);
    if (below >= 0 && below === this.colorAt(r + 2, c)) out.add(below);
    const left = this.colorAt(r, c - 1);
    if (left >= 0 && left === this.colorAt(r, c - 2)) out.add(left);
    return [...out];
  }

  // ---------------------------------------------------------------- matching

  // Runs of 3+ same-colored candies, merged into groups when runs share a cell (L, T and + shapes).
  findMatchGroups() {
    const runs = [];
    const scan = (outer, inner, at, dir) => {
      for (let i = 0; i < outer; i++) {
        let j = 0;
        while (j < inner) {
          const color = at(i, j);
          let end = j + 1;
          if (color >= 0) while (end < inner && at(i, end) === color) end++;
          if (color >= 0 && end - j >= 3) {
            const cells = [];
            for (let k = j; k < end; k++) cells.push(dir === 'h' ? this.cells[i][k] : this.cells[k][i]);
            runs.push({ dir, color, cells });
          }
          j = end;
        }
      }
    };
    scan(this.rows, this.cols, (r, c) => this.colorAt(r, c), 'h');
    scan(this.cols, this.rows, (c, r) => this.colorAt(r, c), 'v');
    if (!runs.length) return [];

    const parent = runs.map((_, i) => i);
    const find = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const firstRun = new Map();
    runs.forEach((run, i) => {
      for (const cell of run.cells) {
        const j = firstRun.get(cell);
        if (j === undefined) firstRun.set(cell, i);
        else parent[find(i)] = find(j);
      }
    });
    const groups = new Map();
    runs.forEach((run, i) => {
      const root = find(i);
      let group = groups.get(root);
      if (!group) {
        group = { color: run.color, runs: [], cells: new Set() };
        groups.set(root, group);
      }
      group.runs.push(run);
      run.cells.forEach((cell) => group.cells.add(cell));
    });
    return [...groups.values()].map((g) => ({ color: g.color, runs: g.runs, cells: [...g.cells] }));
  }

  // Decides which special candy (if any) a group creates, and where.
  planGroup(group, preferCells = null, swapDir = null) {
    const longest = group.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
    const hasH = group.runs.some((run) => run.dir === 'h');
    const hasV = group.runs.some((run) => run.dir === 'v');
    let special = Special.NONE;
    if (longest.cells.length >= 5) special = Special.RAINBOW;
    else if (hasH && hasV) special = Special.BOMB;
    else if (longest.cells.length === 4) special = Special.STRIPE_H;
    if (special === Special.NONE) return { group, special, at: null };

    const usable = (cell) => !cell.lock && cell.piece && !cell.piece.dying && cell.piece.special === Special.NONE;
    const candidates = group.cells.filter(usable);
    let at = preferCells?.find((cell) => candidates.includes(cell)) ?? null;
    const fromSwap = !!at;
    if (!at && special === Special.BOMB) {
      const across = new Set(group.runs.filter((run) => run.dir === 'h').flatMap((run) => run.cells));
      at = group.runs
        .filter((run) => run.dir === 'v')
        .flatMap((run) => run.cells)
        .find((cell) => across.has(cell) && usable(cell)) ?? null;
    }
    if (!at && candidates.length) {
      const mid = longest.cells[Math.floor((longest.cells.length - 1) / 2)];
      const d = (cell) => Math.abs(cell.r - mid.r) + Math.abs(cell.c - mid.c);
      at = candidates.reduce((a, b) => (d(b) < d(a) ? b : a));
    }
    if (!at) return { group, special: Special.NONE, at: null };

    if (special === Special.STRIPE_H) {
      // A swipe sets the stripe direction; cascades stripe across the run so the blast reaches new rows.
      if (fromSwap && swapDir) special = swapDir === 'h' ? Special.STRIPE_H : Special.STRIPE_V;
      else special = longest.dir === 'h' ? Special.STRIPE_V : Special.STRIPE_H;
    }
    return { group, special, at };
  }

  // ---------------------------------------------------------------- moves

  lineLengths(r, c, color) {
    let h = 1;
    let v = 1;
    for (let k = c - 1; this.colorAt(r, k) === color; k--) h++;
    for (let k = c + 1; this.colorAt(r, k) === color; k++) h++;
    for (let k = r - 1; this.colorAt(k, c) === color; k--) v++;
    for (let k = r + 1; this.colorAt(k, c) === color; k++) v++;
    return [h, v];
  }

  matchWeightAt(cell) {
    const p = cell.piece;
    if (!p || p.color < 0) return 0;
    const [h, v] = this.lineLengths(cell.r, cell.c, p.color);
    if (h < 3 && v < 3) return 0;
    if (h >= 5 || v >= 5) return 30;
    if (h >= 3 && v >= 3) return 20;
    if (h === 4 || v === 4) return 12;
    return isStriped(p) ? 9 : 3;
  }

  // 0 when the swap does nothing, otherwise a rough measure of how good it is.
  evaluateSwap(a, b) {
    const pa = a.piece;
    const pb = b.piece;
    if (isColorless(pa) || isColorless(pb)) {
      const rank = (p) => (p.special === Special.RAINBOW ? 3 : p.special === Special.BOMB ? 2 : isStriped(p) ? 1 : 0);
      const [hi, lo] = [rank(pa), rank(pb)].sort((x, y) => y - x);
      return 20 + hi * 10 + lo * 12;
    }
    if (isStriped(pa) && isStriped(pb)) return 35;
    this.swapPieces(a, b);
    const weight = this.matchWeightAt(a) + this.matchWeightAt(b);
    this.swapPieces(a, b);
    return weight;
  }

  validMoves() {
    const moves = [];
    for (const a of this.list) {
      if (!this.isMovable(a)) continue;
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ]) {
        const b = this.cell(a.r + dr, a.c + dc);
        if (!b || !this.isMovable(b)) continue;
        const weight = this.evaluateSwap(a, b);
        if (weight > 0) moves.push({ a, b, weight });
      }
    }
    return moves;
  }

  hasValidMove() {
    for (const a of this.list) {
      if (!this.isMovable(a)) continue;
      const right = this.cell(a.r, a.c + 1);
      if (right && this.isMovable(right) && this.evaluateSwap(a, right) > 0) return true;
      const down = this.cell(a.r + 1, a.c);
      if (down && this.isMovable(down) && this.evaluateSwap(a, down) > 0) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- gravity

  // Drops candies straight down (through holes) and spawns new ones at the top of each column.
  // Columns are split into segments by fixed cells; only the top segment is fed by the spawner.
  gravity() {
    const moves = [];
    const spawns = [];
    this.assistsLeft = CASCADE_ASSISTS_PER_REFILL;
    for (let c = 0; c < this.cols; c++) {
      let segment = [];
      let fed = true;
      const flush = () => {
        this.compact(segment, fed, moves, spawns);
        segment = [];
      };
      for (let r = 0; r < this.rows; r++) {
        const cell = this.cells[r][c];
        if (!cell.active) continue;
        if (this.isFixed(cell)) {
          flush();
          fed = false;
          continue;
        }
        segment.push(cell);
      }
      flush();
    }
    return { moves, spawns };
  }

  compact(segment, fed, moves, spawns) {
    if (!segment.length) return;
    let write = segment.length - 1;
    for (let i = segment.length - 1; i >= 0; i--) {
      const cell = segment[i];
      if (!cell.piece) continue;
      if (i !== write) {
        const target = segment[write];
        target.piece = cell.piece;
        cell.piece = null;
        moves.push({ piece: target.piece, from: cell, to: target });
      }
      write--;
    }
    if (!fed) return;
    const missing = write + 1;
    const top = segment[0].r;
    for (let i = write; i >= 0; i--) {
      const piece = this.spawnPiece(segment[i]);
      segment[i].piece = piece;
      // Stack new candies above the column so the whole column falls as one.
      spawns.push({ piece, to: segment[i], fromRow: top - (missing - i) });
    }
  }

  // One round of diagonal slides into gaps that nothing can reach from straight above.
  diagonal() {
    const slides = [];
    const used = new Set();
    for (let c = 0; c < this.cols; c++) {
      let fed = true;
      let done = false;
      for (let r = 0; r < this.rows; r++) {
        const cell = this.cells[r][c];
        if (!cell.active) continue;
        if (this.isFixed(cell)) {
          fed = false;
          done = false;
          continue;
        }
        if (fed || done || cell.piece || used.has(cell)) continue;
        const sources = [this.cell(r - 1, c - 1), this.cell(r - 1, c + 1)].filter(
          (src) => src && !used.has(src) && this.isMovable(src) && !this.canFall(src),
        );
        if (!sources.length) continue;
        const src = sources.length > 1 ? this.rng.pick(sources) : sources[0];
        used.add(src);
        used.add(cell);
        cell.piece = src.piece;
        src.piece = null;
        slides.push({ piece: cell.piece, from: src, to: cell });
        done = true;
      }
    }
    return slides;
  }

  canFall(cell) {
    for (let r = cell.r + 1; r < this.rows; r++) {
      const below = this.cells[r][cell.c];
      if (!below.active) continue;
      return this.isOpen(below) && !below.piece;
    }
    return false;
  }

  // ---------------------------------------------------------------- shuffles and blockers

  shuffle() {
    const cells = this.list.filter((cell) => this.isMovable(cell));
    const pieces = cells.map((cell) => cell.piece);
    for (let attempt = 0; attempt < 200; attempt++) {
      this.rng.shuffle(pieces);
      cells.forEach((cell, i) => (cell.piece = pieces[i]));
      if (!this.findMatchGroups().length && this.hasValidMove()) break;
      if (attempt > 120) {
        // Rare: the mix of candies cannot make a move. Repaint plain candies instead.
        for (const cell of cells) {
          if (cell.piece.special === Special.NONE) cell.piece.color = this.pickColor(cell.r, cell.c);
        }
        if (!this.findMatchGroups().length && this.hasValidMove()) break;
      }
    }
    return cells.map((cell) => ({ piece: cell.piece, to: cell }));
  }

  spreadChocolate() {
    const options = [];
    for (const cell of this.list) {
      if (cell.blocker?.type !== 'chocolate') continue;
      for (const n of this.neighbors(cell)) {
        if (!n.blocker && !n.lock && n.piece && !n.piece.dying && n.piece.special === Special.NONE) options.push([cell, n]);
      }
    }
    if (!options.length) return null;
    const [from, to] = this.rng.pick(options);
    const eaten = to.piece;
    to.piece = null;
    to.blocker = { type: 'chocolate', hp: 1 };
    return { from, to, eaten };
  }
}
