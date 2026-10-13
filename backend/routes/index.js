import express from "express";
import profileRouter from "./profile.js";

import {
    getRaceConfig,
    generateRaceSignature,
    generateFishingSignature,
    generateFruitNinjaSignature,
    generateProofOfPatienceSignature 
} from "../controllers/gameController.js";

import {
    verifyPoints,
    addPoints,
    getPoints,
    claimTask,
} from "../controllers/pointsController.js";

import {
    startCandySession,
    verifyCandyLevel,
} from "../controllers/candyCascadeController.js";

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
} from "../controllers/authController.js";

const router = express.Router();

// Keepalive target for phone games: a cheap request every few seconds stops mobile browsers from
// dropping the idle connection mid-game. (Express answers HEAD from this GET route.)
router.get("/ping", (req, res) => res.sendStatus(204));

// Profile Sub-Router
router.use("/profile", profileRouter);

// Game Signatures & Configs 
router.get("/race/config", getRaceConfig);
router.post("/race/signature", generateRaceSignature);
router.post("/fishing/signature", generateFishingSignature);
router.post("/fruitninja/signature", generateFruitNinjaSignature);
router.post("/proof-of-patience/signature", generateProofOfPatienceSignature);
router.post("/candy-cascade/session", startCandySession);
router.post("/candy-cascade/verify", verifyCandyLevel);

// Points Management 
router.post("/points/verify", verifyPoints);
router.post("/points/add", addPoints);
router.get("/points/get", getPoints);
router.post("/points/claim", claimTask);
// router.post("/points/vote", addVotePoints);

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