import { ethers } from "ethers";
import { ECOSYSTEM_CONTRACTS, GENERIC_GAME_ABI, GAME_CONFIG } from "../config/constants.js";
import { provider, getServerWallet } from "../config/provider.js";

const HEMI_CHAIN_ID = 43111n; // Hardcoded to prevent redundant getNetwork() RPC calls

// Helper function to prevent the RPC from hanging the server indefinitely
const fetchNonceWithTimeout = async (contract, player, timeoutMs = 6000) => {
  const noncePromise = contract.userNonces(player);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Hemi RPC timed out fetching nonce")), timeoutMs)
  );
  return Promise.race([noncePromise, timeoutPromise]);
};

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
    
    const nonce = await fetchNonceWithTimeout(gameContract, player);

    const serverWallet = getServerWallet();
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "uint256", "address", "uint256"],
      [player, BigInt(timeTakenMs), BigInt(nonce), targetContract, HEMI_CHAIN_ID]
    );

    const signature = await serverWallet.signMessage(ethers.getBytes(messageHash));
    res.json({ timeTakenMs, nonce: nonce.toString(), signature });
  } catch (error) {
    console.error("Race signature error:", error.message);
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
    
    const nonce = await fetchNonceWithTimeout(gameContract, player);

    const serverWallet = getServerWallet();
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "uint256", "uint256", "address", "uint256"],
      [player, BigInt(finalScore), BigInt(totalFish), BigInt(nonce), targetContract, HEMI_CHAIN_ID]
    );

    const signature = await serverWallet.signMessage(ethers.getBytes(messageHash));
    res.json({ finalScore, totalFish, nonce: nonce.toString(), signature });
  } catch (error) {
    console.error("Fishing signature error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// FruitNinja.submitGameResult signs over:
// keccak256(abi.encodePacked(player, finalScore, levelReached, fruitsSliced, nonce, contract, chainid))
export const generateFruitNinjaSignature = async (req, res) => {
  try {
    const { player, finalScore, levelReached, fruitsSliced } = req.body;
    if (
      !player ||
      finalScore === undefined ||
      levelReached === undefined ||
      fruitsSliced === undefined
    ) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const targetContract = ECOSYSTEM_CONTRACTS["fruit_ninja"];
    const gameContract = new ethers.Contract(targetContract, GENERIC_GAME_ABI, provider);
    
    const nonce = await fetchNonceWithTimeout(gameContract, player);

    const serverWallet = getServerWallet();
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "uint256", "uint256", "uint256", "address", "uint256"],
      [
        player,
        BigInt(finalScore),
        BigInt(levelReached),
        BigInt(fruitsSliced),
        BigInt(nonce),
        targetContract,
        HEMI_CHAIN_ID,
      ]
    );

    const signature = await serverWallet.signMessage(ethers.getBytes(messageHash));
    res.json({ finalScore, levelReached, fruitsSliced, nonce: nonce.toString(), signature });
  } catch (error) {
    console.error("FruitNinja signature error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

//pop
const POP_MAX_SCORE = 30_000;
const POP_SCORE_TOLERANCE = 1.25;
const POP_MAX_ANSWERS_PER_SECOND = 8;
const POP_MAX_SHOTS_PER_SECOND = 17;

function popHonestScoreCeiling(answered, hits) {
  const a = answered;
  const h = hits;
  return 170 * a * (a + 1) + 1_310 * a + 3 * h * a + 20 * h + 8_300;
}

function popImplausibleReason({ score, survivalSeconds, answered, shots, hits }) {
  if (hits > shots) return "More hits than shots.";
  if (score > POP_MAX_SCORE) return "Score is above the contract maximum.";

  const duration = survivalSeconds + 1;

  const ceiling = Math.min(popHonestScoreCeiling(answered, hits) * POP_SCORE_TOLERANCE, POP_MAX_SCORE);
  if (score > ceiling) return "Score is higher than this run's answers could produce.";

  if (answered > duration * POP_MAX_ANSWERS_PER_SECOND) {
    return "More answers than the round length allows.";
  }
  if (shots > duration * POP_MAX_SHOTS_PER_SECOND + 1) {
    return "More shots than the fire rate allows.";
  }
  return null;
}

// ProofOfPatience.submitScore signs over:
// keccak256(abi.encodePacked(player, score, survivalSeconds, answered, shots, hits, nonce, contract, chainid))
export const generateProofOfPatienceSignature = async (req, res) => {
  try {
    const { player, score, survivalSeconds, answered, shots, hits } = req.body;
    if (
      !player ||
      score === undefined ||
      survivalSeconds === undefined ||
      answered === undefined ||
      shots === undefined ||
      hits === undefined
    ) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const implausible = popImplausibleReason({
      score: Number(score),
      survivalSeconds: Number(survivalSeconds),
      answered: Number(answered),
      shots: Number(shots),
      hits: Number(hits),
    });
    if (implausible) {
      return res.status(400).json({ error: implausible });
    }

    const targetContract = ECOSYSTEM_CONTRACTS["proof_of_patience"];
    const gameContract = new ethers.Contract(targetContract, GENERIC_GAME_ABI, provider);
    
    const nonce = await fetchNonceWithTimeout(gameContract, player);

    const serverWallet = getServerWallet();
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "address", "uint256"],
      [
        player,
        BigInt(score),
        BigInt(survivalSeconds),
        BigInt(answered),
        BigInt(shots),
        BigInt(hits),
        BigInt(nonce),
        targetContract,
        HEMI_CHAIN_ID,
      ]
    );

    const signature = await serverWallet.signMessage(ethers.getBytes(messageHash));
    res.json({ score, survivalSeconds, answered, shots, hits, nonce: nonce.toString(), signature });
  } catch (error) {
    console.error("ProofOfPatience signature error:", error.message);
    res.status(500).json({ error: error.message });
  }
};