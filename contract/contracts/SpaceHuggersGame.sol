pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SpaceHuggersGame is Ownable2Step, Pausable, ReentrancyGuard {

    using ECDSA for bytes32;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Backend wallet whose signature authorises every score submission.
    address public trustedSigner;

    /// @notice Fee (in wei) required with every submitLevelScore call.
    uint256 public submissionFee;

    /// @notice Per-player sequential nonce — prevents replay attacks.
    mapping(address => uint256) public userNonces;

    /// @notice Cumulative verified on-chain score per player.
    mapping(address => uint256) public playerTotalPoints;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event ScoreSubmitted(
        address indexed player,
        uint256 indexed level,
        uint256 kills,
        uint256 points,
        uint256 totalPoints,
        uint256 feePaid
    );

    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event SubmissionFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(
        address _trustedSigner,
        uint256 _submissionFee
    )
        Ownable(msg.sender)
    {
        _setTrustedSigner(_trustedSigner);
        _setSubmissionFee(_submissionFee);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core — score submission
    // ─────────────────────────────────────────────────────────────────────────

    function submitLevelScore(
        uint256 level,
        uint256 kills,
        uint256 points,
        uint256 nonce,
        bytes calldata signature
    )
        external
        payable
        whenNotPaused
        nonReentrant
    {
        // ── 1. Fee gate ───────────────────────────────────────────────────────
        require(msg.value == submissionFee, "SpaceHuggers: incorrect fee");

        // ── 2. Nonce check ────────────────────────────────────────────────────
        require(nonce == userNonces[msg.sender], "SpaceHuggers: invalid nonce");
        userNonces[msg.sender]++;

        // ── 3. Reconstruct and verify the backend signature ───────────────────
        bytes32 structHash = keccak256(
            abi.encodePacked(
                msg.sender,
                level,
                kills,
                points,
                nonce,
                address(this),
                block.chainid
            )
        );

        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(structHash);
        address signer = ethSignedHash.recover(signature);
        require(signer == trustedSigner, "SpaceHuggers: invalid signature");

        // ── 4. State update ───────────────────────────────────────────────────
        playerTotalPoints[msg.sender] += points;

        emit ScoreSubmitted(
            msg.sender,
            level,
            kills,
            points,
            playerTotalPoints[msg.sender],
            msg.value
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Treasury & Admin Controls
    // ─────────────────────────────────────────────────────────────────────────

    function claimFees(address payable _to) external onlyOwner nonReentrant {
        require(_to != address(0), "SpaceHuggers: zero address");
        uint256 balance = address(this).balance;
        require(balance > 0, "SpaceHuggers: nothing to claim");

        (bool success, ) = _to.call{value: balance}("");
        require(success, "SpaceHuggers: transfer failed");

        emit FeesWithdrawn(_to, balance);
    }

    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function setTrustedSigner(address _newSigner) external onlyOwner {
        address old = trustedSigner;
        _setTrustedSigner(_newSigner);
        emit TrustedSignerUpdated(old, _newSigner);
    }

    function setSubmissionFee(uint256 _newFee) external onlyOwner {
        uint256 old = submissionFee;
        _setSubmissionFee(_newFee);
        emit SubmissionFeeUpdated(old, _newFee);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _setTrustedSigner(address _signer) internal {
        require(_signer != address(0), "SpaceHuggers: zero signer");
        trustedSigner = _signer;
    }

    function _setSubmissionFee(uint256 _fee) internal {
        submissionFee = _fee;
    }

    receive() external payable {
        revert("SpaceHuggers: use submitLevelScore");
    }

    fallback() external payable {
        revert("SpaceHuggers: unknown function");
    }
}