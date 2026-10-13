// Signs results with the backend's own signLevelResult, so these tests also prove the backend's
// signatures are exactly what the contract checks.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const SESSION = (n) => ethers.zeroPadValue(ethers.toBeHex(n), 32);
const backendModule = (file) => import(pathToFileURL(path.join(__dirname, "..", "..", "backend", "services", file)).href);

describe("CandyCascade", () => {
  let signLevelResult, contract, owner, player, other, signer, chainId, address;

  before(async () => {
    ({ signLevelResult } = await backendModule("candyCascade.js"));
    chainId = (await ethers.provider.getNetwork()).chainId;
  });

  beforeEach(async () => {
    [owner, player, other] = await ethers.getSigners();
    signer = ethers.Wallet.createRandom();
    contract = await (await ethers.getContractFactory("CandyCascade")).deploy(signer.address, 0);
    address = await contract.getAddress();
  });

  const sign = (fields, wallet = signer) =>
    signLevelResult(wallet, { contract: address, chainId, sessionId: SESSION(1), ...fields });

  // Opens a run and returns its id, the way the game does before every attempt.
  async function start(levelId, from = player) {
    await contract.connect(from).startLevel(levelId);
    return (await contract.activeRuns(from.address)).runId;
  }

  async function clear(levelId, score, stars, { from = player, session = 1, fee = 0 } = {}) {
    const runId = await start(levelId, from);
    const signature = await sign({ player: from.address, levelId, score, stars, runId, sessionId: SESSION(session) });
    return contract.connect(from).submitLevel(levelId, score, stars, SESSION(session), signature, { value: fee });
  }

  it("starts a run, then saves a signed win against it", async () => {
    await expect(contract.connect(player).startLevel(1)).to.emit(contract, "LevelStarted").withArgs(player.address, 1, 1);
    const signature = await sign({ player: player.address, levelId: 1, score: 9500, stars: 2, runId: 1 });
    await expect(contract.connect(player).submitLevel(1, 9500, 2, SESSION(1), signature))
      .to.emit(contract, "LevelCleared")
      .withArgs(player.address, 1, 9500, 2, 0, 1, SESSION(1));
    expect(await contract.highestCleared(player.address)).to.equal(1);
    expect((await contract.activeRuns(player.address)).active).to.equal(false);
    const [best, stars] = await contract.levelRecord(player.address, 1);
    expect([best, stars]).to.deep.equal([9500n, 2n]);
  });

  it("needs an open run for the level", async () => {
    const signature = await sign({ player: player.address, levelId: 1, score: 9000, stars: 1, runId: 1 });
    await expect(contract.connect(player).submitLevel(1, 9000, 1, SESSION(1), signature)).to.be.revertedWith(
      "CandyCascade: no open run for this level",
    );
    await start(1);
    await expect(contract.connect(player).submitLevel(2, 9000, 1, SESSION(1), signature)).to.be.revertedWith(
      "CandyCascade: no open run for this level",
    );
  });

  it("closes the run on save, so a signature works once", async () => {
    const runId = await start(1);
    const signature = await sign({ player: player.address, levelId: 1, score: 9000, stars: 1, runId });
    await contract.connect(player).submitLevel(1, 9000, 1, SESSION(1), signature);
    await expect(contract.connect(player).submitLevel(1, 9000, 1, SESSION(1), signature)).to.be.revertedWith(
      "CandyCascade: no open run for this level",
    );
    await start(1); // a new run has a new id, so the old signature still fails
    await expect(contract.connect(player).submitLevel(1, 9000, 1, SESSION(1), signature)).to.be.revertedWith(
      "CandyCascade: invalid signature",
    );
  });

  it("lets a new start replace an open run, which voids the old run's win", async () => {
    const first = await start(1);
    const oldWin = await sign({ player: player.address, levelId: 1, score: 9000, stars: 1, runId: first });
    const second = await start(1);
    expect(second).to.equal(first + 1n);
    await expect(contract.connect(player).submitLevel(1, 9000, 1, SESSION(1), oldWin)).to.be.revertedWith(
      "CandyCascade: invalid signature",
    );
    const newWin = await sign({ player: player.address, levelId: 1, score: 9000, stars: 1, runId: second });
    await contract.connect(player).submitLevel(1, 9000, 1, SESSION(1), newWin);
  });

  it("keeps the best score and stars, and emits the old best on improvement", async () => {
    await clear(1, 9500, 2);
    await expect(clear(1, 8000, 1, { session: 2 })).to.emit(contract, "LevelCleared").withArgs(player.address, 1, 8000, 1, 9500, 2, SESSION(2));
    await expect(clear(1, 12000, 3, { session: 3 })).to.emit(contract, "LevelCleared").withArgs(player.address, 1, 12000, 3, 9500, 3, SESSION(3));
    const [, totalScore, totalStars, bestScores, stars] = await contract.getProgress(player.address);
    expect(totalScore).to.equal(12000);
    expect(totalStars).to.equal(3);
    expect(bestScores[0]).to.equal(12000);
    expect(stars[0]).to.equal(3);
  });

  it("won't start a level that already has 3 stars, but replays 1 and 2 star levels", async () => {
    await clear(1, 9000, 1);
    await clear(1, 9500, 2, { session: 2 }); // 1 star: replayable
    await clear(1, 12000, 3, { session: 3 }); // 2 stars: replayable
    await expect(contract.connect(player).startLevel(1)).to.be.revertedWith("CandyCascade: level already has 3 stars");
    await start(2); // the next level is open
  });

  it("unlocks levels in order", async () => {
    await expect(contract.connect(player).startLevel(2)).to.be.revertedWith("CandyCascade: level locked");
    await clear(1, 9000, 1);
    await clear(2, 9000, 1, { session: 2 });
    const [highest, , , bestScores] = await contract.getProgress(player.address);
    expect(highest).to.equal(2);
    expect(bestScores.length).to.equal(500);
    expect(bestScores[1]).to.equal(9000);
  });

  it("lets only the owner open more levels, and never fewer", async () => {
    expect(await contract.levelCount()).to.equal(500);
    await expect(contract.connect(player).setLevelCount(600)).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    await expect(contract.setLevelCount(499)).to.be.revertedWith("CandyCascade: bad level count");
    await expect(contract.setLevelCount(600)).to.emit(contract, "LevelCountUpdated").withArgs(500, 600);
    expect((await contract.getProgress(player.address))[3].length).to.equal(600);
  });

  it("rejects a raised score, more stars, a different signer, another player and another chain", async () => {
    const runId = await start(1);
    await start(1, other);
    const fields = { player: player.address, levelId: 1, score: 9000, stars: 1, runId };
    const good = await sign(fields);
    const submit = (from, score, stars, signature) => contract.connect(from).submitLevel(1, score, stars, SESSION(1), signature);
    await expect(submit(player, 99999, 1, good)).to.be.revertedWith("CandyCascade: invalid signature");
    await expect(submit(player, 9000, 3, good)).to.be.revertedWith("CandyCascade: invalid signature");
    await expect(submit(player, 9000, 1, await sign(fields, ethers.Wallet.createRandom()))).to.be.revertedWith(
      "CandyCascade: invalid signature",
    );
    await expect(submit(other, 9000, 1, good)).to.be.revertedWith("CandyCascade: invalid signature");
    const otherChain = await signLevelResult(signer, { ...fields, contract: address, chainId: 43111n, sessionId: SESSION(1) });
    await expect(submit(player, 9000, 1, otherChain)).to.be.revertedWith("CandyCascade: invalid signature");
    await submit(player, 9000, 1, good);
  });

  it("checks level range, stars and fee", async () => {
    await expect(contract.connect(player).startLevel(0)).to.be.revertedWith("CandyCascade: no such level");
    await expect(contract.connect(player).startLevel(501)).to.be.revertedWith("CandyCascade: no such level");
    await expect(clear(1, 9000, 0)).to.be.revertedWith("CandyCascade: bad stars");
    await expect(clear(1, 9000, 4)).to.be.revertedWith("CandyCascade: bad stars");
    await contract.setSubmissionFee(ethers.parseEther("0.000008"));
    await expect(clear(1, 9000, 1)).to.be.revertedWith("CandyCascade: incorrect fee");
    await clear(1, 9000, 1, { fee: ethers.parseEther("0.000008") });
    await expect(contract.claimFees(owner.address)).to.emit(contract, "FeesWithdrawn");
  });

  it("end to end: a real game is replayed, signed, saved and credited by improvement", async () => {
    const { CORE_DIR, replayLevel, findLevelCleared, findLevelStarted, startLevelArg } = await backendModule("candyCascade.js");
    const core = (file) => import(pathToFileURL(path.join(CORE_DIR, file)).href);
    const [{ Engine }, { LEVELS }, { createRng }] = await Promise.all([core("engine.js"), core("levels.js"), core("rng.js")]);

    // Play level 1 like a player would, on a seed the server issued, keeping the move log.
    async function play(seed) {
      const engine = new Engine(LEVELS[0], { rng: createRng(seed) });
      while (!engine.over) {
        const moves = engine.board.validMoves();
        if (!moves.length) break;
        const best = moves.reduce((a, b) => (b.weight > a.weight ? b : a));
        await engine.trySwap(best.a, best.b);
      }
      return engine;
    }

    async function attempt(seed, session) {
      const startTx = await contract.connect(player).startLevel(1);
      expect(startLevelArg(startTx.data)).to.equal(1); // what the session endpoint checks
      const started = findLevelStarted(await startTx.wait(), address); // what verify checks
      const engine = await play(seed);
      const replay = await replayLevel(1, seed, engine.moveLog);
      expect(replay).to.deep.equal({ valid: true, win: true, score: engine.result.score, stars: engine.result.stars });
      const signature = await sign({ player: player.address, levelId: 1, score: replay.score, stars: replay.stars, runId: started.runId, sessionId: SESSION(session) });
      const tx = await contract.connect(player).submitLevel(1, replay.score, replay.stars, SESSION(session), signature);
      const cleared = findLevelCleared(await tx.wait(), address);
      return { score: replay.score, stars: replay.stars, credited: Math.max(0, Number(cleared.score) - Number(cleared.previousBest)) };
    }

    // Replays until 3 stars (or four tries); after 3 stars the level can't be started again.
    const runs = [];
    for (const [seed, session] of [[1111, 1], [2222, 2], [3333, 3], [4444, 4]]) {
      runs.push(await attempt(seed, session));
      if (runs.at(-1).stars === 3) break;
    }
    if (runs.some((r) => r.stars === 3)) {
      await expect(contract.connect(player).startLevel(1)).to.be.revertedWith("CandyCascade: level already has 3 stars");
    }
    expect(runs[0].credited).to.equal(runs[0].score); // a first clear pays the full score
    const best = Math.max(...runs.map((r) => r.score));
    expect(runs.reduce((sum, r) => sum + r.credited, 0)).to.equal(best); // replays only pay up to the best
    expect((await contract.levelRecord(player.address, 1))[0]).to.equal(best);
  });

  it("limits admin to the owner and can pause", async () => {
    await expect(contract.connect(player).setTrustedSigner(player.address)).to.be.revertedWithCustomError(
      contract,
      "OwnableUnauthorizedAccount",
    );
    await contract.pause();
    await expect(contract.connect(player).startLevel(1)).to.be.revertedWithCustomError(contract, "EnforcedPause");
    await contract.unpause();
    await clear(1, 9000, 1);
  });
});
