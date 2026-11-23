import rookieBadge from "@/assets/ranks/rank-1-rookie.svg";
import playerBadge from "@/assets/ranks/rank-2-player.svg";
import veteranBadge from "@/assets/ranks/rank-3-veteran.svg";
import eliteBadge from "@/assets/ranks/rank-4-elite.svg";
import legendBadge from "@/assets/ranks/rank-5-legend.svg";
import immortalBadge from "@/assets/ranks/rank-6-immortal.svg";

// Single source of truth for level thresholds. Each level's ceiling is the
// next level's min (so the header/level bars always agree), and rank order
// here also drives the roadmap render order. `badge` is the rank's emblem (RankBadge).
export const LEVELS = [
  { level: 1, title: "Rookie",   min: 0,        color: "#94a3b8", badge: rookieBadge },
  { level: 2, title: "Player",   min: 50000,    color: "#10b981", badge: playerBadge },
  { level: 3, title: "Veteran",  min: 150000,   color: "#3b82f6", badge: veteranBadge },
  { level: 4, title: "Elite",    min: 4000000,  color: "#a855f7", badge: eliteBadge },
  { level: 5, title: "Legend",   min: 10000000, color: "#fb923c", badge: legendBadge },
  { level: 6, title: "Immortal", min: 25000000, color: "#f43f5e", badge: immortalBadge },
];

export function levelIndex(points) {
  return Math.max(0, LEVELS.findLastIndex(l => points >= l.min));
}

export function getLevelInfo(points) {
  const idx = levelIndex(points);
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1];
  const max = next ? next.min : current.min;
  const pct = next ? Math.min(100, Math.round(((points - current.min) / (max - current.min)) * 100)) : 100;
  return { ...current, max, pct, next, isMaxed: !next };
}
