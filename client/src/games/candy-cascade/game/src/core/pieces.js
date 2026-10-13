// Piece model shared by the board, the engine and the renderer.

export const Special = Object.freeze({
  NONE: 0,
  STRIPE_H: 1, // clears its row
  STRIPE_V: 2, // clears its column
  BOMB: 3, // colorless, blows up a round area
  RAINBOW: 4, // colorless, clears every candy of one kind
});

// Regular candies, in the order levels unlock them (a 5-color level uses the first five).
export const CANDIES = [
  { key: 'jelly-ring', name: 'Jelly Ring', plural: 'Jelly Rings' },
  { key: 'star', name: 'Sugar Star', plural: 'Sugar Stars' },
  { key: 'gumdrop', name: 'Gumdrop', plural: 'Gumdrops' },
  { key: 'toffee', name: 'Toffee', plural: 'Toffees' },
  { key: 'donut', name: 'Donut', plural: 'Donuts' },
  { key: 'cake', name: 'Choco Cake', plural: 'Choco Cakes' },
];

let lastId = 0;

export function createPiece(color, special = Special.NONE) {
  return {
    id: ++lastId,
    color, // candy index, or -1 for colorless specials
    special,
    radius: 0, // bomb blast radius override (0 = default)
    bonus: 0, // extra moves granted when cleared (stopwatch candies)
    dying: false, // being cleared; ignore for matching and hits
    fresh: false, // created during the current clear step; immune until it ends
  };
}

export const isStriped = (p) => p.special === Special.STRIPE_H || p.special === Special.STRIPE_V;
export const isColorless = (p) => p.special === Special.BOMB || p.special === Special.RAINBOW;
export const isSpecial = (p) => p.special !== Special.NONE;
