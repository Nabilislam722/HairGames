import { randomBytes } from "node:crypto";
import { ethers } from "ethers";
import MotoSession, { VERIFIED_SESSION_TTL_MS } from "../models/MotoSession.js";
import { ECOSYSTEM_CONTRACTS, VENOM_NFT } from "../config/constants.js";
import { provider, getServerWallet } from "../config/provider.js";
import {
  MOTO_RUSH_ABI,
  LEVEL_COUNT,
  bikeCount,
  bikeInfo,
  findLevelStarted,
  replayRide,
  rulesFingerprint,
  signLevelResult,
  startLevelArg,
} from "../services/motoRush.js";
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
const isTxHash = (value) => /^0x[0-9a-f]{64}$/.test(value);

function contractAddress() {
  const address = ECOSYSTEM_CONTRACTS.moto_rush;
  if (!address) throw httpError(503, "Moto Rush is not connected to its contract yet.");
  return address;
}

const gameContract = () => new ethers.Contract(contractAddress(), MOTO_RUSH_ABI, provider);
const venomContract = () => new ethers.Contract(VENOM_NFT, ["function balanceOf(address owner) view returns (uint256)"], provider);

function sendError(res, error, fallback) {
  if (!error.status) console.error("Moto Rush error:", error.message);
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

export const startMotoSession = async (req, res) => {
  try {
    const { wallet } = req.body;
    const levelId = Number(req.body.levelId);
    const startTxHash = String(req.body.startTxHash ?? "").toLowerCase();
    if (!wallet || !ethers.isAddress(wallet)) throw httpError(400, "A valid wallet address is required.");
    if (!Number.isInteger(levelId) || levelId < 1 || levelId > LEVEL_COUNT) throw httpError(400, "Unknown level.");
    if (!isTxHash(startTxHash)) throw httpError(400, "A start transaction is required.");

    const existing = await MotoSession.findOne({ startTxHash });
    if (existing) {
      if (existing.wallet !== wallet.toLowerCase() || existing.levelId !== levelId) {
        logSuspicious(req, wallet, "moto_start_reused", "Reused a level start for a different level or wallet", {
          startTxHash, levelId, startedLevel: existing.levelId, startedBy: existing.wallet,
        });
        throw httpError(409, "That start transaction belongs to a different level.");
      }
      return res.json({ sessionId: existing.sessionId });
    }

    const tx = await findTransaction(startTxHash);
    if (!tx) throw httpError(404, "Couldn't find your start transaction yet. Please try again.");
    if (
      tx.from.toLowerCase() !== wallet.toLowerCase() ||
      tx.to?.toLowerCase() !== contractAddress().toLowerCase() ||
      startLevelArg(tx.data) !== levelId
    ) {
      logSuspicious(req, wallet, "moto_foreign_start", "Asked for a ride with a transaction that doesn't start this level", {
        startTxHash, levelId, txFrom: tx.from, txTo: tx.to, txLevel: startLevelArg(tx.data),
      });
      throw httpError(400, "That transaction doesn't start this level.");
    }

    const contract = gameContract();
    const [next, record] = await Promise.all([
      withTimeout(contract.nextLevel(wallet), "progress"),
      withTimeout(contract.levelRecord(wallet, levelId), "level record"),
    ]);
    if (record.completed) throw httpError(403, `You already completed level ${levelId}. On to the next one!`);
    if (levelId !== Number(next)) throw httpError(403, `Level ${levelId} is locked. Complete level ${Number(next)} first.`);

    try {
      const session = await MotoSession.create({ sessionId: ethers.hexlify(randomBytes(32)), startTxHash, wallet, levelId });
      res.json({ sessionId: session.sessionId });
    } catch (error) {
      if (error.code !== 11000) throw error;
      res.json({ sessionId: (await MotoSession.findOne({ startTxHash })).sessionId });
    }
  } catch (error) {
    sendError(res, error, "Could not start the level. Please try again.");
  }
};

async function checkBike(req, wallet, bike, levelId) {
  if (!Number.isInteger(bike) || bike < 0 || bike >= bikeCount()) throw httpError(400, "Unknown bike.");
  const info = bikeInfo(bike);
  if (info.nft) {
    const held = await withTimeout(venomContract().balanceOf(wallet), "your Venom");
    if (held === 0n) {
      logSuspicious(req, wallet, "moto_venom_without_nft", "Rode the Venom without holding one", { levelId, bike });
      throw httpError(403, "This ride used the #27 Venom, but your wallet doesn't hold one.");
    }
  } else if (info.unlock > 0) {
    const progress = await withTimeout(gameContract().getProgress(wallet), "your stars");
    if (Number(progress.totalStars) < info.unlock) {
      logSuspicious(req, wallet, "moto_locked_bike", "Rode a bike its stars haven't unlocked", {
        levelId, bike, stars: Number(progress.totalStars), needs: info.unlock,
      });
      throw httpError(403, `${info.name} unlocks at ${info.unlock} stars.`);
    }
  }
  return info;
}

export const verifyMotoRide = async (req, res) => {
  try {
    const { wallet, inputs } = req.body;
    const bike = Number(req.body.bike);
    const reviveStep = req.body.reviveStep == null ? null : Number(req.body.reviveStep);
    const sessionId = String(req.body.sessionId ?? "").toLowerCase();
    if (!wallet || !ethers.isAddress(wallet)) throw httpError(400, "A valid wallet address is required.");
    if (!isTxHash(sessionId)) throw httpError(400, "Unknown level session.");
    if (req.body.rules !== currentRules()) {
      throw httpError(409, "The game was updated. Reload the page and ride the level again.");
    }

    const session = await MotoSession.findOne({ sessionId, wallet: wallet.toLowerCase() });
    if (!session) throw httpError(404, "This ride session expired or does not exist. Ride the level again.");
    if (session.status === "rejected") throw httpError(400, "This ride was rejected.");

    if (session.status === "open") {
      const info = await checkBike(req, wallet, bike, session.levelId);
      const result = replayRide({ levelId: session.levelId, bike, inputs, reviveStep });
      if (!result.valid || !result.finished) {
        session.status = "rejected";
        await session.save();
        logSuspicious(
          req,
          wallet,
          result.valid ? "moto_unfinished_ride_submitted" : "moto_tampered_inputs",
          result.valid ? `Sent a ride that didn't finish (${result.reason})` : `Inputs failed the replay: ${result.reason}`,
          { sessionId, levelId: session.levelId, bike, runs: Array.isArray(inputs) ? inputs.length : null },
        );
        throw httpError(400, result.valid ? "That ride didn't reach the finish." : `The ride did not check out (${result.reason}).`);
      }
      session.status = "verified";
      session.bike = bike;
      session.venomBonus = !!info.nft;
      session.timeMs = result.timeMs;
      session.stars = result.stars;
      session.expiresAt = new Date(Date.now() + VERIFIED_SESSION_TTL_MS);
      await session.save();
    }

    const address = contractAddress();
    const receipt = await provider.waitForTransaction(session.startTxHash, 1, START_CONFIRM_WAIT_MS).catch(() => null);
    if (!receipt) throw httpError(409, "Your level start isn't confirmed on chain yet. Try again in a moment.");
    if (receipt.status !== 1) throw httpError(409, "Your level start failed on chain, so this ride can't be saved.");
    const started = findLevelStarted(receipt, address);
    if (!started || started.player.toLowerCase() !== wallet.toLowerCase() || Number(started.levelId) !== session.levelId) {
      throw httpError(409, "Your start transaction doesn't match this level.");
    }
    const run = await withTimeout(gameContract().activeRuns(wallet), "your open run");
    if (!run.active || run.runId !== started.runId) {
      throw httpError(409, "You started another attempt after this one, so this ride can't be saved.");
    }

    const signature = await signLevelResult(getServerWallet(), {
      player: wallet,
      levelId: session.levelId,
      timeMs: session.timeMs,
      stars: session.stars,
      runId: started.runId,
      sessionId: session.sessionId,
      contract: address,
      chainId: HEMI_CHAIN_ID,
    });

    res.json({
      levelId: session.levelId,
      timeMs: session.timeMs,
      stars: session.stars,
      bike: session.bike,
      sessionId: session.sessionId,
      runId: started.runId.toString(),
      submitAfter: Number(run.startedAt) + Math.floor(session.timeMs / 1000),
      signature,
    });
  } catch (error) {
    sendError(res, error, "Could not verify the ride. Please try again.");
  }
};
