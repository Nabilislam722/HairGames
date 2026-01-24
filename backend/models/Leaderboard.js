import mongoose from "mongoose";

const leaderboardSchema = new mongoose.Schema({
  wallet: { type: String, required: true, unique: true },
  points: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Leaderboard", leaderboardSchema);
