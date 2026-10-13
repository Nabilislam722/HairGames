import mongoose from "mongoose";

// Where an indexer has read up to, so a restart continues from there. `caughtUp` turns true the
// first time it reaches the chain head (the end of a collection's backfill) and stays true.
const indexerStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // e.g. "nft:0xabc…"
    lastBlock: { type: Number, required: true },
    caughtUp: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model("IndexerState", indexerStateSchema);
