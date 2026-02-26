import { index } from "drizzle-orm/mysql-core";
import mongoose from "mongoose";
import { type } from "os";

const leaderboardSchema = new mongoose.Schema({
  wallet: { type: String, required: true, unique: true, lowercase: true },
  points: { type: Number, default: 0 },
  processedHashes: {type: [String], default: [], index: true},
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Leaderboard", leaderboardSchema);
