import express from "express";
import profileRouter from "./profile.js";

import {
    getRaceConfig,
    generateRaceSignature,
    generateFishingSignature,
    generateFruitNinjaSignature
} from "../controllers/gameController.js";

import {
    verifyPoints,
    addPoints,
    getPoints,
    claimTask
} from "../controllers/pointsController.js";

import {
    getGlobalLeaderboard,
    getEventLeaderboard,
} from "../controllers/statsController.js";

const router = express.Router();

// Profile Sub-Router 
router.use("/profile", profileRouter);

// Game Signatures & Configs 
router.get("/race/config", getRaceConfig);
router.post("/race/signature", generateRaceSignature);
router.post("/fishing/signature", generateFishingSignature);
router.post("/fruitninja/signature", generateFruitNinjaSignature);

// Points Management 
router.post("/points/verify", verifyPoints);
router.post("/points/add", addPoints);
router.get("/points/get", getPoints);
router.post("/points/claim", claimTask);

// Leaderboards & Events 
router.get("/leaderboard", getGlobalLeaderboard);
router.get("/event/leaderboard", getEventLeaderboard);

export default router;