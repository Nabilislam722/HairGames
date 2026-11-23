import { randomInt } from "node:crypto";
import { ethers } from "ethers";
import { CHARACTER_IDS, DIFFICULTIES, RULES_ID, replayMatch } from "./pixelFighterEngine.js";

// pixelFighterEngine.js is the game's own engine, bundled by the pixel-fighter repo's
// `npm run build:hairgames`, which also builds client/public/pixel-fighter/. Rebuild both together,
// and restart the backend after replacing it.

export const PIXEL_FIGHTER_ABI = [
  "function startMatch(uint8 difficulty)",
  "function activeRuns(address) view returns (uint64 runId, uint8 difficulty, uint64 startedAt, bool active)",
  "event MatchStarted(address indexed player, uint256 difficulty, uint256 runId)",
  "event MatchCompleted(address indexed player, uint256 indexed runId, uint256 difficulty, uint256 score, bool won, uint256 durationMs, bytes32 sessionId)",
];

const iface = new ethers.Interface(PIXEL_FIGHTER_ABI);

export { CHARACTER_IDS, DIFFICULTIES, replayMatch };

/**
 * Fingerprint of the engine this process loaded (it's part of the module). The game build sends
 * the same value, so matches played on another engine are refused instead of failing the replay.
 */
export function rulesFingerprint() {
  return RULES_ID;
}

/** The CPU for a new match: a random fighter other than the player's, and the seed of its AI. */
export function drawOpponent(p1) {
  const pool = CHARACTER_IDS.filter((id) => id !== p1);
  return { p2: pool[randomInt(pool.length)], seed: randomInt(1, 0x7fffffff) };
}

export async function signMatchResult(wallet, { player, runId, difficulty, score, won, durationMs, sessionId, contract, chainId }) {
  const messageHash = ethers.solidityPackedKeccak256(
    ["address", "uint256", "uint256", "uint256", "bool", "uint256", "bytes32", "address", "uint256"],
    [player, BigInt(runId), BigInt(difficulty), BigInt(score), won, BigInt(durationMs), sessionId, contract, BigInt(chainId)]
  );
  return wallet.signMessage(ethers.getBytes(messageHash));
}

/** The difficulty index a startMatch transaction opened, or null for any other call. */
export function startMatchArg(txData) {
  try {
    const parsed = iface.parseTransaction({ data: txData });
    return parsed?.name === "startMatch" ? Number(parsed.args[0]) : null;
  } catch {
    return null;
  }
}

function findEvent(receipt, contractAddress, name) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === name) return parsed.args;
    } catch {
      // not one of ours
    }
  }
  return null;
}

export const findMatchStarted = (receipt, contractAddress) => findEvent(receipt, contractAddress, "MatchStarted");
export const findMatchCompleted = (receipt, contractAddress) => findEvent(receipt, contractAddress, "MatchCompleted");
