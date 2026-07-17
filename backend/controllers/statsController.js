import UserProfile from "../models/UserProfile.js";
import EventProfile from "../models/EventProfile.js";

export const getGlobalLeaderboard = async (req, res) => {
  try {
    const leaderboard = await UserProfile.find().sort({ points: -1 }).limit(50);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: "Failed to load global leaderboard" });
  }
};

export const getEventLeaderboard = async (req, res) => {
  try {
    const eventLeaderboard = await EventProfile.find().sort({ points: -1 });
    res.json(eventLeaderboard);
  } catch (error) {
    res.status(500).json({ error: "Failed to load event leaderboard" });
  }
};