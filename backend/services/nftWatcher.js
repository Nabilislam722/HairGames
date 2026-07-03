import { ethers } from "ethers";
import UserProfile from "../models/UserProfile.js";
import CollectionConfig from "../models/CollectionConfig.js";

const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPER — single source of truth for multiplier calculation
// Formula: 1.0 + Σ(bonus × count) per collection
// Example: 2 NFTs from a 1.25x collection → 1.0 + (0.25 × 2) = 1.50x
// Example: 1× 1.25x + 1× 1.50x collection  → 1.0 + 0.25 + 0.50 = 1.75x
// ─────────────────────────────────────────────────────────────────────────────
function computeStackedMultiplier(holdings, allowedCollections) {
  if (!holdings || holdings.length === 0) return 1.0;

  const uniqueAddresses = [...new Set(holdings.map(h => h.contractAddress.toLowerCase()))];
  let totalBonus = 0.0;

  for (const address of uniqueAddresses) {
    const config = allowedCollections.find(c => c.address.toLowerCase() === address);
    if (config) {
      const count = holdings.filter(h => h.contractAddress.toLowerCase() === address).length;
      totalBonus += (config.multiplier - 1.0) * count;
    }
  }
  if (totalBonus > 0.5) {
    totalBonus = 0.5;
  }
  return parseFloat((1.0 + totalBonus).toFixed(2));
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function resolveOwnedTokenIds(contract, walletLower, balance, collection, provider) {
  const balanceNum = Number(balance);

  // Strategy 1: ERC721Enumerable
  try {
    const ids = [];
    for (let i = 0; i < balanceNum; i++) {
      const tokenId = await contract.tokenOfOwnerByIndex(walletLower, i);
      ids.push(Number(tokenId));
    }
    console.log(`   │  └── [Enumerable] Resolved via tokenOfOwnerByIndex: [${ids.join(", ")}]`);
    return ids;
  } catch {
    console.log(`   │  └── tokenOfOwnerByIndex not available. Falling back to Transfer log scan...`);
  }

  // Strategy 2: Transfer event log scan
  try {
    const startBlock = collection.startBlock ?? 0;
    console.log(`   │  └── Querying Transfer logs from block ${startBlock} to latest...`);

    const filterTo   = contract.filters.Transfer(null, walletLower);
    const filterFrom = contract.filters.Transfer(walletLower, null);

    const [toEvents, fromEvents] = await Promise.all([
      contract.queryFilter(filterTo,   startBlock, "latest"),
      contract.queryFilter(filterFrom, startBlock, "latest"),
    ]);

    const sentAway = new Set(fromEvents.map(e => Number(e.args.tokenId)));
    const ids = [
      ...new Set(
        toEvents
          .map(e => Number(e.args.tokenId))
          .filter(id => !sentAway.has(id))
      )
    ];

    if (ids.length < balanceNum) {
      console.warn(
        `   │  └── ⚠️ Mismatch: balanceOf says ${balanceNum}, but log scan only found ${ids.length}.\n` +
        `   │      The RPC node likely dropped older events. Padding the missing NFTs.`
      );
      const missingCount = balanceNum - ids.length;
      let placeholderId = 9999000;
      for (let i = 0; i < missingCount; i++) {
        while (ids.includes(placeholderId)) { placeholderId++; }
        ids.push(placeholderId);
        placeholderId++;
      }
    }

    console.log(`   │  └── [Log scan] Resolved token IDs: [${ids.join(", ")}]`);
    return ids;

  } catch (logErr) {
    console.error(`   │  └── ❌ Log scan failed:`, logErr.message);
    return null;
  }
}

/**
 * Re-evaluates a wallet's stacked multiplier from its current DB holdings.
 * Reads fresh from DB so it's always accurate after a $pull or $push.
 */
async function recalculateUserMultiplier(walletLower, allowedCollections) {
  const profile = await UserProfile.findOne({ wallet: walletLower });
  if (!profile || !profile.nftHoldings || profile.nftHoldings.length === 0) return 1.0;
  return computeStackedMultiplier(profile.nftHoldings, allowedCollections);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED: PER-WALLET SYNC
// ─────────────────────────────────────────────────────────────────────────────

export async function syncWalletNFTs(walletLower, provider, allowedCollections) {
  console.log(`⚙️  [SYNC] Running NFT sync for: ${walletLower}`);

  const profile = await UserProfile.findOne({ wallet: walletLower });
  let baselineHoldings = profile ? [...profile.nftHoldings] : [];
  let structureChanged = !profile;

  for (const collection of allowedCollections) {
    const contractLower = collection.address.toLowerCase();

    try {
      const contract      = new ethers.Contract(collection.address, ERC721_ABI, provider);
      const actualBalance = await contract.balanceOf(walletLower);
      const balanceNum    = Number(actualBalance);
      const dbCount       = baselineHoldings.filter(h => h.contractAddress === contractLower).length;

      console.log(`   ├─ 📄 [${collection.name}]: DB=${dbCount} | Chain=${balanceNum}`);

      // CASE 1: Wallet holds nothing on-chain but DB has stale records → wipe
      if (balanceNum === 0 && dbCount > 0) {
        console.log(`   ├─ ⚠️  [CASE 1] Balance is 0. Clearing stale DB entries for ${collection.name}.`);
        baselineHoldings = baselineHoldings.filter(h => h.contractAddress !== contractLower);
        structureChanged = true;
        continue;
      }

      // CASE 2: Chain balance exceeds DB → resolve and add missing tokens
      if (balanceNum > dbCount) {
        console.log(`   ├─ ⚠️  [CASE 2] Chain ahead of DB. Resolving token IDs for ${collection.name}...`);

        const ownedIds = await resolveOwnedTokenIds(
          contract, walletLower, actualBalance, collection, provider
        );
        if (!ownedIds) continue;

        console.log(`   ├─ ✅ Final owned IDs discovered: [${ownedIds.join(", ")}]`);

        baselineHoldings = baselineHoldings.filter(h => h.contractAddress !== contractLower);
        for (const id of ownedIds) {
          baselineHoldings.push({
            contractAddress: contractLower,
            tokenId:         id,
            name:            `${collection.name} #${id}`,
            collectionName:  collection.name,
            emoji:           collection.emoji || "🔮",
            color:           collection.color || "#a78bfa"
          });
        }
        structureChanged = true;
      }

      // CASE 3: DB has more entries than chain (sold some but not all while server was offline)
      if (balanceNum > 0 && balanceNum < dbCount) {
        console.log(`   ├─ ⚠️  [CASE 3] DB ahead of chain (${dbCount} → ${balanceNum}). Re-resolving for ${collection.name}...`);

        const ownedIds = await resolveOwnedTokenIds(
          contract, walletLower, actualBalance, collection, provider
        );
        if (!ownedIds) continue;

        console.log(`   ├─ ✅ Corrected owned IDs: [${ownedIds.join(", ")}]`);

        baselineHoldings = baselineHoldings.filter(h => h.contractAddress !== contractLower);
        for (const id of ownedIds) {
          baselineHoldings.push({
            contractAddress: contractLower,
            tokenId:         id,
            name:            `${collection.name} #${id}`,
            collectionName:  collection.name,
            emoji:           collection.emoji || "🔮",
            color:           collection.color || "#a78bfa"
          });
        }
        structureChanged = true;
      }

    } catch (err) {
      console.error(`   ❌ balanceOf error on ${collection.address}:`, err.message);
    }
  }

  if (structureChanged) {
    const stackedMultiplier = computeStackedMultiplier(baselineHoldings, allowedCollections);

    await UserProfile.findOneAndUpdate(
      { wallet: walletLower },
      {
        $set: {
          nftHoldings:  baselineHoldings,
          multiplier:   stackedMultiplier,
          lastSyncedAt: new Date()
        },
        $setOnInsert: {
          points: 0,
          completedTasks: [],
          processedHashes: []
        }
      },
      { upsert: true, new: true }
    );

    console.log(`   💾 [SYNC SAVED] ${walletLower} | holdings=${baselineHoldings.length} | multiplier=${stackedMultiplier}x\n`);
  } else {
    console.log(`   ✅ Already up-to-date for ${walletLower}.\n`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP SANITY CHECK
// ─────────────────────────────────────────────────────────────────────────────

async function runStartupSanityCheck(provider, allowedCollections) {
  const profiles = await UserProfile.find({});
  console.log(`\n🔍 [STARTUP] Syncing ${profiles.length} existing profiles...`);
  console.log(`📦 Monitored collections: ${allowedCollections.map(c => c.name).join(", ") || "NONE"}\n`);

  for (const profile of profiles) {
    await syncWalletNFTs(profile.wallet.toLowerCase(), provider, allowedCollections);
  }

  console.log(`🏁 [STARTUP] Sanity check complete.\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DAEMON
// ─────────────────────────────────────────────────────────────────────────────

export async function startNftWatcher(provider) {
  console.log("🚀 Live 24/7 NFT Transfer Event Daemon starting...");

  try {
    const allowedCollections = await CollectionConfig.find({}).lean();
    console.log(`📦 Loaded ${allowedCollections.length} collection config(s) from DB.`);

    if (allowedCollections.length === 0) {
      console.warn("⚠️  CollectionConfig is empty. Seed your DB before starting the watcher.");
      return;
    }

    await runStartupSanityCheck(provider, allowedCollections);

    for (const collection of allowedCollections) {
      const contract = new ethers.Contract(collection.address, ERC721_ABI, provider);
      console.log(`📡 Listening for Transfers on: ${collection.name} [${collection.address}]`);

      contract.on("Transfer", async (from, to, tokenId) => {
        const fromLower     = from.toLowerCase();
        const toLower       = to.toLowerCase();
        const idNum         = Number(tokenId);
        const contractLower = collection.address.toLowerCase();

        console.log(`\n🔔 [LIVE] [${collection.name}] Token #${idNum}: ${fromLower} → ${toLower}`);

        try {
          // 1. Remove from sender
          if (fromLower !== ethers.ZeroAddress.toLowerCase()) {
            console.log(`   ├─ 📉 Removing token #${idNum} from ${fromLower}`);

            await UserProfile.updateOne(
              { wallet: fromLower },
              { $pull: { nftHoldings: { contractAddress: contractLower, tokenId: idNum } } }
            );

            try {
              const contract2 = new ethers.Contract(collection.address, ERC721_ABI, provider);
              const currentOwner = await contract2.ownerOf(idNum);
              if (currentOwner.toLowerCase() === fromLower) {
                console.warn(`   ├─ ⚠️  ownerOf still returns sender after pull — possible re-org or RPC lag.`);
              }
            } catch {
              // ownerOf reverts if token was burned — fine
            }

            const newMultiplier = await recalculateUserMultiplier(fromLower, allowedCollections);
            await UserProfile.updateOne(
              { wallet: fromLower },
              { $set: { multiplier: newMultiplier, lastSyncedAt: new Date() } }
            );
            console.log(`   ├─ ✅ Sender multiplier: ${newMultiplier}x`);
          }

          // 2. Add to receiver
          if (toLower !== ethers.ZeroAddress.toLowerCase()) {
            console.log(`   ├─ 📈 Adding token #${idNum} to ${toLower}`);

            try {
              const contract2    = new ethers.Contract(collection.address, ERC721_ABI, provider);
              const currentOwner = await contract2.ownerOf(idNum);
              if (currentOwner.toLowerCase() !== toLower) {
                console.warn(
                  `   ├─ ⚠️  ownerOf(${idNum}) returned ${currentOwner} — ` +
                  `does not match event 'to' (${toLower}). Skipping write to avoid corrupt state.`
                );
                return;
              }
            } catch (ownerErr) {
              console.warn(`   ├─ ⚠️  ownerOf check failed (${ownerErr.message}). Proceeding with event data.`);
            }

            await UserProfile.findOneAndUpdate(
              { wallet: toLower },
              {
                $setOnInsert: { points: 0, completedTasks: [], processedHashes: [] },
                $push: {
                  nftHoldings: {
                    contractAddress: contractLower,
                    tokenId:         idNum,
                    name:            `${collection.name} #${idNum}`,
                    collectionName:  collection.name,
                    emoji:           collection.emoji || "🔮",
                    color:           collection.color || "#a78bfa"
                  }
                }
              },
              { upsert: true }
            );

            const newMultiplier = await recalculateUserMultiplier(toLower, allowedCollections);
            await UserProfile.updateOne(
              { wallet: toLower },
              { $set: { multiplier: newMultiplier, lastSyncedAt: new Date() } }
            );
            console.log(`   ├─ ✅ Receiver multiplier: ${newMultiplier}x`);
          }

        } catch (eventErr) {
          console.error(`   ❌ Error handling Transfer for token #${idNum}:`, eventErr.message);
        }

        console.log(`   🏁 Done with Token #${idNum}\n`);
      });
    }

    console.log("✅ All event listeners attached. Watcher is live.\n");

  } catch (error) {
    console.error("❌ Critical failure initializing NFT Watcher:", error);
  }
}