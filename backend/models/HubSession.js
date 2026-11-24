import mongoose from "mongoose";

// The server's side of one run of a hub game. It's opened from the run's startRun transaction, even while
// that's pending, with what the game needs (a level, or a CPU opponent and its seed). It's verified once the
// player's recorded inputs replay to a finished run; `runId` and `startedAt` come from the mined start.
const hubSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  startTxHash: { type: String, required: true, unique: true, lowercase: true },
  wallet: { type: String, required: true, lowercase: true, index: true },
  gameId: { type: String, required: true },
  params: { type: mongoose.Schema.Types.Mixed, default: {} }, // e.g. { levelId } or { difficulty, p1, p2, seed }
  status: { type: String, enum: ["open", "verified", "rejected"], default: "open" },
  result: { type: mongoose.Schema.Types.Mixed }, // { score, details, playedSeconds, ... } once verified
  runId: { type: String, index: true },
  startedAt: { type: Date },
  sender: { type: String, lowercase: true },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 6 * 60 * 60 * 1000) },
});
hubSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VERIFIED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export default mongoose.model("HubSession", hubSessionSchema);
