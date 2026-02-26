import mongoose from "mongoose";

const leaderboardSchema = new mongoose.Schema({
  wallet: { type: String, required: true, unique: true, lowercase: true },
  points: { type: Number, default: 0 },
  processedHashes: { type: [String], default: [], index: true },
  completedTasks: { type: [String], default: [] }, 
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Leaderboard", leaderboardSchema);