import express from "express";
import mongoose from "mongoose";
import Leaderboard from "./models/Leaderboard.js";
import cors from "cors"

const API_KEY = "NoCheater";
const app = express();
app.use(cors())
app.use(express.json());

mongoose.connect("mongodb://localhost:27017")
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.error(err));

app.post("/api/points/add", async (req, res) => {
  const key = req.headers["x-api-key"];

  if (key !== API_KEY) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { wallet, points } = req.body;

  if (!wallet || points !== 100) {
    return res.status(400).json({ error: "Invalid data" });
  }

  const user = await Leaderboard.findOneAndUpdate(
    { wallet },
    { $inc: { points } },
    { upsert: true, new: true }
  );

  res.json(user);
});

app.get("/api/leaderboard", async (req, res) => {
  const leaderboard = await Leaderboard
    .find()
    .sort({ points: -1 })
    .limit(50);

  res.json(leaderboard);
});

app.get("/api/points/get" , async (req, res) => {
   
   const { wallet } = req.query;
   
   if(!wallet){
    return res.status(400).json({ error: "Wallet address required"});
   }

   const user = await Leaderboard.findOne({ wallet });
   if(!user){
    return res.json({ wallet, points: 0 });
   }

   res.json({ wallet:user.wallet, points:user.points });
});

app.listen(5000, () => console.log("Server running on 5000"));
