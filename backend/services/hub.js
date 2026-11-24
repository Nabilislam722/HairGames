// HairGames Hub V2 and its session registry: their interfaces, the backend's result signature, each hub
// game's result data, and the playtime rules. Shared by the hub controllers and the hub indexer.
import { ethers } from "ethers";
import { HUB } from "../config/constants.js";
import { provider, hemiChainId } from "../config/provider.js";

export const HUB_ABI = [
  "function startRun(uint16 game, bytes32 params) payable returns (uint256 runId)",
  "function checkpoint(uint256 runId, bytes16 stateHash)",
  "function submitRun(uint256 runId, uint256 score, bytes details, uint64 notBefore, uint64 deadline, bytes32 r, bytes32 vs) payable",
  "function runs(uint256 runId) view returns (address player, uint40 startedAt, uint16 game, bool open)",
  "event RunStarted(uint256 indexed runId, address indexed player, uint16 game, address sender, bytes32 params)",
  "event Checkpoint(uint256 indexed runId, address indexed sender, bytes16 stateHash)",
  "event RunSaved(uint256 indexed runId, address indexed player, uint16 game, uint256 score, bytes details)",
];

export const REGISTRY_ABI = [
  "function playerFor(address caller) view returns (address)",
  "event SessionOpened(address indexed owner, address indexed key, uint40 expiresAt, uint256 funded)",
  "event SessionClosed(address indexed owner, address indexed key, address closedBy)",
  "event AllSessionsRevoked(address indexed owner, uint32 epoch)",
];

export const hubIface = new ethers.Interface(HUB_ABI);
export const registryIface = new ethers.Interface(REGISTRY_ABI);
export const hubContract = () => new ethers.Contract(HUB.ADDRESS, HUB_ABI, provider);
export const registryContract = () => new ethers.Contract(HUB.REGISTRY, REGISTRY_ABI, provider);

const GAME_IDS = Object.fromEntries(Object.entries(HUB.GAMES).map(([gameId, game]) => [game, gameId]));
export const gameNumber = (gameId) => HUB.GAMES[gameId];
export const gameIdOf = (game) => GAME_IDS[Number(game)] ?? null;

// A run's start data (params) as a number, e.g. a level or a difficulty, and back.
export const paramsNumber = (params) => Number(BigInt(params));
export const numberParams = (n) => ethers.toBeHex(n, 32);

/** The startRun in a transaction to the hub, as { game, params }, or null for anything else. */
export function decodeStartRun(tx) {
  if (tx?.to?.toLowerCase() !== HUB.ADDRESS.toLowerCase()) return null;
  try {
    const parsed = hubIface.parseTransaction({ data: tx.data });
    return parsed?.name === "startRun" ? { game: Number(parsed.args.game), params: parsed.args.params } : null;
  } catch {
    return null;
  }
}

/** The hub's events called `name` in a receipt, decoded. */
export function hubEvents(receipt, name) {
  return receipt.logs
    .filter((log) => log.address.toLowerCase() === HUB.ADDRESS.toLowerCase())
    .flatMap((log) => {
      try {
        const parsed = hubIface.parseLog(log);
        return parsed?.name === name ? [parsed.args] : [];
      } catch {
        return [];
      }
    });
}

// ---- The backend's signature over a verified result (EIP-712, as HairGamesHubV2 checks it) ------------

const RESULT_TYPES = {
  Result: [
    { name: "runId", type: "uint256" },
    { name: "player", type: "address" },
    { name: "game", type: "uint16" },
    { name: "score", type: "uint256" },
    { name: "detailsHash", type: "bytes32" },
    { name: "notBefore", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
};
const hubDomain = () => ({ name: "HairGames Hub V2", version: "2", chainId: hemiChainId, verifyingContract: HUB.ADDRESS });

/** Signs a verified result; returns the compact (EIP-2098) signature halves submitRun takes. */
export async function signResult(wallet, { runId, player, game, score, details, notBefore, deadline }) {
  const signature = await wallet.signTypedData(hubDomain(), RESULT_TYPES, {
    runId, player, game, score, detailsHash: ethers.keccak256(details), notBefore, deadline,
  });
  const { r, yParityAndS } = ethers.Signature.from(signature);
  return { r, vs: yParityAndS };
}

/** How long a signed result stays usable. */
export const SIGNATURE_LIFETIME_S = 30 * 60;

// ---- Each hub game's result data (`details` in submitRun and RunSaved) -------------------------------

const DETAILS = {
  moto_rush: { types: ["uint16", "uint32", "uint8", "uint8"], keys: ["level", "timeMs", "stars", "bike"] },
  pixel_fighter: { types: ["uint8", "bool", "uint32"], keys: ["difficulty", "won", "durationMs"] },
  // stars 0 is a lost level; movesLeft is what the win left, moves the actions played.
  candy_cascade: { types: ["uint16", "uint8", "uint8", "uint16"], keys: ["level", "stars", "movesLeft", "moves"] },
};
const coder = ethers.AbiCoder.defaultAbiCoder();

export const encodeDetails = (gameId, values) => coder.encode(DETAILS[gameId].types, DETAILS[gameId].keys.map((k) => values[k]));

/** A game's result data as an object, or null if it can't be read. */
export function decodeDetails(gameId, details) {
  const d = DETAILS[gameId];
  if (!d) return null;
  try {
    const values = coder.decode(d.types, details);
    return Object.fromEntries(d.keys.map((k, i) => [k, typeof values[i] === "bigint" ? Number(values[i]) : values[i]]));
  } catch {
    return null;
  }
}

// ---- Playtime ----------------------------------------------------------------------------------------

export const PLAYTIME = {
  MAX_GAP_S: 30, // a longer pause between checkpoints isn't counted as play
  SLACK_S: 60, // allowance on top of the replayed length, for loading and the moments around a run
};

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * A saved run's active seconds per UTC day. The points are the run's start, its valid checkpoints and
 * its save; each gap between two points counts if it's at most MAX_GAP_S, toward the day it ends in.
 * The total is capped at the replayed length plus SLACK_S, so a run never earns more playtime than the
 * server saw played. Times are Dates or ms.
 */
export function activeByDay({ startedAt, savedAt, checkpoints = [], playedSeconds = 0 }) {
  const start = new Date(startedAt).getTime();
  const end = new Date(savedAt).getTime();
  const points = [
    start,
    ...checkpoints.map((c) => new Date(c.at).getTime()).filter((t) => t >= start && t <= end),
    end,
  ].sort((a, b) => a - b);

  let budget = (Math.max(0, playedSeconds) + PLAYTIME.SLACK_S) * 1000;
  const byDay = {};
  for (let i = 1; i < points.length && budget > 0; i++) {
    const gap = points[i] - points[i - 1];
    if (gap <= 0 || gap > PLAYTIME.MAX_GAP_S * 1000) continue;
    const counted = Math.min(gap, budget);
    budget -= counted;
    const day = dayKey(points[i]);
    byDay[day] = (byDay[day] ?? 0) + counted / 1000;
  }
  for (const day of Object.keys(byDay)) byDay[day] = Math.round(byDay[day]);
  return byDay;
}
