import { ethers } from "ethers";
import UserProfile from "../models/UserProfile.js";
import DailyTaskClaim from "../models/DailyTaskClaim.js";
import { ECOSYSTEM_CONTRACTS } from "../config/constants.js";
import { currentTasks, dayKey, playsFor, playsOn, resetsAt, todaysDraw } from "../services/dailyTasks.js";

const DRAW_FAILED = "Couldn't draw today's tasks yet. Try again in a minute.";

/**
 * GET /api/tasks/daily?wallet=0x...
 * Today's daily tasks and the Bitcoin block that seeded the draw. With a wallet, also each task's plays
 * so far (capped at what it needs) and whether it's claimed.
 */
export const getDailyTasks = async (req, res) => {
  const { wallet } = req.query;
  if (wallet != null && !ethers.isAddress(wallet)) return res.status(400).json({ error: "Invalid wallet" });
  const now = Date.now();
  const day = dayKey(now);

  let draw;
  try {
    draw = await todaysDraw(now);
  } catch (err) {
    console.error("Daily task draw failed:", err.message);
    return res.status(503).json({ error: DRAW_FAILED });
  }

  try {
    const tasks = await currentTasks(draw);
    let plays = { byGame: {}, total: 0 };
    let claimed = new Set();
    if (wallet && tasks.length) {
      const walletLower = wallet.toLowerCase();
      const [p, rows] = await Promise.all([
        playsOn(walletLower, day),
        DailyTaskClaim.find({ wallet: walletLower, day }, { taskId: 1 }).lean(),
      ]);
      plays = p;
      claimed = new Set(rows.map((r) => String(r.taskId)));
    }
    res.json({
      day,
      resetsAt: resetsAt(day),
      bitcoin: draw ? { height: draw.btcHeight, hash: draw.btcHash } : null,
      tasks: tasks.map((t) => ({
        id: String(t.taskId),
        title: t.title,
        description: t.description,
        reward: t.reward,
        game: t.game,
        contract: ECOSYSTEM_CONTRACTS[t.game] ?? null,
        playCount: t.playCount,
        boost: t.boost,
        plays: Math.min(playsFor(t, plays), t.playCount),
        claimed: claimed.has(String(t.taskId)),
      })),
    });
  } catch (err) {
    console.error("getDailyTasks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/tasks/daily/claim  { wallet, taskId }
 * Pays one of today's tasks once the wallet has played enough. Each task can be claimed once a day, and
 * the HP goes to the wallet's lifetime points, like the bonus tasks.
 */
export const claimDailyTask = async (req, res) => {
  const { wallet, taskId } = req.body ?? {};
  if (!ethers.isAddress(wallet) || typeof taskId !== "string") {
    return res.status(400).json({ error: "Invalid claim request" });
  }
  const walletLower = wallet.toLowerCase();
  const now = Date.now();
  const day = dayKey(now);

  let draw;
  try {
    draw = await todaysDraw(now);
  } catch (err) {
    console.error("Daily task draw failed:", err.message);
    return res.status(503).json({ error: DRAW_FAILED });
  }

  try {
    const task = (await currentTasks(draw)).find((t) => String(t.taskId) === taskId);
    if (!task) return res.status(404).json({ error: "That isn't one of today's tasks. They may have just reset." });

    const plays = playsFor(task, await playsOn(walletLower, day));
    if (plays < task.playCount) {
      return res.status(400).json({ error: `Not done yet: ${plays} of ${task.playCount} plays.` });
    }

    try {
      await DailyTaskClaim.create({ wallet: walletLower, day, taskId: task.taskId, reward: task.reward });
    } catch (err) {
      if (err.code === 11000) return res.status(400).json({ error: "Task already claimed", alreadyDone: true });
      throw err;
    }

    let user;
    try {
      user = await UserProfile.findOneAndUpdate(
        { wallet: walletLower },
        { $inc: { points: task.reward }, $set: { lastSyncedAt: new Date() } },
        { upsert: true, new: true }
      );
    } catch (err) {
      await DailyTaskClaim.deleteOne({ wallet: walletLower, day, taskId: task.taskId }).catch(() => {});
      throw err;
    }

    res.json({ success: true, taskId, added: task.reward, newTotal: user.points });
  } catch (err) {
    console.error("claimDailyTask error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
