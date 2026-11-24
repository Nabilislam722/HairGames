// Games on HairGames Hub V2 (HUB.LIVE: Moto Rush, Pixel Fighters and Candy Cascade). The flow per run:
//  1. The game sends startRun(game, params) to the hub, usually from the player's session key.
//  2. POST /api/hub/<game>/session checks that transaction, even while it's pending, and opens the
//     server's side of the run: the level (with its board seed), or the CPU opponent and its seed.
//  3. POST /api/hub/<game>/verify replays the player's recorded inputs with the game's own engine and
//     signs only the result of that replay, bound to the mined run.
//  4. The game sends submitRun with that signature, then reports it to POST /api/hub/saved, so progress
//     moves on at once. The hub indexer applies the same save too; whichever comes second changes nothing.
// Hub games pay no HP per play: daily tasks pay HP for plays and playtime.
import { randomBytes, randomInt } from "node:crypto";
import { ethers } from "ethers";
import HubSession, { VERIFIED_SESSION_TTL_MS } from "../models/HubSession.js";
import HubProgress from "../models/HubProgress.js";
import HubRun from "../models/HubRun.js";
import { HUB, VENOM_NFT } from "../config/constants.js";
import { provider, hemiChainId, getServerWallet } from "../config/provider.js";
import {
  SIGNATURE_LIFETIME_S, decodeStartRun, encodeDetails, gameNumber, hubContract, hubEvents, paramsNumber,
  registryContract, signResult,
} from "../services/hub.js";
import { applyRunSaved, hubActivityOn } from "../services/hubRuns.js";
import { LEVEL_COUNT as CANDY_LEVEL_COUNT, replayLevel, rulesFingerprint as candyRulesFingerprint } from "../services/candyCascade.js";
import { LEVEL_COUNT, STEP, bikeCount, bikeInfo, replayRide, rulesFingerprint as motoRulesFingerprint } from "../services/motoRush.js";
import { CHARACTER_IDS, DIFFICULTIES, drawOpponent, replayMatch, rulesFingerprint as pixelRulesFingerprint } from "../services/pixelFighter.js";
import { logSuspicious } from "../services/moderation.js";

const RPC_TIMEOUT_MS = 6000;
const START_LOOKUP_TRIES = 6;
const START_CONFIRM_WAIT_MS = 9000;
const SAVE_CONFIRM_WAIT_MS = 20000;

let motoRules = null;
let pixelRules = null;
let candyRules = null;

// A Candy Cascade attempt has no clock in its replay, so its time comes from its moves: at least
// `min` seconds each (the soonest its result can be saved) and at most `max` (the playtime it can earn).
export const CANDY_SECONDS_PER_MOVE = { min: 0.5, max: 15 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = (promise, what) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Hemi RPC timed out reading ${what}`)), RPC_TIMEOUT_MS)),
  ]);
const httpError = (status, message) => Object.assign(new Error(message), { status });
const isHash = (value) => /^0x[0-9a-f]{64}$/.test(value);
const todayKey = () => new Date().toISOString().slice(0, 10);

function sendError(res, error, fallback) {
  if (!error.status) console.error("Hub error:", error.message);
  res.status(error.status || 500).json({ error: error.status ? error.message : fallback });
}

function readWallet(value) {
  if (!value || !ethers.isAddress(value)) throw httpError(400, "A valid wallet address is required.");
  return value.toLowerCase();
}

async function findTransaction(hash) {
  for (let i = 0; i < START_LOOKUP_TRIES; i++) {
    const tx = await withTimeout(provider.getTransaction(hash), "the start transaction").catch(() => null);
    if (tx) return tx;
    await sleep(1500);
  }
  return null;
}

// ---- Shared steps ------------------------------------------------------------------------------------

// The session already opened for this start transaction, if any. It must be the same wallet and game.
async function existingSession(req, startTxHash, wallet, gameId) {
  const session = await HubSession.findOne({ startTxHash });
  if (session && (session.wallet !== wallet || session.gameId !== gameId)) {
    logSuspicious(req, wallet, "hub_start_reused", "Reused a run start for another wallet or game", {
      startTxHash, gameId, startedBy: session.wallet, startedGame: session.gameId,
    });
    throw httpError(409, "That start transaction belongs to a different run.");
  }
  return session;
}

// Checks a startRun transaction for `gameId`, sent by the wallet or by a session key playing for it, and
// returns its params. Works while the transaction is still pending, so play can begin at once.
async function checkStart(req, wallet, startTxHash, gameId) {
  const tx = await findTransaction(startTxHash);
  if (!tx) throw httpError(404, "Couldn't find your start transaction yet. Please try again.");
  const start = decodeStartRun(tx);
  const player = start ? (await withTimeout(registryContract().playerFor(tx.from), "your session")).toLowerCase() : null;
  if (!start || start.game !== gameNumber(gameId) || player !== wallet) {
    logSuspicious(req, wallet, "hub_foreign_start", "Asked for a run with a transaction that doesn't start this game for this wallet", {
      startTxHash, gameId, txFrom: tx.from, txTo: tx.to, txGame: start?.game ?? null, playsFor: player,
    });
    throw httpError(400, "That transaction doesn't start this game for your wallet.");
  }
  return { params: start.params, sender: tx.from.toLowerCase() };
}

async function createSession(fields) {
  try {
    return await HubSession.create({ sessionId: ethers.hexlify(randomBytes(32)), ...fields });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return HubSession.findOne({ startTxHash: fields.startTxHash }); // opened at the same moment by a retry
  }
}

// The verified session's run once its start is mined: it must be this wallet's run of this game with the
// same params, and still open (not saved yet).
async function minedRun(session) {
  if (session.runId) {
    const run = await withTimeout(hubContract().runs(session.runId), "your run");
    if (!run.open) throw httpError(409, "This run was already saved.");
    return;
  }
  const receipt = await provider.waitForTransaction(session.startTxHash, 1, START_CONFIRM_WAIT_MS).catch(() => null);
  if (!receipt) throw httpError(409, "Your start isn't confirmed on chain yet. Try again in a moment.");
  if (receipt.status !== 1) throw httpError(409, "Your start failed on chain, so this run can't be saved.");
  const [started] = hubEvents(receipt, "RunStarted");
  if (
    !started ||
    started.player.toLowerCase() !== session.wallet ||
    Number(started.game) !== gameNumber(session.gameId) ||
    started.params !== session.params.raw
  ) {
    throw httpError(409, "Your start transaction doesn't match this run.");
  }
  const run = await withTimeout(hubContract().runs(started.runId), "your run");
  if (!run.open) throw httpError(409, "This run was already saved.");
  session.runId = started.runId.toString();
  session.startedAt = new Date(Number(run.startedAt) * 1000);
  session.sender = started.sender.toLowerCase();
  await session.save();
}

// Signs the verified result of the session's run. notBefore is the run's start plus the least time it
// takes (its replayed length, or minSeconds for a game without a clock), so it can't be saved sooner
// than it could have been played.
async function signedResult(session) {
  const { score, details, playedSeconds, minSeconds } = session.result;
  const notBefore = Math.floor(session.startedAt.getTime() / 1000) + Math.floor(minSeconds ?? playedSeconds);
  const deadline = Math.max(Math.floor(Date.now() / 1000), notBefore) + SIGNATURE_LIFETIME_S;
  const game = gameNumber(session.gameId);
  const { r, vs } = await signResult(getServerWallet(), {
    runId: BigInt(session.runId), player: session.wallet, game, score: BigInt(score), details, notBefore, deadline,
  });
  return { runId: session.runId, game, score: String(score), details, notBefore, deadline, r, vs };
}

async function verifiedSession(sessionId, wallet, gameId) {
  const session = await HubSession.findOne({ sessionId, wallet, gameId });
  if (!session) throw httpError(404, "This run expired or does not exist. Start a new one.");
  if (session.status === "rejected") throw httpError(400, "This run was rejected.");
  return session;
}

// ---- Moto Rush ---------------------------------------------------------------------------------------

async function checkBike(req, wallet, bike, levelId) {
  if (!Number.isInteger(bike) || bike < 0 || bike >= bikeCount()) throw httpError(400, "Unknown bike.");
  const info = bikeInfo(bike);
  if (info.nft) {
    const venom = new ethers.Contract(VENOM_NFT, ["function balanceOf(address owner) view returns (uint256)"], provider);
    if ((await withTimeout(venom.balanceOf(wallet), "your Venom")) === 0n) {
      logSuspicious(req, wallet, "moto_venom_without_nft", "Rode the Venom without holding one", { levelId, bike });
      throw httpError(403, "This ride used the #27 Venom, but your wallet doesn't hold one.");
    }
  } else if (info.unlock > 0) {
    const stars = (await HubProgress.findOne({ wallet, gameId: "moto_rush" }).lean())?.totalStars ?? 0;
    if (stars < info.unlock) {
      logSuspicious(req, wallet, "moto_locked_bike", "Rode a bike its stars haven't unlocked", { levelId, bike, stars, needs: info.unlock });
      throw httpError(403, `${info.name} unlocks at ${info.unlock} stars.`);
    }
  }
}

// POST /api/hub/moto-rush/session { wallet, startTxHash }
// The level is the run's params on chain, and it must be the player's next level.
export const startHubMotoSession = async (req, res) => {
  try {
    const wallet = readWallet(req.body.wallet);
    const startTxHash = String(req.body.startTxHash ?? "").toLowerCase();
    if (!isHash(startTxHash)) throw httpError(400, "A start transaction is required.");

    const existing = await existingSession(req, startTxHash, wallet, "moto_rush");
    if (existing) return res.json({ sessionId: existing.sessionId, levelId: existing.params.levelId });

    const { params, sender } = await checkStart(req, wallet, startTxHash, "moto_rush");
    const levelId = paramsNumber(params);
    if (!Number.isInteger(levelId) || levelId < 1 || levelId > LEVEL_COUNT) throw httpError(400, "Unknown level.");
    const next = ((await HubProgress.findOne({ wallet, gameId: "moto_rush" }).lean())?.completed ?? 0) + 1;
    if (levelId < next) throw httpError(403, `You already completed level ${levelId}. On to the next one!`);
    if (levelId > next) throw httpError(403, `Level ${levelId} is locked. Complete level ${next} first.`);

    const session = await createSession({ startTxHash, wallet, gameId: "moto_rush", params: { levelId, raw: params }, sender });
    res.json({ sessionId: session.sessionId, levelId });
  } catch (error) {
    sendError(res, error, "Could not start the level. Please try again.");
  }
};

// POST /api/hub/moto-rush/verify { wallet, sessionId, bike, inputs, reviveStep, rules }
export const verifyHubMotoRide = async (req, res) => {
  try {
    const wallet = readWallet(req.body.wallet);
    const sessionId = String(req.body.sessionId ?? "").toLowerCase();
    const bike = Number(req.body.bike);
    const reviveStep = req.body.reviveStep == null ? null : Number(req.body.reviveStep);
    if (!isHash(sessionId)) throw httpError(400, "Unknown level session.");
    if (req.body.rules !== (motoRules ??= motoRulesFingerprint())) {
      throw httpError(409, "The game was updated. Reload the page and ride the level again.");
    }

    const session = await verifiedSession(sessionId, wallet, "moto_rush");
    const levelId = session.params.levelId;
    if (session.status === "open") {
      await checkBike(req, wallet, bike, levelId);
      const result = replayRide({ levelId, bike, inputs: req.body.inputs, reviveStep });
      if (!result.valid || !result.finished) {
        session.status = "rejected";
        await session.save();
        logSuspicious(
          req, wallet,
          result.valid ? "moto_unfinished_ride_submitted" : "moto_tampered_inputs",
          result.valid ? `Sent a ride that didn't finish (${result.reason})` : `Inputs failed the replay: ${result.reason}`,
          { sessionId, levelId, bike, runs: Array.isArray(req.body.inputs) ? req.body.inputs.length : null },
        );
        throw httpError(400, result.valid ? "That ride didn't reach the finish." : `The ride did not check out (${result.reason}).`);
      }
      session.status = "verified";
      session.result = {
        score: result.timeMs, timeMs: result.timeMs, stars: result.stars, bike,
        details: encodeDetails("moto_rush", { level: levelId, timeMs: result.timeMs, stars: result.stars, bike }),
        playedSeconds: result.steps * STEP,
      };
      session.expiresAt = new Date(Date.now() + VERIFIED_SESSION_TTL_MS);
      await session.save();
    }

    await minedRun(session);
    const { timeMs, stars } = session.result;
    res.json({ ...(await signedResult(session)), levelId, timeMs, stars, bike: session.result.bike });
  } catch (error) {
    sendError(res, error, "Could not verify the ride. Please try again.");
  }
};

// GET /api/hub/moto-rush/progress?wallet=0x…
export const getHubMotoProgress = async (req, res) => {
  try {
    const wallet = readWallet(req.query.wallet);
    const progress = await HubProgress.findOne({ wallet, gameId: "moto_rush" }).lean();
    res.json({
      completed: progress?.completed ?? 0,
      totalStars: progress?.totalStars ?? 0,
      levels: (progress?.levels ?? []).map(({ level, stars, timeMs }) => ({ level, stars, timeMs })).sort((a, b) => a.level - b.level),
    });
  } catch (error) {
    sendError(res, error, "Could not load your progress.");
  }
};

// ---- Pixel Fighters ----------------------------------------------------------------------------------

// POST /api/hub/pixel-fighter/session { wallet, startTxHash, p1 }
// The CPU level is the run's params on chain; the server picks the CPU fighter and its seed, once per start.
export const startHubPixelSession = async (req, res) => {
  try {
    const wallet = readWallet(req.body.wallet);
    const { p1 } = req.body;
    const startTxHash = String(req.body.startTxHash ?? "").toLowerCase();
    if (!CHARACTER_IDS.includes(p1)) throw httpError(400, "Unknown fighter.");
    if (!isHash(startTxHash)) throw httpError(400, "A start transaction is required.");

    const reply = (s) => ({ sessionId: s.sessionId, seed: s.params.seed, p2: s.params.p2, difficulty: DIFFICULTIES[s.params.difficulty] });
    const existing = await existingSession(req, startTxHash, wallet, "pixel_fighter");
    if (existing) {
      if (existing.params.p1 !== p1) throw httpError(409, "That start transaction belongs to a different match.");
      return res.json(reply(existing));
    }

    const { params, sender } = await checkStart(req, wallet, startTxHash, "pixel_fighter");
    const difficulty = paramsNumber(params);
    if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty >= DIFFICULTIES.length) throw httpError(400, "Unknown CPU level.");
    const { p2, seed } = drawOpponent(p1);
    const session = await createSession({ startTxHash, wallet, gameId: "pixel_fighter", params: { difficulty, p1, p2, seed, raw: params }, sender });
    res.json(reply(session));
  } catch (error) {
    sendError(res, error, "Could not start the match. Please try again.");
  }
};

// POST /api/hub/pixel-fighter/verify { wallet, sessionId, inputs, rules }
export const verifyHubPixelMatch = async (req, res) => {
  try {
    const wallet = readWallet(req.body.wallet);
    const sessionId = String(req.body.sessionId ?? "").toLowerCase();
    if (!isHash(sessionId)) throw httpError(400, "Unknown match.");
    if (req.body.rules !== (pixelRules ??= pixelRulesFingerprint())) {
      throw httpError(409, "The game was updated. Reload the page and play the match again.");
    }

    const session = await verifiedSession(sessionId, wallet, "pixel_fighter");
    const { difficulty, p1, p2, seed } = session.params;
    if (session.status === "open") {
      const result = replayMatch({ p1, p2, difficulty: DIFFICULTIES[difficulty], seed, inputs: req.body.inputs });
      if (!result.valid || !result.finished) {
        session.status = "rejected";
        await session.save();
        logSuspicious(req, wallet, "pixel_tampered_inputs", `Inputs failed the replay: ${result.reason}`, {
          sessionId, p1, p2, difficulty, runs: Array.isArray(req.body.inputs) ? req.body.inputs.length : null,
        });
        throw httpError(400, `The match did not check out (${result.reason}).`);
      }
      const won = result.summary.won;
      session.status = "verified";
      session.result = {
        score: result.score, won, durationMs: result.durationMs,
        details: encodeDetails("pixel_fighter", { difficulty, won, durationMs: result.durationMs }),
        playedSeconds: result.durationMs / 1000,
      };
      session.expiresAt = new Date(Date.now() + VERIFIED_SESSION_TTL_MS);
      await session.save();
    }

    await minedRun(session);
    const { won, durationMs } = session.result;
    res.json({ ...(await signedResult(session)), won, durationMs });
  } catch (error) {
    sendError(res, error, "Could not verify the match. Please try again.");
  }
};

// GET /api/hub/pixel-fighter/stats?wallet=0x…
export const getHubPixelStats = async (req, res) => {
  try {
    const wallet = readWallet(req.query.wallet);
    const [stats] = await HubRun.aggregate([
      { $match: { player: wallet, gameId: "pixel_fighter", status: "saved" } },
      {
        $group: {
          _id: null,
          matches: { $sum: 1 },
          wins: { $sum: { $cond: ["$result.won", 1, 0] } },
          bestScore: { $max: "$score" },
          totalScore: { $sum: "$score" },
        },
      },
    ]);
    res.json({ matches: stats?.matches ?? 0, wins: stats?.wins ?? 0, bestScore: stats?.bestScore ?? 0, totalScore: stats?.totalScore ?? 0 });
  } catch (error) {
    sendError(res, error, "Could not load your stats.");
  }
};

// ---- Candy Cascade -----------------------------------------------------------------------------------

const candyProgress = (wallet) => HubProgress.findOne({ wallet, gameId: "candy_cascade" }).lean();

// POST /api/hub/candy-cascade/session { wallet, startTxHash }
// The level is the run's params on chain: an unlocked level without 3 stars yet. The server picks the
// board's seed, once per start.
export const startHubCandySession = async (req, res) => {
  try {
    const wallet = readWallet(req.body.wallet);
    const startTxHash = String(req.body.startTxHash ?? "").toLowerCase();
    if (!isHash(startTxHash)) throw httpError(400, "A start transaction is required.");

    const reply = (s) => ({ sessionId: s.sessionId, levelId: s.params.levelId, seed: s.params.seed });
    const existing = await existingSession(req, startTxHash, wallet, "candy_cascade");
    if (existing) return res.json(reply(existing));

    const { params, sender } = await checkStart(req, wallet, startTxHash, "candy_cascade");
    const levelId = paramsNumber(params);
    if (!Number.isInteger(levelId) || levelId < 1 || levelId > CANDY_LEVEL_COUNT) throw httpError(400, "Unknown level.");
    const progress = await candyProgress(wallet);
    const next = (progress?.completed ?? 0) + 1;
    if (levelId > next) throw httpError(403, `Level ${levelId} is locked. Clear level ${next} first.`);
    if ((progress?.levels.find((l) => l.level === levelId)?.stars ?? 0) >= 3) {
      throw httpError(403, `You already have 3 stars on level ${levelId}. Try a new level!`);
    }

    const seed = randomInt(0, 2 ** 32);
    const session = await createSession({ startTxHash, wallet, gameId: "candy_cascade", params: { levelId, seed, raw: params }, sender });
    res.json(reply(session));
  } catch (error) {
    sendError(res, error, "Could not start the level. Please try again.");
  }
};

// POST /api/hub/candy-cascade/verify { wallet, sessionId, moves, rules }
// Wins and losses are both saved: a lost level is play too, and counts toward daily tasks.
export const verifyHubCandyLevel = async (req, res) => {
  try {
    const wallet = readWallet(req.body.wallet);
    const sessionId = String(req.body.sessionId ?? "").toLowerCase();
    if (!isHash(sessionId)) throw httpError(400, "Unknown level session.");
    if (req.body.rules !== (candyRules ??= candyRulesFingerprint())) {
      throw httpError(409, "The game was updated. Reload the page and play the level again.");
    }

    const session = await verifiedSession(sessionId, wallet, "candy_cascade");
    const { levelId, seed } = session.params;
    if (session.status === "open") {
      const result = await replayLevel(levelId, seed, req.body.moves);
      if (!result.valid) {
        session.status = "rejected";
        await session.save();
        logSuspicious(req, wallet, "candy_tampered_moves", `Moves failed the replay: ${result.reason}`, {
          sessionId, levelId, moves: Array.isArray(req.body.moves) ? req.body.moves.length : null,
        });
        throw httpError(400, `The level did not check out (${result.reason}).`);
      }
      session.status = "verified";
      session.result = {
        score: result.score, won: result.win, stars: result.stars, movesLeft: result.movesLeft, moves: result.moves,
        details: encodeDetails("candy_cascade", { level: levelId, stars: result.stars, movesLeft: result.movesLeft, moves: result.moves }),
        playedSeconds: result.moves * CANDY_SECONDS_PER_MOVE.max,
        minSeconds: result.moves * CANDY_SECONDS_PER_MOVE.min,
      };
      session.expiresAt = new Date(Date.now() + VERIFIED_SESSION_TTL_MS);
      await session.save();
    }

    await minedRun(session);
    const { won, stars, movesLeft } = session.result;
    res.json({ ...(await signedResult(session)), levelId, won, stars, movesLeft });
  } catch (error) {
    sendError(res, error, "Could not verify the level. Please try again.");
  }
};

// GET /api/hub/candy-cascade/progress?wallet=0x…
// In the shape the game takes: the highest unlocked level, and the best stars and score per level.
export const getHubCandyProgress = async (req, res) => {
  try {
    const wallet = readWallet(req.query.wallet);
    const progress = await candyProgress(wallet);
    const stars = {};
    const best = {};
    for (const l of progress?.levels ?? []) {
      stars[l.level] = l.stars;
      best[l.level] = l.score ?? 0;
    }
    res.json({
      unlocked: Math.min(CANDY_LEVEL_COUNT, (progress?.completed ?? 0) + 1),
      stars,
      best,
      totalStars: progress?.totalStars ?? 0,
    });
  } catch (error) {
    sendError(res, error, "Could not load your progress.");
  }
};

// ---- Every hub game ----------------------------------------------------------------------------------

// POST /api/hub/saved { wallet, txHash }
// The game reports a mined submitRun, so progress moves on before the indexer gets to it.
export const reportHubSave = async (req, res) => {
  try {
    const wallet = readWallet(req.body.wallet);
    const txHash = String(req.body.txHash ?? "").toLowerCase();
    if (!isHash(txHash)) throw httpError(400, "A transaction hash is required.");

    const receipt = await provider.waitForTransaction(txHash, 1, SAVE_CONFIRM_WAIT_MS).catch(() => null);
    if (!receipt) throw httpError(409, "Your save isn't confirmed on chain yet. Try again in a moment.");
    if (receipt.status !== 1) throw httpError(400, "That save failed on chain.");
    const saves = hubEvents(receipt, "RunSaved").filter((s) => s.player.toLowerCase() === wallet);
    if (!saves.length) throw httpError(400, "That transaction didn't save a run of yours.");

    const savedAt = new Date((await withTimeout(provider.getBlock(receipt.blockNumber), "the save's block")).timestamp * 1000);
    const saved = [];
    for (const s of saves) {
      const { gameId, result } = await applyRunSaved({
        runId: s.runId, player: s.player, game: s.game, score: s.score, details: s.details, savedAt, txHash,
      });
      saved.push({ runId: s.runId.toString(), gameId, result });
    }
    res.json({ saved });
  } catch (error) {
    sendError(res, error, "Could not record your save. It will still show up shortly.");
  }
};

// GET /api/hub/playtime?wallet=0x…&day=YYYY-MM-DD (today, UTC, by default)
// Saved runs and verified minutes of play that day, per game.
export const getHubPlaytime = async (req, res) => {
  try {
    const wallet = readWallet(req.query.wallet);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(req.query.day ?? "") ? req.query.day : todayKey();
    const { plays, seconds } = await hubActivityOn(wallet, day);
    res.json({ day, plays, seconds, minutes: Math.floor(seconds.total / 60) });
  } catch (error) {
    sendError(res, error, "Could not load your playtime.");
  }
};

// GET /api/hub/runs?wallet=0x…&days=14 (1 to 30)
// The wallet's hub runs started in the last `days` days, newest first, for the site's Recent plays.
export const getHubRuns = async (req, res) => {
  try {
    const wallet = readWallet(req.query.wallet);
    const days = Math.min(30, Math.max(1, Math.floor(Number(req.query.days)) || 14));
    const runs = await HubRun.find(
      { player: wallet, startedAt: { $gte: new Date(Date.now() - days * 86400000) } },
      { gameId: 1, startedAt: 1, startTx: 1, status: 1, savedAt: 1, saveTx: 1, score: 1, result: 1 },
    ).sort({ startedAt: -1 }).limit(500).lean();
    // Runs read before start transactions were kept get theirs from the run's session.
    const missing = runs.filter((r) => !r.startTx).map((r) => r._id);
    const sessions = missing.length ? await HubSession.find({ runId: { $in: missing } }, { runId: 1, startTxHash: 1 }).lean() : [];
    const startTxOf = new Map(sessions.map((s) => [s.runId, s.startTxHash]));
    res.json({
      runs: runs.map((r) => ({
        runId: r._id,
        gameId: r.gameId,
        startedAt: r.startedAt,
        startTx: r.startTx ?? startTxOf.get(r._id) ?? null,
        status: r.status,
        savedAt: r.savedAt ?? null,
        saveTx: r.saveTx ?? null,
        score: r.score ?? null,
        result: r.result ?? null,
      })),
    });
  } catch (error) {
    sendError(res, error, "Could not load your runs.");
  }
};

// GET /api/hub/config
export const getHubConfig = (req, res) => {
  res.json({ hub: HUB.ADDRESS, registry: HUB.REGISTRY, chainId: Number(hemiChainId), games: HUB.GAMES, live: HUB.LIVE });
};
