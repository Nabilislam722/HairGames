import mongoose from "mongoose";

const motoSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  startTxHash: { type: String, required: true, unique: true, lowercase: true },
  wallet: { type: String, required: true, lowercase: true, index: true },
  levelId: { type: Number, required: true },
  status: { type: String, enum: ["open", "verified", "rejected"], default: "open" },
  bike: { type: Number },
  venomBonus: { type: Boolean, default: false },
  timeMs: { type: Number },
  stars: { type: Number },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 6 * 60 * 60 * 1000) },
});
motoSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VERIFIED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export default mongoose.model("MotoSession", motoSessionSchema);
