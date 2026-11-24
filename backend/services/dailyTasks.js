import { ethers } from "ethers";
import { provider } from "../config/provider.js";
import { DAILY_TASKS, ECOSYSTEM_CONTRACTS, HEMI_BITCOIN_KIT, HUB } from "../config/constants.js";
import DailyTask from "../models/DailyTask.js";
import DailyTaskDraw from "../models/DailyTaskDraw.js";
import ProcessedTx from "../models/ProcessedTx.js";
import { hubActivityOn } from "./hubRuns.js";

const DAY_MS = 86400000;
const RPC_TIMEOUT_MS = 8000;

const HEADER = "tuple(uint32 height, bytes32 blockHash, uint32 version, bytes32 previousBlockHash, bytes32 merkleRoot, uint32 timestamp, uint32 bits, uint32 nonce)";
const bitcoinKit = new ethers.Contract(HEMI_BITCOIN_KIT, [`function getLastHeader() view returns (${HEADER})`], provider);

export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const dayStart = (day) => Date.parse(`${day}T00:00:00.000Z`);
export const resetsAt = (day) => dayStart(day) + DAY_MS;

/** The latest Bitcoin block Hemi knows, read through hBK. */
export async function bitcoinTip() {
  const header = await Promise.race([
    bitcoinKit.getLastHeader(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Hemi RPC timed out reading the Bitcoin tip")), RPC_TIMEOUT_MS)),
  ]);
  return { height: Number(header.height), hash: header.blockHash };
}

// A task as stored in MongoDB, cleaned up, or null if it can't be used. Tasks are added by hand, so a
// missing game means any game, a missing boost means 1, and anything unusable is skipped. The goal is
// exactly one of playCount (plays) or playMinutes (minutes of verified play, which only hub games record).
function usableTask(t) {
  const reward = Math.round(Number(t.reward));
  const boost = t.boost == null ? 1 : Number(t.boost);
  const game = t.game == null || t.game === "" ? "any" : String(t.game);
  if (typeof t.title !== "string" || !t.title.trim()) return null;
  if (!(reward > 0) || !(boost >= 1)) return null;
  if (game !== "any" && !ECOSYSTEM_CONTRACTS[game]) return null;
  if ((t.playCount == null) === (t.playMinutes == null)) return null;
  const goal = Number(t.playCount ?? t.playMinutes);
  if (!Number.isInteger(goal) || goal < 1) return null;
  if (t.playMinutes != null && game !== "any" && !HUB.LIVE.includes(game)) return null;
  const description = typeof t.description === "string" ? t.description.trim() : "";
  return {
    taskId: t._id, title: t.title.trim(), description, reward, game, boost,
    ...(t.playCount != null ? { playCount: goal } : { playMinutes: goal }),
  };
}

/** The draw's seed: keccak256 of the Bitcoin block hash and the day, packed. */
export const drawSeed = (btcHash, day) => ethers.solidityPackedKeccak256(["bytes32", "string"], [btcHash, day]);

/**
 * Picks `count` tasks, weighted by boost, with no repeats, the same way every time for a seed: the tasks
 * sorted by id weigh boost × 100 each, and pick i takes keccak256(seed, i) modulo the weight left in the pool.
 */
export function drawTasks(tasks, seed, count) {
  const pool = [...tasks]
    .sort((a, b) => String(a.taskId).localeCompare(String(b.taskId)))
    .map((task) => ({ task, weight: BigInt(Math.round(task.boost * 100)) }));
  const picked = [];
  for (let i = 0; picked.length < count && pool.length > 0; i++) {
    const total = pool.reduce((sum, p) => sum + p.weight, 0n);
    let r = BigInt(ethers.solidityPackedKeccak256(["bytes32", "uint256"], [seed, i])) % total;
    const k = pool.findIndex((p) => (r -= p.weight) < 0n);
    picked.push(pool.splice(k, 1)[0].task);
  }
  return picked;
}

/**
 * Today's draw (UTC), made by the first request of the day: the latest Bitcoin block hash read through
 * hBK seeds it. Null while there's no usable active task, so tasks added later in the day still get drawn.
 */
export async function todaysDraw(now = Date.now()) {
  const day = dayKey(now);
  const existing = await DailyTaskDraw.findOne({ day }).lean();
  if (existing) return existing;

  const candidates = (await DailyTask.find({ active: { $ne: false } }).lean()).map(usableTask).filter(Boolean);
  if (candidates.length === 0) return null;
  const btc = await bitcoinTip();
  const tasks = drawTasks(candidates, drawSeed(btc.hash, day), DAILY_TASKS.COUNT);
  try {
    const draw = await DailyTaskDraw.create({
      day,
      btcHeight: btc.height,
      btcHash: btc.hash,
      candidates: candidates.map((t) => t.taskId),
      tasks,
    });
    return draw.toObject();
  } catch (err) {
    if (err.code !== 11000) throw err;
    return DailyTaskDraw.findOne({ day }).lean(); // another request drew the day first
  }
}

/**
 * The day's drawn tasks as they are now in MongoDB, so edits show right away; which tasks were drawn stays
 * fixed for the day. A task deleted since the draw is left out, and one edited into something unusable
 * falls back to the copy saved with the draw. A task set inactive stays for the rest of its day.
 */
export async function currentTasks(draw) {
  if (!draw?.tasks.length) return [];
  const docs = await DailyTask.find({ _id: { $in: draw.tasks.map((t) => t.taskId) } }).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return draw.tasks.flatMap((saved) => {
    const doc = byId.get(String(saved.taskId));
    return doc ? [usableTask(doc) ?? saved] : [];
  });
}

/**
 * The wallet's activity on `day`, per gameId and in all: plays (game saves credited the old way, plus
 * saved runs on the hub) and seconds of verified play on the hub.
 */
export async function activityOn(wallet, day) {
  const start = new Date(dayStart(day));
  const [rows, hub] = await Promise.all([
    ProcessedTx.aggregate([
      { $match: { wallet: wallet.toLowerCase(), createdAt: { $gte: start, $lt: new Date(start.getTime() + DAY_MS) } } },
      { $group: { _id: "$gameId", plays: { $sum: 1 } } },
    ]),
    hubActivityOn(wallet, day),
  ]);
  const byGame = Object.fromEntries(rows.map((r) => [r._id, r.plays]));
  for (const [gameId, n] of Object.entries(hub.plays.byGame)) byGame[gameId] = (byGame[gameId] ?? 0) + n;
  return {
    plays: { byGame, total: Object.values(byGame).reduce((sum, n) => sum + n, 0) },
    seconds: hub.seconds,
  };
}

/** How far the wallet is with a task: { progress, goal, unit }, progress capped at the goal. */
export function taskProgress(task, activity) {
  const minutes = task.playMinutes != null;
  const { byGame, total } = minutes ? activity.seconds : activity.plays;
  const done = task.game === "any" ? total : byGame[task.game] ?? 0;
  const goal = minutes ? task.playMinutes : task.playCount;
  return { progress: Math.min(minutes ? Math.floor(done / 60) : done, goal), goal, unit: minutes ? "minutes" : "plays" };
}

export const NO_ACTIVITY = { plays: { byGame: {}, total: 0 }, seconds: { byGame: {}, total: 0 } };
