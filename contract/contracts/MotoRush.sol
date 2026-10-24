// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MotoRush
 * @notice On-chain results for Moto Rush: the levels each player has completed, with their finish
 *         time and stars. Every level can be completed only once.
 *
 * Every attempt starts on chain with startLevel, which opens a numbered run on the player's next
 * level. The backend replays the run's recorded inputs with the game's physics and signs only a ride
 * that reached the finish, with the time and stars that replay produced (never the client's claim),
 * bound to that run. submitLevel checks the signature, closes the run and locks the level for good:
 * a level with 1, 2 or 3 stars can't be started again. A crash or a quit is never submitted, so the
 * next startLevel simply opens a new run on the same level.
 */
contract MotoRush is Ownable2Step, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;

    // State
    address public trustedSigner;
    uint256 public submissionFee;
    /// Playable levels. The owner can raise it when the game adds levels, so no redeploy is needed.
    uint256 public levelCount = 500;

    struct LevelRecord {
        uint32 timeMs; // finish time after flip bonuses, as the game shows it
        uint8 stars; // 1 to 3 once completed; 0 means not completed yet
    }

    struct PlayerTotals {
        uint16 completed; // levels are completed in order, so these are levels 1..completed
        uint32 totalStars;
        uint64 totalTimeMs;
    }

    /// The attempt a finish can be saved against. A new start replaces it, so crashing or quitting
    /// never leaves a player stuck.
    struct Run {
        uint64 runId; // counts up per player; signatures are bound to it
        uint16 levelId;
        uint64 startedAt;
        bool active;
    }

    mapping(address => mapping(uint256 => LevelRecord)) private _records;
    mapping(address => PlayerTotals) private _totals;
    mapping(address => Run) public activeRuns;
    mapping(address => uint64) public runCount;

    // Events
    event LevelStarted(address indexed player, uint256 indexed levelId, uint256 runId);
    event LevelCompleted(
        address indexed player,
        uint256 indexed levelId,
        uint256 timeMs,
        uint256 stars,
        uint256 runId,
        bytes32 sessionId
    );
    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event SubmissionFeeUpdated(uint256 oldFee, uint256 newFee);
    event LevelCountUpdated(uint256 oldCount, uint256 newCount);
    event FeesWithdrawn(address indexed to, uint256 amount);

    // Constructor
    constructor(address _trustedSigner, uint256 _submissionFee) Ownable(msg.sender) {
        require(_trustedSigner != address(0), "MotoRush: zero signer");
        trustedSigner = _trustedSigner;
        submissionFee = _submissionFee;
    }

    // Gameplay
    /// Opens a run on the caller's next level, replacing any run still open. Completed levels can't
    /// be started again, and a level stays locked until the one before it is completed.
    function startLevel(uint256 levelId) external whenNotPaused {
        require(levelId >= 1 && levelId <= levelCount, "MotoRush: no such level");
        require(_records[msg.sender][levelId].stars == 0, "MotoRush: level already completed");
        require(levelId == uint256(_totals[msg.sender].completed) + 1, "MotoRush: level locked");
        uint64 runId = runCount[msg.sender] + 1;
        runCount[msg.sender] = runId;
        activeRuns[msg.sender] = Run({
            runId: runId,
            levelId: uint16(levelId),
            startedAt: uint64(block.timestamp),
            active: true
        });
        emit LevelStarted(msg.sender, levelId, runId);
    }

    /**
     * Saves a finished ride against the caller's open run, closes the run and locks the level.
     * @param levelId    The level of the open run.
     * @param timeMs     Finish time in milliseconds from the backend's replay of the ride.
     * @param stars      1 to 3, from the same replay.
     * @param sessionId  The backend session the replay belongs to.
     * @param signature  Backend signature over keccak256(abi.encodePacked(player, levelId, timeMs,
     *                   stars, runId, sessionId, address(this), block.chainid)), EIP-191 prefixed,
     *                   where runId is the open run's id.
     */
    function submitLevel(
        uint256 levelId,
        uint256 timeMs,
        uint256 stars,
        bytes32 sessionId,
        bytes calldata signature
    ) external payable whenNotPaused nonReentrant {
        require(msg.value == submissionFee, "MotoRush: incorrect fee");
        require(stars >= 1 && stars <= 3, "MotoRush: bad stars");
        require(timeMs > 0 && timeMs <= type(uint32).max, "MotoRush: bad time");

        Run storage run = activeRuns[msg.sender];
        require(run.active && run.levelId == levelId, "MotoRush: no open run for this level");
        require(_records[msg.sender][levelId].stars == 0, "MotoRush: level already completed");
        // The game clock only runs while riding, so a real finish time is never shorter than the
        // time since the run was opened on chain.
        require(block.timestamp >= uint256(run.startedAt) + timeMs / 1000, "MotoRush: finished too fast");

        uint256 runId = run.runId;
        _checkSignature(levelId, timeMs, stars, runId, sessionId, signature);
        run.active = false;

        PlayerTotals storage totals = _totals[msg.sender];
        _records[msg.sender][levelId] = LevelRecord({timeMs: uint32(timeMs), stars: uint8(stars)});
        totals.completed = uint16(levelId); // startLevel only opens completed + 1
        totals.totalStars += uint32(stars);
        totals.totalTimeMs += uint64(timeMs);

        emit LevelCompleted(msg.sender, levelId, timeMs, stars, runId, sessionId);
    }

    function _checkSignature(
        uint256 levelId,
        uint256 timeMs,
        uint256 stars,
        uint256 runId,
        bytes32 sessionId,
        bytes calldata signature
    ) private view {
        bytes32 structHash = keccak256(
            abi.encodePacked(msg.sender, levelId, timeMs, stars, runId, sessionId, address(this), block.chainid)
        );
        address signer = MessageHashUtils.toEthSignedMessageHash(structHash).recover(signature);
        require(signer == trustedSigner, "MotoRush: invalid signature");
    }

    // Views
    /// Everything the game needs to draw its level list, in one call.
    function getProgress(address player)
        external
        view
        returns (
            uint256 completed,
            uint256 totalStars,
            uint256 totalTimeMs,
            uint32[] memory timesMs,
            uint8[] memory stars
        )
    {
        PlayerTotals storage totals = _totals[player];
        uint256 count = levelCount;
        timesMs = new uint32[](count);
        stars = new uint8[](count);
        uint256 last = totals.completed;
        for (uint256 i = 0; i < last; i++) {
            LevelRecord storage record = _records[player][i + 1];
            timesMs[i] = record.timeMs;
            stars[i] = record.stars;
        }
        return (last, totals.totalStars, totals.totalTimeMs, timesMs, stars);
    }

    function levelRecord(address player, uint256 levelId)
        external
        view
        returns (uint256 timeMs, uint256 stars, bool completed)
    {
        LevelRecord storage record = _records[player][levelId];
        return (record.timeMs, record.stars, record.stars > 0);
    }

    /// The only level the player can start, or 0 once every level is completed.
    function nextLevel(address player) external view returns (uint256) {
        uint256 next = uint256(_totals[player].completed) + 1;
        return next <= levelCount ? next : 0;
    }

    // Treasury & admin
    function claimFees(address payable _to) external onlyOwner nonReentrant {
        require(_to != address(0), "MotoRush: zero address");
        uint256 balance = address(this).balance;
        require(balance > 0, "MotoRush: nothing to claim");
        (bool success, ) = _to.call{value: balance}("");
        require(success, "MotoRush: transfer failed");
        emit FeesWithdrawn(_to, balance);
    }

    function setTrustedSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "MotoRush: zero signer");
        emit TrustedSignerUpdated(trustedSigner, _newSigner);
        trustedSigner = _newSigner;
    }

    function setSubmissionFee(uint256 _newFee) external onlyOwner {
        emit SubmissionFeeUpdated(submissionFee, _newFee);
        submissionFee = _newFee;
    }

    /// Opens more levels when the game adds them. It can only grow, so no progress is cut off.
    function setLevelCount(uint256 _newCount) external onlyOwner {
        require(_newCount >= levelCount && _newCount <= type(uint16).max, "MotoRush: bad level count");
        emit LevelCountUpdated(levelCount, _newCount);
        levelCount = _newCount;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
