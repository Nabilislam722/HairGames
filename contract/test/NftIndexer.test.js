// Runs the backend NFT indexer (backend/services/nftIndexer.js) against a local chain, with an
// in-memory store in place of MongoDB, and checks the index against what the contracts say.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const HOUR = 3_600_000;
const indexerModule = () =>
  import(pathToFileURL(path.join(__dirname, "..", "..", "backend", "services", "nftIndexer.js")).href);

// Same interface as backend/services/nftStore.js, kept in memory.
function memoryStore(collections) {
  const tokens = new Map();
  const cursors = new Map();
  const profiles = new Map();
  return {
    collections, tokens, cursors, profiles,
    loadCollections: async () => collections.map((c) => ({ ...c })),
    loadCursors: async (keys) => new Map(keys.filter((k) => cursors.has(k)).map((k) => [k, { ...cursors.get(k) }])),
    saveCursors: async (keys, lastBlock, caughtUp) =>
      keys.forEach((k) => cursors.set(k, { lastBlock, caughtUp: caughtUp || !!cursors.get(k)?.caughtUp })),
    loadTokens: async (keys) => new Map(keys.filter((k) => tokens.has(k)).map((k) => [k, { ...tokens.get(k) }])),
    saveTokens: async (docs) => docs.forEach((d) => tokens.set(`${d.contract}:${d.tokenId}`, { ...d })),
    tokensOwnedBy: async (wallet, contracts) =>
      [...tokens.values()].filter((t) => t.owner === wallet && contracts.includes(t.contract)).map((t) => ({ ...t })),
    playerWallets: async (wallets) => wallets.filter((w) => profiles.has(w)),
    async *playerWalletBatches() {
      yield [...profiles.keys()];
    },
    cachedHoldings: async (wallet) => profiles.get(wallet)?.nftHoldings ?? [],
    saveProfileCache: async (wallet, nftHoldings, multiplier) => profiles.set(wallet, { nftHoldings, multiplier }),
  };
}

describe("NFT indexer", () => {
  let lib, plain, enumerable, deployer, alice, bob, carol, collections, clock;
  const lc = (signer) => signer.address.toLowerCase();
  const mine = (blocks) => network.provider.send("hardhat_mine", [ethers.toQuantity(blocks)]);
  const latestTime = async () => (await ethers.provider.getBlock("latest")).timestamp * 1000;

  const indexer = (store, options = {}) =>
    lib.createNftIndexer({
      provider: ethers.provider,
      store,
      holdHours: 24,
      confirmations: 3,
      chunk: { start: 4, min: 1, max: 8 }, // tiny chunks, so every test crosses many of them
      reconcileEveryMs: 0,
      now: () => clock,
      ...options,
    });

  // Every token the store knows, checked against ownerOf on chain (burned = zero address).
  async function expectIndexMatchesChain(store) {
    for (const t of store.tokens.values()) {
      const contract = t.contract === collections[0].address ? plain : enumerable;
      const owner = await contract.ownerOf(t.tokenId).then((o) => o.toLowerCase(), () => lib.ZERO_ADDRESS);
      expect(t.owner, `${t.contract} #${t.tokenId}`).to.equal(owner);
    }
  }

  before(async () => {
    lib = await indexerModule();
  });

  beforeEach(async () => {
    [deployer, alice, bob, carol] = await ethers.getSigners();
    plain = await (await ethers.getContractFactory("MockERC721")).deploy();
    enumerable = await (await ethers.getContractFactory("MockERC721Enumerable")).deploy();
    const startBlock = await ethers.provider.getBlockNumber();
    collections = [
      { address: (await plain.getAddress()).toLowerCase(), name: "Plain", multiplier: 1.25, startBlock },
      { address: (await enumerable.getAddress()).toLowerCase(), name: "Enum", multiplier: 1.5, startBlock },
    ];

    await plain.mint(alice.address, 1);
    await plain.mint(alice.address, 2);
    await plain.mint(alice.address, 3);
    await plain.mint(bob.address, 4);
    await plain.connect(alice).transferFrom(alice.address, bob.address, 2);
    await plain.burn(3);
    await enumerable.mint(carol.address, 10);
    await enumerable.mint(alice.address, 11);
    await mine(5);
    clock = await latestTime();
  });

  it("backfills both collections and matches the chain", async () => {
    const store = memoryStore(collections);
    store.profiles.set(lc(alice), { nftHoldings: [] });
    store.profiles.set(lc(bob), { nftHoldings: [] });
    await indexer(store).indexOnce();

    await expectIndexMatchesChain(store);
    expect(store.tokens.get(`${collections[0].address}:3`).owner).to.equal(lib.ZERO_ADDRESS); // burned
    for (const c of collections) expect(store.cursors.get(lib.cursorKey(c.address)).caughtUp).to.equal(true);

    const ids = async (signer) => (await indexer(store).walletNfts(lc(signer))).holdings.map((h) => `${h.collectionName}#${h.tokenId}`).sort();
    expect(await ids(alice)).to.deep.equal(["Enum#11", "Plain#1"]);
    expect(await ids(bob)).to.deep.equal(["Plain#2", "Plain#4"]);
    expect(store.profiles.has(lc(carol))).to.equal(false); // non-players get no profile
  });

  it("counts NFTs only after the hold period, and caps the bonus at +0.5", async () => {
    const store = memoryStore(collections);
    store.profiles.set(lc(alice), { nftHoldings: [] });
    await indexer(store).indexOnce();

    let nfts = await indexer(store).walletNfts(lc(alice));
    expect(nfts.multiplier).to.equal(1); // just acquired
    expect(nfts.pendingMultiplier).to.equal(1.5); // 1.25x + 1.5x collections = +0.75, capped
    expect(nfts.holdings.every((h) => !h.active && h.countsFrom > new Date(clock))).to.equal(true);

    clock += 25 * HOUR;
    nfts = await indexer(store).walletNfts(lc(alice));
    expect(nfts.multiplier).to.equal(1.5);
    expect(nfts.holdings.every((h) => h.active)).to.equal(true);
  });

  it("restarts the hold period when an NFT comes back after being passed around", async () => {
    const store = memoryStore(collections);
    await indexer(store).indexOnce();
    await network.provider.send("evm_increaseTime", [25 * 3600]); // a day later on chain
    await mine(1);
    clock = await latestTime();
    expect(await indexer(store).walletMultiplier(lc(alice))).to.equal(1.5);

    await plain.connect(alice).transferFrom(alice.address, carol.address, 1);
    await plain.connect(carol).transferFrom(carol.address, alice.address, 1);
    await mine(4);
    await indexer(store).indexOnce();
    clock = (await latestTime()) + HOUR;
    const nfts = await indexer(store).walletNfts(lc(alice));
    expect(nfts.holdings.find((h) => h.tokenId === "1").active).to.equal(false);
    expect(nfts.multiplier).to.equal(1.5); // the Enum NFT alone is +0.5
  });

  it("waits for confirmations before applying a transfer", async () => {
    const store = memoryStore(collections);
    await indexer(store).indexOnce();
    await plain.connect(alice).transferFrom(alice.address, carol.address, 1);
    await indexer(store).indexOnce();
    expect(store.tokens.get(`${collections[0].address}:1`).owner).to.equal(lc(alice)); // 0 confirmations
    await mine(3);
    await indexer(store).indexOnce();
    expect(store.tokens.get(`${collections[0].address}:1`).owner).to.equal(lc(carol));
  });

  it("continues from its cursor after a restart, and replays change nothing", async () => {
    const store = memoryStore(collections);
    await indexer(store).indexOnce();
    const snapshot = JSON.stringify([...store.tokens]);

    expect((await indexer(store).indexOnce()).transfers).to.equal(0); // a fresh instance resumes
    for (const c of collections) store.cursors.delete(lib.cursorKey(c.address)); // force a full replay
    await indexer(store).indexOnce();
    expect(JSON.stringify([...store.tokens])).to.equal(snapshot);
    await expectIndexMatchesChain(store);
  });

  it("shrinks its block range when the RPC rejects big queries", async () => {
    const store = memoryStore(collections);
    let rejected = 0;
    const picky = new Proxy(ethers.provider, {
      get(target, prop) {
        if (prop === "getLogs") {
          return async (filter) => {
            if (filter.toBlock - filter.fromBlock > 2) {
              rejected++;
              throw new Error("block range too large");
            }
            return target.getLogs(filter);
          };
        }
        const value = target[prop];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await indexer(store, { provider: picky, chunk: { start: 64, min: 1, max: 64 } }).indexOnce();
    expect(rejected).to.be.greaterThan(0);
    await expectIndexMatchesChain(store);
  });

  it("picks up a new collection and backfills it", async () => {
    const store = memoryStore([collections[0]]);
    await indexer(store).indexOnce();
    expect(await indexer(store).walletNfts(lc(alice)).then((n) => n.holdings.length)).to.equal(1);

    store.collections.push(collections[1]); // added to CollectionConfig while running
    await indexer(store).indexOnce();
    expect(await indexer(store).walletNfts(lc(alice)).then((n) => n.holdings.length)).to.equal(2);
    await expectIndexMatchesChain(store);
  });

  it("uses the profile's cached holdings for a collection still backfilling", async () => {
    const store = memoryStore(collections);
    store.profiles.set(lc(alice), {
      nftHoldings: [{ contractAddress: collections[1].address, tokenId: 11, name: "Enum #11", collectionName: "Enum" }],
    });
    const nfts = await indexer(store).walletNfts(lc(alice)); // nothing indexed yet
    expect(nfts.holdings.map((h) => h.tokenId)).to.deep.equal(["11"]);
    expect(nfts.multiplier).to.equal(1.5);
  });

  it("repairs drift for a wallet from on-chain balances", async () => {
    const store = memoryStore(collections);
    store.profiles.set(lc(alice), { nftHoldings: [] });
    store.profiles.set(lc(bob), { nftHoldings: [] });
    await indexer(store).indexOnce();

    // Pretend the RPC lost two events: alice's Enum #11 vanished, and bob's Plain #4 shows as hers.
    store.tokens.delete(`${collections[1].address}:11`);
    store.tokens.get(`${collections[0].address}:4`).owner = lc(alice);

    const { repairs } = await indexer(store).reconcileWallet(lc(alice));
    expect(repairs).to.equal(2);
    await expectIndexMatchesChain(store);
    expect(store.tokens.get(`${collections[1].address}:11`).owner).to.equal(lc(alice)); // found via enumeration
    expect(store.profiles.get(lc(bob)).nftHoldings.map((h) => h.tokenId).sort()).to.deep.equal(["2", "4"]);
  });

  it("ignores ERC-20 style Transfer logs", () => {
    const topic = (addr) => ethers.zeroPadValue(addr, 32);
    const logs = [
      { address: collections[0].address, topics: [lib.TRANSFER_TOPIC, topic(alice.address), topic(bob.address)], blockNumber: 1, index: 0 },
      { address: collections[0].address, topics: [lib.TRANSFER_TOPIC, topic(alice.address), topic(bob.address), ethers.toBeHex(7, 32)], blockNumber: 1, index: 1 },
    ];
    expect(lib.decodeTransfers(logs).map((t) => t.tokenId)).to.deep.equal(["7"]);
  });
});
