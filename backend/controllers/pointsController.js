import { ethers } from "ethers";
import UserProfile from "../models/UserProfile.js";
import EventProfile from "../models/EventProfile.js";
import { 
  ECOSYSTEM_CONTRACTS, 
  GENERIC_GAME_ABI, 
  GAME_CONFIG, 
  SUBMIT_LEVEL_SCORE_SELECTOR 
} from "../config/constants.js";
import { provider, getServerWallet } from "../config/provider.js";
import { findLevelCleared } from "../services/candyCascade.js";
import { nft } from "../services/nft.js";
import { logSuspicious } from "../services/moderation.js";

// Helper function to sign the verification payload
async function generateCryptoSignature(level, kills, points, nonce, walletAddress, targetAddress, chainId) {
  const serverWallet = getServerWallet();
  const messageHash = ethers.solidityPackedKeccak256(
    ["address", "uint256", "uint256", "uint256", "uint256", "address", "uint256"],
    [walletAddress, BigInt(level), BigInt(kills), BigInt(points), BigInt(nonce), targetAddress, BigInt(chainId)]
  );
  return await serverWallet.signMessage(ethers.getBytes(messageHash));
}

/**
 * POST /api/points/verify
 */
export const verifyPoints = async (req, res) => {
  try {
    const { wallet, level = 1, kills = 0, livesRemaining = 0, gameId = "default_legacy" } = req.body;
    if (!wallet) return res.status(400).json({ error: "Wallet address is required" });

    let points = 0;
    if (gameId === "space_huggers") {
      points = Math.min(Math.round((Number(kills) * 30) + (Number(livesRemaining) * 100)), 65535) || 0;
    } else {
      points = Number(req.body.score) || 0;
    }

    const targetAddress = ECOSYSTEM_CONTRACTS[gameId] || ECOSYSTEM_CONTRACTS["default_legacy"];
    const gameContract = new ethers.Contract(targetAddress, GENERIC_GAME_ABI, provider);

    const nonce = await gameContract.userNonces(wallet);
    const network = await provider.getNetwork();
    const chainId = network.chainId;

    const signature = await generateCryptoSignature(
      Number(level),
      Number(kills),
      points,
      nonce,
      wallet,
      targetAddress,
      chainId
    );

    res.json({
      nonce: nonce.toString(),
      signature: signature,
      points: points
    });
  } catch (error) {
    console.error("Verification Endpoint error:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/points/add
 */
export const addPoints = async (req, res) => {
  const { wallet, txHash, score, gameId } = req.body;

  try {
    if (!wallet || !txHash) {
      return res.status(400).json({ error: 'Missing wallet or txHash' });
    }

    let pointsRequested = 0;
    if (gameId !== "racing_game") {
      pointsRequested = parseInt(score, 10);
      if (!Number.isFinite(pointsRequested) || pointsRequested < 0) {
        return res.status(400).json({ error: 'Invalid score value' });
      }
    }

    const alreadyProcessed = await UserProfile.findOne({ processedHashes: txHash });
    if (alreadyProcessed) {
      return res.status(400).json({ error: 'Transaction already processed' });
    }

    const receipt = await provider.waitForTransaction(txHash);
    if (!receipt || receipt.status !== 1) {
      return res.status(400).json({ error: 'Transaction failed or not found' });
    }

    const targetAddress = ECOSYSTEM_CONTRACTS[gameId] || ECOSYSTEM_CONTRACTS["default_legacy"];
    if (receipt.to.toLowerCase() !== targetAddress.toLowerCase()) {
      return res.status(400).json({ error: 'Transaction not sent to game contract' });
    }

    // Transactions are public: without this, anyone could claim another player's unprocessed tx.
    if (receipt.from.toLowerCase() !== wallet.toLowerCase()) {
      logSuspicious(req, wallet, "claimed_foreign_tx", "Tried to claim HP for a transaction another wallet sent", {
        txHash, gameId, sender: receipt.from,
      });
      return res.status(400).json({ error: 'Transaction was not sent by this wallet' });
    }

    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return res.status(400).json({ error: 'Transaction not found' });
    }

    const inputData = tx.data;
    let onChainScore;
    const abiCoder = new ethers.AbiCoder();

    if (gameId === "racing_game") {
      const RACING_SELECTOR = ethers.id("submitRaceResult(uint256,uint256,bytes)").slice(0, 10);
      if (!inputData.startsWith(RACING_SELECTOR)) {
        return res.status(400).json({ error: 'Transaction did not call submitRaceResult' });
      }
      const decodedData = abiCoder.decode(['uint256', 'uint256', 'bytes'], '0x' + inputData.slice(10));
      const timeTakenMs = Number(decodedData[0]);
      const timeTakenSeconds = Math.floor(timeTakenMs / 1000);
      onChainScore = Math.max(0, GAME_CONFIG.RACE_INITIAL_POINTS - (timeTakenSeconds * GAME_CONFIG.RACE_POINTS_DECREMENT_PER_SECOND));
    
    } else if (gameId === "fishing_party") {
      const FISHING_SELECTOR = ethers.id("submitGameResult(uint256,uint256,uint256,bytes)").slice(0, 10);
      if (!inputData.startsWith(FISHING_SELECTOR)) {
        return res.status(400).json({ error: 'Transaction did not call submitGameResult' });
      }
      const decodedData = abiCoder.decode(['uint256', 'uint256', 'uint256', 'bytes'], '0x' + inputData.slice(10));
      onChainScore = Number(decodedData[0]);

    } else if (gameId === "fruit_ninja") {
      const FRUIT_NINJA_SELECTOR = ethers.id("submitGameResult(uint256,uint256,uint256,uint256,bytes)").slice(0, 10);
      if (!inputData.startsWith(FRUIT_NINJA_SELECTOR)) {
        return res.status(400).json({ error: 'Transaction did not call submitGameResult' });
      }
      const decodedData = abiCoder.decode(['uint256', 'uint256', 'uint256', 'uint256', 'bytes'], '0x' + inputData.slice(10));
      onChainScore = Number(decodedData[0]);

    } else if (gameId === "proof_of_patience") {
      // submitScore(uint256 score, uint256 survivalSeconds, uint256 answered,
      // uint256 shots, uint256 hits, uint256 nonce, bytes signature) — score
      // is the first param. A zero-score forfeit tx (clearing a stuck
      // session) decodes and credits fine here too, at zero points — no
      // special-casing needed.
      const POP_SELECTOR = ethers
        .id("submitScore(uint256,uint256,uint256,uint256,uint256,uint256,bytes)")
        .slice(0, 10);
      if (!inputData.startsWith(POP_SELECTOR)) {
        return res.status(400).json({ error: 'Transaction did not call submitScore' });
      }
      const decodedData = abiCoder.decode(
        ['uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes'],
        '0x' + inputData.slice(10)
      );
      onChainScore = Number(decodedData[0]);

    } else if (gameId === "space_huggers") {
      if (!inputData.startsWith(SUBMIT_LEVEL_SCORE_SELECTOR)) {
        return res.status(400).json({ error: 'Transaction did not call submitLevelScore' });
      }
      const decodedData = abiCoder.decode(['uint256', 'uint256', 'uint256', 'uint256', 'bytes'], '0x' + inputData.slice(10));
      onChainScore = Number(decodedData[2]);

    } else if (gameId === "candy_cascade") {
      // HP pays for beating your best on a level, read from the contract's own event: replays that
      // don't improve earn nothing, and lifetime HP is capped by the sum of best scores.
      const cleared = findLevelCleared(receipt, targetAddress);
      if (!cleared) {
        return res.status(400).json({ error: 'Transaction did not clear a Candy Cascade level' });
      }
      if (cleared.player.toLowerCase() !== wallet.toLowerCase()) {
        logSuspicious(req, wallet, "claimed_foreign_level", "Tried to claim HP for a Candy Cascade level another wallet cleared", {
          txHash, player: cleared.player,
        });
        return res.status(400).json({ error: 'Level was cleared by a different wallet' });
      }
      onChainScore = Math.max(0, Number(cleared.score) - Number(cleared.previousBest));

    } else {
      const SELECTOR_16 = ethers.id("submitGuess(uint16)").slice(0, 10);
      const SELECTOR_256 = ethers.id("submitGuess(uint256)").slice(0, 10);

      if (inputData.startsWith(SELECTOR_16)) {
        const decodedData = abiCoder.decode(['uint16'], '0x' + inputData.slice(10));
        onChainScore = Number(decodedData[0]);
      } else if (inputData.startsWith(SELECTOR_256)) {
        const decodedData = abiCoder.decode(['uint256'], '0x' + inputData.slice(10));
        onChainScore = Number(decodedData[0]);
      } else {
        return res.status(400).json({ error: 'Transaction did not call submitGuess' });
      }
    }

    if (gameId !== "racing_game" && gameId !== "candy_cascade" && onChainScore !== pointsRequested) {
      logSuspicious(req, wallet, "score_mismatch", "Claimed a different score than the transaction recorded", {
        txHash, gameId, onChainScore, claimed: pointsRequested,
      });
      return res.status(400).json({ error: `Score mismatch: on-chain=${onChainScore}, claimed=${pointsRequested}` });
    }

    const walletLower = wallet.toLowerCase();
    // Fresh from the NFT index: only NFTs held past the hold period count, so passing one NFT
    // between wallets can't boost each of them.
    const userMultiplier = await nft.walletMultiplier(walletLower);
    const pointsToAdd = Math.round(onChainScore * userMultiplier);

    const user = await UserProfile.findOneAndUpdate(
      { wallet: walletLower },
      {
        $inc: { points: pointsToAdd },
        $push: { processedHashes: txHash },
        $set: { lastSyncedAt: new Date() },
      },
      { upsert: true, new: true }
    );

    await EventProfile.findOneAndUpdate(
      { wallet: walletLower },
      {
        $inc: { points: pointsToAdd },
        $set: { lastSyncedAt: new Date() }
      },
      { upsert: true }
    );

    return res.json({
      wallet: user.wallet,
      points: user.points,
      baseScore: onChainScore,
      multiplierApplied: userMultiplier,
      added: pointsToAdd,
      txHash,
    });
  } catch (err) {
    console.error('/api/points/add error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/points/get
 */
export const getPoints = async (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: "Wallet required" });

  try {
    const user = await UserProfile.findOne({ wallet: wallet.toLowerCase() });
    res.json({
      wallet: wallet.toLowerCase(),
      points: user ? user.points : 0,
      tasks: user ? user.completedTasks : []
    });
  } catch (error) {
    console.error("getPoints error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/points/claim
 */
export const claimTask = async (req, res) => {
  const { wallet, task } = req.body;
  const walletLower = wallet?.toLowerCase();

  if (!walletLower || (task !== 'twitter_follow' && task !== 'hairy_person' && task !== 'hairy_holder' && task !== 'hair_discord')) {
    return res.status(400).json({ error: "Invalid claim request" });
  }

  try {
    let user = await UserProfile.findOne({ wallet: walletLower });
    if (user && user.completedTasks && user.completedTasks.includes(task)) {
      return res.status(400).json({ error: "Task already completed", alreadyDone: true });
    }

    const updatedUser = await UserProfile.findOneAndUpdate(
      { wallet: walletLower, completedTasks: { $ne: task } },
      {
        $inc: { points: 100 },
        $addToSet: { completedTasks: task },
        $set: { lastSyncedAt: new Date() }
      },
      { upsert: true, new: true }
    );

    if (!updatedUser) return res.status(400).json({ error: "Task already processed" });

    res.json({ 
      success: true, 
      newTotal: updatedUser.points, 
      tasks: updatedUser.completedTasks 
    });
  } catch (err) {
    console.error("Claim Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};