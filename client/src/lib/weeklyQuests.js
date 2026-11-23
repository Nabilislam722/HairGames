// Weekly quests: goals counted from the player's game transactions (see activity.js) since the week
// began. `game` is the quest's game (its logo is the quest's icon), or null for any game. Crediting
// the reward needs a backend endpoint that doesn't exist yet, so for now the Dashboard only shows
// quests with dev mock data.

// Quest weeks start Monday 00:00 UTC (getUTCDay: 0 = Sunday).
export const QUEST_WEEK_START_DAY = 1;

export function weekStart(now = Date.now()) {
  const d = new Date(now);
  const daysIn = (d.getUTCDay() - QUEST_WEEK_START_DAY + 7) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysIn);
}

const starts = (plays) => plays.filter(p => p.kind === "start");
const savedIn = (plays, gameId) => plays.filter(p => p.kind === "save" && p.status === "ok" && p.game.id === gameId).length;

export const WEEKLY_QUESTS = [
  {
    id: "play_10",
    title: "Play 10 games",
    goal: 10,
    reward: 1000,
    game: null,
    count: (plays) => starts(plays).length,
  },
  {
    id: "variety_3",
    title: "Try 3 different games",
    goal: 3,
    reward: 1500,
    game: null,
    count: (plays) => new Set(starts(plays).map(p => p.game.id)).size,
  },
  {
    id: "candy_5",
    title: "Clear 5 Candy Cascade levels",
    goal: 5,
    reward: 2000,
    game: "candy_cascade",
    count: (plays) => savedIn(plays, "candy_cascade"),
  },
  {
    id: "moto_5",
    title: "Finish 5 Moto Rush tracks",
    goal: 5,
    reward: 2000,
    game: "moto_rush",
    count: (plays) => savedIn(plays, "moto_rush"),
  },
];

// Each quest with `done` (capped at its goal) for this week's plays.
export function questProgress(plays, now = Date.now()) {
  const since = weekStart(now);
  const thisWeek = plays.filter(p => p.at >= since && p.at <= now);
  return WEEKLY_QUESTS.map(q => ({ ...q, done: Math.min(q.goal, q.count(thisWeek)) }));
}
