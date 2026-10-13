import mongoose from "mongoose";

// Current owner of one NFT in a multiplier collection, as indexed from Transfer logs. `block` and
// `logIndex` locate the transfer that set it, so only a later transfer can replace it.
const nftTokenSchema = new mongoose.Schema(
  {
    contract: { type: String, required: true, lowercase: true },
    tokenId: { type: String, required: true }, // a string: token ids can exceed 2^53
    owner: { type: String, required: true, lowercase: true }, // the zero address once burned
    acquiredAt: { type: Date, required: true }, // block time of the transfer to `owner`
    block: { type: Number, required: true },
    logIndex: { type: Number, required: true },
  },
  { versionKey: false }
);

nftTokenSchema.index({ contract: 1, tokenId: 1 }, { unique: true });
nftTokenSchema.index({ owner: 1, contract: 1 });

export default mongoose.model("NftToken", nftTokenSchema);
