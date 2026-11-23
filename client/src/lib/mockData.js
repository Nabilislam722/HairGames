// Mock data for local dev, so pages can be designed before their data exists. MOCK_DATA is false in
// production builds, so none of this runs there and the generators are left out of the bundle. Set
// VITE_USE_REAL_DATA=true to see real data in dev.
export const MOCK_DATA = import.meta.env.DEV && import.meta.env.VITE_USE_REAL_DATA !== "true";

export const MOCK_POINTS = 182400;
export const MOCK_MULTIPLIER = 1.2;
export const MOCK_HAIR = 120000;

const DAY = 86400000;

// A ranking shaped like /api/leaderboard and /api/event/leaderboard, with `address` placed in it.
export function mockLeaderboard(address, { size = 24, top = 2000000, myPoints = MOCK_POINTS } = {}) {
  const rand = seededRandom(`board:${top}`);
  const entries = Array.from({ length: size }, (_, i) => {
    const wallet = "0x" + Array.from({ length: 40 }, () => Math.floor(rand() * 16).toString(16)).join("");
    return { _id: wallet, wallet, points: Math.round(top * Math.pow(0.8, i) * (0.92 + rand() * 0.08)) };
  });
  if (address) entries[entries.length - 1] = { _id: address, wallet: address, points: myPoints };
  return entries.sort((a, b) => b.points - a.points);
}

const randomWallet = (rand) => "0x" + Array.from({ length: 40 }, () => Math.floor(rand() * 16).toString(16)).join("");

// Today's shared board: the same game, board and scores for everyone. Moto Rush scores are finish
// times in ms (lower wins); Candy Cascade scores are points.
export function mockDailyChallenge(address, day) {
  const rand = seededRandom(`daily:${day}`);
  const gameId = day % 2 ? "moto_rush" : "candy_cascade";
  const lowerIsBetter = gameId === "moto_rush";
  const entries = Array.from({ length: 12 }, (_, i) => ({
    wallet: randomWallet(rand),
    score: lowerIsBetter
      ? Math.round(38000 + i * 2600 + rand() * 1500)
      : Math.round(120000 - i * 7000 - rand() * 3000),
  }));
  if (address) entries[6] = { wallet: address, score: entries[6].score };
  return { gameId, board: 1 + ((day * 37) % 500), lowerIsBetter, entries, attempts: 3, players: 140 + Math.floor(rand() * 90) };
}

// This week's holder tournament: a featured game, best score of the week wins.
export function mockHolderTournament(week) {
  const rand = seededRandom(`holder:${week}`);
  const games = ["race_car", "fishing_game", "max_fruitninja", "space_huggers"];
  return {
    gameId: games[week % games.length],
    entries: Array.from({ length: 10 }, (_, i) => ({
      wallet: randomWallet(rand),
      score: Math.round(3000 - i * 180 - rand() * 60),
    })),
    players: 40 + Math.floor(rand() * 40),
  };
}

// The shape /api/profile/:wallet answers with, plus the social handles.
export function mockProfile() {
  return {
    points: MOCK_POINTS,
    multiplier: MOCK_MULTIPLIER,
    pendingMultiplier: 1.4,
    motoRushVenomMultiplier: null,
    completedTasks: ["twitter_follow", "hair_discord"],
    rank: 12,
    twitter: null,
    discord: null,
    nftHoldings: [
      { contractAddress: "0xmock1", tokenId: "12", name: "Hemi 1st Anniversary #12", collectionName: "Hemi Network 1st Anniversary", active: true },
      { contractAddress: "0xmock1", tokenId: "48", name: "Hemi 1st Anniversary #48", collectionName: "Hemi Network 1st Anniversary", active: true },
      {
        contractAddress: "0xmock2", tokenId: "27", name: "#27 Venom", collectionName: "Venom",
        active: false, countsFrom: Date.now() + 6 * 3600000, gameBonus: { moto_rush: 0.2 },
      },
    ],
  };
}

// A wallet's allocations shaped like the claim contracts' answers (see rewards.js), in base units:
// HEMI with some left to claim, HAIR fully claimed.
export function mockAllocations() {
  const units = (n) => BigInt(n) * 10n ** 18n;
  return {
    HEMI: { allocated: units(210), claimed: units(60) },
    HAIR: { allocated: units(12500), claimed: units(12500) },
  };
}

// Seeded so the mock stays the same across renders and reloads for a wallet.
function seededRandom(text) {
  let s = 2166136261;
  for (const ch of text) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const toWei = (eth) => BigInt(Math.round(eth * 1e18));

// Two weeks of plays shaped like the explorer data: a start and a save per play, newest first.
export function mockActivity(address, games) {
  const rand = seededRandom(address.toLowerCase());
  const hash = () => "0x" + Array.from({ length: 64 }, () => Math.floor(rand() * 16).toString(16)).join("");
  const live = games.filter(g => g.status === "active" && g.contract);
  const now = Date.now();
  const plays = [];

  for (let day = 0; day < 14; day++) {
    const count = Math.floor(rand() * 5) + (day < 7 ? 2 : 1);
    for (let k = 0; k < count; k++) {
      const game = live[Math.floor(rand() * live.length)];
      const at = now - day * DAY - Math.floor(rand() * DAY * 0.9) - 5 * 60000;
      plays.push({ hash: hash(), game, kind: "start", status: "ok", cost: toWei(0.000001), at });
      plays.push({
        hash: hash(),
        game,
        kind: "save",
        status: rand() > 0.1 ? "ok" : "failed",
        cost: toWei(Number(game.entryFee) + 0.0000016),
        at: at + 60000 + Math.floor(rand() * 180000),
      });
    }
  }
  plays.sort((a, b) => b.at - a.at);
  plays[0] = { ...plays[0], status: "pending", at: now - 20000 };

  const hpByDay = Array.from({ length: 14 }, (_, i) => Math.round(3000 + rand() * 7000 + i * 350));
  return { plays, hpByDay };
}
