import express from "express";
import mongoose from "mongoose";
import UserProfile from "./models/UserProfile.js";
import cors from "cors";
import { ethers } from "ethers";
import dotenv from "dotenv";
import profileRouter from "./routes/profile.js";
import { startNftWatcher } from "./services/nftWatcher.js";

dotenv.config();

const hemiRpcUrl = "https://rpc.hemi.network/rpc";
const provider = new ethers.JsonRpcProvider(hemiRpcUrl);

// ── 1. UPDATED ECOSYSTEM CONTRACTS ─────────────────────────────────────────
const ECOSYSTEM_CONTRACTS = {
  "space_huggers": "0x895087a3b85C38DAB365495A5E1EA518459A9750",
  "racing_game": "0x3E0784ffE4e036bCc1859CA124dF327e8B866E29", 
  "default_legacy": "0x61A86E5B2075d0E6ff659a6b29D1E367CAa6a8E5"
};

const GENERIC_GAME_ABI = [
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "userNonces",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY;
const SUBMIT_LEVEL_SCORE_SELECTOR = "0xaba261ec";
const RACE_INITIAL_POINTS = Number(process.env.RACE_INITIAL_POINTS) || 15000;
const RACE_POINTS_DECREMENT_PER_SECOND = Number(process.env.RACE_POINTS_DECREMENT_PER_SECOND) || 100;

const app = express();

app.use(cors({
  origin: ["https://game.hairtoken.xyz", "http://localhost:5173", "http://127.0.0.1:5173"],
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// ── NEW SCHEMA: Weekly Event Leaderboard ──────────────────────────────────
const eventProfileSchema = new mongoose.Schema({
  wallet: { type: String, required: true, unique: true, lowercase: true },
  points: { type: Number, default: 0 },
  lastSyncedAt: { type: Date, default: Date.now }
});
const EventProfile = mongoose.model("EventProfile", eventProfileSchema);

mongoose.connect("mongodb://127.0.0.1:27017/hp-db")
  .then(() => {
    console.log("MongoDB Connected");
    startNftWatcher(provider);
  })
  .catch(err => console.error(err));

async function generateCryptoSignature(level, kills, points, nonce, walletAddress, targetAddress, chainId) {
  if (!SERVER_PRIVATE_KEY) {
    throw new Error("Server authentication private key environment variable missing");
  }
  const serverWallet = new ethers.Wallet(SERVER_PRIVATE_KEY);
  const messageHash = ethers.solidityPackedKeccak256(
    ["address", "uint256", "uint256", "uint256", "uint256", "address", "uint256"],
    [walletAddress, BigInt(level), BigInt(kills), BigInt(points), BigInt(nonce), targetAddress, BigInt(chainId)]
  );
  return await serverWallet.signMessage(ethers.getBytes(messageHash));
}

// ─────────────────────────────────────────────────────────────────────────
// NEW RACING GAME: Signature Generation Endpoint
// ─────────────────────────────────────────────────────────────────────────
app.post("/api/race/signature", async (req, res) => {
  try {
    const { player, timeTakenMs } = req.body;
    if (!player || !timeTakenMs) {
      return res.status(400).json({ error: "Missing player address or timeTakenMs" });
    }
    if (!SERVER_PRIVATE_KEY) {
      return res.status(500).json({ error: "Server private key configuration missing" });
    }

    const targetContract = ECOSYSTEM_CONTRACTS["racing_game"];
    const gameContract = new ethers.Contract(targetContract, GENERIC_GAME_ABI, provider);

    const nonce = await gameContract.userNonces(player);
    const network = await provider.getNetwork();
    const chainId = network.chainId;

    const serverWallet = new ethers.Wallet(SERVER_PRIVATE_KEY);

    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "uint256", "address", "uint256"],
      [player, BigInt(timeTakenMs), BigInt(nonce), targetContract, BigInt(chainId)]
    );

    const signature = await serverWallet.signMessage(ethers.getBytes(messageHash));

    res.json({
      timeTakenMs,
      nonce: nonce.toString(),
      signature: signature
    });
  } catch (error) {
    console.error("Racing Signature Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/race/config", (req, res) => {
  res.json({
    initialPoints: RACE_INITIAL_POINTS,
    decrementPerSecond: RACE_POINTS_DECREMENT_PER_SECOND,
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Score Verification and Point Submission
// ─────────────────────────────────────────────────────────────────────────

app.post('/api/points/verify', async (req, res) => {
  try {
    const { wallet, level = 1, kills = 0, livesRemaining = 0, gameId = "default_legacy" } = req.body;
    if (!wallet) throw new Error("Wallet address is required");

    let points = 0;
    if (gameId === "space_huggers") {
      points = Math.min(Math.round((Number(kills) * 10) + (Number(livesRemaining) * 5)), 65535) || 0;
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
});

app.post('/api/points/add', async (req, res) => {
  const { wallet, txHash, score, gameId } = req.body;

  try {
    if (!wallet || !txHash) {
      return res.status(400).json({ error: 'Missing wallet or txHash' });
    }

    let pointsRequested = 0;
    if (gameId !== "racing_game") {
      pointsRequested = parseInt(score, 10);
      if (!Number.isFinite(pointsRequested) || pointsRequested < 0 || pointsRequested > 65535) {
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
      onChainScore = Math.max(0, RACE_INITIAL_POINTS - (timeTakenSeconds * RACE_POINTS_DECREMENT_PER_SECOND));
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

    // 1. Update Global/Permanent Highscore
    const user = await UserProfile.findOneAndUpdate(
      { wallet: walletLower },
      {
        $inc: { points: pointsToAdd },
        $push: { processedHashes: txHash },
        $set: { lastSyncedAt: new Date() },
      },
      { upsert: true, new: true }
    );

    // 2. NEW: Update Weekly Active Event Highscore
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
});

// ─────────────────────────────────────────────────────────────────────────
// Permanent Leaderboard and Task Claim System
// ─────────────────────────────────────────────────────────────────────────

app.get("/api/leaderboard", async (req, res) => {
  const leaderboard = await UserProfile.find().sort({ points: -1 }).limit(50);
  res.json(leaderboard);
});

// ─────────────────────────────────────────────────────────────────────────
// NEW: Event Leaderboard Endpoints (Weekly Rules)
// ─────────────────────────────────────────────────────────────────────────

/**
 * GET /api/event/leaderboard
 * Returns weekly event rankings sorted by active points descending.
 * Returns all active players so the frontend find logic handles user positions cleanly.
 */
app.get("/api/event/leaderboard", async (req, res) => {
  try {
    const eventLeaderboard = await EventProfile.find()
      .sort({ points: -1 }); // Get all users with data for client-side ranking calculations
    res.json(eventLeaderboard);
  } catch (error) {
    res.status(500).json({ error: "Failed to load event leaderboard" });
  }
});

/**
 * POST /api/event/reset
 * Action route used by an administrative schedule or webhook every Monday 00:00 UTC.
 * Wipes weekly active pools down to zero.
 */
app.post("/api/event/reset", async (req, res) => {
  // In a production environment, protect this route with an API key checking headers
  try {
    await EventProfile.updateMany({}, { $set: { points: 0 } });
    res.json({ success: true, message: "Weekly event score tables cleared successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset event standings" });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Remaining Auxiliary Endpoints
// ─────────────────────────────────────────────────────────────────────────

app.get("/api/points/get", async (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: "Wallet required" });

  const user = await UserProfile.findOne({ wallet: wallet.toLowerCase() });
  res.json({
    wallet: wallet.toLowerCase(),
    points: user ? user.points : 0,
    tasks: user ? user.completedTasks : []
  });
});

app.post("/api/points/claim", async (req, res) => {
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

    // Note: If you want tasks to award weekly event points too, add an EventProfile update here.

    res.json({ success: true, newTotal: updatedUser.points, tasks: updatedUser.completedTasks });
  } catch (err) {
    console.error("Claim Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.use("/api/profile", profileRouter);

app.listen(3000, () => console.log("Server running on 3000"));