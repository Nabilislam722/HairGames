// Replays a recorded level so a server can recompute the result from the moves alone. The engine
// draws every random choice from the seeded generator, and refused swaps never touch it, so the
// same seed plus the same accepted moves always reproduce the same game, score and stars.
import { Engine } from './engine.js';
import { LEVELS } from './levels.js';
import { createRng } from './rng.js';

// Far above any real game (moves plus stopwatch bonuses); bounds the work a request can cause.
export const MAX_RECORDED_MOVES = 400;

const fail = (reason) => ({ valid: false, reason });

// moves: [[r, c, r, c] | [r, c], ...] as recorded in engine.moveLog.
// Resolves to { valid: true, win, score, stars } or { valid: false, reason }.
export async function replayLevel(levelId, seed, moves) {
  const level = LEVELS.find((l) => l.id === levelId);
  if (!level) return fail('unknown level');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return fail('bad seed');
  if (!Array.isArray(moves) || moves.length === 0 || moves.length > MAX_RECORDED_MOVES) return fail('bad move list');

  const engine = new Engine(level, { rng: createRng(seed) });
  for (const move of moves) {
    if (engine.over) return fail('moves after the level ended');
    if (!Array.isArray(move) || (move.length !== 2 && move.length !== 4) || !move.every(Number.isInteger)) {
      return fail('malformed move');
    }
    const a = engine.board.cell(move[0], move[1]);
    if (!a) return fail('move outside the board');
    let accepted;
    if (move.length === 2) {
      accepted = await engine.tapActivate(a);
    } else {
      const b = engine.board.cell(move[2], move[3]);
      if (!b) return fail('move outside the board');
      accepted = await engine.trySwap(a, b);
    }
    if (!accepted) return fail('illegal move');
  }
  if (!engine.over || !engine.result) return fail('level not finished');
  return { valid: true, win: engine.result.win, score: engine.result.score, stars: engine.result.stars };
}
