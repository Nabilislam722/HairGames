// Settings (sound, music) live in localStorage on this device. Game state (unlocked level, stars,
// best scores) comes from the chain when the game runs inside HairGames (see host.js) and is never
// stored locally then; opened on its own, the game keeps that in localStorage too. Every access is
// guarded because storage can be missing or blocked (private windows, embedded previews).
const KEY = 'candy-cascade:v1';

const DEFAULTS = { unlocked: 1, stars: {}, best: {}, sound: true, music: true };
const SETTINGS = ['sound', 'music'];

const pickSettings = (source) => Object.fromEntries(SETTINGS.filter((k) => k in (source ?? {})).map((k) => [k, source[k]]));

// local: false loads only the settings; game state then starts empty until the host sends it.
export function loadProgress(snapshot = null, { local = true } = {}) {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    saved = null;
  }
  const progress = { ...DEFAULTS, ...(local ? saved ?? {} : pickSettings(saved)) };
  // A hot-reload snapshot may know about progress that storage could not keep.
  if (local && snapshot && snapshot.unlocked > progress.unlocked) Object.assign(progress, snapshot);
  progress.stars = { ...progress.stars };
  progress.best = { ...progress.best };
  return progress;
}

// local: false writes only the settings, so on-chain game state never lands in localStorage.
export function saveProgress(progress, { local = true } = {}) {
  try {
    localStorage.setItem(KEY, JSON.stringify(local ? progress : pickSettings(progress)));
  } catch {
    // Storage unavailable: progress still lasts for this session.
  }
}

export function totalStars(progress) {
  return Object.values(progress.stars).reduce((sum, n) => sum + n, 0);
}
