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

// BestGameVoting.vote(uint256) — selector only.
const VOTE_SELECTOR = ethers.id("vote(uint256)").slice(0, 10);
const VOTE_REWARD_POINTS = 5000;
const MAX_VOTES_PER_DAY = 10;
const VOTE_RESET_OFFSET_SECONDS = 60;
const SECONDS_PER_DAY = 86400;
const VOTING_CONTRACT_ADDRESS = process.env.VOTING_CONTRACTADDRESS || "0x79e42F91c7Df1ee23EEd5404748631F3472fdC4C";

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
      points = Math.min(Math.round((Number(kills) * 50) + (Number(livesRemaining) * 100)), 65535) || 0;
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

    } else if (gameId === "space_huggers") {
      if (!inputData.startsWith(SUBMIT_LEVEL_SCORE_SELECTOR)) {
        return res.status(400).json({ error: 'Transaction did not call submitLevelScore' });
      }
      const decodedData = abiCoder.decode(['uint256', 'uint256', 'uint256', 'uint256', 'bytes'], '0x' + inputData.slice(10));
      onChainScore = Number(decodedData[2]);
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

    if (gameId !== "racing_game" && onChainScore !== pointsRequested) {
      return res.status(400).json({ error: `Score mismatch: on-chain=${onChainScore}, claimed=${pointsRequested}` });
    }

    const walletLower = wallet.toLowerCase();
    const profile = await UserProfile.findOne({ wallet: walletLower });
    const userMultiplier = profile?.multiplier || 1.0;
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
 * POST /api/points/vote
 */
export const addVotePoints = async (req, res) => {
  const { wallet, txHash } = req.body;

  try {
    if (!wallet || !txHash) {
      return res.status(400).json({ error: "Missing wallet or txHash" });
    }

    const walletLower = wallet.toLowerCase();

    const alreadyProcessed = await UserProfile.findOne({ processedHashes: txHash });
    if (alreadyProcessed) {
      return res.status(400).json({ error: "Transaction already processed" });
    }

    const receipt = await provider.waitForTransaction(txHash);
    if (!receipt || receipt.status !== 1) {
      return res.status(400).json({ error: "Transaction failed or not found" });
    }
    if (receipt.to?.toLowerCase() !== VOTING_CONTRACT_ADDRESS.toLowerCase()) {
      return res.status(400).json({ error: "Transaction not sent to voting contract" });
    }

    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return res.status(400).json({ error: "Transaction not found" });
    }
    if (tx.from.toLowerCase() !== walletLower) {
      return res.status(400).json({ error: "Transaction sender does not match wallet" });
    }

    const inputData = tx.data;
    if (!inputData.startsWith(VOTE_SELECTOR)) {
      return res.status(400).json({ error: "Transaction did not call vote()" });
    }
    const abiCoder = new ethers.AbiCoder();
    const [onChainGameId] = abiCoder.decode(["uint256"], "0x" + inputData.slice(10));

    const block = await provider.getBlock(receipt.blockNumber);
    const voteDay = Math.floor(Math.max(block.timestamp - VOTE_RESET_OFFSET_SECONDS, 0) / SECONDS_PER_DAY);

    // Ensure the UserProfile exists safely without conditional upserts
    let user = await UserProfile.findOne({ wallet: walletLower });
    if (!user) {
      try {
        user = await UserProfile.findOneAndUpdate(
          { wallet: walletLower },
          { $setOnInsert: { wallet: walletLower, points: 0, votesToday: 0, voteDay: -1 } },
          { upsert: true, new: true }
        );
      } catch (e) {
        if (e.code === 11000) {
          user = await UserProfile.findOne({ wallet: walletLower });
        } else {
          throw e;
        }
      }
    }

    const userMultiplier = user?.multiplier || 1.0;
    const pointsToAdd = Math.round(VOTE_REWARD_POINTS * userMultiplier);

    let updatedUser;

    if (user.voteDay !== voteDay) {
      // Reset counter for new day
      updatedUser = await UserProfile.findOneAndUpdate(
        { wallet: walletLower },
        {
          $inc: { points: pointsToAdd },
          $push: { processedHashes: txHash },
          $set: { lastSyncedAt: new Date(), voteDay, votesToday: 1 },
        },
        { new: true }
      );
    } else {
      // Same day path: verify daily cap before updating
      if (user.votesToday >= MAX_VOTES_PER_DAY) {
        return res.status(400).json({ error: "Daily vote reward limit reached" });
      }

      updatedUser = await UserProfile.findOneAndUpdate(
        { wallet: walletLower, voteDay, votesToday: { $lt: MAX_VOTES_PER_DAY } },
        {
          $inc: { points: pointsToAdd, votesToday: 1 },
          $push: { processedHashes: txHash },
          $set: { lastSyncedAt: new Date() },
        },
        { new: true }
      );
    }

    if (!updatedUser) {
      return res.status(400).json({ error: "Daily vote reward limit reached" });
    }

    await EventProfile.findOneAndUpdate(
      { wallet: walletLower },
      {
        $inc: { points: pointsToAdd },
        $set: { lastSyncedAt: new Date() },
      },
      { upsert: true }
    );

    return res.json({
      wallet: updatedUser.wallet,
      points: updatedUser.points,
      gameId: onChainGameId.toString(),
      votesToday: updatedUser.votesToday,
      votesLeftToday: MAX_VOTES_PER_DAY - updatedUser.votesToday,
      added: pointsToAdd,
      txHash,
    });
  } catch (err) {
    console.error("/api/points/vote error:", err);
    return res.status(500).json({ error: "Internal server error" });
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

  if (!walletLower || (task !== 'twitter_follow' && task !== 'hairy_person')) {
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