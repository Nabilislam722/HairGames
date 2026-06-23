import { ethers } from "ethers";
import UserProfile from "../models/UserProfile.js";
import CollectionConfig from "../models/CollectionConfig.js";

// ─────────────────────────────────────────────────────────────────────────────
// ABI
// Includes both ERC721 base and ERC721Enumerable optional extension.
// tokenOfOwnerByIndex will revert on non-enumerable contracts — that's expected
// and handled gracefully in resolveOwnedTokenIds().
// ─────────────────────────────────────────────────────────────────────────────

const ERC721_ABI = [
  // ERC721 base
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  // ERC721Enumerable extension (optional — not all contracts implement this)
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the set of token IDs currently owned by `walletLower` on `contract`.
 *
 * Strategy (in order of preference):
 *
 *  1. ERC721Enumerable  — tokenOfOwnerByIndex(wallet, 0..balance-1)
 *     Direct on-chain read. No events, no block ranges, no RPC log caps.
 *     Works even for tokens minted years ago.
 *
 *  2. Transfer log scan — fallback for non-enumerable contracts.
 *     Queries Transfer events scoped to `startBlock` (from CollectionConfig).
 *     If startBlock is missing it falls back to block 0, which is slower but
 *     still correct as long as the RPC doesn't enforce a hard range cap.
 *
 * Returns an array of numeric token IDs, or null if resolution failed entirely.
 */
async function resolveOwnedTokenIds(contract, walletLower, balance, collection, provider) {
  const balanceNum = Number(balance);

  // ERC721Enumerable 
  try {
    const ids = [];
    for (let i = 0; i < balanceNum; i++) {
      const tokenId = await contract.tokenOfOwnerByIndex(walletLower, i);
      ids.push(Number(tokenId));
    }
    console.log(`   │  └── [Enumerable] Resolved via tokenOfOwnerByIndex: [${ids.join(", ")}]`);
    return ids;
  } catch {
    // Contract doesn't implement ERC721Enumerable — fall through to log scan
    console.log(`   │  └── tokenOfOwnerByIndex not available. Falling back to Transfer log scan...`);
  }

  // ── Strategy 2: Transfer event log scan ───────────────────────────────────
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

    // ── NEW FIX: Catch partial RPC log drops ──
    if (ids.length < balanceNum) {
      console.warn(
        `   │  └── ⚠️ Mismatch: balanceOf says ${balanceNum}, but log scan only found ${ids.length}.\n` +
        `   │      The RPC node likely dropped older events. Padding the missing NFTs.`
      );
      
      const missingCount = balanceNum - ids.length;
      let placeholderId = 9999000; 
      
      for (let i = 0; i < missingCount; i++) {
        // Ensure our placeholder doesn't accidentally match a real ID we did find
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
 * Re-evaluates a wallet's scalar multiplier from its current DB holdings.
 * Returns 1.0 as the floor when no eligible holdings are present.
 */
async function recalculateUserMultiplier(walletLower, allowedCollections) {
  const profile = await UserProfile.findOne({ wallet: walletLower });
  if (!profile || !profile.nftHoldings || profile.nftHoldings.length === 0) {
    return 1.0;
  }

  let highestMultiplier = 1.0;
  const uniqueAddresses = [
    ...new Set(profile.nftHoldings.map(h => h.contractAddress.toLowerCase()))
  ];

  for (const address of uniqueAddresses) {
    const config = allowedCollections.find(c => c.address.toLowerCase() === address);
    if (config && config.multiplier > highestMultiplier) {
      highestMultiplier = config.multiplier;
    }
  }

  return highestMultiplier;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED: PER-WALLET SYNC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Syncs NFT holdings for a single wallet against all monitored collections.
 *
 * Called from:
 *   1. runStartupSanityCheck  — all wallets already in DB at boot
 *   2. GET /api/profile/:wallet — on-demand for wallets with empty holdings
 *   3. Any future manual re-sync endpoint
 */
export async function syncWalletNFTs(walletLower, provider, allowedCollections) {
  console.log(`⚙️  [SYNC] Running NFT sync for: ${walletLower}`);

  // 1. Look for profile, but don't bail out if it doesn't exist yet!
  const profile = await UserProfile.findOne({ wallet: walletLower });
  
  // If profile is missing, start with an empty holdings array
  let baselineHoldings = profile ? [...profile.nftHoldings] : [];
  let structureChanged = !profile; // If it's a new profile, we absolutely need to save it

  for (const collection of allowedCollections) {
    const contractLower = collection.address.toLowerCase();

    try {
      const contract      = new ethers.Contract(collection.address, ERC721_ABI, provider);
      const actualBalance = await contract.balanceOf(walletLower);
      const balanceNum    = Number(actualBalance);
      const dbCount       = baselineHoldings.filter(h => h.contractAddress === contractLower).length;

      console.log(`   ├─ 📄 [${collection.name}]: DB=${dbCount} | Chain=${balanceNum}`);

      // CASE 1: Wallet doesn't own any tokens, but DB has stale records
      if (balanceNum === 0 && dbCount > 0) {
        console.log(`   ├─ ⚠️  [CASE 1] Balance is 0. Clearing stale DB entries for ${collection.name}.`);
        baselineHoldings = baselineHoldings.filter(h => h.contractAddress !== contractLower);
        structureChanged = true;
        continue;
      }

      // CASE 2: Chain balance exceeds DB (Catching historical or missed assets)
      if (balanceNum > dbCount) {
        console.log(`   ├─ ⚠️  [CASE 2] Chain ahead of DB. Resolving token IDs for ${collection.name}...`);

        const ownedIds = await resolveOwnedTokenIds(
          contract, walletLower, actualBalance, collection, provider
        );

        if (!ownedIds) continue; // RPC failure mitigation

        console.log(`   ├─ ✅ Final owned IDs discovered: [${ownedIds.join(", ")}]`);

        // Flush old records for this collection to avoid duplicates, then rebuild
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

  // 2. If data changed OR this is a completely new user profile, commit via Upsert
  if (structureChanged) {
    let highestMultiplier = 1.0;
    const uniqueAddresses = [...new Set(baselineHoldings.map(h => h.contractAddress.toLowerCase()))];
    
    for (const address of uniqueAddresses) {
      const config = allowedCollections.find(c => c.address.toLowerCase() === address);
      if (config && config.multiplier > highestMultiplier) {
        highestMultiplier = config.multiplier;
      }
    }

    // Use findOneAndUpdate with upsert to write data safely
    await UserProfile.findOneAndUpdate(
      { wallet: walletLower },
      {
        $set: {
          nftHoldings:  baselineHoldings,
          multiplier:   highestMultiplier,
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

    console.log(`   💾 [SYNC SAVED] ${walletLower} | holdings=${baselineHoldings.length} | multiplier=${highestMultiplier}x\n`);
  } else {
    console.log(`   ✅ Already up-to-date for ${walletLower}.\n`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP SANITY CHECK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs at boot to reconcile all existing DB profiles against on-chain state.
 */
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

/**
 * Starts the 24/7 NFT Transfer event watcher.
 * Call once from your server entry point after DB connects.
 */
export async function startNftWatcher(provider) {
  console.log("🚀 Live 24/7 NFT Transfer Event Daemon starting...");

  try {
    const allowedCollections = await CollectionConfig.find({}).lean();
    console.log(`📦 Loaded ${allowedCollections.length} collection config(s) from DB.`);

    if (allowedCollections.length === 0) {
      console.warn("⚠️  CollectionConfig is empty. Seed your DB before starting the watcher.");
      return;
    }

    // Phase 1: Back-fill state that drifted while offline
    await runStartupSanityCheck(provider, allowedCollections);

    // Phase 2: Attach live Transfer listeners
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

            // Verify the pull actually worked by checking ownerOf on-chain.
            // If ownerOf still returns fromLower (shouldn't happen in normal flow),
            // this acts as an integrity check you can hook alerts into.
            try {
              const contract2 = new ethers.Contract(collection.address, ERC721_ABI, provider);
              const currentOwner = await contract2.ownerOf(idNum);
              if (currentOwner.toLowerCase() === fromLower) {
                console.warn(`   ├─ ⚠️  ownerOf still returns sender after pull — possible re-org or RPC lag.`);
              }
            } catch {
              // ownerOf reverts if token was burned — that's fine
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

            // Double-check ownership before writing — guards against re-org edge cases
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