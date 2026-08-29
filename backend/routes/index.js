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
    claimTask,
    addVotePoints
} from "../controllers/pointsController.js";

import {
    getGlobalLeaderboard,
    getEventLeaderboard,
} from "../controllers/statsController.js";

import {
    startTwitterAuth,
    twitterCallback,
    startDiscordAuth,
    discordCallback,
    getTwitterStatus,
    getDiscordStatus
} from "../controllers/Authcontroller.js";

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
router.post("/points/vote", addVotePoints);

// Leaderboards & Events 
router.get("/leaderboard", getGlobalLeaderboard);
router.get("/event/leaderboard", getEventLeaderboard);

// Social
router.get("/auth/twitter", startTwitterAuth);
router.get("/auth/twitter/callback", twitterCallback);
router.get("/auth/discord", startDiscordAuth);
router.get("/auth/discord/callback", discordCallback);
router.get("/status/x", getTwitterStatus);
router.get("/status/discord", getDiscordStatus);

export default router;