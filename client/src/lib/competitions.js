import { useMemo } from "react";
import { MOCK_DATA, mockDailyChallenge, mockHolderTournament } from "@/lib/mockData";
import { weekStart } from "@/lib/weeklyQuests";

// Competitions: the daily challenge (one shared board a day, resets 00:00 UTC) and the weekly holder
// tournament (free for wallets holding enough HAIR). They need backend support that doesn't exist
// yet: the daily seed and scores, and tournament entries checked against HAIR held until the end.
// Until then they only show with dev mock data.
export const COMPETITIONS_LIVE = MOCK_DATA;

// HAIR a wallet must hold to enter the holder tournament.
export const TOURNAMENT_MIN_HAIR = 50000;

const DAY = 86400000;
const WEEK = 7 * DAY;

export const dayIndex = (now) => Math.floor(now / DAY);
export const nextDailyReset = (now) => (dayIndex(now) + 1) * DAY;
export const dateKey = (day) => new Date(day * DAY).toISOString().slice(0, 10);
export const tournamentEnd = (now) => weekStart(now) + WEEK;

// ISO 8601 week number (weeks start Monday, week 1 holds the year's first Thursday).
export function isoWeek(ms) {
  const d = new Date(ms);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - firstThursday) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

const byScore = (lowerIsBetter) => (a, b) => (lowerIsBetter ? a.score - b.score : b.score - a.score);

export function useCompetitions(address) {
  const now = Date.now();
  const day = dayIndex(now);
  const week = weekStart(now);
  return useMemo(() => {
    if (!COMPETITIONS_LIVE || !address) return null;
    const daily = mockDailyChallenge(address, day);
    const tournament = mockHolderTournament(Math.floor(week / WEEK));
    return {
      daily: { ...daily, day, entries: [...daily.entries].sort(byScore(daily.lowerIsBetter)) },
      tournament: { ...tournament, week: isoWeek(week), entries: [...tournament.entries].sort(byScore(false)) },
    };
  }, [address, day, week]);
}
