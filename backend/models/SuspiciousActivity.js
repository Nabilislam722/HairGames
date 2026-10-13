import mongoose from "mongoose";

// Things the backend caught that look like cheating: faked scores, tampered moves, claiming someone
// else's transaction, and so on. It's a review list for deciding bans; nothing here bans anyone.
// Entries are deleted after 180 days.
const suspiciousActivitySchema = new mongoose.Schema(
  {
    wallet: { type: String, lowercase: true, index: true },
    type: { type: String, required: true, index: true }, // e.g. "candy_tampered_moves"
    message: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
    route: { type: String },
    createdAt: { type: Date, default: Date.now, expires: 180 * 24 * 60 * 60 },
  },
  { versionKey: false }
);

export default mongoose.model("SuspiciousActivity", suspiciousActivitySchema);
