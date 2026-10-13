import mongoose from "mongoose";

// An NFT collection that boosts HP. Changes are picked up by the indexer on its next pass; a new
// collection is backfilled from `startBlock`, so set it to the contract's deploy block.
const collectionConfigSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true, lowercase: true, index: true },
  name: { type: String, required: true },
  multiplier: { type: Number, required: true, default: 1.0 }, // 1.25 adds +0.25 per NFT held
  startBlock: { type: Number, default: 0 },
  imageUrl: { type: String },
  emoji: { type: String },
  color: { type: String },
}, { timestamps: true });

export default mongoose.model("CollectionConfig", collectionConfigSchema);
