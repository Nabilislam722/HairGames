const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// Same packing as backend/services/pixelFighter.js signMatchResult.
async function sign(wallet, { player, runId, difficulty, score, won, durationMs, sessionId, contract, chainId }) {
  const hash = ethers.solidityPackedKeccak256(
    ["address", "uint256", "uint256", "uint256", "bool", "uint256", "bytes32", "address", "uint256"],
    [player, runId, difficulty, score, won, durationMs, sessionId, contract, chainId]
  );
  return wallet.signMessage(ethers.getBytes(hash));
}

describe("PixelFighter", () => {
  it("saves a signed match once and rejects bad ones", async () => {
    const [owner, player, other] = await ethers.getSigners();
    const signer = ethers.Wallet.createRandom();
    const fee = ethers.parseEther("0.000008");
    const c = await (await ethers.getContractFactory("PixelFighter")).deploy(signer.address, fee);
    const contract = await c.getAddress();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const sessionId = ethers.hexlify(ethers.randomBytes(32));

    await expect(c.connect(player).startMatch(3)).to.be.revertedWith("PixelFighter: bad difficulty");
    await expect(c.connect(player).startMatch(2)).to.emit(c, "MatchStarted").withArgs(player.address, 2, 1);

    const result = { player: player.address, runId: 1, difficulty: 2, score: 2875, won: true, durationMs: 61500, sessionId, contract, chainId };
    const sig = await sign(signer, result);

    await expect(c.connect(player).submitMatch(2875, true, 61500, sessionId, sig, { value: fee })).to.be.revertedWith("PixelFighter: finished too fast");
    await network.provider.send("evm_increaseTime", [62]);
    await network.provider.send("evm_mine");

    await expect(c.connect(player).submitMatch(2875, true, 61500, sessionId, sig, { value: 0 })).to.be.revertedWith("PixelFighter: incorrect fee");
    await expect(c.connect(player).submitMatch(3000, true, 61500, sessionId, sig, { value: fee })).to.be.revertedWith("PixelFighter: invalid signature");
    await expect(c.connect(player).submitMatch(2875, false, 61500, sessionId, sig, { value: fee })).to.be.revertedWith("PixelFighter: invalid signature");
    await expect(c.connect(other).submitMatch(2875, true, 61500, sessionId, sig, { value: fee })).to.be.revertedWith("PixelFighter: no open match");

    await expect(c.connect(player).submitMatch(2875, true, 61500, sessionId, sig, { value: fee }))
      .to.emit(c, "MatchCompleted").withArgs(player.address, 1, 2, 2875, true, 61500, sessionId);
    await expect(c.connect(player).submitMatch(2875, true, 61500, sessionId, sig, { value: fee })).to.be.revertedWith("PixelFighter: no open match");

    const s = await c.stats(player.address);
    expect(s.matches).to.equal(1); expect(s.wins).to.equal(1); expect(s.bestScore).to.equal(2875); expect(s.totalScore).to.equal(2875);

    // A signature for run 1 can't be used on run 2.
    await c.connect(player).startMatch(2);
    await network.provider.send("evm_increaseTime", [62]);
    await expect(c.connect(player).submitMatch(2875, true, 61500, sessionId, sig, { value: fee })).to.be.revertedWith("PixelFighter: invalid signature");
    // Nor at a different difficulty than the run was opened at.
    await c.connect(player).startMatch(0);
    await network.provider.send("evm_increaseTime", [62]);
    const sig3 = await sign(signer, { ...result, runId: 3 });
    await expect(c.connect(player).submitMatch(2875, true, 61500, sessionId, sig3, { value: fee })).to.be.revertedWith("PixelFighter: invalid signature");

    expect(await ethers.provider.getBalance(contract)).to.equal(fee);
    await expect(c.connect(player).claimFees(player.address)).to.be.reverted;
    await expect(c.claimFees(owner.address)).to.emit(c, "FeesWithdrawn");
  });
});
