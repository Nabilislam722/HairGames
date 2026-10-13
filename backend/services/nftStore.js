// MongoDB storage for the NFT indexer (services/nftIndexer.js describes the interface by use).
import CollectionConfig from "../models/CollectionConfig.js";
import IndexerState from "../models/IndexerState.js";
import NftToken from "../models/NftToken.js";
import UserProfile from "../models/UserProfile.js";

const BATCH = 1000;

function* batches(items, size = BATCH) {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

// The fields a profile caches; display-only extras (imageUrl, active) are added per request.
const toCachedHolding = ({ contractAddress, tokenId, name, collectionName, emoji, color, countsFrom }) => ({
  contractAddress, tokenId, name, collectionName, emoji, color, countsFrom,
});

export const mongoNftStore = {
  loadCollections: () => CollectionConfig.find({}).lean(),

  async loadCursors(keys) {
    const docs = await IndexerState.find({ key: { $in: keys } }).lean();
    return new Map(docs.map((d) => [d.key, d]));
  },

  // caughtUp only ever turns on.
  async saveCursors(keys, lastBlock, caughtUp) {
    await IndexerState.bulkWrite(
      keys.map((key) => ({
        updateOne: {
          filter: { key },
          update: caughtUp ? { $set: { lastBlock, caughtUp: true } } : { $set: { lastBlock }, $setOnInsert: { caughtUp: false } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  },

  // keys are "contract:tokenId"; returns a Map keyed the same way.
  async loadTokens(keys) {
    const byContract = new Map();
    for (const key of keys) {
      const [contract, tokenId] = key.split(":");
      if (!byContract.has(contract)) byContract.set(contract, []);
      byContract.get(contract).push(tokenId);
    }
    const found = new Map();
    for (const [contract, tokenIds] of byContract) {
      for (const ids of batches(tokenIds)) {
        for (const doc of await NftToken.find({ contract, tokenId: { $in: ids } }).lean()) {
          found.set(`${doc.contract}:${doc.tokenId}`, doc);
        }
      }
    }
    return found;
  },

  async saveTokens(docs) {
    for (const batch of batches(docs)) {
      await NftToken.bulkWrite(
        batch.map(({ contract, tokenId, owner, block, logIndex, acquiredAt }) => ({
          updateOne: {
            filter: { contract, tokenId },
            update: { $set: { owner, block, logIndex, acquiredAt } },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    }
  },

  tokensOwnedBy: (wallet, contracts) =>
    contracts.length ? NftToken.find({ owner: wallet, contract: { $in: contracts } }).lean() : [],

  // Only wallets with a profile get a cached copy.
  async playerWallets(wallets) {
    const players = [];
    for (const batch of batches(wallets, 500)) {
      for (const doc of await UserProfile.find({ wallet: { $in: batch } }, { wallet: 1 }).lean()) players.push(doc.wallet);
    }
    return players;
  },

  async *playerWalletBatches(size) {
    let batch = [];
    for await (const doc of UserProfile.find({}, { wallet: 1 }).lean().cursor()) {
      batch.push(doc.wallet);
      if (batch.length >= size) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  },

  async cachedHoldings(wallet) {
    const profile = await UserProfile.findOne({ wallet }, { nftHoldings: 1 }).lean();
    return profile?.nftHoldings ?? [];
  },

  saveProfileCache: (wallet, holdings, multiplier) =>
    UserProfile.updateOne(
      { wallet },
      { $set: { nftHoldings: holdings.map(toCachedHolding), multiplier, lastSyncedAt: new Date() } }
    ),
};
