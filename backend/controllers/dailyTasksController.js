import { ethers } from "ethers";
import UserProfile from "../models/UserProfile.js";
import EventProfile from "../models/EventProfile.js";
import DailyTaskClaim from "../models/DailyTaskClaim.js";
import { ECOSYSTEM_CONTRACTS } from "../config/constants.js";
import { NO_ACTIVITY, activityOn, currentTasks, dayKey, resetsAt, taskProgress, todaysDraw } from "../services/dailyTasks.js";
import { nft } from "../services/nft.js";

const DRAW_FAILED = "Couldn't draw today's tasks yet. Try again in a minute.";

/**
 * GET /api/tasks/daily?wallet=0x...
 * Today's daily tasks and the Bitcoin block that seeded the draw. With a wallet, also each task's
 * progress (plays, or minutes of verified play, capped at the goal) and whether it's claimed.
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
    let activity = NO_ACTIVITY;
    let claimed = new Set();
    if (wallet && tasks.length) {
      const walletLower = wallet.toLowerCase();
      const [a, rows] = await Promise.all([
        activityOn(walletLower, day),
        DailyTaskClaim.find({ wallet: walletLower, day }, { taskId: 1 }).lean(),
      ]);
      activity = a;
      claimed = new Set(rows.map((r) => String(r.taskId)));
    }
    res.json({
      day,
      resetsAt: resetsAt(day),
      bitcoin: draw ? { height: draw.btcHeight, hash: draw.btcHash } : null,
      tasks: tasks.map((t) => {
        const { progress, goal, unit } = taskProgress(t, activity);
        return {
          id: String(t.taskId),
          title: t.title,
          description: t.description,
          reward: t.reward,
          game: t.game,
          contract: ECOSYSTEM_CONTRACTS[t.game] ?? null,
          boost: t.boost,
          unit, // "plays" or "minutes"
          goal,
          progress,
          // What the Dashboard reads today, in the task's unit.
          playCount: goal,
          plays: progress,
          claimed: claimed.has(String(t.taskId)),
        };
      }),
    });
  } catch (err) {
    console.error("getDailyTasks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/tasks/daily/claim  { wallet, taskId }
 * Pays one of today's tasks once the wallet has done it. Each task can be claimed once a day. The HP is
 * the task's reward times the wallet's NFT multiplier (with any NFT bonus for the task's game), and it
 * counts toward the wallet's lifetime points and the weekly event.
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

    const { progress, goal, unit } = taskProgress(task, await activityOn(walletLower, day));
    if (progress < goal) {
      return res.status(400).json({ error: `Not done yet: ${progress} of ${goal} ${unit}.` });
    }

    const multiplier = await nft.walletMultiplier(walletLower, task.game === "any" ? undefined : task.game);
    const reward = Math.round(task.reward * multiplier);
    try {
      await DailyTaskClaim.create({ wallet: walletLower, day, taskId: task.taskId, reward, baseReward: task.reward, multiplier });
    } catch (err) {
      if (err.code === 11000) return res.status(400).json({ error: "Task already claimed", alreadyDone: true });
      throw err;
    }

    let user;
    try {
      user = await UserProfile.findOneAndUpdate(
        { wallet: walletLower },
        { $inc: { points: reward }, $set: { lastSyncedAt: new Date() } },
        { upsert: true, new: true }
      );
    } catch (err) {
      await DailyTaskClaim.deleteOne({ wallet: walletLower, day, taskId: task.taskId }).catch(() => {});
      throw err;
    }
    await EventProfile.findOneAndUpdate(
      { wallet: walletLower },
      { $inc: { points: reward }, $set: { lastSyncedAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true, taskId, added: reward, baseReward: task.reward, multiplier, newTotal: user.points });
  } catch (err) {
    console.error("claimDailyTask error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
