import mongoose from "mongoose";

// A daily task, added by hand in MongoDB (the `dailytasks` collection). Every UTC day the backend draws
// DAILY_TASKS.COUNT of the active ones (services/dailyTasks.js). Tasks inserted straight into MongoDB skip
// this schema, so the draw checks each one again before using it.
const dailyTaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: "" },
  reward: { type: Number, required: true, min: 1 }, // HP paid when the task is claimed
  game: { type: String, default: "any" }, // a gameId from ECOSYSTEM_CONTRACTS, or "any" for any game
  playCount: { type: Number, required: true, min: 1 }, // plays of that game needed in the day
  boost: { type: Number, default: 1, min: 1 }, // draw weight: 3 is three times as likely; above 1 shows as Boosted
  active: { type: Boolean, default: true }, // false keeps it out of the next draws
}, { timestamps: true, versionKey: false });

export default mongoose.model("DailyTask", dailyTaskSchema);
