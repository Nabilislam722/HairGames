// When the game runs inside HairGames, the page hosts it: it supplies the player's on-chain
// progress, gets a server seed for every level attempt and saves wins on chain. Opened on its own,
// there is no host and the game keeps progress locally. Messages only go to, and are only accepted
// from, a parent window on the same origin.

/* global __CANDY_RULES__ */
export const RULES = typeof __CANDY_RULES__ === 'string' ? __CANDY_RULES__ : 'dev';

const GAME = 'candy-cascade';
const HOST = 'hairgames';

// `?local` runs embedded but without a host (the page uses it while no contract is configured).
export function connectHost() {
  if (window.parent === window || new URLSearchParams(location.search).has('local')) return null;

  const pending = new Map();
  let nextId = 1;
  let onProgress = () => {};

  const post = (msg) => window.parent.postMessage({ source: GAME, ...msg }, location.origin);

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    const msg = event.data;
    if (!msg || msg.source !== HOST) return;
    if (msg.type === 'progress') {
      onProgress(msg.progress);
      return;
    }
    const request = pending.get(msg.requestId);
    if (!request) return;
    pending.delete(msg.requestId);
    if (msg.type === 'error') request.reject(Object.assign(new Error(msg.message || 'Something went wrong.'), { cancelled: !!msg.cancelled }));
    else request.resolve(msg);
  });

  const request = (type, payload) =>
    new Promise((resolve, reject) => {
      const requestId = nextId++;
      pending.set(requestId, { resolve, reject });
      post({ type, requestId, ...payload });
    });

  return {
    // fn(progress) runs whenever the host sends fresh on-chain progress.
    set onProgress(fn) {
      onProgress = fn;
    },
    ready: () => post({ type: 'ready', rules: RULES }),
    // Resolves to { sessionId, seed } for a new attempt at levelId.
    startLevel: (levelId) => request('start', { levelId }),
    // Resolves once the win is verified and saved on chain, with the new progress.
    submitWin: ({ sessionId, levelId, moves }) => request('won', { sessionId, levelId, moves, rules: RULES }),
  };
}
