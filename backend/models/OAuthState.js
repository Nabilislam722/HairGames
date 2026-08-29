import mongoose from "mongoose";

const oauthStateSchema = new mongoose.Schema({
  state: { type: String, required: true, unique: true },
  wallet: { type: String, required: true },
  platform: { type: String, enum: ["twitter", "discord"], required: true },
  codeVerifier: { type: String }, 
  createdAt: { type: Date, default: Date.now, expires: 600 }, // auto-deleted after 10 minutes
});

export default mongoose.model("OAuthState", oauthStateSchema);