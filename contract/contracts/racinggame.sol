// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract NeedForHair is Ownable2Step, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    address public trustedSigner;
    uint256 public submissionFee;

    struct Race {
        uint256 startTime;
        bool isActive;
    }

    mapping(address => Race) public activeRaces;
    mapping(address => uint256) public playerTotalPoints;
    mapping(address => uint256) public userNonces; // Cheaper than mapping bytes32 signatures

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event RaceStarted(address indexed player, uint256 startTime);
    event RaceCompleted(address indexed player, uint256 timeTakenMs, uint256 pointsAwarded, uint256 feePaid);
    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event SubmissionFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address _trustedSigner, uint256 _submissionFee) Ownable(msg.sender) {
        require(_trustedSigner != address(0), "RacingGame: zero signer");
        trustedSigner = _trustedSigner;
        submissionFee = _submissionFee;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core Gameplay Logic
    // ─────────────────────────────────────────────────────────────────────────

    function startGame() external whenNotPaused {
        require(!activeRaces[msg.sender].isActive, "Race already in progress");

        activeRaces[msg.sender] = Race({
            startTime: block.timestamp,
            isActive: true
        });

        emit RaceStarted(msg.sender, block.timestamp);
    }

    function submitRaceResult(
        uint256 timeTakenMs,
        uint256 nonce,
        bytes calldata signature
    ) external payable whenNotPaused nonReentrant {
        require(activeRaces[msg.sender].isActive, "No active race");
        require(msg.value == submissionFee, "RacingGame: incorrect fee");
        require(nonce == userNonces[msg.sender], "RacingGame: invalid nonce");
        
        // Increment nonce to prevent replay attacks
        userNonces[msg.sender]++;

        // ── 1. Reconstruct and verify the backend signature ───────────────────
        bytes32 structHash = keccak256(
            abi.encodePacked(
                msg.sender,
                timeTakenMs,
                nonce,
                address(this),
                block.chainid
            )
        );

        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(structHash);
        address signer = ethSignedHash.recover(signature);
        require(signer == trustedSigner, "RacingGame: invalid signature");

        // ── 2. State update ───────────────────────────────────────────────────
        activeRaces[msg.sender].isActive = false;

        uint256 points = calculatePoints(timeTakenMs);
        playerTotalPoints[msg.sender] += points;

        emit RaceCompleted(msg.sender, timeTakenMs, points, msg.value);
    }

    function calculatePoints(uint256 timeTakenMs) internal pure returns (uint256) {
        uint256 parTimeMs = 60000; 
        if (timeTakenMs >= parTimeMs) return 10; 
        return 10 + ((parTimeMs - timeTakenMs) / 1000);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Treasury & Admin Controls
    // ─────────────────────────────────────────────────────────────────────────

    function claimFees(address payable _to) external onlyOwner nonReentrant {
        require(_to != address(0), "RacingGame: zero address");
        uint256 balance = address(this).balance;
        require(balance > 0, "RacingGame: nothing to claim");

        (bool success, ) = _to.call{value: balance}("");
        require(success, "RacingGame: transfer failed");

        emit FeesWithdrawn(_to, balance);
    }

    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function setTrustedSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "RacingGame: zero signer");
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