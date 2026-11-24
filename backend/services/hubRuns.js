// What a saved hub run changes, shared by the hub indexer and the game's own "saved" report so either can
// come first: the run is marked saved with its verified result, its playtime is worked out, and the
// player's progress moves on. Applying the same save twice changes nothing.
import HubRun from "../models/HubRun.js";
import HubSession from "../models/HubSession.js";
import HubProgress from "../models/HubProgress.js";
import { activeByDay, decodeDetails, gameIdOf } from "./hub.js";

const DAY_MS = 86400000;

/** Recomputes a saved run's playtime from its checkpoints (e.g. after more of them were read). */
export async function refreshPlaytime(runId) {
  const run = await HubRun.findById(String(runId)).lean();
  if (run?.status !== "saved") return;
  await HubRun.updateOne({ _id: run._id }, { $set: { activeByDay: activeByDay(run) } });
}

/** Applies a RunSaved event. Returns { applied, gameId, result }; applied is false if it was already saved. */
export async function applyRunSaved({ runId, player, game, score, details, savedAt, txHash }) {
  runId = String(runId);
  player = player.toLowerCase();
  const gameId = gameIdOf(game);
  const result = decodeDetails(gameId, details);
  const session = await HubSession.findOne({ runId }).lean();

  // The run may not be indexed yet when the game reports the save first: fill it in from the session.
  if (session?.startedAt) {
    await HubRun.updateOne(
      { _id: runId },
      { $setOnInsert: { player, gameId, game: Number(game), sender: session.sender, startedAt: session.startedAt, startTx: session.startTxHash } },
      { upsert: true },
    );
  }

  const run = await HubRun.findOneAndUpdate(
    { _id: runId, status: "open" },
    {
      $set: {
        status: "saved", savedAt, saveTx: txHash, score: Number(score), details, result,
        playedSeconds: session?.result?.playedSeconds ?? 0,
      },
    },
    { new: true },
  ).lean();
  if (!run) return { applied: false, gameId, result };

  await HubRun.updateOne({ _id: runId }, { $set: { activeByDay: activeByDay(run) } });
  if (gameId === "moto_rush" && result) await completeLevel(player, runId, result);
  if (gameId === "candy_cascade" && result) await recordCandyLevel(player, runId, Number(score), result);
  return { applied: true, gameId, result };
}

async function ensureProgress(wallet, gameId) {
  try {
    await HubProgress.updateOne(
      { wallet, gameId },
      { $setOnInsert: { completed: 0, totalStars: 0, levels: [] } },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error; // created at the same moment by another save
  }
}

// Completes a Moto Rush level if it's the player's next one: levels go in order, each once.
async function completeLevel(wallet, runId, { level, stars, timeMs }) {
  await ensureProgress(wallet, "moto_rush");
  await HubProgress.updateOne(
    { wallet, gameId: "moto_rush", completed: level - 1 },
    { $set: { completed: level }, $inc: { totalStars: stars }, $push: { levels: { level, stars, timeMs, runId } } },
  );
}

// Records a cleared Candy Cascade level: its best stars (adding any gain to the total) and best score.
// Clearing the newest level opens the next one. A lost level (0 stars) changes nothing.
async function recordCandyLevel(wallet, runId, score, { level, stars }) {
  if (!(stars >= 1)) return;
  const filter = { wallet, gameId: "candy_cascade" };
  await ensureProgress(wallet, "candy_cascade");
  const added = await HubProgress.updateOne(
    { ...filter, "levels.level": { $ne: level } },
    { $push: { levels: { level, stars, score, runId } }, $inc: { totalStars: stars } },
  );
  if (!added.modifiedCount) {
    // Cleared before. Raising the stars only from the value just read keeps two saves from both adding.
    for (let attempt = 0; attempt < 3; attempt++) {
      const doc = await HubProgress.findOne(filter, { levels: { $elemMatch: { level } } }).lean();
      const before = doc?.levels?.[0]?.stars ?? 0;
      if (stars <= before) break;
      const raised = await HubProgress.updateOne(
        { ...filter, levels: { $elemMatch: { level, stars: before } } },
        { $set: { "levels.$.stars": stars, "levels.$.runId": runId }, $inc: { totalStars: stars - before } },
      );
      if (raised.modifiedCount) break;
    }
    await HubProgress.updateOne(
      { ...filter, levels: { $elemMatch: { level, score: { $lt: score } } } },
      { $set: { "levels.$.score": score } },
    );
  }
  await HubProgress.updateOne({ ...filter, completed: level - 1 }, { $set: { completed: level } });
}

/**
 * A wallet's saved hub runs on a UTC day: plays per gameId (by save time) and seconds of verified play
 * per gameId (by when it was played), with totals.
 */
export async function hubActivityOn(wallet, day) {
  wallet = wallet.toLowerCase();
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + DAY_MS);
  const [plays, seconds] = await Promise.all([
    HubRun.aggregate([
      { $match: { player: wallet, status: "saved", savedAt: { $gte: start, $lt: end } } },
      { $group: { _id: "$gameId", n: { $sum: 1 } } },
    ]),
    // A run's play on this day was saved this day, or the next if it ran past midnight.
    HubRun.aggregate([
      { $match: { player: wallet, status: "saved", savedAt: { $gte: start, $lt: new Date(end.getTime() + DAY_MS) }, [`activeByDay.${day}`]: { $gt: 0 } } },
      { $group: { _id: "$gameId", s: { $sum: `$activeByDay.${day}` } } },
    ]),
  ]);
  const fold = (rows, field) => {
    const byGame = Object.fromEntries(rows.map((r) => [r._id, r[field]]));
    return { byGame, total: rows.reduce((sum, r) => sum + r[field], 0) };
  };
  return { plays: fold(plays, "n"), seconds: fold(seconds, "s") };
}
