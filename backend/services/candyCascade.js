// Candy Cascade anti-cheat: the backend replays the player's exact moves with the game's own engine
// and signs only what that replay produced. The engine is loaded from the game's source in this
// repo (client/src/games/candy-cascade/game/src/core), the same files the deployed game is built
// from; a rules fingerprint catches the two drifting apart.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ethers } from "ethers";

const here = dirname(fileURLToPath(import.meta.url));

export const CORE_DIR = resolve(
  process.env.CANDY_CASCADE_CORE_DIR || join(here, "..", "..", "client", "src", "games", "candy-cascade", "game", "src", "core")
);

export const CANDY_CASCADE_ABI = [
  "function startLevel(uint256 levelId)",
  "function highestCleared(address) view returns (uint256)",
  "function levelRecord(address player, uint256 levelId) view returns (uint256 bestScore, uint256 stars)",
  "function activeRuns(address) view returns (uint64 runId, uint16 levelId, uint64 startedAt, bool active)",
  "event LevelStarted(address indexed player, uint256 indexed levelId, uint256 runId)",
  "event LevelCleared(address indexed player, uint256 indexed levelId, uint256 score, uint256 stars, uint256 previousBest, uint256 runId, bytes32 sessionId)",
];

const iface = new ethers.Interface(CANDY_CASCADE_ABI);

// The game's level count; the contract's own levelCount is what actually gates play.
export const LEVEL_COUNT = 500;

// Same algorithm as tools/rules-fingerprint.mjs in the game repo: sha256 over every core file,
// sorted by name, with line endings normalised. Must match the build's baked-in value.
export function rulesFingerprint(coreDir = CORE_DIR) {
  const hash = createHash("sha256");
  const files = readdirSync(coreDir).filter((f) => f.endsWith(".js")).sort();
  for (const file of files) {
    const text = readFileSync(join(coreDir, file), "utf8").replace(/\r\n/g, "\n");
    hash.update(`${file}\n${text}\n`);
  }
  return hash.digest("hex").slice(0, 16);
}

let replayModule = null;

// Resolves to { valid: true, win, score, stars } or { valid: false, reason }.
export async function replayLevel(levelId, seed, moves) {
  replayModule ??= await import(pathToFileURL(join(CORE_DIR, "replay.js")).href);
  return replayModule.replayLevel(levelId, seed, moves);
}

// CandyCascade.submitLevel checks: keccak256(abi.encodePacked(player, levelId, score, stars,
// runId, sessionId, contract, chainid)), EIP-191 signed by the trusted signer.
export async function signLevelResult(wallet, { player, levelId, score, stars, runId, sessionId, contract, chainId }) {
  const messageHash = ethers.solidityPackedKeccak256(
    ["address", "uint256", "uint256", "uint256", "uint256", "bytes32", "address", "uint256"],
    [player, BigInt(levelId), BigInt(score), BigInt(stars), BigInt(runId), sessionId, contract, BigInt(chainId)]
  );
  return wallet.signMessage(ethers.getBytes(messageHash));
}

// The level a startLevel transaction asks for, or null when the data is something else.
export function startLevelArg(txData) {
  try {
    const parsed = iface.parseTransaction({ data: txData });
    return parsed?.name === "startLevel" ? Number(parsed.args[0]) : null;
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
      // Not one of ours.
    }
  }
  return null;
}

// The LevelStarted / LevelCleared event this contract emitted in a receipt, or null.
export const findLevelStarted = (receipt, contractAddress) => findEvent(receipt, contractAddress, "LevelStarted");
export const findLevelCleared = (receipt, contractAddress) => findEvent(receipt, contractAddress, "LevelCleared");
