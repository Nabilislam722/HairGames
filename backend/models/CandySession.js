import mongoose from "mongoose";

// One Candy Cascade level attempt, tied to the startLevel transaction that opened it. The server
// picks the seed, so the board can be replayed from the player's moves; each start transaction gets
// exactly one seed, and a session gets at most one verified result.
const candySessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true }, // 0x-prefixed bytes32
  startTxHash: { type: String, required: true, unique: true, lowercase: true },
  wallet: { type: String, required: true, lowercase: true, index: true },
  levelId: { type: Number, required: true },
  seed: { type: Number, required: true },
  status: { type: String, enum: ["open", "verified", "rejected"], default: "open" },
  score: { type: Number },
  stars: { type: Number },
  createdAt: { type: Date, default: Date.now, expires: 6 * 60 * 60 },
});

export default mongoose.model("CandySession", candySessionSchema);
