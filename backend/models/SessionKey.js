import mongoose from "mongoose";

// A session key from the HairGames session registry, with the times it was live for its wallet: each
// open or renewal adds an interval, and closing, revoking or revokeAll cuts the live one short. The hub
// indexer uses it to tell whether a checkpoint's sender was playing for the run's player at that moment.
const sessionKeySchema = new mongoose.Schema({
  _id: { type: String }, // the key's address, lowercase
  owner: { type: String, required: true, lowercase: true, index: true },
  intervals: {
    type: [new mongoose.Schema({ from: { type: Date, required: true }, to: { type: Date, required: true } }, { _id: false })],
    default: [],
  },
}, { timestamps: true, versionKey: false });

export default mongoose.model("SessionKey", sessionKeySchema);
