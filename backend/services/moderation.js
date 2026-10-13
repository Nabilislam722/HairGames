// Bans and the suspicious-activity log.
//  - `rejectBanned` sits in front of every route that plays a game or pays HP, and turns banned
//    wallets away with a 403 (`banned: true`), so the site can show its ban screen.
//  - `logSuspicious` records what looked like cheating, for review. It never bans by itself and
//    never throws, so logging can't break a request.
import Blocklist from "../models/Blocklist.js";
import SuspiciousActivity from "../models/SuspiciousActivity.js";

const activeBanFilter = (wallet) => ({
  wallet: wallet.toLowerCase(),
  $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
});

// The wallet's active ban, or null.
export async function findBan(wallet) {
  if (typeof wallet !== "string" || !wallet) return null;
  return Blocklist.findOne(activeBanFilter(wallet)).lean();
}

// What a player may see about their own ban (never the internal notes).
const publicBan = (ban) => ({
  banned: true,
  reason: ban.reason,
  until: ban.expiresAt ?? null, // null = permanent
});

const walletOf = (req) => req.body?.wallet ?? req.body?.player ?? req.query?.wallet ?? req.params?.wallet;

// Express middleware: 403s requests for a banned wallet.
export async function rejectBanned(req, res, next) {
  try {
    const ban = await findBan(walletOf(req));
    if (!ban) return next();
    return res.status(403).json({ error: "This wallet is banned from HairGames.", ...publicBan(ban) });
  } catch (error) {
    // A database hiccup shouldn't take every game down; the route's own checks still run.
    console.error("[moderation] ban check failed:", error.message);
    return next();
  }
}

// GET /api/ban/:wallet — whether a wallet is banned, for the site's ban screen.
export async function getBanStatus(req, res) {
  try {
    const ban = await findBan(req.params.wallet);
    res.json(ban ? publicBan(ban) : { banned: false });
  } catch (error) {
    console.error("[moderation] ban status failed:", error.message);
    res.status(500).json({ error: "Could not check the ban list." });
  }
}

// Saves a suspicious event. `type` is a short code ("pop_implausible_score"), `details` anything
// that helps a reviewer decide.
export function logSuspicious(req, wallet, type, message, details = {}) {
  const forwarded = req.headers?.["x-forwarded-for"];
  SuspiciousActivity.create({
    wallet: typeof wallet === "string" ? wallet : undefined,
    type,
    message,
    details,
    ip: (typeof forwarded === "string" && forwarded.split(",")[0].trim()) || req.ip,
    userAgent: req.headers?.["user-agent"],
    route: req.originalUrl,
  }).catch((error) => console.error("[moderation] could not log suspicious activity:", error.message));
  console.warn(`[suspicious] ${type} ${wallet ?? ""}: ${message}`);
}
