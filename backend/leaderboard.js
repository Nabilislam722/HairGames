import express from "express";
import mongoose from "mongoose";
import Leaderboard from "./models/Leaderboard.js";
import cors from "cors";
import { ethers } from "ethers";


const provider = new ethers.JsonRpcProvider("https://rpc.hemi.network/rpc");
const smart_contract = "0x61A86E5B2075d0E6ff659a6b29D1E367CAa6a8E5";


const app = express();

app.use(cors({
  origin: "https://game.hairtoken.xyz",
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

mongoose.connect("mongodb://127.0.0.1:27017/hp-db")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error(err));

app.post('/api/points/add', async (req, res) => {
  const { wallet, txHash, score } = req.body;

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

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) {
      return res.status(400).json({ error: 'Transaction failed or not found' });
    }

    if (receipt.to.toLowerCase() !== smart_contract.toLowerCase()) {
      return res.status(400).json({ error: 'Transaction not sent to game contract' });
    }

    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return res.status(400).json({ error: 'Transaction not found' });
    }

    const inputData = tx.data;

    if (!inputData.startsWith(SUBMIT_GUESS_SELECTOR)) {
      return res.status(400).json({ error: 'Transaction did not call submitGuess' });
    }

    const abiCoder = new ethers.AbiCoder();
    const [decodedScore] = abiCoder.decode(['uint16'], '0x' + inputData.slice(10));
    const onChainScore   = Number(decodedScore);

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
        $set:  { lastUpdated: new Date() },
      },
      { upsert: true, new: true }
    );

    return res.json({
      wallet:    user.wallet,
      points:    user.points,
      added:     pointsToAdd,
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
