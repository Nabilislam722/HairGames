// Levels come from level-data.js, which `npm run levels` generates and calibrates from
// tools/level-designs.mjs. The layout legend is in board.js; candy colors index into CANDIES.
import { CASCADE_CHANCE } from './board.js';
import { LEVEL_DATA } from './level-data.js';

export const THEMES = {
  berry: { light: 'tile-berry-light', dark: 'tile-berry-dark', outline: '#5d80ff', base: '#3b1d4a' },
  cherry: { light: 'tile-cherry-light', dark: 'tile-cherry-dark', outline: '#ff8900', base: '#3f1a2c' },
  cocoa: { light: 'tile-cocoa-light', dark: 'tile-cocoa-dark', outline: '#ff5c9e', base: '#33191a' },
};

// Every 10th level is a challenge: tuned so most players clear it in one or two tries.
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

// level-data.js is tuned so the balancing bot wins about 95% of normal levels (70% of challenges)
// on the plain game, but the bot spots the best move every turn and people do not. So the first
// levels get an extra move, smaller score and collect targets and a strong refill assist (see
// CASCADE_CHANCE), and difficulty steps up every DIFFICULTY_STEP levels along DIFFICULTY_CURVE:
// each step moves one notch from one point toward the next.
//  - Moves are kept tight: even so the bot finishes the goals with over half its moves to spare,
//    and spare moves are what a player stalls with (see maxScore below).
//  - By level 296 goals are as generated and moves 5% under, with half the assist: the bot still
//    wins about 95% of normal levels and 75% of challenges.
//  - Levels 301-500 phase out the assist, so the last step is the plain game the levels were
//    balanced on, 5% short on moves: the bot wins about 93% of normal levels and 73% of challenges,
//    so none becomes unbeatable.
// Star scores are tuned to every step by `npm run stars`, so the 1 / 2 / 3 star mix (and anything
// paid per star) stays the same.
export const DIFFICULTY_STEP = 5;
export const DIFFICULTY_CURVE = [
  { level: 1, moveScale: 1, extraMoves: 1, targetScale: 0.8, cascadeChance: CASCADE_CHANCE },
  { level: 296, moveScale: 0.95, extraMoves: 0, targetScale: 1, cascadeChance: 0.25 },
  { level: 496, moveScale: 0.95, extraMoves: 0, targetScale: 1, cascadeChance: 0 },
];
const settings = ({ level, ...rest }) => rest;
export const EASING = {
  start: settings(DIFFICULTY_CURVE[0]),
  floor: settings(DIFFICULTY_CURVE[DIFFICULTY_CURVE.length - 1]),
};

const lerp = (a, b, t) => (a === b ? a : a * (1 - t) + b * t); // exact at both ends and on flat stretches
const roundTo100 = (n) => Math.max(100, Math.round(n / 100) * 100);

export function easingFor(levelId) {
  // Every level in a step plays like the step's first level.
  const stepStart = Math.floor((levelId - 1) / DIFFICULTY_STEP) * DIFFICULTY_STEP + 1;
  const i = Math.max(0, DIFFICULTY_CURVE.findLastIndex((p) => p.level <= stepStart));
  const from = DIFFICULTY_CURVE[i];
  const to = DIFFICULTY_CURVE[i + 1] ?? from;
  const t = to === from ? 0 : Math.min(1, (stepStart - from.level) / (to.level - from.level));
  return {
    moveScale: lerp(from.moveScale, to.moveScale, t),
    extraMoves: Math.round(lerp(from.extraMoves, to.extraMoves, t)),
    targetScale: lerp(from.targetScale, to.targetScale, t),
    cascadeChance: lerp(from.cascadeChance, to.cascadeChance, t),
  };
}

function ease(level) {
  const easing = easingFor(level.id);
  const goals = level.goals.map((goal) => {
    if (goal.type === 'score') return { ...goal, target: roundTo100(goal.target * easing.targetScale) };
    if (goal.type === 'collect') return { ...goal, count: Math.max(1, Math.round(goal.count * easing.targetScale)) };
    return goal; // blocker and cage goals count what is on the board
  });
  const scoreGoal = goals.find((goal) => goal.type === 'score');
  const [one, two, three] = level.stars;
  return {
    ...level,
    moves: Math.round(level.moves * easing.moveScale) + easing.extraMoves,
    cascadeChance: easing.cascadeChance,
    goals,
    stars: [scoreGoal ? Math.min(one, scoreGoal.target) : one, two, three],
    // The most the level can score is its 3-star score, so each level has its own cap. Without
    // one, a player could hold back the last goal and keep scoring with every move left.
    maxScore: three,
  };
}

export const LEVELS = LEVEL_DATA.map((level) => ({
  ...ease(level),
  layout: level.layout.split('/'),
  challenge: level.id % CHALLENGE_EVERY === 0,
}));

export const episodeOf = (levelId) => Math.floor((levelId - 1) / EPISODE_SIZE);
