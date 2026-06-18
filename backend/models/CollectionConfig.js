import mongoose from "mongoose";

const collectionConfigSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true, lowercase: true, index: true },
  name: { type: String, required: true },
  multiplier: { type: Number, required: true, default: 1.0 }
}, { timestamps: true });

export default mongoose.model("CollectionConfig", collectionConfigSchema);