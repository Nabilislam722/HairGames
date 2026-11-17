import mongoose from "mongoose";

// One Pixel Fighters match: opened when its start transaction is checked, with the CPU the server
// chose, and verified once the player's recorded inputs replay to a finished match.
const pixelFighterSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  startTxHash: { type: String, required: true, unique: true, lowercase: true },
  wallet: { type: String, required: true, lowercase: true, index: true },
  difficulty: { type: Number, required: true },
  p1: { type: String, required: true },
  p2: { type: String, required: true },
  seed: { type: Number, required: true },
  status: { type: String, enum: ["open", "verified", "rejected"], default: "open" },
  score: { type: Number },
  won: { type: Boolean },
  durationMs: { type: Number },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 6 * 60 * 60 * 1000) },
});
pixelFighterSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VERIFIED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export default mongoose.model("PixelFighterSession", pixelFighterSessionSchema);
