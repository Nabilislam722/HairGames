import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { ethers } from "ethers";
import { MOTO_RUSH, VENOM_NFT } from "../config/constants.js";
import { MAX_BONUS } from "./nftIndexer.js";

const here = dirname(fileURLToPath(import.meta.url));

export const GAME_DIR = resolve(process.env.MOTO_RUSH_DIR || join(here, "..", "..", "client", "public", "moto-rush"));
// detmath must load before planck
export const PHYSICS_FILES = ["js/detmath.js", "vendor/planck.min.js", "js/levels.js", "js/sim.js"];

export const MOTO_RUSH_ABI = [
  "function startLevel(uint256 levelId)",
  "function nextLevel(address player) view returns (uint256)",
  "function levelRecord(address player, uint256 levelId) view returns (uint256 timeMs, uint256 stars, bool completed)",
  "function getProgress(address player) view returns (uint256 completed, uint256 totalStars, uint256 totalTimeMs, uint32[] timesMs, uint8[] stars)",
  "function activeRuns(address) view returns (uint64 runId, uint16 levelId, uint64 startedAt, bool active)",
  "event LevelStarted(address indexed player, uint256 indexed levelId, uint256 runId)",
  "event LevelCompleted(address indexed player, uint256 indexed levelId, uint256 timeMs, uint256 stars, uint256 runId, bytes32 sessionId)",
];

const iface = new ethers.Interface(MOTO_RUSH_ABI);

export const LEVEL_COUNT = 500;
export const STEP = 1 / 120;
export const MAX_STEPS = 120 * 60 * 15;
const MAX_INPUT_RUNS = 50_000;

export const STAR_HP = { 1: 5000, 2: 7000, 3: 10000 };

const round2 = (n) => Number(n.toFixed(2));

// What a Moto Rush multiplier is made of, for the result screen: 1 + the bonus of every reason
// without `countsFrom` or `hint` equals `applied`. Those two are bonuses that didn't count this time.
export function multiplierReasons({ holdings, nftMultiplier, venomRide, applied }) {
  const groups = new Map();
  for (const h of holdings) {
    if (!h.active || !(h.bonus > 0)) continue;
    const g = groups.get(h.collectionName) ?? { name: h.name, count: 0, bonus: 0 };
    g.count++;
    g.bonus += h.bonus;
    groups.set(h.collectionName, g);
  }
  const reasons = [...groups].map(([collection, g]) => ({
    label: g.count > 1 ? `${g.count} ${collection} NFTs` : g.name,
    bonus: round2(g.bonus),
  }));
  const nftCut = round2(nftMultiplier - 1 - reasons.reduce((sum, r) => sum + r.bonus, 0));
  if (nftCut < 0) reasons.push({ label: `NFT bonus cap (+${MAX_BONUS.toFixed(2)} max)`, bonus: nftCut });
  const venom = venomRide ? MOTO_RUSH.VENOM_BONUS : 0;
  if (venomRide) reasons.push({ label: "Riding the Venom", bonus: venom });
  const cut = round2(applied - nftMultiplier - venom);
  if (cut < 0) reasons.push({ label: `Moto Rush cap (${MOTO_RUSH.MAX_MULTIPLIER.toFixed(2)}× max)`, bonus: cut });

  for (const h of holdings) {
    if (!h.active && h.bonus > 0) reasons.push({ label: h.name, bonus: h.bonus, countsFrom: h.countsFrom });
  }
  if (!venomRide && holdings.some((h) => h.active && h.contractAddress === VENOM_NFT.toLowerCase())) {
    reasons.push({ label: "Ride the Venom", bonus: MOTO_RUSH.VENOM_BONUS, hint: true });
  }
  return reasons;
}

export function rulesFingerprint(gameDir = GAME_DIR) {
  const hash = createHash("sha256");
  for (const file of PHYSICS_FILES) {
    const text = readFileSync(join(gameDir, file), "utf8").replace(/\r\n/g, "\n");
    hash.update(`${file}\n${text}\n`);
  }
  return hash.digest("hex").slice(0, 16);
}

let physics = null;
export function loadPhysics() {
  if (physics) return physics;
  const context = vm.createContext({});
  context.self = context;
  for (const file of PHYSICS_FILES) {
    vm.runInContext(readFileSync(join(GAME_DIR, file), "utf8"), context, { filename: file });
  }
  physics = { Sim: context.MotoSim.Sim, BIKES: context.MotoSim.BIKES, LEVELS: context.MotoLevels.LEVELS };
  return physics;
}

export const bikeCount = () => loadPhysics().BIKES.length;
export const bikeInfo = (bike) => loadPhysics().BIKES[bike];

// inputs: [[mask, steps], ...] with gas 1, brake 2, back 4, fwd 8
function decodeInputs(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > MAX_INPUT_RUNS) return null;
  let total = 0;
  for (const run of inputs) {
    if (!Array.isArray(run) || run.length !== 2) return null;
    const [mask, steps] = run;
    if (!Number.isInteger(mask) || mask < 0 || mask > 15 || !Number.isInteger(steps) || steps < 1) return null;
    total += steps;
    if (total > MAX_STEPS) return null;
  }
  return total;
}
const toInput = (mask) => ({ gas: !!(mask & 1), brake: !!(mask & 2), back: !!(mask & 4), fwd: !!(mask & 8) });

export function replayRide({ levelId, bike, inputs, reviveStep = null }) {
  const { Sim, BIKES, LEVELS } = loadPhysics();
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > LEVELS.length) return { valid: false, reason: "unknown level" };
  if (!Number.isInteger(bike) || bike < 0 || bike >= BIKES.length) return { valid: false, reason: "unknown bike" };
  const total = decodeInputs(inputs);
  if (total === null) return { valid: false, reason: "malformed inputs" };
  if (reviveStep !== null && (!Number.isInteger(reviveStep) || reviveStep < 1 || reviveStep >= total)) {
    return { valid: false, reason: "malformed revive" };
  }

  const sim = new Sim(levelId - 1, bike);
  let step = 0;
  for (const [mask, steps] of inputs) {
    const inp = toInput(mask);
    for (let i = 0; i < steps; i++, step++) {
      if (step === reviveStep && !sim.revive()) return { valid: false, reason: "revive not allowed here" };
      sim.step(inp, STEP);
      sim.drainEvents();
      if (sim.state === "finished") {
        const t = sim.result();
        return { valid: true, finished: true, timeMs: Math.round(t * 1000), stars: sim.starsFor(t), steps: step + 1 };
      }
    }
  }
  return { valid: true, finished: false, reason: sim.state === "crashed" ? "crashed" : "did not reach the finish" };
}

export async function signLevelResult(wallet, { player, levelId, timeMs, stars, runId, sessionId, contract, chainId }) {
  const messageHash = ethers.solidityPackedKeccak256(
    ["address", "uint256", "uint256", "uint256", "uint256", "bytes32", "address", "uint256"],
    [player, BigInt(levelId), BigInt(timeMs), BigInt(stars), BigInt(runId), sessionId, contract, BigInt(chainId)]
  );
  return wallet.signMessage(ethers.getBytes(messageHash));
}

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
      // not one of ours
    }
  }
  return null;
}

export const findLevelStarted = (receipt, contractAddress) => findEvent(receipt, contractAddress, "LevelStarted");
export const findLevelCompleted = (receipt, contractAddress) => findEvent(receipt, contractAddress, "LevelCompleted");
