import mongoose from "mongoose";
import { ethers } from "ethers";
import connectDB from "../config/db.js";
import Blocklist from "../models/Blocklist.js";
import SuspiciousActivity from "../models/SuspiciousActivity.js";

const [command, ...rest] = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) flags[rest[i].slice(2)] = rest[i + 1]?.startsWith("--") ? true : rest[++i];
  else positional.push(rest[i]);
}

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

// Arguments are checked before connecting, so bad input never touches the database.
const COMMANDS = ["ban", "unban", "list", "suspicious", "top"];
if (!COMMANDS.includes(command)) {
  fail("Usage: node backend/scripts/blocklist.js <ban|unban|list|suspicious|top> ... (see the top of this file)");
}
const needsWallet = command === "ban" || command === "unban" || (command === "suspicious" && positional[0]);
if (needsWallet && !ethers.isAddress(positional[0] ?? "")) fail("Give a valid wallet address.");
const wallet = needsWallet ? positional[0].toLowerCase() : null;
const days = flags.days ? Number(flags.days) : null;
if (days !== null && !(days > 0)) fail("--days must be a positive number.");

const fmt = (date) => (date ? new Date(date).toISOString().replace("T", " ").slice(0, 16) : "permanent");

const commands = {
  async ban() {
    const ban = await Blocklist.findOneAndUpdate(
      { wallet },
      {
        $set: {
          reason: flags.reason || "Breaking the HairGames rules",
          notes: flags.notes,
          bannedBy: flags.by,
          expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`Banned ${wallet} until ${fmt(ban.expiresAt)}. Reason: ${ban.reason}`);
  },

  async unban() {
    const { deletedCount } = await Blocklist.deleteOne({ wallet });
    console.log(deletedCount ? `Unbanned ${wallet}.` : `${wallet} wasn't banned.`);
  },

  async list() {
    const bans = await Blocklist.find({}).sort({ createdAt: -1 }).lean();
    if (!bans.length) return console.log("The blocklist is empty.");
    console.table(
      bans.map((b) => ({
        wallet: b.wallet,
        reason: b.reason,
        until: fmt(b.expiresAt),
        active: !b.expiresAt || b.expiresAt > new Date(),
        by: b.bannedBy ?? "",
        since: fmt(b.createdAt),
      }))
    );
  },

  async suspicious() {
    const filter = wallet ? { wallet } : {};
    const events = await SuspiciousActivity.find(filter).sort({ createdAt: -1 }).limit(Number(flags.limit) || 50).lean();
    if (!events.length) return console.log("Nothing suspicious logged.");
    console.table(events.map((e) => ({ when: fmt(e.createdAt), wallet: e.wallet, type: e.type, message: e.message, ip: e.ip })));
  },

  // Wallets with the most suspicious events recently: a starting point for ban decisions.
  async top() {
    const since = new Date(Date.now() - (days || 30) * 86_400_000);
    const rows = await SuspiciousActivity.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$wallet", events: { $sum: 1 }, types: { $addToSet: "$type" }, last: { $max: "$createdAt" } } },
      { $sort: { events: -1 } },
      { $limit: 25 },
    ]);
    if (!rows.length) return console.log("Nothing suspicious logged in that window.");
    const banned = new Set((await Blocklist.find({ wallet: { $in: rows.map((r) => r._id) } }).lean()).map((b) => b.wallet));
    console.table(rows.map((r) => ({ wallet: r._id, events: r.events, types: r.types.join(", "), last: fmt(r.last), banned: banned.has(r._id) })));
  },
};

await connectDB();
try {
  await commands[command]();
} finally {
  await mongoose.disconnect();
}
