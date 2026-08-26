// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract FruitNinja is Ownable2Step, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    address public trustedSigner;
    uint256 public submissionFee;

    struct GameSession {
        uint256 startTime;
        bool isActive;
    }

    mapping(address => GameSession) public activeSessions;
    mapping(address => uint256) public playerTotalScore;
    mapping(address => uint256) public playerBestScore;
    mapping(address => uint256) public playerTotalFruitsSliced;
    mapping(address => uint256) public playerHighestLevel;
    mapping(address => uint256) public userNonces;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event GameStarted(address indexed player, uint256 startTime);
    event GameCompleted(
        address indexed player,
        uint256 finalScore,
        uint256 levelReached,
        uint256 fruitsSliced,
        uint256 feePaid
    );
    event NewBestScore(address indexed player, uint256 newBest);
    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event SubmissionFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address _trustedSigner, uint256 _submissionFee) Ownable(msg.sender) {
        require(_trustedSigner != address(0), "FruitSlashGame: zero signer");
        trustedSigner = _trustedSigner;
        submissionFee = _submissionFee;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core Gameplay Logic
    // ─────────────────────────────────────────────────────────────────────────

    function startGame() external whenNotPaused {
        require(!activeSessions[msg.sender].isActive, "Session already in progress");

        activeSessions[msg.sender] = GameSession({
            startTime: block.timestamp,
            isActive: true
        });

        emit GameStarted(msg.sender, block.timestamp);
    }

    function submitGameResult(
        uint256 finalScore,
        uint256 levelReached,
        uint256 fruitsSliced,
        uint256 nonce,
        bytes calldata signature
    ) external payable whenNotPaused nonReentrant {
        require(activeSessions[msg.sender].isActive, "No active session");
        require(msg.value == submissionFee, "FruitSlashGame: incorrect fee");
        require(nonce == userNonces[msg.sender], "FruitSlashGame: invalid nonce");

        // Increment nonce immediately to prevent replay attacks
        userNonces[msg.sender]++;

        // The backend must sign: keccak256(player, score, level, fruits, nonce, contract, chainid)
        bytes32 structHash = keccak256(
            abi.encodePacked(
                msg.sender,
                finalScore,
                levelReached,
                fruitsSliced,
                nonce,
                address(this),
                block.chainid
            )
        );

        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(structHash);
        address signer = ethSignedHash.recover(signature);
        require(signer == trustedSigner, "FruitSlashGame: invalid signature");

        // ── State update ────────────────────────────────────────────────────
        activeSessions[msg.sender].isActive = false;

        playerTotalScore[msg.sender] += finalScore;
        playerTotalFruitsSliced[msg.sender] += fruitsSliced;

        if (levelReached > playerHighestLevel[msg.sender]) {
            playerHighestLevel[msg.sender] = levelReached;
        }

        if (finalScore > playerBestScore[msg.sender]) {
            playerBestScore[msg.sender] = finalScore;
            emit NewBestScore(msg.sender, finalScore);
        }

        emit GameCompleted(msg.sender, finalScore, levelReached, fruitsSliced, msg.value);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Treasury & Admin Controls
    // ─────────────────────────────────────────────────────────────────────────

    function claimFees(address payable _to) external onlyOwner nonReentrant {
        require(_to != address(0), "FruitSlashGame: zero address");
        uint256 balance = address(this).balance;
        require(balance > 0, "FruitSlashGame: nothing to claim");

        (bool success, ) = _to.call{value: balance}("");
        require(success, "FruitSlashGame: transfer failed");

        emit FeesWithdrawn(_to, balance);
    }

    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function setTrustedSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "FruitSlashGame: zero signer");
        address old = trustedSigner;
        trustedSigner = _newSigner;
        emit TrustedSignerUpdated(old, _newSigner);
    }

    function setSubmissionFee(uint256 _newFee) external onlyOwner {
        uint256 old = submissionFee;
        submissionFee = _newFee;
        emit SubmissionFeeUpdated(old, _newFee);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
