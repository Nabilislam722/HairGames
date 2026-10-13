// Small seedable PRNG (mulberry32). Seeding makes boards and simulations reproducible.
export function createRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (a, b) => a + next() * (b - a),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    },
  };
}
