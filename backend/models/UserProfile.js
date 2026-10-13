import mongoose from "mongoose";

// A cached copy of the wallet's NFTs from the indexer (services/nftIndexer.js), which is the source
// of truth; `countsFrom` is when the NFT starts counting toward the multiplier.
const nftHoldingSchema = new mongoose.Schema({
  contractAddress: { type: String, required: true, lowercase: true },
  tokenId: { type: String, required: true },
  name: { type: String, required: true },
  collectionName: { type: String, required: true },
  emoji: { type: String, default: "🔮" },
  color: { type: String, default: "#a78bfa" },
  countsFrom: { type: Date }
}, { _id: false });

const userProfileSchema = new mongoose.Schema({
  wallet: { type: String, required: true, unique: true, lowercase: true },
  points: { type: Number, default: 0, index: true }, // indexed for the rank count
  processedHashes: { type: [String], default: [], index: true },
  completedTasks: { type: [String], default: [] },
  nftHoldings: { type: [nftHoldingSchema], default: [] },
  multiplier: { type: Number, default: 1.0 },
  social: [{ platform: { type: String, enum: ["twitter", "discord"], required: true }, handle: { type: String, required: true }, connectedAt: { type: Date, default: Date.now }}],
  voteDay: { type: Number, default: 0 },
  votesToday: { type: Number, default: 0 },
  lastSyncedAt: { type: Date, default: Date.now },
  rank: { type: Number }
}, { timestamps: true });

export default mongoose.model("UserProfile", userProfileSchema);