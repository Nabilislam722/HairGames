import express from "express";
import { ethers } from "ethers";
import UserProfile from "../models/UserProfile.js";
import CollectionConfig from "../models/CollectionConfig.js";
import { syncWalletNFTs } from "../services/nftWatcher.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────
// On-chain NFT holder multiplier
// Flat bonus check against ONE specific contract: 0 held -> 1.0, 1+ held ->
// NFT_HOLDER_MULTIPLIER. Independent from the per-collection multiplier
// nftWatcher.js computes from CollectionConfig — see note where this is used.
// ─────────────────────────────────────────────────────────────────────────
const HEMI_RPC_URL = "https://rpc.hemi.network/rpc";
const provider = new ethers.JsonRpcProvider(HEMI_RPC_URL);

const NFT_CONTRACT_ADDRESS = "0x21d494D2f708D418d58908b48b3E80d8e08A8533";
const NFT_HOLDER_MULTIPLIER = 1.5;

const NFT_BALANCE_ABI = [
  "function balanceOf(address owner) view returns (uint256)"
];

const nftContract = ethers.isAddress(NFT_CONTRACT_ADDRESS)
  ? new ethers.Contract(NFT_CONTRACT_ADDRESS, NFT_BALANCE_ABI, provider)
  : null;

async function getMultiplierForWallet(walletAddress) {
  if (!nftContract) {
    console.warn("⚠️ NFT_CONTRACT_ADDRESS not configured — multiplier defaulting to 1.0");
    return 1.0;
  }
  try {
    const balance = await nftContract.balanceOf(walletAddress);
    return balance > 0n ? NFT_HOLDER_MULTIPLIER : 1.0;
  } catch (err) {
    console.error("⚠️ balanceOf lookup failed, defaulting multiplier to 1.0:", err);
    return 1.0;
  }
}

/**
 * @route   GET /api/profile/:wallet
 * @desc    Fetch profile metadata arrays, on-chain NFT-holding multiplier, and dynamic live ranking positions
 * @access  Public
 */
router.get("/:wallet", async (req, res) => {
  const { wallet } = req.params;

  // 1. Structural Sanity Guard Input Validation
  if (!wallet || !ethers.isAddress(wallet)) {
    return res.status(400).json({ error: "A valid cryptography address mapping configuration target parameter is required" });
  }

  try {
    const walletLower = wallet.toLowerCase();

    // 2. Make sure a profile document exists BEFORE syncing. syncWalletNFTs
    // (services/nftWatcher.js) silently no-ops on any wallet it can't find
    // in Mongo, so without this upsert a brand-new wallet's first profile
    // view would never get its holdings populated at all.
    await UserProfile.findOneAndUpdate(
      { wallet: walletLower },
      { $set: { wallet: walletLower }, $setOnInsert: { points: 0, nftHoldings: [], completedTasks: [] } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    // 3. On-demand sync: reconciles nftHoldings against current chain state
    // on every profile view. Previously this only ever ran at server boot
    // (runStartupSanityCheck) or on live Transfer events — both of which
    // miss a wallet whose NFT was acquired, or whose profile document
    // didn't exist yet, before the watcher last started. This is what was
    // actually leaving holdings empty.
    try {
      const allowedCollections = await CollectionConfig.find({}).lean();
      await syncWalletNFTs(walletLower, provider, allowedCollections);
    } catch (syncErr) {
      // Don't let an RPC hiccup take the whole profile fetch down — fall
      // back to whatever's already cached from the last successful sync.
      console.error("⚠️  On-demand NFT sync failed, serving cached holdings:", syncErr.message);
    }

    // 4. Re-fetch — syncWalletNFTs writes directly to Mongo, so anything
    // read before it ran is stale.
    const user = await UserProfile.findOne({ wallet: walletLower });

    // 5. Fetch current points value to build high-performance dynamic rank scoring indexing
    const userPoints = user ? (user.points || 0) : 0;

    // Efficiently count how many users have more points than this specific wallet address
    const globalRank = await UserProfile.countDocuments({ points: { $gt: userPoints } }) + 1;

    // 6. Multiplier comes from the live on-chain balanceOf check, not the DB
    const multiplier = await getMultiplierForWallet(walletLower);

    // 7. Fallback Provision: shouldn't trigger given the upsert above, kept as a defensive guard
    if (!user) {
      return res.json({
        wallet: walletLower,
        points: 0,
        nftHoldings: [],
        multiplier,
        completedTasks: [],
        rank: globalRank,
        isNewUser: true
      });
    }

    // 8. Secure Database Write-Back Process: Persist the freshly computed global placement rank metric
    await UserProfile.updateOne(
      { wallet: walletLower },
      { $set: { rank: globalRank } }
    );

    // 9. Clean, Sanitized and Structured Production Response Object Payload Delivery
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