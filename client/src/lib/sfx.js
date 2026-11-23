// Small site sounds, made with the Web Audio API so there are no files to load.

let ctx = null;

// Browsers only let a page start audio after the player interacts with it, so call this in the click
// handler before any await. The sound itself can then play once the server answers.
export function primeAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(out, freq, start, duration, { type = "sine", gain = 0.2, glideTo } = {}) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// A reward landing: a soft thump, a two-note coin, then a rising sparkle. About 0.7 s.
export function playClaimSound() {
  if (!ctx) primeAudio();
  if (!ctx || document.hidden) return;
  const out = ctx.createGain();
  out.gain.value = 0.7;
  out.connect(ctx.destination);
  const t = ctx.currentTime + 0.01;

  tone(out, 180, t, 0.18, { gain: 0.35, glideTo: 90 });
  tone(out, 988, t, 0.08, { type: "triangle", gain: 0.18 }); // B5
  tone(out, 1319, t + 0.07, 0.38, { type: "triangle", gain: 0.18 }); // E6
  [1568, 1976, 2349, 3136].forEach((f, i) => tone(out, f, t + 0.16 + i * 0.06, 0.28, { gain: 0.07 - i * 0.012 })); // G6 B6 D7 G7
}
