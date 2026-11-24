import mongoose from "mongoose";

// A player's progress in a hub level game, written only from saved runs, whose results the server signed.
//  - Moto Rush: levels are completed in order, each once, with the result of the run that completed it.
//  - Candy Cascade: the best stars and score on every cleared level. Levels open in order, and any level
//    without 3 stars can be played again for more.
const hubProgressSchema = new mongoose.Schema({
  wallet: { type: String, required: true, lowercase: true },
  gameId: { type: String, required: true },
  completed: { type: Number, default: 0 }, // the highest level completed; the next one is completed + 1
  totalStars: { type: Number, default: 0 },
  levels: {
    type: [new mongoose.Schema({
      level: { type: Number, required: true },
      stars: { type: Number, required: true },
      timeMs: { type: Number }, // Moto Rush
      score: { type: Number }, // Candy Cascade: the best score on the level
      runId: { type: String, required: true }, // the run that earned the stars
    }, { _id: false })],
    default: [],
  },
}, { timestamps: true, versionKey: false });

hubProgressSchema.index({ wallet: 1, gameId: 1 }, { unique: true });

export default mongoose.model("HubProgress", hubProgressSchema);
