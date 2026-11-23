// Competitions: the daily challenge (one shared board a day, resets 00:00 UTC) and the weekly holder
// tournament (free for wallets holding enough HAIR). They need backend support that doesn't exist
// yet: the daily seed and scores, and tournament entries checked against HAIR held until the end.
// Until then useCompetitions has nothing to show, and the Dashboard leaves them out.

// HAIR a wallet must hold to enter the holder tournament.
export const TOURNAMENT_MIN_HAIR = 50000;

const DAY = 86400000;
const WEEK = 7 * DAY;

// Tournament weeks start Monday 00:00 UTC (getUTCDay: 0 = Sunday).
function weekStart(now) {
  const d = new Date(now);
  const daysIn = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysIn);
}

export const dayIndex = (now) => Math.floor(now / DAY);
export const nextDailyReset = (now) => (dayIndex(now) + 1) * DAY;
export const dateKey = (day) => new Date(day * DAY).toISOString().slice(0, 10);
export const tournamentEnd = (now) => weekStart(now) + WEEK;

// Today's challenge and this week's tournament for the wallet, or null while there's no backend for them.
export function useCompetitions() {
  return null;
}
