import mongoose from "mongoose";

// The daily tasks drawn for one UTC day, and the Bitcoin block (read through hBK) whose hash seeded the
// draw. `candidates` lists every task that could have been picked, so anyone can redo the draw. The tasks
// are copied in as a record of the draw: the API shows each task as it is now in `dailytasks`, and uses the
// copy only if the task was edited into something unusable.
const drawnTaskSchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, required: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  reward: { type: Number, required: true },
  game: { type: String, required: true },
  playCount: { type: Number, required: true },
  boost: { type: Number, required: true },
}, { _id: false });

const dailyTaskDrawSchema = new mongoose.Schema({
  day: { type: String, required: true, unique: true }, // UTC date, e.g. "2026-11-24"
  btcHeight: { type: Number, required: true },
  btcHash: { type: String, required: true },
  candidates: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  tasks: { type: [drawnTaskSchema], default: [] },
}, { timestamps: true, versionKey: false });

export default mongoose.model("DailyTaskDraw", dailyTaskDrawSchema);
