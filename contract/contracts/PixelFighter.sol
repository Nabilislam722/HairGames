// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PixelFighter
 * @notice On-chain results for Pixel Fighters matches against the CPU.
 *
 * Every match starts on chain with startMatch, which opens a numbered run at a CPU difficulty. The
 * backend then picks the CPU's seed and opponent, and after the match replays the player's recorded
 * inputs with the game's engine. It signs only the score that replay produced (never the client's
 * claim), bound to the run. submitMatch checks the signature and closes the run. A quit is never
 * submitted, so the next startMatch simply opens a new run.
 */
contract PixelFighter is Ownable2Step, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;

    uint8 public constant DIFFICULTY_COUNT = 3; // 0 easy, 1 normal, 2 hard

    // State
    address public trustedSigner;
    uint256 public submissionFee;

    /// The match a result can be saved against. A new start replaces it.
    struct Run {
        uint64 runId; // counts up per player; signatures are bound to it
        uint8 difficulty;
        uint64 startedAt;
        bool active;
    }

    struct PlayerStats {
        uint32 matches;
        uint32 wins;
        uint32 bestScore;
        uint64 totalScore;
    }

    mapping(address => Run) public activeRuns;
    mapping(address => uint64) public runCount;
    mapping(address => PlayerStats) public stats;

    // Events
    event MatchStarted(address indexed player, uint256 difficulty, uint256 runId);
    event MatchCompleted(
        address indexed player,
        uint256 indexed runId,
        uint256 difficulty,
        uint256 score,
        bool won,
        uint256 durationMs,
        bytes32 sessionId
    );
    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event SubmissionFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);

    constructor(address _trustedSigner, uint256 _submissionFee) Ownable(msg.sender) {
        require(_trustedSigner != address(0), "PixelFighter: zero signer");
        trustedSigner = _trustedSigner;
        submissionFee = _submissionFee;
    }

    // Gameplay
    /// Opens a run at a CPU difficulty, replacing any run still open.
    function startMatch(uint8 difficulty) external whenNotPaused {
        require(difficulty < DIFFICULTY_COUNT, "PixelFighter: bad difficulty");
        uint64 runId = runCount[msg.sender] + 1;
        runCount[msg.sender] = runId;
        activeRuns[msg.sender] = Run({
            runId: runId,
            difficulty: difficulty,
            startedAt: uint64(block.timestamp),
            active: true
        });
        emit MatchStarted(msg.sender, difficulty, runId);
    }

    /**
     * Saves a finished match against the caller's open run and closes the run.
     * @param score       Score from the backend's replay of the match.
     * @param won         Whether the player won, from the same replay.
     * @param durationMs  Length of the match in game time, from the same replay.
     * @param sessionId   The backend session the replay belongs to.
     * @param signature   Backend signature over keccak256(abi.encodePacked(player, runId, difficulty,
     *                    score, won, durationMs, sessionId, address(this), block.chainid)), EIP-191
     *                    prefixed, where runId and difficulty are the open run's.
     */
    function submitMatch(
        uint256 score,
        bool won,
        uint256 durationMs,
        bytes32 sessionId,
        bytes calldata signature
    ) external payable whenNotPaused nonReentrant {
        require(msg.value == submissionFee, "PixelFighter: incorrect fee");
        require(score <= type(uint32).max, "PixelFighter: bad score");

        Run storage run = activeRuns[msg.sender];
        require(run.active, "PixelFighter: no open match");
        // The game clock only runs while playing, so a real match never ends sooner than its own
        // length after the run was opened on chain.
        require(block.timestamp >= uint256(run.startedAt) + durationMs / 1000, "PixelFighter: finished too fast");

        uint256 runId = run.runId;
        uint256 difficulty = run.difficulty;
        _checkSignature(runId, difficulty, score, won, durationMs, sessionId, signature);
        run.active = false;

        PlayerStats storage s = stats[msg.sender];
        s.matches += 1;
        if (won) s.wins += 1;
        if (score > s.bestScore) s.bestScore = uint32(score);
        s.totalScore += uint64(score);

        emit MatchCompleted(msg.sender, runId, difficulty, score, won, durationMs, sessionId);
    }

    function _checkSignature(
        uint256 runId,
        uint256 difficulty,
        uint256 score,
        bool won,
        uint256 durationMs,
        bytes32 sessionId,
        bytes calldata signature
    ) private view {
        bytes32 structHash = keccak256(
            abi.encodePacked(msg.sender, runId, difficulty, score, won, durationMs, sessionId, address(this), block.chainid)
        );
        address signer = MessageHashUtils.toEthSignedMessageHash(structHash).recover(signature);
        require(signer == trustedSigner, "PixelFighter: invalid signature");
    }

    // Treasury & admin
    function claimFees(address payable _to) external onlyOwner nonReentrant {
        require(_to != address(0), "PixelFighter: zero address");
        uint256 balance = address(this).balance;
        require(balance > 0, "PixelFighter: nothing to claim");
        (bool success, ) = _to.call{value: balance}("");
        require(success, "PixelFighter: transfer failed");
        emit FeesWithdrawn(_to, balance);
    }

    function setTrustedSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "PixelFighter: zero signer");
        emit TrustedSignerUpdated(trustedSigner, _newSigner);
        trustedSigner = _newSigner;
    }

    function setSubmissionFee(uint256 _newFee) external onlyOwner {
        emit SubmissionFeeUpdated(submissionFee, _newFee);
        submissionFee = _newFee;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
