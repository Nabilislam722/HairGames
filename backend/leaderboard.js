import express from "express";
import mongoose from "mongoose";
import Leaderboard from "./models/Leaderboard.js";
import cors from "cors";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const hemiRpcUrl = "https://rpc.hemi.network/rpc";
const provider = new ethers.JsonRpcProvider(hemiRpcUrl);

const ECOSYSTEM_CONTRACTS = {
  "space_huggers": "0x895087a3b85C38DAB365495A5E1EA518459A9750",
  "default_legacy": "0x61A86E5B2075d0E6ff659a6b29D1E367CAa6a8E5"
};

const SPACE_HUGGERS_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "name": "userNonces",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY;
const SUBMIT_LEVEL_SCORE_SELECTOR = "0xaba261ec";

const app = express();

app.use(cors({
  origin: "http://127.0.0.1:5173",
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

mongoose.connect("mongodb://127.0.0.1:27017/hp-db")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error(err));

/**
 * Utility function to securely hash and sign score parameters
 */
async function generateCryptoSignature(level, kills, points, nonce, walletAddress, targetAddress, chainId) {
  if (!SERVER_PRIVATE_KEY) {
    throw new Error("Server authentication private key environment variable missing");
  }

  const serverWallet = new ethers.Wallet(SERVER_PRIVATE_KEY);

  // Aligns perfectly with Solidity: msg.sender, level, kills, points, nonce, address(this), block.chainid
  const messageHash = ethers.solidityPackedKeccak256(
    ["address", "uint256", "uint256", "uint256", "uint256", "address", "uint256"],
    [walletAddress, BigInt(level), BigInt(kills), BigInt(points), BigInt(nonce), targetAddress, BigInt(chainId)]
  );

  const signature = await serverWallet.signMessage(ethers.getBytes(messageHash));
  return signature;
}

app.post('/api/points/verify', async (req, res) => {
  try {
    const { wallet, level = 1, kills = 0, livesRemaining = 0, gameId = "default_legacy" } = req.body;

    if (!wallet) throw new Error("Wallet address is required");

    let points = 0;
    if (gameId === "space_huggers") {
      points = Math.min(Math.round((Number(kills) * 100) + (Number(livesRemaining) * 50)), 65535) || 0;
    } else {
      points = Number(req.body.score) || 0;
    }

    const targetAddress = ECOSYSTEM_CONTRACTS[gameId] || ECOSYSTEM_CONTRACTS["default_legacy"];
    const gameContract = new ethers.Contract(targetAddress, SPACE_HUGGERS_ABI, provider);

    const nonce = await gameContract.userNonces(wallet);

    // 1. Fetch current network data to extract the live chainid
    const network = await provider.getNetwork();
    const chainId = network.chainId;

    // 2. Supply target address and chainId into signature generation
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
    console.error("Verification Endpoint error execution loop:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/points/add', async (req, res) => {
  const { wallet, txHash, score, gameId } = req.body;

  try {
    if (!wallet || !txHash) {
      return res.status(400).json({ error: 'Missing wallet or txHash' });
    }

    const pointsRequested = parseInt(score, 10);
    if (!Number.isFinite(pointsRequested) || pointsRequested < 0 || pointsRequested > 65535) {
      return res.status(400).json({ error: 'Invalid score value' });
    }

    const alreadyProcessed = await Leaderboard.findOne({ processedHashes: txHash });
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

    // ── ROUTE THE DECODING BASED ON THE GAME ──
    if (gameId === "space_huggers") {

      if (!inputData.startsWith(SUBMIT_LEVEL_SCORE_SELECTOR)) {
        return res.status(400).json({ error: 'Transaction did not call submitLevelScore' });
      }
      const decodedData = abiCoder.decode(
        ['uint256', 'uint256', 'uint256', 'uint256', 'bytes'],
        '0x' + inputData.slice(10)
      );
      onChainScore = Number(decodedData[2]);

    }
    else {
      const SELECTOR_16 = ethers.id("submitGuess(uint16)").slice(0, 10);
      const SELECTOR_256 = ethers.id("submitGuess(uint256)").slice(0, 10);

      if (inputData.startsWith(SELECTOR_16)) {
        const decodedData = abiCoder.decode(['uint16'], '0x' + inputData.slice(10));
        onChainScore = Number(decodedData[0]);
      }
      else if (inputData.startsWith(SELECTOR_256)) {
        const decodedData = abiCoder.decode(['uint256'], '0x' + inputData.slice(10));
        onChainScore = Number(decodedData[0]);
      }
      else {
        return res.status(400).json({ error: 'Transaction did not call submitGuess' });
      }
    }

    if (onChainScore !== pointsRequested) {
      return res.status(400).json({
        error: `Score mismatch: on-chain=${onChainScore}, claimed=${pointsRequested}`,
      });
    }

    const pointsToAdd = onChainScore;

    const user = await Leaderboard.findOneAndUpdate(
      { wallet: wallet.toLowerCase() },
      {
        $inc: { points: pointsToAdd },
        $push: { processedHashes: txHash },
        $set: { lastUpdated: new Date() },
      },
      { upsert: true, new: true }
    );

    return res.json({
      wallet: user.wallet,
      points: user.points,
      added: pointsToAdd,
      txHash,
    });

  } catch (err) {
    console.error('/api/points/add error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get("/api/leaderboard", async (req, res) => {
  const leaderboard = await Leaderboard
    .find()
    .sort({ points: -1 })
    .limit(50);

  res.json(leaderboard);
});

app.get("/api/points/get", async (req, res) => {
  const { wallet } = req.query;
  if (!wallet) {
    return res.status(400).json({ error: "Wallet required" });
  }

  const user = await Leaderboard.findOne({ wallet: wallet.toLowerCase() });

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
    let user = await Leaderboard.findOne({ wallet: walletLower });
    if (user && user.completedTasks && user.completedTasks.includes(task)) {
      return res.status(400).json({
        error: "Task already completed",
        alreadyDone: true
      });
    }

    const updatedUser = await Leaderboard.findOneAndUpdate(
      { wallet: walletLower, completedTasks: { $ne: task } },
      {
        $inc: { points: 100 },
        $addToSet: { completedTasks: task },
        $set: { updatedAt: new Date() }
      },
      { upsert: true, new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({ error: "Task already processed" });
    }

    res.json({
      success: true,
      newTotal: updatedUser.points,
      tasks: updatedUser.completedTasks
    });

  } catch (err) {
    console.error("Claim Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(5000, () => console.log("Server running on 5000"));