// SPDX-License-Identifier: MIT
pragma solidity 0.8.39;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import "./interfaces/ISessionRegistry.sol";

/**
 * @title HairGamesSessionRegistry
 * @notice Lets a wallet appoint short-lived session keys that play games for it, so playing needs no
 *         wallet popups. A key lives in the player's browser with a small ETH balance for gas and fees.
 *         It only counts as the player on contracts that ask this registry (HairGamesHubV2), and it can
 *         never move the player's tokens or NFTs, which don't know about it.
 *
 * Security:
 * - The key signs its consent (EIP-712) to the exact wallet and expiry, so nobody can tie a key they
 *   don't hold to their own wallet, not even by copying a player's pending transaction.
 * - Once a key belongs to a wallet, it stays with that wallet: only that wallet can renew it.
 * - A session lasts at most MAX_DURATION. The key can end its own session, and the wallet can revoke
 *   one key or all of its keys at once (revokeAll, e.g. after losing a device).
 * - A live session key can't open sessions itself, so sessions never chain.
 * - No owner, admin or upgrade path: nobody can change these rules after deployment.
 *
 * ETH sent to a key stays in the key: a contract can't take it back. The site returns what's left to the
 * wallet when the session ends (the key sends it back), so it's only lost if the browser loses the key.
 */
contract HairGamesSessionRegistry is ISessionRegistry, EIP712, ReentrancyGuardTransient {
    uint40 public constant MAX_DURATION = 30 days;

    /// One storage slot per key: 20 + 5 + 4 bytes.
    struct Session {
        address owner; // the wallet the key plays for
        uint40 expiresAt; // unix seconds; the session is live strictly before this
        uint32 epoch; // the owner's epoch when opened; revokeAll() moves the owner past it
    }

    bytes32 private constant CONSENT_TYPEHASH =
        keccak256("SessionConsent(address owner,address key,uint40 expiresAt)");

    mapping(address key => Session) public sessions;
    mapping(address owner => uint32) public epochOf;

    event SessionOpened(address indexed owner, address indexed key, uint40 expiresAt, uint256 funded);
    event SessionClosed(address indexed owner, address indexed key, address closedBy);
    event AllSessionsRevoked(address indexed owner, uint32 epoch);

    error InvalidKey();
    error InvalidExpiry();
    error KeyTaken();
    error BadConsent();
    error SessionKeyCannotOpen();
    error NotYourSession();
    error FundingFailed();

    constructor() EIP712("HairGames SessionRegistry", "1") {}

    /**
     * Opens or renews a session for `key` until `expiresAt`, and forwards any ETH sent to the key for gas
     * and game fees. Renewing with ETH tops the key up.
     * @param r,vs The key's compact (EIP-2098) signature over SessionConsent(owner = caller, key, expiresAt).
     */
    function openSession(address key, uint40 expiresAt, bytes32 r, bytes32 vs) external payable nonReentrant {
        if (key == address(0) || key == msg.sender) revert InvalidKey();
        if (expiresAt <= block.timestamp || expiresAt > block.timestamp + MAX_DURATION) revert InvalidExpiry();
        if (ownerOf(msg.sender) != address(0)) revert SessionKeyCannotOpen();
        address current = sessions[key].owner;
        if (current != address(0) && current != msg.sender) revert KeyTaken();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CONSENT_TYPEHASH, msg.sender, key, expiresAt)));
        if (ECDSA.recover(digest, r, vs) != key) revert BadConsent();

        sessions[key] = Session({owner: msg.sender, expiresAt: expiresAt, epoch: epochOf[msg.sender]});
        emit SessionOpened(msg.sender, key, expiresAt, msg.value);

        if (msg.value > 0) {
            (bool ok, ) = key.call{value: msg.value}("");
            if (!ok) revert FundingFailed();
        }
    }

    /// Ends the caller's own session. Called by the key, e.g. when the player ends the session.
    function closeSession() external {
        Session storage s = sessions[msg.sender];
        address owner = s.owner;
        if (owner == address(0)) revert NotYourSession();
        s.expiresAt = uint40(block.timestamp);
        emit SessionClosed(owner, msg.sender, msg.sender);
    }

    /// Ends one of the caller's sessions. Called by the wallet.
    function revokeSession(address key) external {
        Session storage s = sessions[key];
        if (s.owner != msg.sender) revert NotYourSession();
        s.expiresAt = uint40(block.timestamp);
        emit SessionClosed(msg.sender, key, msg.sender);
    }

    /// Ends every session of the caller's at once. Called by the wallet.
    function revokeAll() external {
        uint32 epoch = ++epochOf[msg.sender];
        emit AllSessionsRevoked(msg.sender, epoch);
    }

    /// @inheritdoc ISessionRegistry
    function ownerOf(address key) public view returns (address owner) {
        Session memory s = sessions[key];
        owner = s.owner;
        if (owner == address(0) || s.expiresAt <= block.timestamp || s.epoch != epochOf[owner]) return address(0);
    }

    /// @inheritdoc ISessionRegistry
    function playerFor(address caller) external view returns (address) {
        address owner = ownerOf(caller);
        return owner == address(0) ? caller : owner;
    }
}
