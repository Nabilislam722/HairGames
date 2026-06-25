import express from "express";
import { ethers } from "ethers";
import UserProfile from "../models/UserProfile.js";
import CollectionConfig from "../models/CollectionConfig.js";
import { syncWalletNFTs } from "../services/nftWatcher.js";

const router = express.Router();

const HEMI_RPC_URL = "https://rpc.hemi.network/rpc";
const provider = new ethers.JsonRpcProvider(HEMI_RPC_URL);

/**
 * @route   GET /api/profile/:wallet
 */
router.get("/:wallet", async (req, res) => {
  const { wallet } = req.params;

  if (!wallet || !ethers.isAddress(wallet)) {
    return res.status(400).json({ error: "A valid cryptography address mapping configuration target parameter is required" });
  }

  try {
    const walletLower = wallet.toLowerCase();

    const allowedCollections = await CollectionConfig.find({}).lean();

    try {
      await syncWalletNFTs(walletLower, provider, allowedCollections);
    } catch (syncErr) {
      console.error("⚠️  On-demand NFT sync failed, serving cached holdings:", syncErr.message);
    }

    let user = await UserProfile.findOne({ wallet: walletLower });

    if (!user) {
      user = await UserProfile.findOneAndUpdate(
        { wallet: walletLower },
        { $set: { wallet: walletLower }, $setOnInsert: { points: 0, nftHoldings: [], completedTasks: [] } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const userPoints = user.points || 0;
    const globalRank = await UserProfile.countDocuments({ points: { $gt: userPoints } }) + 1;

    // Read multiplier from DB — already computed correctly by syncWalletNFTs
    // from CollectionConfig. Do NOT re-derive here; that would overwrite the
    // per-collection multiplier with a single hardcoded contract check.
    const multiplier = user.multiplier ?? 1.0;

    await UserProfile.updateOne(
      { wallet: walletLower },
      { $set: { rank: globalRank } }
    );

    return res.json({
      wallet: user.wallet,
      points: user.points,
      nftHoldings: user.nftHoldings || [],
      multiplier,
      completedTasks: user.completedTasks || [],
      rank: globalRank,
      lastSyncedAt: user.lastSyncedAt,
      createdAt: user.createdAt
    });

  } catch (error) {
    console.error(`❌ Critical runtime crash encountered inside Profile Pipeline lookup:`, error);
    return res.status(500).json({ error: "Internal service transactional data reading pipeline trace exception" });
  }
});

export default router;