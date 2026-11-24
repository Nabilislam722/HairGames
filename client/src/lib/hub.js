import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import {
  encodePacked, keccak256, numberToHex, parseAbi, parseEther, parseEventLogs, slice, stringToHex, zeroHash,
} from "viem";
import { useGameSession } from "@/lib/gameSession";
import { hemi } from "@/lib/hemi";
import { fetchWithRetry, postJson } from "@/lib/network";
import { useHemiNetwork } from "@/lib/useHemiNetwork";

// Games on HairGames Hub V2. A run goes:
//  1. startRun(game, params) on the hub, sent with the player's session key (no popup) or their wallet;
//  2. the game's /api/hub/<game>/session checks that transaction and sets the run up (a seed, a CPU);
//  3. while it's played, a checkpoint every CHECKPOINT_EVERY_MS (session key only: with the wallet each
//     one would be a popup), carrying a hash of the game's state so far; they count toward playtime;
//  4. /api/hub/<game>/verify replays the game and signs the result, submitRun saves it, and
//     /api/hub/saved records it at once (the hub indexer would within seconds anyway).
// Hub games pay no HP per play: daily tasks pay for plays and playtime.

export const HUB_ADDRESS = import.meta.env.VITE_GAME_HUB_CONTRACT;
// The hub's game numbers, fixed when it was deployed (HUB.GAMES in backend/config/constants.js).
export const HUB_GAMES = { moto_rush: 1, candy_cascade: 2, pixel_fighter: 3 };
export const CHECKPOINT_EVERY_MS = 10_000;
const CHECKPOINT_GAS = 50_000n; // a checkpoint uses about 24,000
// What the key must hold to send a save itself; below it the wallet sends the save.
const SAVE_RESERVE_WEI = parseEther("0.000003");

const HUB_ABI = parseAbi([
  "function games(uint16 game) view returns (bool listed, bool paused, uint96 startFee, uint96 submitFee)",
  "function startRun(uint16 game, bytes32 params) payable returns (uint256 runId)",
  "function checkpoint(uint256 runId, bytes16 stateHash)",
  "function submitRun(uint256 runId, uint256 score, bytes details, uint64 notBefore, uint64 deadline, bytes32 r, bytes32 vs) payable",
  "event RunStarted(uint256 indexed runId, address indexed player, uint16 game, address sender, bytes32 params)",
  "error HubPaused()",
  "error GameIsPaused()",
  "error UnknownGame()",
  "error WrongFee()",
  "error RunNotOpen()",
  "error NotYourRun()",
  "error TooEarly()",
  "error SignatureExpired()",
  "error BadSignature()",
]);

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getJson(path) {
  const res = await fetchWithRetry(`${API_BASE}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** A hash of a game's state so far (e.g. its moves), for the run's checkpoints. */
export const stateDigest = (state) => keccak256(stringToHex(JSON.stringify(state)));

function isDecline(error) {
  for (let e = error; e; e = e.cause) {
    if (e.name === "UserRejectedRequestError" || e.code === 4001) return true;
  }
  return /user (rejected|denied)/i.test(`${error?.shortMessage ?? ""} ${error?.message ?? ""}`);
}

export function friendlyHubError(error) {
  const text = `${error?.shortMessage ?? ""} ${error?.message ?? ""} ${error?.cause?.data?.errorName ?? ""}`;
  if (isDecline(error)) return "You declined the transaction in your wallet.";
  if (/insufficient funds|exceeds the balance/i.test(text)) return "Not enough ETH to send this. Add funds to your session, or play with your wallet.";
  if (/TooEarly/.test(text)) return "The chain's clock isn't there yet. Try again in a few seconds.";
  if (/SignatureExpired/.test(text)) return "The save took too long. Try again for a fresh signature.";
  if (/RunNotOpen/.test(text)) return "This run was already saved.";
  if (/NotYourRun/.test(text)) return "This run belongs to another wallet, or its session has ended.";
  if (/GameIsPaused|HubPaused/.test(text)) return "Saving is paused for a moment. Try again soon.";
  return error?.shortMessage || error?.message || "Something went wrong.";
}

// Resolves once the chain's latest block is at or past `unixSeconds`.
async function waitForChainTime(publicClient, unixSeconds) {
  for (;;) {
    const block = await publicClient.getBlock();
    const behind = Number(unixSeconds) - Number(block.timestamp);
    if (behind <= 0) return;
    await sleep(Math.min(12000, Math.max(2000, behind * 1000)));
  }
}

/**
 * One game page's runs on the hub. `start` and `save` resolve with the backend's replies and keep
 * `starting` / `saving` ({ mode, step, error? }) up to date for the page to show; mode is "session" (the
 * key sends) or "wallet". After a failed save, `retrySave` picks up where it stopped.
 */
export function useHubRun(gameId) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { ensureHemi } = useHemiNetwork(); // also asks a wallet on another network to switch
  const session = useGameSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const game = HUB_GAMES[gameId];

  const run = useRef(null); // the run being played
  const saved = useRef(null); // the run being saved (a new one can start meanwhile)
  const pendingStart = useRef(null); // { params, hash }: a start that went out but whose session request failed
  const [starting, setStarting] = useState(null);
  const [saving, setSaving] = useState(null);

  const stopCheckpoints = (r) => {
    if (r?.timer) clearInterval(r.timer);
    if (r) r.timer = null;
  };
  useEffect(() => () => stopCheckpoints(run.current), []);

  const send = useCallback(
    async (mode, functionName, args, value = 0n, gas) => {
      const request = { address: HUB_ADDRESS, abi: HUB_ABI, functionName, args, value, ...(gas ? { gas } : {}) };
      if (mode === "session") return sessionRef.current.keyWrite(request);
      await ensureHemi(); // never send on another network
      return writeContractAsync({ ...request, chainId: hemi.id });
    },
    [ensureHemi, writeContractAsync],
  );

  const fees = useCallback(async () => {
    const [listed, paused, startFee, submitFee] = await publicClient.readContract({
      address: HUB_ADDRESS, abi: HUB_ABI, functionName: "games", args: [game],
    });
    if (!listed) throw new Error("This game isn't on the hub yet.");
    if (paused) throw new Error("This game is paused for a moment. Try again soon.");
    return { startFee, submitFee };
  }, [publicClient, game]);

  const checkpoint = useCallback(
    async (r) => {
      if (r.finished || r.runId == null || r.sending) return;
      r.sending = true;
      try {
        r.seq += 1;
        const stateHash = slice(keccak256(encodePacked(["uint256", "uint32", "bytes32"], [r.runId, r.seq, r.digest])), 0, 16);
        await send("session", "checkpoint", [r.runId, stateHash], 0n, CHECKPOINT_GAS);
        r.failures = 0;
      } catch (error) {
        console.warn("Checkpoint not sent:", error?.shortMessage ?? error?.message);
        r.failures = (r.failures ?? 0) + 1;
        if (r.failures >= 3) stopCheckpoints(r); // e.g. the key ran out of ETH
      } finally {
        r.sending = false;
      }
    },
    [send],
  );

  // Once the start is mined: the run's id from RunStarted, a first checkpoint, then one every
  // CHECKPOINT_EVERY_MS until the run ends.
  const followStart = useCallback(
    async (r) => {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: r.startTxHash, timeout: 180_000 });
        const [started] = parseEventLogs({ abi: HUB_ABI, logs: receipt.logs, eventName: "RunStarted" });
        if (receipt.status !== "success" || !started) return;
        r.runId = started.args.runId;
        if (r.mode !== "session" || r.finished) return;
        checkpoint(r);
        r.timer = setInterval(() => checkpoint(r), CHECKPOINT_EVERY_MS);
      } catch (error) {
        console.warn("Couldn't follow the run's start:", error?.shortMessage ?? error?.message);
      }
    },
    [publicClient, checkpoint],
  );

  // Starts a run with `params` (a level, a CPU level…) and asks the backend to set it up.
  const start = useCallback(
    async ({ params, sessionPath, body = {} }) => {
      if (run.current) {
        run.current.finished = true;
        stopCheckpoints(run.current);
        run.current = null;
      }
      const mode = sessionRef.current.usesKey ? "session" : "wallet";
      let step = mode === "session" ? "send" : "wallet";
      setStarting({ mode, step });
      try {
        let startTxHash;
        if (pendingStart.current?.params === params) {
          startTxHash = pendingStart.current.hash; // the start went out already: no new transaction
        } else {
          const { startFee } = await fees();
          startTxHash = await send(mode, "startRun", [game, numberToHex(params, { size: 32 })], startFee);
          pendingStart.current = { params, hash: startTxHash };
        }
        step = "session";
        setStarting({ mode, step });
        const reply = await postJson(sessionPath, { wallet: address, startTxHash, ...body });
        pendingStart.current = null;
        const r = { mode, startTxHash, sessionId: reply.sessionId, runId: null, seq: 0, digest: zeroHash, finished: false, timer: null };
        run.current = r;
        setStarting(null);
        followStart(r);
        return reply;
      } catch (error) {
        setStarting({ mode, step, error: friendlyHubError(error) });
        throw error;
      }
    },
    [address, fees, followStart, game, send],
  );

  // The game's state so far, for the next checkpoints.
  const setState = useCallback((state) => {
    if (run.current && !run.current.finished) run.current.digest = stateDigest(state);
  }, []);

  const runSave = useCallback(
    async (r) => {
      let mode = r.mode;
      let step = "verify";
      try {
        if (!r.verified) {
          setSaving({ mode, step });
          r.verified = await postJson(r.verifyPath, { wallet: address, sessionId: r.sessionId, ...r.verifyBody });
        }
        const v = r.verified;
        if (!r.saveTx) {
          step = "clock";
          setSaving({ mode, step });
          await waitForChainTime(publicClient, v.notBefore);
          const { submitFee } = await fees();
          // The key sends the save if it still holds enough; otherwise the wallet does.
          const s = sessionRef.current;
          if (mode === "session" && !(s.status === "active" && s.balance >= submitFee + SAVE_RESERVE_WEI)) mode = "wallet";
          step = mode === "session" ? "send" : "wallet";
          setSaving({ mode, step });
          r.saveTx = await send(
            mode, "submitRun",
            [BigInt(v.runId), BigInt(v.score), v.details, BigInt(v.notBefore), BigInt(v.deadline), v.r, v.vs],
            submitFee,
          );
        }
        if (!r.mined) {
          step = "confirm";
          setSaving({ mode, step });
          const receipt = await publicClient.waitForTransactionReceipt({ hash: r.saveTx, timeout: 180_000 });
          if (receipt.status !== "success") {
            r.saveTx = null;
            throw new Error("The save failed on chain.");
          }
          r.mined = true;
        }
        step = "record";
        setSaving({ mode, step });
        // The hub indexer records the save too, within seconds, so a failure here isn't one.
        await postJson("/api/hub/saved", { wallet: address, txHash: r.saveTx }).catch((error) =>
          console.warn("The save will show up shortly:", error.message),
        );
        if (saved.current === r) saved.current = null;
        setSaving({ mode, step: "done" });
        sessionRef.current.refresh?.();
        return v;
      } catch (error) {
        // A save that failed (and wasn't declined) is checked again on retry, for a fresh signature.
        if ((step === "send" || step === "wallet" || step === "confirm") && !isDecline(error)) r.verified = null;
        setSaving({ mode, step, error: friendlyHubError(error) });
        throw error;
      }
    },
    [address, fees, publicClient, send],
  );

  // Ends the run and saves its result: `body` is what the game's verify endpoint replays.
  const save = useCallback(
    ({ verifyPath, body = {} }) => {
      const r = run.current;
      if (!r) return Promise.reject(new Error("This run isn't open any more."));
      run.current = null;
      saved.current = r;
      r.finished = true;
      stopCheckpoints(r);
      r.verifyPath = verifyPath;
      r.verifyBody = body;
      return runSave(r);
    },
    [runSave],
  );

  const retrySave = useCallback(() => (saved.current ? runSave(saved.current) : Promise.resolve(null)), [runSave]);

  // Drops the run being saved (the player chose to skip it) and clears the save display.
  const dismissSave = useCallback(() => {
    saved.current = null;
    setSaving(null);
  }, []);

  return {
    mode: session.usesKey ? "session" : "wallet",
    starting,
    saving,
    start,
    setState,
    save,
    retrySave,
    dismissStart: () => setStarting(null),
    dismissSave,
  };
}
