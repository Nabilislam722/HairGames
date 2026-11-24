// Levels come from level-data.js, which `npm run levels` generates from tools/level-designs.mjs and
// `npm run balance` tunes (moves and stars). The layout legend is in board.js; candy colors index
// into CANDIES.
import { LEVEL_DATA } from './level-data.js';

export const THEMES = {
  berry: { light: 'tile-berry-light', dark: 'tile-berry-dark', outline: '#5d80ff', base: '#3b1d4a' },
  cherry: { light: 'tile-cherry-light', dark: 'tile-cherry-dark', outline: '#ff8900', base: '#3f1a2c' },
  cocoa: { light: 'tile-cocoa-light', dark: 'tile-cocoa-dark', outline: '#ff5c9e', base: '#33191a' },
};

// Every 10th level is a challenge, balanced to a lower win rate (challengeWin on DIFFICULTY_CURVE).
export const CHALLENGE_EVERY = 10;
export const EPISODE_SIZE = 20;
export const EPISODES = [
  'Sugar Meadow',
  'Caramel Canyon',
  'Gumdrop Grove',
  'Toffee Trail',
  'Frosting Falls',
  'Cocoa Cove',
  'Jelly Junction',
  'Lollipop Lagoon',
  'Marshmallow Mountains',
  'Sprinkle Springs',
  'Licorice Lane',
  'Peppermint Peaks',
  'Honey Hollow',
  'Bonbon Bay',
  'Candy Castle',
  'Praline Plains',
  'Nougat Narrows',
  'Butterscotch Bluffs',
  'Taffy Tundra',
  'Fudge Fjords',
  'Meringue Mesa',
  'Truffle Thicket',
  'Sherbet Shores',
  'Marzipan Marsh',
  'Sugarplum Summit',
];

// Difficulty rises in steps of DIFFICULTY_STEP levels along DIFFICULTY_CURVE: each step moves one notch
// from one point toward the next, and every level in a step plays like the step's first level. A point
// sets two things.
//  - How its levels play: `targetScale` sizes score and collect goals (blocker goals count what's on
//    the board), and `cascadeChance` is the refill assist (see CASCADE_CHANCE in board.js), which makes
//    the board help out with free matches.
//  - What `npm run balance` (tools/balance.mjs) tunes their moves and stars to, on the level as played.
//    Moves: enough for the balancing bot to win `win` of its games (`challengeWin` on challenges), and
//    for a casual player, who always makes the biggest match, to win `casualWin` (`casualChallengeWin`),
//    whichever needs more. Stars: `twoStars` and `threeStars` of the bot's wins leave enough moves for
//    2 and 3 stars.
// The bot never plans ahead, so these numbers say how hard a level feels, not exact odds for people.
// The first 20 levels teach the game, and nearly everyone gets through them; after that most levels take
// a try or two. Goals grow and the assist fades along the way (with the full assist the board plays
// itself: levels were about 40% shorter), and the last stretch plays without it.
export const DIFFICULTY_STEP = 5;
export const DIFFICULTY_CURVE = [
  { level: 1, targetScale: 1, cascadeChance: 0.35, win: 0.97, challengeWin: 0.85, casualWin: 0.92, casualChallengeWin: 0.75, twoStars: 0.7, threeStars: 0.4 },
  { level: 21, targetScale: 1.1, cascadeChance: 0.2, win: 0.92, challengeWin: 0.72, casualWin: 0.75, casualChallengeWin: 0.55, twoStars: 0.6, threeStars: 0.3 },
  { level: 101, targetScale: 1.2, cascadeChance: 0.1, win: 0.85, challengeWin: 0.64, casualWin: 0.55, casualChallengeWin: 0.4, twoStars: 0.55, threeStars: 0.25 },
  { level: 301, targetScale: 1.3, cascadeChance: 0, win: 0.78, challengeWin: 0.58, casualWin: 0.5, casualChallengeWin: 0.35, twoStars: 0.5, threeStars: 0.2 },
  { level: 496, targetScale: 1.4, cascadeChance: 0, win: 0.75, challengeWin: 0.55, casualWin: 0.5, casualChallengeWin: 0.35, twoStars: 0.5, threeStars: 0.2 },
];

const lerp = (a, b, t) => (a === b ? a : a * (1 - t) + b * t); // exact at both ends and on flat stretches
const roundTo100 = (n) => Math.max(100, Math.round(n / 100) * 100);

// The point on DIFFICULTY_CURVE that a level plays at: { targetScale, cascadeChance, win, challengeWin,
// twoStars, threeStars }.
export function difficultyFor(levelId) {
  const stepStart = Math.floor((levelId - 1) / DIFFICULTY_STEP) * DIFFICULTY_STEP + 1;
  const i = Math.max(0, DIFFICULTY_CURVE.findLastIndex((p) => p.level <= stepStart));
  const from = DIFFICULTY_CURVE[i];
  const to = DIFFICULTY_CURVE[i + 1] ?? from;
  const t = to === from ? 0 : Math.min(1, (stepStart - from.level) / (to.level - from.level));
  const { level, ...settings } = from;
  return Object.fromEntries(Object.keys(settings).map((key) => [key, lerp(from[key], to[key], t)]));
}

// The level as players get it. Its moves and starMoves come from level-data.js as they are: they were
// balanced on this version of the level.
function asPlayed(level) {
  const { targetScale, cascadeChance } = difficultyFor(level.id);
  const goals = level.goals.map((goal) => {
    if (goal.type === 'score') return { ...goal, target: roundTo100(goal.target * targetScale) };
    if (goal.type === 'collect') return { ...goal, count: Math.max(1, Math.round(goal.count * targetScale)) };
    return goal; // blocker and cage goals count what is on the board
  });
  return { ...level, cascadeChance, goals };
}

export const LEVELS = LEVEL_DATA.map((level) => ({
  ...asPlayed(level),
  layout: level.layout.split('/'),
  challenge: level.id % CHALLENGE_EVERY === 0,
}));

export const episodeOf = (levelId) => Math.floor((levelId - 1) / EPISODE_SIZE);
