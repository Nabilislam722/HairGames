import { randomBytes } from "node:crypto";
import { ethers } from "ethers";
import PixelFighterSession, { VERIFIED_SESSION_TTL_MS } from "../models/PixelFighterSession.js";
import { ECOSYSTEM_CONTRACTS } from "../config/constants.js";
import { provider, getServerWallet } from "../config/provider.js";
import {
  CHARACTER_IDS,
  DIFFICULTIES,
  PIXEL_FIGHTER_ABI,
  drawOpponent,
  findMatchStarted,
  replayMatch,
  rulesFingerprint,
  signMatchResult,
  startMatchArg,
} from "../services/pixelFighter.js";
import { logSuspicious } from "../services/moderation.js";

const HEMI_CHAIN_ID = 43111n;
const RPC_TIMEOUT_MS = 6000;
const START_LOOKUP_TRIES = 6;
const START_CONFIRM_WAIT_MS = 9000;

let rules = null;
const currentRules = () => (rules ??= rulesFingerprint());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = (promise, what) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Hemi RPC timed out reading ${what}`)), RPC_TIMEOUT_MS)),
  ]);

const httpError = (status, message) => Object.assign(new Error(message), { status });
const isHash = (value) => /^0x[0-9a-f]{64}$/.test(value);

function contractAddress() {
  const address = ECOSYSTEM_CONTRACTS.pixel_fighter;
  if (!address) throw httpError(503, "Pixel Fighters is not connected to its contract yet.");
  return address;
}

const gameContract = () => new ethers.Contract(contractAddress(), PIXEL_FIGHTER_ABI, provider);

function sendError(res, error, fallback) {
  if (!error.status) console.error("Pixel Fighters error:", error.message);
  res.status(error.status || 500).json({ error: error.status ? error.message : fallback });
}

async function findTransaction(hash) {
  for (let i = 0; i < START_LOOKUP_TRIES; i++) {
    const tx = await withTimeout(provider.getTransaction(hash), "the start transaction").catch(() => null);
    if (tx) return tx;
    await sleep(1500);
  }
  return null;
}

const sessionReply = (session) => ({ sessionId: session.sessionId, seed: session.seed, p2: session.p2 });

// POST /api/pixel-fighter/session { wallet, startTxHash, p1, difficulty }
// Checks the start transaction (even while it's pending) and picks the CPU: one per start.
export const startPixelSession = async (req, res) => {
  try {
    const { wallet, p1 } = req.body;
    const difficulty = DIFFICULTIES.indexOf(req.body.difficulty);
    const startTxHash = String(req.body.startTxHash ?? "").toLowerCase();
    if (!wallet || !ethers.isAddress(wallet)) throw httpError(400, "A valid wallet address is required.");
    if (!CHARACTER_IDS.includes(p1)) throw httpError(400, "Unknown fighter.");
    if (difficulty < 0) throw httpError(400, "Unknown CPU level.");
    if (!isHash(startTxHash)) throw httpError(400, "A start transaction is required.");

    const existing = await PixelFighterSession.findOne({ startTxHash });
    if (existing) {
      if (existing.wallet !== wallet.toLowerCase() || existing.difficulty !== difficulty || existing.p1 !== p1) {
        logSuspicious(req, wallet, "pixel_start_reused", "Reused a match start for another wallet, fighter or CPU level", {
          startTxHash, difficulty, p1, startedBy: existing.wallet,
        });
        throw httpError(409, "That start transaction belongs to a different match.");
      }
      return res.json(sessionReply(existing));
    }

    const tx = await findTransaction(startTxHash);
    if (!tx) throw httpError(404, "Couldn't find your start transaction yet. Please try again.");
    if (
      tx.from.toLowerCase() !== wallet.toLowerCase() ||
      tx.to?.toLowerCase() !== contractAddress().toLowerCase() ||
      startMatchArg(tx.data) !== difficulty
    ) {
      logSuspicious(req, wallet, "pixel_foreign_start", "Asked for a match with a transaction that doesn't start one", {
        startTxHash, difficulty, txFrom: tx.from, txTo: tx.to, txDifficulty: startMatchArg(tx.data),
      });
      throw httpError(400, "That transaction doesn't start this match.");
    }

    const { p2, seed } = drawOpponent(p1);
    try {
      const session = await PixelFighterSession.create({
        sessionId: ethers.hexlify(randomBytes(32)), startTxHash, wallet, difficulty, p1, p2, seed,
      });
      res.json(sessionReply(session));
    } catch (error) {
      if (error.code !== 11000) throw error;
      res.json(sessionReply(await PixelFighterSession.findOne({ startTxHash })));
    }
  } catch (error) {
    sendError(res, error, "Could not start the match. Please try again.");
  }
};

// POST /api/pixel-fighter/verify { wallet, sessionId, inputs, rules }
// Replays the match from the recorded inputs and signs the result of that replay.
export const verifyPixelMatch = async (req, res) => {
  try {
    const { wallet, inputs } = req.body;
    const sessionId = String(req.body.sessionId ?? "").toLowerCase();
    if (!wallet || !ethers.isAddress(wallet)) throw httpError(400, "A valid wallet address is required.");
    if (!isHash(sessionId)) throw httpError(400, "Unknown match.");
    if (req.body.rules !== currentRules()) {
      throw httpError(409, "The game was updated. Reload the page and play the match again.");
    }

    const session = await PixelFighterSession.findOne({ sessionId, wallet: wallet.toLowerCase() });
    if (!session) throw httpError(404, "This match expired or does not exist. Play a new one.");
    if (session.status === "rejected") throw httpError(400, "This match was rejected.");

    if (session.status === "open") {
      const result = replayMatch({
        p1: session.p1, p2: session.p2, difficulty: DIFFICULTIES[session.difficulty], seed: session.seed, inputs,
      });
      if (!result.valid || !result.finished) {
        session.status = "rejected";
        await session.save();
        logSuspicious(req, wallet, "pixel_tampered_inputs", `Inputs failed the replay: ${result.reason}`, {
          sessionId, p1: session.p1, p2: session.p2, difficulty: session.difficulty,
          runs: Array.isArray(inputs) ? inputs.length : null,
        });
        throw httpError(400, `The match did not check out (${result.reason}).`);
      }
      session.status = "verified";
      session.score = result.score;
      session.won = result.summary.won;
      session.durationMs = result.durationMs;
      session.expiresAt = new Date(Date.now() + VERIFIED_SESSION_TTL_MS);
      await session.save();
    }

    const address = contractAddress();
    const receipt = await provider.waitForTransaction(session.startTxHash, 1, START_CONFIRM_WAIT_MS).catch(() => null);
    if (!receipt) throw httpError(409, "Your match start isn't confirmed on chain yet. Try again in a moment.");
    if (receipt.status !== 1) throw httpError(409, "Your match start failed on chain, so this match can't be saved.");
    const started = findMatchStarted(receipt, address);
    if (!started || started.player.toLowerCase() !== wallet.toLowerCase() || Number(started.difficulty) !== session.difficulty) {
      throw httpError(409, "Your start transaction doesn't match this match.");
    }
    const run = await withTimeout(gameContract().activeRuns(wallet), "your open match");
    if (!run.active || run.runId !== started.runId) {
      throw httpError(409, "You started another match after this one, so this one can't be saved.");
    }

    const signature = await signMatchResult(getServerWallet(), {
      player: wallet,
      runId: started.runId,
      difficulty: session.difficulty,
      score: session.score,
      won: session.won,
      durationMs: session.durationMs,
      sessionId: session.sessionId,
      contract: address,
      chainId: HEMI_CHAIN_ID,
    });

    res.json({
      score: session.score,
      won: session.won,
      durationMs: session.durationMs,
      sessionId: session.sessionId,
      runId: started.runId.toString(),
      submitAfter: Number(run.startedAt) + Math.floor(session.durationMs / 1000),
      signature,
    });
  } catch (error) {
    sendError(res, error, "Could not verify the match. Please try again.");
  }
};
