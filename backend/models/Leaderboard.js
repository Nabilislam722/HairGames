import mongoose from "mongoose";

const leaderboardSchema = new mongoose.Schema({
  wallet: { type: String, required: true, unique: true, lowercase: true },
  points: { type: Number, default: 0 },
  processedHashes: { type: [String], default: [], index: true }, // Kept for /api/points/add
  completedTasks: { type: [String], default: [] },               // Kept for /api/points/claim
  NftHoldings: { type: [String], default: [], index: true },     // Array of specific NFT contract addresses owned
  multiplier: { type: [String], default: [] },                    // Array of active stringified multiplier values (e.g. ["2.0", "1.25"])
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Leaderboard", leaderboardSchema);