import mongoose from "mongoose";

const eventProfileSchema = new mongoose.Schema({
  wallet: { type: String, required: true, unique: true, lowercase: true },
  points: { type: Number, default: 0 },
  lastSyncedAt: { type: Date, default: Date.now }
});

export default mongoose.model("EventProfile", eventProfileSchema);