// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ProofOfPatience is Ownable2Step, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    address public trustedSigner;
    uint256 public submissionFee;

    struct Run {
        uint256 startTime;
        bool isActive;
    }

    mapping(address => Run) public activeRuns;
    mapping(address => uint256) public playerBestScore;
    mapping(address => uint256) public userNonces;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event RunStarted(address indexed player, uint256 startTime);
    event RunCompleted(
        address indexed player,
        uint256 score,
        uint256 survivalSeconds,
        uint256 answered,
        uint256 shots,
        uint256 hits,
        uint256 feePaid
    );
    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event SubmissionFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address _trustedSigner, uint256 _submissionFee) Ownable(msg.sender) {
        require(_trustedSigner != address(0), "ProofOfPatience: zero signer");
        trustedSigner = _trustedSigner;
        submissionFee = _submissionFee;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core Gameplay Logic
    // ─────────────────────────────────────────────────────────────────────────

    function startRun() external whenNotPaused {
        require(!activeRuns[msg.sender].isActive, "ProofOfPatience: run already in progress");

        activeRuns[msg.sender] = Run({
            startTime: block.timestamp,
            isActive: true
        });

        emit RunStarted(msg.sender, block.timestamp);
    }

    /**
     * @param score            Final patience-point score reported by the client.
     * @param survivalSeconds  Seconds the round lasted before it ended.
     * @param answered         Questions fully answered.
     * @param shots            Letters fired.
     * @param hits             Letters that landed on the caller waiting for them.
     * @param nonce            Must equal the caller's current on-chain nonce.
     * @param signature        Backend attestation over every field above plus
     *                         caller/contract/chain.
     *
     * Unlike a fixed-time race, this game's score depends on combo chains,
     * POP OFF timing and mid-round breaks — there's no single pure function to
     * recompute it from on-chain. Trust is placed entirely in `trustedSigner`,
     * the same way `submitRaceResult` trusts it for lap time. The backend is
     * expected to reject anything implausible (score vs. answered/hits, rate
     * limits) before it ever signs — that check happens off-chain, same as
     * every other validation here.
     */
    function submitScore(
        uint256 score,
        uint256 survivalSeconds,
        uint256 answered,
        uint256 shots,
        uint256 hits,
        uint256 nonce,
        bytes calldata signature
    ) external payable whenNotPaused nonReentrant {
        require(activeRuns[msg.sender].isActive, "ProofOfPatience: no active run");
        require(msg.value == submissionFee, "ProofOfPatience: incorrect fee");
        require(nonce == userNonces[msg.sender], "ProofOfPatience: invalid nonce");

        // Increment nonce to prevent replay attacks
        userNonces[msg.sender]++;

        // ── 1. Reconstruct and verify the backend signature ───────────────────
        bytes32 structHash = keccak256(
            abi.encodePacked(
                msg.sender,
                score,
                survivalSeconds,
                answered,
                shots,
                hits,
                nonce,
                address(this),
                block.chainid
            )
        );

        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(structHash);
        address signer = ethSignedHash.recover(signature);
        require(signer == trustedSigner, "ProofOfPatience: invalid signature");

        // ── 2. State update ───────────────────────────────────────────────────
        activeRuns[msg.sender].isActive = false;

        if (score > playerBestScore[msg.sender]) {
            playerBestScore[msg.sender] = score;
        }

        emit RunCompleted(msg.sender, score, survivalSeconds, answered, shots, hits, msg.value);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Treasury & Admin Controls
    // ─────────────────────────────────────────────────────────────────────────

    function claimFees(address payable _to) external onlyOwner nonReentrant {
        require(_to != address(0), "ProofOfPatience: zero address");
        uint256 balance = address(this).balance;
        require(balance > 0, "ProofOfPatience: nothing to claim");

        (bool success, ) = _to.call{value: balance}("");
        require(success, "ProofOfPatience: transfer failed");

        emit FeesWithdrawn(_to, balance);
    }

    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function setTrustedSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "ProofOfPatience: zero signer");
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
