const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const DAY = 86400;
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;
const increaseTime = async (seconds) => {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
};
const newKey = () => ethers.Wallet.createRandom().connect(ethers.provider);

// The key's consent, as the browser signs it (EIP-712 SessionConsent).
async function consent(key, registry, owner, expiresAt) {
  const { chainId } = await ethers.provider.getNetwork();
  return key.signTypedData(
    { name: "HairGames SessionRegistry", version: "1", chainId, verifyingContract: await registry.getAddress() },
    { SessionConsent: [{ name: "owner", type: "address" }, { name: "key", type: "address" }, { name: "expiresAt", type: "uint40" }] },
    { owner, key: key.address, expiresAt },
  );
}

// Splits a signature into its compact (EIP-2098) r and vs halves, as the contracts take it.
const compact = (sig) => { const s = ethers.Signature.from(sig); return [s.r, s.yParityAndS]; };

async function open(registry, owner, key, expiresAt, value = 0n) {
  return registry.connect(owner).openSession(key.address, expiresAt, ...compact(await consent(key, registry, owner.address, expiresAt)), { value });
}

describe("HairGamesSessionRegistry", () => {
  let registry;
  beforeEach(async () => {
    registry = await (await ethers.getContractFactory("HairGamesSessionRegistry")).deploy();
  });

  it("opens a session with the key's consent and funds the key", async () => {
    const [owner] = await ethers.getSigners();
    const key = newKey();
    const expiresAt = (await now()) + DAY;
    const value = ethers.parseEther("0.001");

    await expect(open(registry, owner, key, expiresAt, value))
      .to.emit(registry, "SessionOpened").withArgs(owner.address, key.address, expiresAt, value);
    expect(await ethers.provider.getBalance(key.address)).to.equal(value);
    expect(await registry.ownerOf(key.address)).to.equal(owner.address);
    expect(await registry.playerFor(key.address)).to.equal(owner.address);
    expect(await registry.playerFor(owner.address)).to.equal(owner.address);
  });

  it("rejects consent for another wallet, key or expiry, so nobody can claim a key they don't hold", async () => {
    const [owner, attacker] = await ethers.getSigners();
    const key = newKey();
    const expiresAt = (await now()) + DAY;
    const sig = await consent(key, registry, owner.address, expiresAt);

    // Copying the player's pending transaction: same key and signature, sent by someone else.
    await expect(registry.connect(attacker).openSession(key.address, expiresAt, ...compact(sig))).to.be.revertedWithCustomError(registry, "BadConsent");
    // The consent covers the exact expiry and key.
    await expect(registry.connect(owner).openSession(key.address, expiresAt + 1, ...compact(sig))).to.be.revertedWithCustomError(registry, "BadConsent");
    await expect(registry.connect(owner).openSession(newKey().address, expiresAt, ...compact(sig))).to.be.revertedWithCustomError(registry, "BadConsent");
    await expect(registry.connect(owner).openSession(key.address, expiresAt, ethers.ZeroHash, ethers.ZeroHash)).to.be.reverted;

    expect(await registry.ownerOf(key.address)).to.equal(ethers.ZeroAddress);
  });

  it("keeps a key with its wallet: no other wallet can take it over, even with the key's consent", async () => {
    const [owner, other] = await ethers.getSigners();
    const key = newKey();
    const expiresAt = (await now()) + DAY;
    await open(registry, owner, key, expiresAt);

    await expect(open(registry, other, key, expiresAt)).to.be.revertedWithCustomError(registry, "KeyTaken");
    await increaseTime(DAY + 1); // not even once it has expired
    await expect(open(registry, other, key, (await now()) + DAY)).to.be.revertedWithCustomError(registry, "KeyTaken");
    // Its own wallet can renew it.
    await open(registry, owner, key, (await now()) + DAY);
    expect(await registry.ownerOf(key.address)).to.equal(owner.address);
  });

  it("only accepts a real key and an expiry within 30 days", async () => {
    const [owner] = await ethers.getSigners();
    const key = newKey();
    const t = await now();

    await expect(open(registry, owner, key, t)).to.be.revertedWithCustomError(registry, "InvalidExpiry");
    await expect(open(registry, owner, key, t + 30 * DAY + 10)).to.be.revertedWithCustomError(registry, "InvalidExpiry");
    await expect(registry.connect(owner).openSession(ethers.ZeroAddress, t + DAY, ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(registry, "InvalidKey");
    await expect(registry.connect(owner).openSession(owner.address, t + DAY, ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(registry, "InvalidKey");
  });

  it("expires on time, after which the key plays only as itself", async () => {
    const [owner] = await ethers.getSigners();
    const key = newKey();
    await open(registry, owner, key, (await now()) + 100);
    await increaseTime(101);
    expect(await registry.ownerOf(key.address)).to.equal(ethers.ZeroAddress);
    expect(await registry.playerFor(key.address)).to.equal(key.address);
  });

  it("ends sessions three ways: by the key, by its wallet, or all of the wallet's at once", async () => {
    const [owner, stranger] = await ethers.getSigners();
    const expiresAt = (await now()) + DAY;
    const [k1, k2, k3, k4] = [newKey(), newKey(), newKey(), newKey()];
    await open(registry, owner, k1, expiresAt, ethers.parseEther("0.001")); // funded, so the key can pay for closeSession
    await open(registry, owner, k2, expiresAt);

    await expect(registry.connect(k1).closeSession()).to.emit(registry, "SessionClosed").withArgs(owner.address, k1.address, k1.address);
    expect(await registry.ownerOf(k1.address)).to.equal(ethers.ZeroAddress);

    await expect(registry.connect(stranger).revokeSession(k2.address)).to.be.revertedWithCustomError(registry, "NotYourSession");
    await registry.connect(owner).revokeSession(k2.address);
    expect(await registry.ownerOf(k2.address)).to.equal(ethers.ZeroAddress);

    await open(registry, owner, k3, expiresAt);
    await open(registry, owner, k4, expiresAt);
    await expect(registry.connect(owner).revokeAll()).to.emit(registry, "AllSessionsRevoked").withArgs(owner.address, 1);
    expect(await registry.ownerOf(k3.address)).to.equal(ethers.ZeroAddress);
    expect(await registry.ownerOf(k4.address)).to.equal(ethers.ZeroAddress);

    // Sessions opened after revokeAll work, and a revoked key can be reopened by its wallet.
    await open(registry, owner, k3, (await now()) + DAY);
    expect(await registry.ownerOf(k3.address)).to.equal(owner.address);
  });

  it("stops a live session key from opening sessions, so sessions never chain", async () => {
    const [owner] = await ethers.getSigners();
    const key = newKey();
    await open(registry, owner, key, (await now()) + DAY, ethers.parseEther("0.001"));
    await expect(open(registry, key, newKey(), (await now()) + DAY)).to.be.revertedWithCustomError(registry, "SessionKeyCannotOpen");
  });
});
