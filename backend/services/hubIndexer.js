// HairGames Hub V2 indexer: reads the hub's and the session registry's events in chain order and keeps
// MongoDB up to date with session keys (when each was live, and for whom), runs, their valid checkpoints,
// and saves.
//
// Like the NFT indexer, it reads block ranges and keeps a cursor instead of listening for live events, so
// a restart continues where it stopped and nothing is missed; it stays `confirmations` blocks behind the
// head; and reading the same logs twice changes nothing.
//
// Checkpoints are bare logs on chain, so this is where they're checked: one counts only if its sender is
// the run's player, or a session key that was live for that player at that block, and only between the
// run's start and its save. Registry and hub events are read together in order, so the key's state is
// exactly what it was when the checkpoint was sent.
import { provider as defaultProvider } from "../config/provider.js";
import { HUB } from "../config/constants.js";
import IndexerState from "../models/IndexerState.js";
import SessionKey from "../models/SessionKey.js";
import HubRun from "../models/HubRun.js";
import { gameIdOf, hubIface, registryIface } from "./hub.js";
import { applyRunSaved, refreshPlaytime } from "./hubRuns.js";

const DEFAULTS = {
  pollMs: 5_000,
  confirmations: 2,
  chunk: { start: 5_000, min: 50, max: 20_000 }, // blocks per getLogs; adapts to the RPC
  rpcTimeoutMs: 30_000,
};
const CURSOR = "hub";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = (promise, ms, what) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms))]);

export function createHubIndexer({
  provider = defaultProvider,
  hubAddress = HUB.ADDRESS,
  registryAddress = HUB.REGISTRY,
  startBlock = HUB.START_BLOCK,
  ...options
} = {}) {
  const config = { ...DEFAULTS, ...options, chunk: { ...DEFAULTS.chunk, ...options.chunk } };
  const hub = hubAddress.toLowerCase();
  const registry = registryAddress.toLowerCase();
  const rpc = (promise, what) => withTimeout(promise, config.rpcTimeoutMs, what);
  let chunkSize = config.chunk.start;
  const blockTimes = new Map(); // block number → Date

  function decode(log) {
    const address = log.address.toLowerCase();
    const iface = address === hub ? hubIface : address === registry ? registryIface : null;
    if (!iface || log.removed) return null;
    try {
      const parsed = iface.parseLog(log);
      return parsed && { name: parsed.name, args: parsed.args, block: log.blockNumber, logIndex: log.index, txHash: log.transactionHash };
    } catch {
      return null;
    }
  }

  async function loadBlockTimes(blocks) {
    if (blockTimes.size > 20_000) blockTimes.clear();
    const missing = [...new Set(blocks)].filter((b) => !blockTimes.has(b));
    for (let i = 0; i < missing.length; i += 5) {
      await Promise.all(missing.slice(i, i + 5).map(async (b) => {
        const block = await rpc(provider.getBlock(b), `block ${b}`);
        blockTimes.set(b, new Date(block.timestamp * 1000));
      }));
    }
  }

  async function applyLogs(logs) {
    const events = logs.map(decode).filter(Boolean).sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
    if (!events.length) return { events: 0, checkpoints: 0, saves: 0 };
    await loadBlockTimes(events.map((e) => e.block));

    // Loaded on first use, changed in memory in chain order, written at the end.
    const keys = new Map(); // key address → { owner, intervals }
    const runs = new Map(); // runId → { player, startedAt, savedAt } or null
    const loadKey = async (address) => {
      if (!keys.has(address)) {
        const doc = await SessionKey.findById(address).lean();
        keys.set(address, doc
          ? { owner: doc.owner, intervals: doc.intervals.map((i) => ({ from: new Date(i.from), to: new Date(i.to) })) }
          : { owner: null, intervals: [] });
      }
      return keys.get(address);
    };
    const loadRun = async (runId) => {
      if (!runs.has(runId)) {
        const doc = await HubRun.findById(runId, { player: 1, startedAt: 1, savedAt: 1, status: 1 }).lean();
        runs.set(runId, doc ? { player: doc.player, startedAt: doc.startedAt, savedAt: doc.status === "saved" ? doc.savedAt : null } : null);
      }
      return runs.get(runId);
    };
    const cutAt = (key, at) => key.intervals.forEach((i) => { if (i.from <= at && i.to > at) i.to = at; });
    const liveFor = (key, player, at) => key.owner === player && key.intervals.some((i) => i.from <= at && at < i.to);

    const changedKeys = new Set();
    const startedRuns = [];
    const checkpoints = new Map(); // runId → [checkpoint]
    const saves = [];

    for (const e of events) {
      const at = blockTimes.get(e.block);
      const a = e.args;
      switch (e.name) {
        case "SessionOpened": {
          const address = a.key.toLowerCase();
          const key = await loadKey(address);
          if (key.intervals.some((i) => i.from.getTime() === at.getTime())) break; // already read
          cutAt(key, at); // a renewal replaces the live interval
          key.owner = a.owner.toLowerCase();
          key.intervals.push({ from: at, to: new Date(Number(a.expiresAt) * 1000) });
          changedKeys.add(address);
          break;
        }
        case "SessionClosed": {
          const address = a.key.toLowerCase();
          cutAt(await loadKey(address), at);
          changedKeys.add(address);
          break;
        }
        case "AllSessionsRevoked": {
          const owner = a.owner.toLowerCase();
          for (const doc of await SessionKey.find({ owner }, { _id: 1 }).lean()) await loadKey(doc._id);
          for (const [address, key] of keys) {
            if (key.owner !== owner) continue;
            cutAt(key, at);
            changedKeys.add(address);
          }
          break;
        }
        case "RunStarted": {
          const runId = a.runId.toString();
          const player = a.player.toLowerCase();
          runs.set(runId, { player, startedAt: at, savedAt: null });
          startedRuns.push({
            _id: runId, player, game: Number(a.game), gameId: gameIdOf(a.game) ?? `game_${Number(a.game)}`,
            sender: a.sender.toLowerCase(), params: a.params, startedAt: at, startTx: e.txHash,
          });
          break;
        }
        case "Checkpoint": {
          const runId = a.runId.toString();
          const run = await loadRun(runId);
          if (!run || at < run.startedAt || (run.savedAt && at > run.savedAt)) break;
          const by = a.sender.toLowerCase();
          if (by !== run.player && !liveFor(await loadKey(by), run.player, at)) break;
          if (!checkpoints.has(runId)) checkpoints.set(runId, []);
          checkpoints.get(runId).push({ id: `${e.block}:${e.logIndex}`, at, by, hash: a.stateHash });
          break;
        }
        case "RunSaved": {
          const runId = a.runId.toString();
          const run = await loadRun(runId);
          if (run && !run.savedAt) run.savedAt = at;
          saves.push({ runId, player: a.player, game: a.game, score: a.score, details: a.details, savedAt: at, txHash: e.txHash });
          break;
        }
      }
    }

    // Keys and runs first, then checkpoints, then saves, which work out playtime from the checkpoints.
    const keyWrites = [...changedKeys].filter((address) => keys.get(address).owner).map((address) => ({
      updateOne: { filter: { _id: address }, update: { $set: { owner: keys.get(address).owner, intervals: keys.get(address).intervals } }, upsert: true },
    }));
    if (keyWrites.length) await SessionKey.bulkWrite(keyWrites);
    if (startedRuns.length) {
      await HubRun.bulkWrite(startedRuns.map(({ _id, ...run }) => ({ updateOne: { filter: { _id }, update: { $setOnInsert: run }, upsert: true } })));
    }
    if (checkpoints.size) {
      await HubRun.bulkWrite([...checkpoints].map(([runId, cps]) => ({
        updateOne: { filter: { _id: runId }, update: { $addToSet: { checkpoints: { $each: cps } } } },
      })));
    }
    for (const save of saves) await applyRunSaved(save);
    // Work playtime out again for every run with new checkpoints: the game often reports its save before
    // they're read, and a save already applied isn't applied again.
    for (const runId of checkpoints.keys()) await refreshPlaytime(runId);

    const checkpointCount = [...checkpoints.values()].reduce((n, cps) => n + cps.length, 0);
    return { events: events.length, checkpoints: checkpointCount, saves: saves.length };
  }

  // Reads everything new since the cursor, chunk by chunk, saving the cursor after each chunk.
  async function indexOnce() {
    const safeHead = (await rpc(provider.getBlockNumber(), "getBlockNumber")) - config.confirmations;
    const state = await IndexerState.findOne({ key: CURSOR }).lean();
    let cursor = state ? state.lastBlock : startBlock - 1;
    const totals = { events: 0, checkpoints: 0, saves: 0 };
    while (cursor < safeHead) {
      const toBlock = Math.min(cursor + chunkSize, safeHead);
      let logs;
      try {
        const started = Date.now();
        logs = await rpc(provider.getLogs({ address: [hubAddress, registryAddress], fromBlock: cursor + 1, toBlock }), "getLogs");
        if (Date.now() - started < 3000 && logs.length < 5000) chunkSize = Math.min(config.chunk.max, chunkSize * 2);
      } catch (error) {
        if (chunkSize <= config.chunk.min) throw error;
        chunkSize = Math.max(config.chunk.min, Math.floor(chunkSize / 2));
        continue;
      }
      const applied = await applyLogs(logs);
      for (const k of Object.keys(totals)) totals[k] += applied[k];
      cursor = toBlock;
      await IndexerState.updateOne({ key: CURSOR }, { $set: { lastBlock: cursor, caughtUp: cursor >= safeHead } }, { upsert: true });
    }
    if (totals.events) console.log(`[hub] ${totals.events} event(s): ${totals.checkpoints} valid checkpoint(s), ${totals.saves} save(s)`);
    return totals;
  }

  // Runs indexOnce every `pollMs` until the returned stop function is called.
  function start() {
    let stopped = false;
    (async () => {
      console.log(`[hub] indexer started (hub ${hubAddress}, from block ${startBlock}, ${config.confirmations} confirmations)`);
      while (!stopped) {
        try {
          await indexOnce();
        } catch (error) {
          console.error("[hub] indexing pass failed:", error.message);
        }
        await sleep(config.pollMs);
      }
    })();
    return () => {
      stopped = true;
    };
  }

  return { start, indexOnce };
}

export const hubIndexer = createHubIndexer();
