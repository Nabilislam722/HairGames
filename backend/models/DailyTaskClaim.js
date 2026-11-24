import mongoose from "mongoose";

// One document per daily task a wallet has claimed. The unique index makes each task claimable once a day,
// however many requests race for it.
const dailyTaskClaimSchema = new mongoose.Schema({
  wallet: { type: String, required: true, lowercase: true },
  day: { type: String, required: true }, // UTC date, as in DailyTaskDraw
  taskId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reward: { type: Number, required: true }, // the HP paid: baseReward × multiplier
  baseReward: { type: Number }, // the task's reward
  multiplier: { type: Number }, // the wallet's NFT multiplier for the task's game when it claimed
}, { timestamps: true, versionKey: false });

dailyTaskClaimSchema.index({ wallet: 1, day: 1, taskId: 1 }, { unique: true });

export default mongoose.model("DailyTaskClaim", dailyTaskClaimSchema);
