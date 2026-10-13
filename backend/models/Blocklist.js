import mongoose from "mongoose";

// Banned wallets. A wallet listed here can't play any game or earn HP (see services/moderation.js),
// and the site shows it a "You are banned" screen. Leave `expiresAt` empty for a permanent ban.
// Manage it with `node backend/scripts/blocklist.js`, or edit the "blocklist" collection directly.
const blocklistSchema = new mongoose.Schema(
  {
    wallet: { type: String, required: true, unique: true, lowercase: true, trim: true },
    reason: { type: String, default: "Breaking the HairGames rules" }, // shown to the player
    notes: { type: String }, // internal, never shown
    bannedBy: { type: String },
    expiresAt: { type: Date, default: null }, // null = permanent
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model("Blocklist", blocklistSchema, "blocklist");
