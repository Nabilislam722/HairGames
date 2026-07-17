import { ethers } from "ethers";
import { ECOSYSTEM_CONTRACTS, GENERIC_GAME_ABI, GAME_CONFIG } from "../config/constants.js";
import { provider, getServerWallet } from "../config/provider.js";

export const getRaceConfig = (req, res) => {
  res.json({
    initialPoints: GAME_CONFIG.RACE_INITIAL_POINTS,
    decrementPerSecond: GAME_CONFIG.RACE_POINTS_DECREMENT_PER_SECOND,
  });
};

export const generateRaceSignature = async (req, res) => {
  try {
    const { player, timeTakenMs } = req.body;
    if (!player || !timeTakenMs) return res.status(400).json({ error: "Missing player or timeTakenMs" });

    const targetContract = ECOSYSTEM_CONTRACTS["racing_game"];
    const gameContract = new ethers.Contract(targetContract, GENERIC_GAME_ABI, provider);
    const nonce = await gameContract.userNonces(player);
    const network = await provider.getNetwork();

    const serverWallet = getServerWallet();
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "uint256", "address", "uint256"],
      [player, BigInt(timeTakenMs), BigInt(nonce), targetContract, BigInt(network.chainId)]
    );

    const signature = await serverWallet.signMessage(ethers.getBytes(messageHash));
    res.json({ timeTakenMs, nonce: nonce.toString(), signature });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const generateFishingSignature = async (req, res) => {
  try {
    const { player, finalScore, totalFish } = req.body;
    if (!player || finalScore === undefined || totalFish === undefined) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const targetContract = ECOSYSTEM_CONTRACTS["fishing_party"];
    const gameContract = new ethers.Contract(targetContract, GENERIC_GAME_ABI, provider);
    const nonce = await gameContract.userNonces(player);
    const network = await provider.getNetwork();

    const serverWallet = getServerWallet();
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "uint256", "uint256", "address", "uint256"],
      [player, BigInt(finalScore), BigInt(totalFish), BigInt(nonce), targetContract, BigInt(network.chainId)]
    );

    const signature = await serverWallet.signMessage(ethers.getBytes(messageHash));
    res.json({ finalScore, totalFish, nonce: nonce.toString(), signature });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};