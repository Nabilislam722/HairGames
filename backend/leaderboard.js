import express from "express";
import mongoose from "mongoose";
import Leaderboard from "./models/Leaderboard.js";
import cors from "cors";
import { ethers } from "ethers";


const provider = new ethers.JsonRpcProvider("https://rpc.hemi.network/rpc");
const smart_contract = "0x61A86E5B2075d0E6ff659a6b29D1E367CAa6a8E5";


const app = express();

app.use(cors({
  origin: 'https://game.hairtoken.xyz',
  methods: ['GET', 'POST'],
  credentials: true
}));


app.use(express.json());

mongoose.connect("mongodb://127.0.0.1:27017/hp-db")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error(err));

app.post("/api/points/add", async (req, res) => {
  const { wallet, txHash } = req.body;

  try {
   
    if (!wallet || !txHash) {

      return res.status(400).json({ error: "Missing data" });
    }

    const alreadyProcessed = await Leaderboard.findOne({ processedHashes: txHash });
    if (alreadyProcessed) {

      return res.status(400).json({ error: "Transaction already used" });
    }

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) {
      return res.status(400).json({ error: "Transaction failed or not found" });
    }

    if (receipt.to.toLowerCase() !== smart_contract.toLowerCase()) {
      return res.status(400).json({ error: "Invalid contract interaction" });
    }


    const pointsToAdd = 100;
    const user = await Leaderboard.findOneAndUpdate(
      { wallet: wallet.toLowerCase() },
      {
        $inc: { points: pointsToAdd },
        $push: { processedHashes: txHash }

      },
      { upsert: true, new: true }
    );

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
    return res.status(400).json({ error: "Wallet address required" });
  }

  const user = await Leaderboard.findOne({ wallet });
  if (!user) {
    return res.json({ wallet, points: 0 });
  }

  res.json({ wallet: user.wallet, points: user.points });
});

app.listen(5000, () => console.log("Server running on 5000"));
