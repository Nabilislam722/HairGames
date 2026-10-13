import { CANDIES } from '../core/pieces.js';

const ITEMS = [
  'bomb',
  'rainbow-bomb',
  'stopwatch',
  'ice-block',
  'caramel-block',
  'caramel-cracked',
  'cane-cage',
  'chocolate',
  'biscuit',
  'croissant',
  'cookie',
  'ice-cream',
  'candy-pack',
  'cupcake',
  'cake-slice',
];

const UI = [
  'select-frame',
  'sky',
  'tile-berry-light',
  'tile-berry-dark',
  'tile-cherry-light',
  'tile-cherry-dark',
  'tile-cocoa-light',
  'tile-cocoa-dark',
];

export const IMAGE_PATHS = Object.fromEntries([
  ...CANDIES.map((candy) => [candy.key, `assets/candies/${candy.key}.png`]),
  ...ITEMS.map((key) => [key, `assets/items/${key}.png`]),
  ...UI.map((key) => [key, `assets/ui/${key}.png`]),
]);

// Treats used only as decoration on the title and map screens.
export const DECOR_KEYS = ['biscuit', 'croissant', 'cookie', 'ice-cream', 'candy-pack', 'cupcake', 'cake-slice'];

export function loadImages(onProgress = () => {}) {
  const entries = Object.entries(IMAGE_PATHS);
  let loaded = 0;
  return Promise.all(
    entries.map(
      ([key, src]) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => {
            const done = () => {
              loaded++;
              onProgress(loaded / entries.length);
              resolve([key, img]);
            };
            img.decode ? img.decode().then(done, done) : done();
          };
          img.onerror = () => reject(new Error(`Could not load ${src}`));
          img.src = src;
        }),
    ),
  ).then((pairs) => new Map(pairs));
}
