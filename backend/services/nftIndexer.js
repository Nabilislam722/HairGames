// NFT ownership indexer behind the HP multiplier.
//
// It reads Transfer logs block range by block range and keeps a cursor per collection, instead of
// listening for live events (an HTTP RPC filter can expire without a sound, and nothing replays
// what happened while the server was down):
//  - A restart continues from the saved block, so no transfer is missed.
//  - It stays `confirmations` blocks behind the head, so shallow reorgs never land.
//  - Each token has one ownership record and only a later transfer replaces it, so replayed or
//    duplicate events change nothing.
//  - Collections added to CollectionConfig are picked up on the next pass and backfilled from their
//    startBlock.
//  - An NFT counts toward the multiplier only after it has been held `holdHours`, so one NFT can't
//    be passed between wallets to boost each of them in turn.
//
// Storage goes through a small `store` interface (services/nftStore.js for MongoDB), which keeps
// this file testable against a local chain.
import { ethers } from "ethers";

export const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
export const ZERO_ADDRESS = ethers.ZeroAddress.toLowerCase();
export const MAX_BONUS = 0.5; // the multiplier tops out at 1.5x

const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
];

const DEFAULTS = {
  pollMs: 10_000,
  confirmations: 3,
  holdHours: undefined, // from NFT_HOLD_HOURS, else 24
  chunk: { start: 20_000, min: 100, max: 100_000 }, // blocks per getLogs; adapts to the RPC
  rpcTimeoutMs: 30_000,
  reconcileEveryMs: 10 * 60_000, // per wallet
  now: () => Date.now(),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = (promise, ms, what) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms))]);

export const tokenKey = (contract, tokenId) => `${contract}:${tokenId}`;
export const cursorKey = (contract) => `nft:${contract.toLowerCase()}`;
const topicAddress = (topic) => ethers.getAddress(ethers.dataSlice(topic, 12)).toLowerCase();

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

// Transfer logs → transfers in chain order. ERC-20 Transfers share the topic but index only two
// arguments, so they carry three topics instead of four and are skipped.
export function decodeTransfers(logs) {
  return logs
    .filter((log) => !log.removed && log.topics.length === 4 && log.topics[0] === TRANSFER_TOPIC)
    .map((log) => ({
      contract: log.address.toLowerCase(),
      from: topicAddress(log.topics[1]),
      to: topicAddress(log.topics[2]),
      tokenId: BigInt(log.topics[3]).toString(),
      block: log.blockNumber,
      logIndex: log.index,
    }))
    .sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
}

// The last transfer of each token wins. Also returns every wallet that sent or received one.
export function foldTransfers(transfers) {
  const latest = new Map();
  const wallets = new Set();
  for (const transfer of transfers) {
    latest.set(tokenKey(transfer.contract, transfer.tokenId), transfer);
    if (transfer.from !== ZERO_ADDRESS) wallets.add(transfer.from);
    if (transfer.to !== ZERO_ADDRESS) wallets.add(transfer.to);
  }
  return { latest: [...latest.values()], wallets };
}

// An incoming state replaces the stored one only if its transfer came later in the chain.
export const isNewer = (incoming, stored) =>
  !stored || incoming.block > stored.block || (incoming.block === stored.block && incoming.logIndex > stored.logIndex);

// 1 + the bonus of every active holding (a 1.25x collection adds 0.25 per NFT), capped at +0.5.
export function computeMultiplier(holdings, collections) {
  const bonusOf = new Map(collections.map((c) => [c.address.toLowerCase(), c.multiplier - 1]));
  let bonus = 0;
  for (const holding of holdings) if (holding.active) bonus += bonusOf.get(holding.contractAddress) ?? 0;
  return Number((1 + Math.min(Math.max(bonus, 0), MAX_BONUS)).toFixed(2));
}

// ─────────────────────────────────────────────────────────────────────────────
// Indexer
// ─────────────────────────────────────────────────────────────────────────────

export function createNftIndexer({ provider, store, ...options }) {
  const config = { ...DEFAULTS, ...options, chunk: { ...DEFAULTS.chunk, ...options.chunk } };
  // Read on use: the env file loads after this module.
  const holdMs = () => (config.holdHours ?? Number(process.env.NFT_HOLD_HOURS ?? 24)) * 3_600_000;
  const rpc = (promise, what) => withTimeout(promise, config.rpcTimeoutMs, what);

  let chunkSize = config.chunk.start;
  const blockTimes = new Map(); // block number → ms
  const lastReconciled = new Map(); // wallet → ms

  async function loadBlockTimes(blocks) {
    if (blockTimes.size > 20_000) blockTimes.clear();
    const missing = [...new Set(blocks)].filter((b) => !blockTimes.has(b));
    for (let i = 0; i < missing.length; i += 5) {
      await Promise.all(
        missing.slice(i, i + 5).map(async (b) => {
          const block = await rpc(provider.getBlock(b), `block ${b}`);
          blockTimes.set(b, block.timestamp * 1000);
        })
      );
    }
  }

  // Stores the newest state of each transferred token. Returns the wallets whose holdings changed.
  async function applyLogs(logs) {
    const { latest, wallets } = foldTransfers(decodeTransfers(logs));
    if (!latest.length) return { wallets, transfers: 0 };
    const stored = await store.loadTokens(latest.map((t) => tokenKey(t.contract, t.tokenId)));
    const newer = latest.filter((t) => isNewer(t, stored.get(tokenKey(t.contract, t.tokenId))));
    await loadBlockTimes(newer.map((t) => t.block));
    await store.saveTokens(
      newer.map((t) => ({
        contract: t.contract,
        tokenId: t.tokenId,
        owner: t.to,
        block: t.block,
        logIndex: t.logIndex,
        acquiredAt: new Date(blockTimes.get(t.block)),
      }))
    );
    return { wallets, transfers: latest.length };
  }

  // Reads collections that share a cursor up to safeHead, chunk by chunk, saving the cursor after
  // each chunk. The chunk grows while the RPC answers quickly and halves when it fails.
  async function indexRange(addresses, fromBlock, safeHead) {
    const wallets = new Set();
    let transfers = 0;
    let cursor = fromBlock - 1;
    while (cursor < safeHead) {
      const toBlock = Math.min(cursor + chunkSize, safeHead);
      let logs;
      try {
        const started = Date.now();
        logs = await rpc(
          provider.getLogs({ address: addresses, topics: [TRANSFER_TOPIC], fromBlock: cursor + 1, toBlock }),
          "getLogs"
        );
        if (Date.now() - started < 3000 && logs.length < 5000) chunkSize = Math.min(config.chunk.max, chunkSize * 2);
      } catch (error) {
        if (chunkSize <= config.chunk.min) throw error;
        chunkSize = Math.max(config.chunk.min, Math.floor(chunkSize / 2));
        continue;
      }
      const applied = await applyLogs(logs);
      applied.wallets.forEach((w) => wallets.add(w));
      transfers += applied.transfers;
      cursor = toBlock;
      await store.saveCursors(addresses.map(cursorKey), cursor, cursor >= safeHead);
    }
    return { wallets, transfers };
  }

  // One pass over every collection: backfills new ones, then reads what's new since the cursor.
  async function indexOnce() {
    const collections = await store.loadCollections();
    if (!collections.length) return { changed: 0, transfers: 0 };
    const safeHead = (await rpc(provider.getBlockNumber(), "getBlockNumber")) - config.confirmations;
    const cursors = await store.loadCursors(collections.map((c) => cursorKey(c.address)));

    // Collections at the same cursor share one getLogs call; once caught up, they all do.
    const groups = new Map();
    for (const c of collections) {
      const address = c.address.toLowerCase();
      const saved = cursors.get(cursorKey(address));
      const next = saved ? saved.lastBlock + 1 : Math.max(0, c.startBlock ?? 0);
      if (next > safeHead) continue;
      if (!groups.has(next)) groups.set(next, []);
      groups.get(next).push(address);
    }

    const changed = new Set();
    let transfers = 0;
    let finishedBackfill = false;
    for (const [next, addresses] of [...groups].sort((a, b) => a[0] - b[0])) {
      const backfill = addresses.some((a) => !cursors.get(cursorKey(a))?.caughtUp);
      if (backfill) console.log(`[nft] backfilling ${addresses.length} collection(s) from block ${next} to ${safeHead}`);
      const result = await indexRange(addresses, next, safeHead);
      result.wallets.forEach((w) => changed.add(w));
      transfers += result.transfers;
      if (backfill) {
        finishedBackfill = true;
        console.log(`[nft] backfill done: ${result.transfers} token(s) indexed`);
      }
    }

    // A finished backfill switches every profile over to indexed data; otherwise refresh only
    // the wallets that moved NFTs.
    if (finishedBackfill) await refreshAllProfiles(collections);
    else if (changed.size) await refreshProfiles([...changed], collections);
    if (transfers && !finishedBackfill) console.log(`[nft] ${transfers} transfer(s), ${changed.size} wallet(s) updated`);
    return { changed: changed.size, transfers };
  }

  // A wallet's NFTs in the multiplier collections and its multiplier right now. `pendingMultiplier`
  // is what it rises to once every NFT it holds has been held long enough.
  async function walletNfts(wallet, collections) {
    wallet = wallet.toLowerCase();
    collections ??= await store.loadCollections();
    const cursors = await store.loadCursors(collections.map((c) => cursorKey(c.address)));
    const byAddress = new Map(collections.map((c) => [c.address.toLowerCase(), c]));
    const indexed = [...byAddress.keys()].filter((a) => cursors.get(cursorKey(a))?.caughtUp);
    const now = config.now();
    const hold = holdMs();

    const holdings = (await store.tokensOwnedBy(wallet, indexed)).map((t) => {
      const c = byAddress.get(t.contract);
      const countsFrom = new Date(t.acquiredAt).getTime() + hold;
      return {
        contractAddress: t.contract,
        tokenId: t.tokenId,
        name: `${c.name} #${t.tokenId}`,
        collectionName: c.name,
        emoji: c.emoji || "🔮",
        color: c.color || "#a78bfa",
        imageUrl: c.imageUrl,
        countsFrom: new Date(countsFrom),
        active: countsFrom <= now,
      };
    });

    // Until a collection's first backfill finishes, use the holdings cached on the profile.
    const pending = new Set([...byAddress.keys()].filter((a) => !indexed.includes(a)));
    if (pending.size) {
      for (const h of await store.cachedHoldings(wallet)) {
        if (!pending.has(h.contractAddress)) continue;
        holdings.push({ ...h, tokenId: String(h.tokenId), imageUrl: byAddress.get(h.contractAddress)?.imageUrl, active: true });
      }
    }

    return {
      holdings,
      multiplier: computeMultiplier(holdings, collections),
      pendingMultiplier: computeMultiplier(holdings.map((h) => ({ ...h, active: true })), collections),
    };
  }

  async function refreshProfiles(wallets, collections) {
    collections ??= await store.loadCollections();
    for (const wallet of await store.playerWallets(wallets)) {
      const { holdings, multiplier } = await walletNfts(wallet, collections);
      await store.saveProfileCache(wallet, holdings, multiplier);
    }
  }

  async function refreshAllProfiles(collections) {
    let count = 0;
    for await (const batch of store.playerWalletBatches(500)) {
      for (const wallet of batch) {
        const { holdings, multiplier } = await walletNfts(wallet, collections);
        await store.saveProfileCache(wallet, holdings, multiplier);
        count++;
      }
    }
    console.log(`[nft] refreshed ${count} profile(s) from indexed data`);
  }

  // A cheap safety net for one wallet (at most every `reconcileEveryMs`): compares on-chain
  // balances with the index and repairs what differs, in case the RPC ever returned incomplete logs.
  async function reconcileWallet(wallet) {
    wallet = wallet.toLowerCase();
    const now = Date.now();
    if (now - (lastReconciled.get(wallet) ?? 0) < config.reconcileEveryMs) return { skipped: true, repairs: 0 };
    if (lastReconciled.size > 50_000) lastReconciled.clear();
    lastReconciled.set(wallet, now);

    const collections = await store.loadCollections();
    const cursors = await store.loadCursors(collections.map((c) => cursorKey(c.address)));
    const head = await rpc(provider.getBlockNumber(), "getBlockNumber");
    const repairs = [];
    const touched = new Set([wallet]);

    for (const c of collections) {
      const address = c.address.toLowerCase();
      if (!cursors.get(cursorKey(address))?.caughtUp) continue;
      const contract = new ethers.Contract(address, ERC721_ABI, provider);
      const balance = Number(await rpc(contract.balanceOf(wallet), "balanceOf"));
      const mine = await store.tokensOwnedBy(wallet, [address]);
      if (balance === mine.length) continue;

      let kept = 0;
      for (const t of mine) {
        const owner = await rpc(contract.ownerOf(t.tokenId), "ownerOf").then((o) => o.toLowerCase(), () => ZERO_ADDRESS);
        if (owner === wallet) kept++;
        else {
          repairs.push({ contract: address, tokenId: t.tokenId, owner });
          if (owner !== ZERO_ADDRESS) touched.add(owner);
        }
      }
      if (balance > kept) {
        try {
          const known = new Set(mine.map((t) => t.tokenId));
          for (let i = 0; i < balance; i++) {
            const id = (await rpc(contract.tokenOfOwnerByIndex(wallet, i), "tokenOfOwnerByIndex")).toString();
            if (!known.has(id)) repairs.push({ contract: address, tokenId: id, owner: wallet });
          }
        } catch {
          console.warn(`[nft] ${wallet} holds ${balance} ${c.name} but ${kept} are indexed, and the contract can't list them`);
        }
      }
    }

    if (repairs.length) {
      console.warn(`[nft] reconcile ${wallet}: repaired ${repairs.length} token(s)`);
      // Stamped at the current head, so only transfers after this point replace them. The real
      // acquisition time is unknown, so the hold period starts now.
      await store.saveTokens(
        repairs.map((r) => ({ ...r, block: head, logIndex: Number.MAX_SAFE_INTEGER, acquiredAt: new Date(config.now()) }))
      );
      await refreshProfiles([...touched], collections);
    }
    return { skipped: false, repairs: repairs.length };
  }

  // Runs indexOnce every `pollMs` until the returned stop function is called.
  function start() {
    let stopped = false;
    (async () => {
      console.log(`[nft] indexer started (${config.confirmations} confirmations, ${holdMs() / 3_600_000}h hold)`);
      while (!stopped) {
        try {
          await indexOnce();
        } catch (error) {
          console.error("[nft] indexing pass failed:", error.message);
        }
        await sleep(config.pollMs);
      }
    })();
    return () => {
      stopped = true;
    };
  }

  return {
    start,
    indexOnce,
    walletNfts,
    walletMultiplier: async (wallet) => (await walletNfts(wallet)).multiplier,
    reconcileWallet,
    refreshProfiles,
  };
}
