import mongoose from "mongoose";

// A valid checkpoint: sent by the run's player, or by a session key that was playing for them then.
// `id` is "block:logIndex", so reading the same log twice adds it once.
const checkpointSchema = new mongoose.Schema({
  id: { type: String, required: true },
  at: { type: Date, required: true },
  by: { type: String, required: true, lowercase: true },
  hash: { type: String, required: true },
}, { _id: false });

// One run on HairGames Hub V2, written by the hub indexer (and as soon as the player reports a save):
// who played which game, its valid checkpoints, the verified result once saved, and the playtime that
// earned. Only saved runs count toward plays and playtime.
const hubRunSchema = new mongoose.Schema({
  _id: { type: String }, // the hub's runId
  player: { type: String, required: true, lowercase: true },
  gameId: { type: String, required: true },
  game: { type: Number, required: true },
  params: { type: String },
  sender: { type: String, lowercase: true }, // who sent startRun: the wallet or its session key
  startTx: { type: String }, // the startRun transaction
  startedAt: { type: Date, required: true },
  status: { type: String, enum: ["open", "saved"], default: "open" },
  savedAt: { type: Date },
  saveTx: { type: String },
  score: { type: Number },
  details: { type: String },
  result: { type: mongoose.Schema.Types.Mixed }, // `details` decoded, e.g. { level, timeMs, stars, bike }
  playedSeconds: { type: Number, default: 0 }, // the replayed length, from the server's verification
  checkpoints: { type: [checkpointSchema], default: [] },
  activeByDay: { type: Map, of: Number, default: {} }, // seconds of verified play per UTC day
}, { timestamps: true, versionKey: false });

hubRunSchema.index({ player: 1, status: 1, savedAt: 1 });
hubRunSchema.index({ player: 1, startedAt: -1 }); // a wallet's recent runs

export default mongoose.model("HubRun", hubRunSchema);
