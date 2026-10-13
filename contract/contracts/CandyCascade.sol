// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CandyCascade
 * @notice On-chain save game for Candy Cascade: each player's highest cleared level and their best
 *         score and stars on every level.
 *
 * Every attempt starts on chain with startLevel, which opens a numbered run. The backend gives each
 * start transaction one random seed, then replays the player's exact move list with the game
 * engine. Only a replay that actually wins gets signed, with the score and stars that replay
 * produced (never the client's claim), and the signature is bound to that run. This contract checks
 * the signature, closes the run and enforces level order, so a result only lands here if it was
 * really played, once, from its own start.
 */
contract CandyCascade is Ownable2Step, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;

    // State
    address public trustedSigner;
    uint256 public submissionFee;
    /// Playable levels. The owner can raise it when the game adds levels, so no redeploy is needed.
    uint256 public levelCount = 500;

    struct LevelRecord {
        uint32 bestScore;
        uint8 stars;
    }

    struct PlayerTotals {
        uint16 highestCleared; // levels unlock in order: the next playable level is highestCleared + 1
        uint32 totalStars;
        uint64 totalScore; // sum of best scores across all levels
    }

    /// The attempt a win can be saved against. A new start replaces it, so quitting or losing
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
    /// `previousBest` lets off-chain rewards pay only for improvement on a level.
    event LevelCleared(
        address indexed player,
        uint256 indexed levelId,
        uint256 score,
        uint256 stars,
        uint256 previousBest,
        uint256 runId,
        bytes32 sessionId
    );
    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event SubmissionFeeUpdated(uint256 oldFee, uint256 newFee);
    event LevelCountUpdated(uint256 oldCount, uint256 newCount);
    event FeesWithdrawn(address indexed to, uint256 amount);

    // Constructor

    constructor(address _trustedSigner, uint256 _submissionFee) Ownable(msg.sender) {
        require(_trustedSigner != address(0), "CandyCascade: zero signer");
        trustedSigner = _trustedSigner;
        submissionFee = _submissionFee;
    }

    // Gameplay
    /// Opens a run for an unlocked level, replacing any run still open. A level with all 3 stars is
    /// finished: it can't be played again, so players move on to new levels instead of farming it.
    function startLevel(uint256 levelId) external whenNotPaused {
        require(levelId >= 1 && levelId <= levelCount, "CandyCascade: no such level");
        require(levelId <= uint256(_totals[msg.sender].highestCleared) + 1, "CandyCascade: level locked");
        require(_records[msg.sender][levelId].stars < 3, "CandyCascade: level already has 3 stars");
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
     * Saves a win against the caller's open run, then closes it.
     * @param levelId    The level of the open run.
     * @param score      Final score from the backend's replay of the player's moves.
     * @param stars      1 to 3, from the same replay.
     * @param sessionId  The backend session the replay belongs to.
     * @param signature  Backend signature over keccak256(abi.encodePacked(player, levelId, score,
     *                   stars, runId, sessionId, address(this), block.chainid)), EIP-191 prefixed,
     *                   where runId is the open run's id.
     */
    function submitLevel(
        uint256 levelId,
        uint256 score,
        uint256 stars,
        bytes32 sessionId,
        bytes calldata signature
    ) external payable whenNotPaused nonReentrant {
        require(msg.value == submissionFee, "CandyCascade: incorrect fee");
        require(stars >= 1 && stars <= 3, "CandyCascade: bad stars");
        require(score <= type(uint32).max, "CandyCascade: score too large");

        Run storage run = activeRuns[msg.sender];
        require(run.active && run.levelId == levelId, "CandyCascade: no open run for this level");
        uint256 runId = run.runId;
        _checkSignature(levelId, score, stars, runId, sessionId, signature);
        run.active = false;

        uint256 previousBest = _record(levelId, score, stars);
        emit LevelCleared(msg.sender, levelId, score, stars, previousBest, runId, sessionId);
    }

    function _checkSignature(
        uint256 levelId,
        uint256 score,
        uint256 stars,
        uint256 runId,
        bytes32 sessionId,
        bytes calldata signature
    ) private view {
        bytes32 structHash = keccak256(
            abi.encodePacked(msg.sender, levelId, score, stars, runId, sessionId, address(this), block.chainid)
        );
        address signer = MessageHashUtils.toEthSignedMessageHash(structHash).recover(signature);
        require(signer == trustedSigner, "CandyCascade: invalid signature");
    }

    /// Keeps the best score and stars for the level, unlocks the next one; returns the old best.
    function _record(uint256 levelId, uint256 score, uint256 stars) private returns (uint256 previousBest) {
        PlayerTotals storage totals = _totals[msg.sender];
        LevelRecord storage record = _records[msg.sender][levelId];
        previousBest = record.bestScore;
        if (score > previousBest) {
            totals.totalScore += uint64(score - previousBest);
            record.bestScore = uint32(score);
        }
        if (stars > record.stars) {
            totals.totalStars += uint32(stars - record.stars);
            record.stars = uint8(stars);
        }
        if (levelId == uint256(totals.highestCleared) + 1) {
            totals.highestCleared = uint16(levelId);
        }
    }

    // Views
    /// Everything the game needs to draw its level map, in one call.
    function getProgress(address player)
        external
        view
        returns (
            uint256 cleared,
            uint256 totalScore,
            uint256 totalStars,
            uint32[] memory bestScores,
            uint8[] memory stars
        )
    {
        PlayerTotals storage totals = _totals[player];
        uint256 count = levelCount;
        bestScores = new uint32[](count);
        stars = new uint8[](count);
        uint256 last = totals.highestCleared;
        for (uint256 i = 0; i < last; i++) {
            LevelRecord storage record = _records[player][i + 1];
            bestScores[i] = record.bestScore;
            stars[i] = record.stars;
        }
        return (last, totals.totalScore, totals.totalStars, bestScores, stars);
    }

    function levelRecord(address player, uint256 levelId) external view returns (uint256 bestScore, uint256 stars) {
        LevelRecord storage record = _records[player][levelId];
        return (record.bestScore, record.stars);
    }

    function highestCleared(address player) external view returns (uint256) {
        return _totals[player].highestCleared;
    }

    
    // Treasury & admin
    function claimFees(address payable _to) external onlyOwner nonReentrant {
        require(_to != address(0), "CandyCascade: zero address");
        uint256 balance = address(this).balance;
        require(balance > 0, "CandyCascade: nothing to claim");
        (bool success, ) = _to.call{value: balance}("");
        require(success, "CandyCascade: transfer failed");
        emit FeesWithdrawn(_to, balance);
    }

    function setTrustedSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "CandyCascade: zero signer");
        emit TrustedSignerUpdated(trustedSigner, _newSigner);
        trustedSigner = _newSigner;
    }

    function setSubmissionFee(uint256 _newFee) external onlyOwner {
        emit SubmissionFeeUpdated(submissionFee, _newFee);
        submissionFee = _newFee;
    }

    /// Opens more levels when the game adds them. It can only grow, so no progress is cut off.
    function setLevelCount(uint256 _newCount) external onlyOwner {
        require(_newCount >= levelCount && _newCount <= type(uint16).max, "CandyCascade: bad level count");
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
