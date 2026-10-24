import mongoose from "mongoose";

// One document per transaction that has paid out HP. _id is the lowercase tx hash, and MongoDB always
// keeps _id unique, so a transaction can be claimed only once, however many requests race for it.
// It doubles as the payout ledger: what each transaction paid and when, e.g. a wallet's HP in the
// last hour is a sum over its documents since then.
const processedTxSchema = new mongoose.Schema({
  _id: { type: String },
  wallet: { type: String, required: true, lowercase: true, index: true },
  gameId: { type: String, required: true },
  baseHp: { type: Number, required: true }, // what the transaction scored
  hp: { type: Number, required: true }, // what was paid, after the NFT multiplier
  multiplier: { type: Number, required: true },
}, { timestamps: true, versionKey: false });

export default mongoose.model("ProcessedTx", processedTxSchema);
