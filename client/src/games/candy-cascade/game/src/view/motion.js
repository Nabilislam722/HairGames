// Easing curves, a promise-based tweener driven by the game clock, and spring helpers.

const c1 = 1.70158;
const c3 = c1 + 1;

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t) => 1 - (1 - t) ** 4,
  outQuint: (t) => 1 - (1 - t) ** 5,
  inExpo: (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  outExpo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inBack: (t) => c3 * t * t * t - c1 * t * t,
  outBack: (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  outBackSoft: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
  outBackStrong: (t) => 1 + 3.6 * (t - 1) ** 3 + 2.6 * (t - 1) ** 2,
  inOutBack: (t) => {
    const c2 = c1 * 1.525;
    return t < 0.5
      ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2
      : ((2 * t - 2) ** 2 * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outElasticSoft: (t) => (t === 0 || t === 1 ? t : 2 ** (-9 * t) * Math.sin((t * 7 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/*
 * Tweens numeric properties and resolves a promise when each tween ends. Time only
 * advances through update(), so pausing the game pauses every animation and every
 * engine step waiting on one.
 */
export class Tweener {
  constructor() {
    this.items = [];
    this.time = 0;
  }

  to(target, props, { duration = 0.3, delay = 0, ease: easing = ease.outCubic, onUpdate = null } = {}) {
    return new Promise((resolve) => {
      this.items.push({ target, props, from: null, t: -delay, duration: Math.max(1e-4, duration), easing, onUpdate, resolve });
    });
  }

  // Runs onUpdate(progress, eased) over the duration; useful for paths and custom curves.
  run(duration, onUpdate, { delay = 0, ease: easing = ease.linear } = {}) {
    return this.to(null, null, { duration, delay, ease: easing, onUpdate });
  }

  wait(seconds) {
    if (!(seconds > 0)) return Promise.resolve();
    return new Promise((resolve) => {
      this.items.push({ target: null, props: null, from: null, t: -seconds, duration: 1e-4, easing: ease.linear, onUpdate: null, resolve });
    });
  }

  after(seconds, fn) {
    this.wait(seconds).then(fn);
  }

  // Jumps the tweens of `target` to their end values and resolves them.
  finish(target) {
    for (const item of this.items) {
      if (item.target !== target || item.done) continue;
      if (item.props) for (const key in item.props) target[key] = item.props[key];
      item.done = true;
      item.resolve();
    }
    this.items = this.items.filter((item) => !item.done);
  }

  update(dt) {
    this.time += dt;
    const list = this.items;
    const count = list.length;
    let finished = 0;
    for (let i = 0; i < count; i++) {
      const item = list[i];
      if (item.done) continue;
      item.t += dt;
      if (item.t < 0) continue;
      if (item.props && !item.from) {
        item.from = {};
        for (const key in item.props) item.from[key] = item.target[key];
      }
      const k = Math.min(1, item.t / item.duration);
      const e = item.easing(k);
      if (item.props) {
        for (const key in item.props) item.target[key] = item.from[key] + (item.props[key] - item.from[key]) * e;
      }
      item.onUpdate?.(k, e);
      if (k >= 1) {
        item.done = true;
        finished++;
      }
    }
    if (!finished) return;
    const done = [];
    this.items = list.filter((item) => {
      if (item.done) done.push(item);
      return !item.done;
    });
    for (const item of done) item.resolve();
  }
}

// Damped spring step toward `target`. Returns the new [value, velocity].
export function spring(value, velocity, target, stiffness, damping, dt) {
  // Sub-step for stability when a frame runs long.
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    velocity += (-(value - target) * stiffness - velocity * damping) * h;
    value += velocity * h;
  }
  return [value, velocity];
}
