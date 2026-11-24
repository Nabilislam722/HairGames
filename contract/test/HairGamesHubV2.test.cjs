const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const DAY = 86400;
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;
const increaseTime = async (seconds) => {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
};
const name = (id) => ethers.encodeBytes32String(id);
const MOTO = 1; // the first game listed
const SUBMIT_FEE = ethers.parseEther("0.000008");
const compact = (sig) => { const s = ethers.Signature.from(sig); return [s.r, s.yParityAndS]; };

async function consent(key, registry, owner, expiresAt) {
  const { chainId } = await ethers.provider.getNetwork();
  return key.signTypedData(
    { name: "HairGames SessionRegistry", version: "1", chainId, verifyingContract: await registry.getAddress() },
    { SessionConsent: [{ name: "owner", type: "address" }, { name: "key", type: "address" }, { name: "expiresAt", type: "uint40" }] },
    { owner, key: key.address, expiresAt },
  );
}

// The backend's signature over a verified result (EIP-712 Result), as the hub checks it.
async function signResult(signer, hub, r) {
  const { chainId } = await ethers.provider.getNetwork();
  return signer.signTypedData(
    { name: "HairGames Hub V2", version: "2", chainId, verifyingContract: await hub.getAddress() },
    {
      Result: [
        { name: "runId", type: "uint256" },
        { name: "player", type: "address" },
        { name: "game", type: "uint16" },
        { name: "score", type: "uint256" },
        { name: "detailsHash", type: "bytes32" },
        { name: "notBefore", type: "uint64" },
        { name: "deadline", type: "uint64" },
      ],
    },
    { ...r, detailsHash: ethers.keccak256(r.details) },
  );
}

async function setup() {
  const [admin, player, stranger] = await ethers.getSigners();
  const registry = await (await ethers.getContractFactory("HairGamesSessionRegistry")).deploy();
  const signer = ethers.Wallet.createRandom();
  const hub = await (await ethers.getContractFactory("HairGamesHubV2")).deploy(admin.address, 0, await registry.getAddress(), signer.address);
  await hub.addGame(name("moto_rush"), 0, SUBMIT_FEE); // game 1

  // The player's session key, funded for gas and fees.
  const key = ethers.Wallet.createRandom().connect(ethers.provider);
  const expiresAt = (await now()) + DAY;
  await registry.connect(player).openSession(key.address, expiresAt, ...compact(await consent(key, registry, player.address, expiresAt)), { value: ethers.parseEther("0.01") });
  return { admin, player, stranger, registry, signer, hub, key };
}

// A result for `runId` that's valid right now.
async function result(runId, player, extra = {}) {
  const t = await now();
  return {
    runId, player, game: MOTO, score: 7000,
    details: ethers.AbiCoder.defaultAbiCoder().encode(["uint16", "uint32", "uint8"], [42, 31250, 3]), // level, time, stars
    notBefore: t, deadline: t + 600, ...extra,
  };
}

const submit = async (hub, from, r, sig, value = SUBMIT_FEE) =>
  hub.connect(from).submitRun(r.runId, r.score, r.details, r.notBefore, r.deadline, ...compact(sig), { value });

describe("HairGamesHubV2", () => {
  it("lets a session key play as its wallet: the run and the save count for the player", async () => {
    const { player, signer, hub, key } = await setup();
    const params = ethers.zeroPadValue("0x2a", 32); // level 42

    await expect(hub.connect(key).startRun(MOTO, params)).to.emit(hub, "RunStarted").withArgs(1, player.address, MOTO, key.address, params);
    const run = await hub.runs(1);
    expect(run.player).to.equal(player.address);
    expect(run.open).to.equal(true);

    const r = await result(1, player.address);
    const sig = await signResult(signer, hub, r);
    await expect(submit(hub, key, r, sig)).to.emit(hub, "RunSaved").withArgs(1, player.address, MOTO, 7000, r.details);

    // Saved once: the run is deleted, so the same result can't be saved again.
    expect((await hub.runs(1)).open).to.equal(false);
    await expect(submit(hub, key, r, sig)).to.be.revertedWithCustomError(hub, "RunNotOpen");
  });

  it("logs checkpoints as cheaply as possible, from any sender, for the backend to check", async () => {
    const { stranger, hub, key } = await setup();
    const state = ethers.dataSlice(ethers.id("inputs so far"), 0, 16);
    await expect(hub.connect(key).checkpoint(1, state)).to.emit(hub, "Checkpoint").withArgs(1, key.address, state);
    // Not checked on chain: the backend only counts checkpoints from the run's player or their session key.
    await expect(hub.connect(stranger).checkpoint(1, state)).to.emit(hub, "Checkpoint").withArgs(1, stranger.address, state);
  });

  it("only saves a result signed for exactly this run, player, game, score and details", async () => {
    const { player, stranger, signer, hub } = await setup();
    await hub.connect(player).startRun(MOTO, ethers.ZeroHash); // run 1
    await hub.connect(player).startRun(MOTO, ethers.ZeroHash); // run 2
    const r = await result(1, player.address);
    const sig = await signResult(signer, hub, r);

    await expect(submit(hub, player, { ...r, score: 9999 }, sig)).to.be.revertedWithCustomError(hub, "BadSignature");
    await expect(submit(hub, player, { ...r, details: "0x01" }, sig)).to.be.revertedWithCustomError(hub, "BadSignature");
    await expect(submit(hub, player, { ...r, runId: 2 }, sig)).to.be.revertedWithCustomError(hub, "BadSignature");
    await expect(submit(hub, player, r, await signResult(ethers.Wallet.createRandom(), hub, r))).to.be.revertedWithCustomError(hub, "BadSignature");
    await expect(submit(hub, player, r, await signResult(signer, hub, { ...r, player: stranger.address }))).to.be.revertedWithCustomError(hub, "BadSignature");
    await expect(submit(hub, player, r, await signResult(signer, hub, { ...r, game: 2 }))).to.be.revertedWithCustomError(hub, "BadSignature");
    // Someone else can't save the player's run, even holding the valid signature.
    await expect(submit(hub, stranger, r, sig)).to.be.revertedWithCustomError(hub, "NotYourRun");
    await expect(submit(hub, player, r, sig, 0n)).to.be.revertedWithCustomError(hub, "WrongFee");

    await expect(submit(hub, player, r, sig)).to.emit(hub, "RunSaved");
  });

  it("refuses a result before notBefore or after its deadline", async () => {
    const { player, signer, hub } = await setup();
    await hub.connect(player).startRun(MOTO, ethers.ZeroHash);
    const t = await now();

    const early = await result(1, player.address, { notBefore: t + 60, deadline: t + 600 });
    const earlySig = await signResult(signer, hub, early);
    await expect(submit(hub, player, early, earlySig)).to.be.revertedWithCustomError(hub, "TooEarly");

    const late = await result(1, player.address, { notBefore: t, deadline: t + 30 });
    const lateSig = await signResult(signer, hub, late);
    await increaseTime(61);
    await expect(submit(hub, player, late, lateSig)).to.be.revertedWithCustomError(hub, "SignatureExpired");
    await expect(submit(hub, player, early, earlySig)).to.emit(hub, "RunSaved"); // now it's late enough
  });

  it("treats an expired or revoked session key as a stranger", async () => {
    const { player, signer, registry, hub, key } = await setup();
    await hub.connect(player).startRun(MOTO, ethers.ZeroHash);
    await registry.connect(player).revokeSession(key.address);

    const r = await result(1, player.address);
    await expect(submit(hub, key, r, await signResult(signer, hub, r))).to.be.revertedWithCustomError(hub, "NotYourRun");
    // A run it starts now is its own, not the player's.
    await expect(hub.connect(key).startRun(MOTO, ethers.ZeroHash)).to.emit(hub, "RunStarted").withArgs(2, key.address, MOTO, key.address, ethers.ZeroHash);
  });

  it("lists, prices and pauses games by role, with fees capped and exact", async () => {
    const { player, stranger, signer, hub } = await setup();

    await expect(hub.connect(stranger).addGame(name("candy_cascade"), 0, SUBMIT_FEE)).to.be.revertedWithCustomError(hub, "AccessControlUnauthorizedAccount");
    await expect(hub.addGame(name("moto_rush"), 0, SUBMIT_FEE)).to.be.revertedWithCustomError(hub, "GameAlreadyListed");
    await expect(hub.addGame(name("candy_cascade"), 0, ethers.parseEther("0.0011"))).to.be.revertedWithCustomError(hub, "FeeTooHigh");
    await hub.addGame(name("candy_cascade"), 0, SUBMIT_FEE);
    expect(await hub.gameOf(name("candy_cascade"))).to.equal(2);
    expect(await hub.gameName(2)).to.equal(name("candy_cascade"));
    await expect(hub.connect(player).startRun(3, ethers.ZeroHash)).to.be.revertedWithCustomError(hub, "UnknownGame");

    await expect(hub.setGameFees(MOTO, ethers.parseEther("0.002"), SUBMIT_FEE)).to.be.revertedWithCustomError(hub, "FeeTooHigh");
    await hub.setGameFees(MOTO, 1000, SUBMIT_FEE);
    await expect(hub.connect(player).startRun(MOTO, ethers.ZeroHash)).to.be.revertedWithCustomError(hub, "WrongFee");
    await hub.connect(player).startRun(MOTO, ethers.ZeroHash, { value: 1000 }); // run 1

    // Pausing one game stops new runs and saves of open ones.
    await expect(hub.connect(stranger).setGamePaused(MOTO, true)).to.be.revertedWithCustomError(hub, "AccessControlUnauthorizedAccount");
    await hub.setGamePaused(MOTO, true);
    await expect(hub.connect(player).startRun(MOTO, ethers.ZeroHash, { value: 1000 })).to.be.revertedWithCustomError(hub, "GameIsPaused");
    const r = await result(1, player.address);
    const sig = await signResult(signer, hub, r);
    await expect(submit(hub, player, r, sig)).to.be.revertedWithCustomError(hub, "GameIsPaused");
    await hub.setGamePaused(MOTO, false);

    // Pausing everything stops starts and saves.
    await hub.setPaused(true);
    await expect(hub.connect(player).startRun(MOTO, ethers.ZeroHash, { value: 1000 })).to.be.revertedWithCustomError(hub, "HubPaused");
    await expect(submit(hub, player, r, sig)).to.be.revertedWithCustomError(hub, "HubPaused");
    await hub.setPaused(false);
    await expect(submit(hub, player, r, sig)).to.emit(hub, "RunSaved");
  });

  it("rotates the signer with a backup signer, with no way to swap the registry", async () => {
    const { player, stranger, signer, hub } = await setup();
    const next = ethers.Wallet.createRandom();
    await hub.connect(player).startRun(MOTO, ethers.ZeroHash); // run 1
    await hub.connect(player).startRun(MOTO, ethers.ZeroHash); // run 2

    await expect(hub.connect(stranger).setBackupSigner(next.address)).to.be.revertedWithCustomError(hub, "AccessControlUnauthorizedAccount");
    await hub.setBackupSigner(next.address);
    const r1 = await result(1, player.address);
    await expect(submit(hub, player, r1, await signResult(next, hub, r1))).to.emit(hub, "RunSaved"); // backup accepted

    await hub.setSigner(next.address);
    await hub.setBackupSigner(ethers.ZeroAddress);
    const r2 = await result(2, player.address);
    await expect(submit(hub, player, r2, await signResult(signer, hub, r2))).to.be.revertedWithCustomError(hub, "BadSignature"); // old key retired
    await expect(submit(hub, player, r2, await signResult(next, hub, r2))).to.emit(hub, "RunSaved");

    expect(hub.setRegistry).to.equal(undefined); // the registry is fixed at deployment
  });

  it("takes no plain ETH, lets only treasurers withdraw fees, and keeps the admin role behind a two-step transfer", async () => {
    const { admin, player, stranger, signer, hub } = await setup();
    await hub.connect(player).startRun(MOTO, ethers.ZeroHash);
    const r = await result(1, player.address);
    await submit(hub, player, r, await signResult(signer, hub, r));

    const hubAddress = await hub.getAddress();
    await expect(player.sendTransaction({ to: hubAddress, value: 1 })).to.be.reverted;
    expect(await ethers.provider.getBalance(hubAddress)).to.equal(SUBMIT_FEE);
    await expect(hub.connect(stranger).withdrawFees(stranger.address, SUBMIT_FEE)).to.be.revertedWithCustomError(hub, "AccessControlUnauthorizedAccount");
    await expect(hub.withdrawFees(admin.address, SUBMIT_FEE)).to.changeEtherBalances([hub, admin], [-SUBMIT_FEE, SUBMIT_FEE]);

    const ADMIN = await hub.DEFAULT_ADMIN_ROLE();
    await expect(hub.grantRole(ADMIN, stranger.address)).to.be.revertedWithCustomError(hub, "AccessControlEnforcedDefaultAdminRules");
    await hub.beginDefaultAdminTransfer(stranger.address);
    expect(await hub.hasRole(ADMIN, stranger.address)).to.equal(false); // not until they accept it
  });
});
