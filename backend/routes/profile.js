import express from "express";
import { ethers } from "ethers";
import UserProfile from "../models/UserProfile.js";
import { nft } from "../services/nft.js";
import { mongoNftStore } from "../services/nftStore.js";
import { MOTO_RUSH, VENOM_NFT } from "../config/constants.js";

const router = express.Router();

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

    // NFTs come from the indexer's database, not the chain, so this stays fast. The occasional
    // on-chain double check runs in the background (at most every few minutes per wallet).
    nft.reconcileWallet(walletLower).catch((err) => console.error("[nft] reconcile failed:", err.message));
    const { holdings, multiplier, pendingMultiplier } = await nft.walletNfts(walletLower);

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

    await UserProfile.updateOne({ wallet: walletLower }, { $set: { rank: globalRank } });
    await mongoNftStore.saveProfileCache(walletLower, holdings, multiplier);

    const holdsVenom = holdings.some((h) => h.contractAddress === VENOM_NFT.toLowerCase());
    const motoRushVenomMultiplier = holdsVenom
      ? Number(Math.min(multiplier + MOTO_RUSH.VENOM_BONUS, MOTO_RUSH.MAX_MULTIPLIER).toFixed(2))
      : null;

    return res.json({
      wallet: user.wallet,
      points: user.points,
      nftHoldings: holdings, // each with `active` and `countsFrom`: NFTs count after a hold period
      multiplier,
      pendingMultiplier,
      motoRushVenomMultiplier,
      completedTasks: user.completedTasks || [],
      rank: globalRank,
      lastSyncedAt: new Date(),
      createdAt: user.createdAt
    });

  } catch (error) {
    console.error(`❌ Critical runtime crash encountered inside Profile Pipeline lookup:`, error);
    return res.status(500).json({ error: "Internal service transactional data reading pipeline trace exception" });
  }
});

export default router;
