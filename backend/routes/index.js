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
    getPointsHistory,
    claimTask,
} from "../controllers/pointsController.js";

import {
    getDailyTasks,
    claimDailyTask,
} from "../controllers/dailyTasksController.js";

import {
    getHubConfig,
    startHubMotoSession,
    verifyHubMotoRide,
    getHubMotoProgress,
    startHubPixelSession,
    verifyHubPixelMatch,
    getHubPixelStats,
    startHubCandySession,
    verifyHubCandyLevel,
    getHubCandyProgress,
    reportHubSave,
    getHubPlaytime,
    getHubRuns,
} from "../controllers/hubController.js";

import { getBanStatus, rejectBanned } from "../services/moderation.js";

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

// Bans: the site asks this when a wallet connects. Every route below that plays a game or pays HP
// goes through rejectBanned.
router.get("/ban/:wallet", getBanStatus);

// Game Signatures & Configs
router.get("/race/config", getRaceConfig);
router.post("/race/signature", rejectBanned, generateRaceSignature);
router.post("/fishing/signature", rejectBanned, generateFishingSignature);
router.post("/fruitninja/signature", rejectBanned, generateFruitNinjaSignature);
router.post("/proof-of-patience/signature", rejectBanned, generateProofOfPatienceSignature);

// Candy Cascade, Moto Rush and Pixel Fighters moved to the hub (below). Their old per-game contracts paid
// HP per play; these routes no longer sign for them, so a page still open from before is told to reload.
const movedToHub = (req, res) =>
    res.status(410).json({ error: "This game now saves through game sessions. Reload the page to keep playing." });
for (const game of ["candy-cascade", "moto-rush", "pixel-fighter"]) {
    router.post(`/${game}/session`, movedToHub);
    router.post(`/${game}/verify`, movedToHub);
}

// Games on HairGames Hub V2 (session keys, checkpoints, HP from daily tasks)
router.get("/hub/config", getHubConfig);
router.post("/hub/moto-rush/session", rejectBanned, startHubMotoSession);
router.post("/hub/moto-rush/verify", rejectBanned, verifyHubMotoRide);
router.get("/hub/moto-rush/progress", getHubMotoProgress);
router.post("/hub/pixel-fighter/session", rejectBanned, startHubPixelSession);
router.post("/hub/pixel-fighter/verify", rejectBanned, verifyHubPixelMatch);
router.get("/hub/pixel-fighter/stats", getHubPixelStats);
router.post("/hub/candy-cascade/session", rejectBanned, startHubCandySession);
router.post("/hub/candy-cascade/verify", rejectBanned, verifyHubCandyLevel);
router.get("/hub/candy-cascade/progress", getHubCandyProgress);
router.post("/hub/saved", rejectBanned, reportHubSave);
router.get("/hub/playtime", getHubPlaytime);
router.get("/hub/runs", getHubRuns);

// Points Management
router.post("/points/verify", rejectBanned, verifyPoints);
router.post("/points/add", rejectBanned, addPoints);
router.get("/points/get", getPoints);
router.get("/points/history", getPointsHistory);
router.post("/points/claim", rejectBanned, claimTask);
router.get("/tasks/daily", getDailyTasks);
router.post("/tasks/daily/claim", rejectBanned, claimDailyTask);
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