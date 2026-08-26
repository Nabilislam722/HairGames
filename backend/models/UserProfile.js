import mongoose from "mongoose";

const nftHoldingSchema = new mongoose.Schema({
  contractAddress: { type: String, required: true, lowercase: true },
  tokenId: { type: Number, required: true },
  name: { type: String, required: true },
  collectionName: { type: String, required: true },
  emoji: { type: String, default: "🔮" },
  color: { type: String, default: "#a78bfa" }
}, { _id: false });

const userProfileSchema = new mongoose.Schema({
  wallet: { type: String, required: true, unique: true, lowercase: true },
  points: { type: Number, default: 0 },
  processedHashes: { type: [String], default: [], index: true },
  completedTasks: { type: [String], default: [] },
  nftHoldings: { type: [nftHoldingSchema], default: [] },
  multiplier: { type: Number, default: 1.0 },
  voteDay: { type: Number, default: 0 },
  votesToday: { type: Number, default: 0 },
  lastSyncedAt: { type: Date, default: Date.now },

  rank: { type: Number }
}, { timestamps: true });

export default mongoose.model("UserProfile", userProfileSchema);