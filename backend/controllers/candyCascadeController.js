import { randomBytes, randomInt } from "node:crypto";
import { ethers } from "ethers";
import CandySession from "../models/CandySession.js";
import { ECOSYSTEM_CONTRACTS } from "../config/constants.js";
import { provider, getServerWallet } from "../config/provider.js";
import {
  CANDY_CASCADE_ABI,
  LEVEL_COUNT,
  findLevelStarted,
  replayLevel,
  rulesFingerprint,
  signLevelResult,
  startLevelArg,
} from "../services/candyCascade.js";

const HEMI_CHAIN_ID = 43111n;
const RPC_TIMEOUT_MS = 6000;
const START_LOOKUP_TRIES = 6; // a just-sent start can take a moment to reach our RPC node
const START_CONFIRM_WAIT_MS = 9000; // stays under the client's 12 s request timeout

let rules = null;
const currentRules = () => (rules ??= rulesFingerprint());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = (promise, what) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Hemi RPC timed out reading ${what}`)), RPC_TIMEOUT_MS)),
  ]);

const httpError = (status, message) => Object.assign(new Error(message), { status });
const isTxHash = (value) => /^0x[0-9a-f]{64}$/.test(value);

function contractAddress() {
  const address = ECOSYSTEM_CONTRACTS.candy_cascade;
  if (!address) throw httpError(503, "Candy Cascade is not connected to its contract yet.");
  return address;
}

const gameContract = () => new ethers.Contract(contractAddress(), CANDY_CASCADE_ABI, provider);

function sendError(res, error, fallback) {
  if (!error.status) console.error("Candy Cascade error:", error.message);
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

const sessionReply = (session) => ({ sessionId: session.sessionId, seed: session.seed });

/**
 * POST /api/candy-cascade/session  { wallet, levelId, startTxHash }
 * Gives a level attempt its board seed, once per startLevel transaction. The start is usually still
 * pending here (the game begins as soon as the wallet sends it); verify checks later that it was
 * mined and is still the player's open run.
 */
export const startCandySession = async (req, res) => {
  try {
    const { wallet } = req.body;
    const levelId = Number(req.body.levelId);
    const startTxHash = String(req.body.startTxHash ?? "").toLowerCase();
    if (!wallet || !ethers.isAddress(wallet)) throw httpError(400, "A valid wallet address is required.");
    if (!Number.isInteger(levelId) || levelId < 1 || levelId > LEVEL_COUNT) throw httpError(400, "Unknown level.");
    if (!isTxHash(startTxHash)) throw httpError(400, "A start transaction is required.");

    // A retried request (dropped connection) gets the same session back: one seed per start.
    const existing = await CandySession.findOne({ startTxHash });
    if (existing) {
      if (existing.wallet !== wallet.toLowerCase() || existing.levelId !== levelId) {
        throw httpError(409, "That start transaction belongs to a different level.");
      }
      return res.json(sessionReply(existing));
    }

    const tx = await findTransaction(startTxHash);
    if (!tx) throw httpError(404, "Couldn't find your start transaction yet. Please try again.");
    if (
      tx.from.toLowerCase() !== wallet.toLowerCase() ||
      tx.to?.toLowerCase() !== contractAddress().toLowerCase() ||
      startLevelArg(tx.data) !== levelId
    ) {
      throw httpError(400, "That transaction doesn't start this level.");
    }

    const contract = gameContract();
    const [highest, record] = await Promise.all([
      withTimeout(contract.highestCleared(wallet), "progress"),
      withTimeout(contract.levelRecord(wallet, levelId), "level stars"),
    ]);
    if (levelId > Number(highest) + 1) throw httpError(403, `Level ${levelId} is locked. Clear level ${Number(highest) + 1} first.`);
    // Same rule as the contract: a 3-star level is finished, so players move on to new levels.
    if (Number(record.stars) >= 3) throw httpError(403, `You already have 3 stars on level ${levelId}. Try a new level!`);

    try {
      const session = await CandySession.create({
        sessionId: ethers.hexlify(randomBytes(32)),
        startTxHash,
        wallet,
        levelId,
        seed: randomInt(0, 2 ** 32),
      });
      res.json(sessionReply(session));
    } catch (error) {
      if (error.code !== 11000) throw error;
      // A parallel retry created it first.
      res.json(sessionReply(await CandySession.findOne({ startTxHash })));
    }
  } catch (error) {
    sendError(res, error, "Could not start the level. Please try again.");
  }
};

/**
 * POST /api/candy-cascade/verify  { wallet, sessionId, moves, rules }
 * Replays the moves on the session's seed and signs the score and stars the replay produced, bound
 * to the on-chain run the session's start opened. The client's own score is never used.
 */
export const verifyCandyLevel = async (req, res) => {
  try {
    const { wallet, moves } = req.body;
    const sessionId = String(req.body.sessionId ?? "").toLowerCase();
    if (!wallet || !ethers.isAddress(wallet)) throw httpError(400, "A valid wallet address is required.");
    if (!isTxHash(sessionId)) throw httpError(400, "Unknown level session.");
    if (req.body.rules !== currentRules()) {
      throw httpError(409, "The game was updated. Reload the page and play the level again.");
    }

    const session = await CandySession.findOne({ sessionId, wallet: wallet.toLowerCase() });
    if (!session) throw httpError(404, "This level session expired or does not exist. Play the level again.");
    if (session.status === "rejected") throw httpError(400, "This level session was rejected.");

    if (session.status === "open") {
      const result = await replayLevel(session.levelId, session.seed, moves);
      if (!result.valid || !result.win) {
        session.status = "rejected";
        await session.save();
        throw httpError(400, result.valid ? "The level was not won." : `The moves did not check out (${result.reason}).`);
      }
      session.status = "verified";
      session.score = result.score;
      session.stars = result.stars;
      await session.save();
    }

    // The win only counts against its own start: mined, successful, and still the open run.
    const address = contractAddress();
    const receipt = await provider.waitForTransaction(session.startTxHash, 1, START_CONFIRM_WAIT_MS).catch(() => null);
    if (!receipt) throw httpError(409, "Your level start isn't confirmed on chain yet. Try again in a moment.");
    if (receipt.status !== 1) throw httpError(409, "Your level start failed on chain, so this win can't be saved.");
    const started = findLevelStarted(receipt, address);
    if (!started || started.player.toLowerCase() !== wallet.toLowerCase() || Number(started.levelId) !== session.levelId) {
      throw httpError(409, "Your start transaction doesn't match this level.");
    }
    const run = await withTimeout(gameContract().activeRuns(wallet), "your open run");
    if (!run.active || run.runId !== started.runId) {
      throw httpError(409, "You started another attempt after this one, so this win can't be saved.");
    }

    // A verified session may be signed again, e.g. after a dropped connection. That is harmless:
    // the signature only works once, against this exact open run.
    const signature = await signLevelResult(getServerWallet(), {
      player: wallet,
      levelId: session.levelId,
      score: session.score,
      stars: session.stars,
      runId: started.runId,
      sessionId: session.sessionId,
      contract: address,
      chainId: HEMI_CHAIN_ID,
    });

    res.json({
      levelId: session.levelId,
      score: session.score,
      stars: session.stars,
      sessionId: session.sessionId,
      runId: started.runId.toString(),
      signature,
    });
  } catch (error) {
    sendError(res, error, "Could not verify the level. Please try again.");
  }
};
