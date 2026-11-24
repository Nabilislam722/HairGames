// SPDX-License-Identifier: MIT
pragma solidity 0.8.39;

import "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import "./interfaces/ISessionRegistry.sol";

/**
 * @title HairGames Hub V2
 * @notice One contract for every HairGames game. A player starts a run, sends checkpoints while playing,
 *         and saves a result the backend has checked and signed. Game rules (level order, stars, replays,
 *         NFT-only items) live in the backend, which signs only results it has verified. This contract
 *         checks who the player is, the fees and the signature, and records everything as events for the
 *         backend's indexer.
 *
 * The player is the calling wallet, or the wallet a live session key plays for (SessionRegistry), so a
 * session plays without wallet popups and everything still counts for the player's own wallet.
 *
 * Built to grow without upgrades: a new game is a config entry (addGame), each game's start data
 * (`params`) and result data (`details`) are free-form and defined by the backend, a backup signer allows
 * key rotation without downtime, and a later version can be deployed alongside.
 *
 * Built for low gas: a run, a game and the hub's own settings each fit in one storage slot, a saved run
 * is deleted (gas refund), signatures are compact (EIP-2098), and a checkpoint is a bare event.
 *
 * Security:
 * - Results need an EIP-712 signature from the signer (or backup signer), bound to this contract and
 *   chain, the run, the player, the game, the score and the details. A run can be saved once, and only
 *   by its own player (their wallet or live session key).
 * - notBefore and deadline in the signed result stop a result being saved too early or replayed late.
 * - The registry is fixed at deployment, so no admin can change who a session key plays for.
 * - Fees are capped at MAX_FEE, because session keys pay them without asking the player each time.
 * - Roles instead of one owner: the admin (two-step transfer with a delay) manages signers and roles;
 *   game managers list games and set fees; pausers pause one game or everything; treasurers withdraw fees.
 * - Exact fees only, and no way to send plain ETH in.
 */
contract HairGamesHubV2 is AccessControlDefaultAdminRules, EIP712, ReentrancyGuardTransient {
    string public constant VERSION = "2";
    uint96 public constant MAX_FEE = 0.001 ether;

    bytes32 public constant GAME_MANAGER_ROLE = keccak256("GAME_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

    bytes32 private constant RESULT_TYPEHASH = keccak256(
        "Result(uint256 runId,address player,uint16 game,uint256 score,bytes32 detailsHash,uint64 notBefore,uint64 deadline)"
    );

    /// Read on every start and save, so kept in one slot: 20 + 8 + 1 bytes.
    struct Config {
        address signer;
        uint64 runCount;
        bool paused;
    }

    /// One slot per game: 1 + 1 + 12 + 12 bytes.
    struct Game {
        bool listed;
        bool paused;
        uint96 startFee; // wei, paid with startRun
        uint96 submitFee; // wei, paid with submitRun
    }

    /// One slot per open run: 20 + 5 + 2 + 1 bytes. Deleted once the run is saved.
    struct Run {
        address player;
        uint40 startedAt;
        uint16 game;
        bool open;
    }

    /// The signed result, in RESULT_TYPEHASH's field order. All its fields are fixed-size, so
    /// abi.encode(RESULT_TYPEHASH, result) encodes exactly like the fields listed one by one.
    struct Result {
        uint256 runId;
        address player;
        uint16 game;
        uint256 score;
        bytes32 detailsHash;
        uint64 notBefore;
        uint64 deadline;
    }

    ISessionRegistry public immutable registry;
    Config private _config;
    address public backupSigner;
    uint16 public gameCount;
    mapping(uint16 game => Game) public games;
    mapping(uint16 game => bytes32 name) public gameName;
    mapping(bytes32 name => uint16 game) public gameOf; // games are numbered from 1, so 0 means not listed
    mapping(uint256 runId => Run) public runs;

    event GameListed(uint16 indexed game, bytes32 name, uint96 startFee, uint96 submitFee);
    event GameFeesSet(uint16 indexed game, uint96 startFee, uint96 submitFee);
    event GamePausedSet(uint16 indexed game, bool paused);
    event PausedSet(bool paused);
    event SignerSet(address indexed signer);
    event BackupSignerSet(address indexed signer);
    event FeesWithdrawn(address indexed to, uint256 amount);

    /// `sender` is the address that sent the transaction: the player's wallet or their session key.
    event RunStarted(uint256 indexed runId, address indexed player, uint16 game, address sender, bytes32 params);
    /// `sender` is unchecked here: see checkpoint().
    event Checkpoint(uint256 indexed runId, address indexed sender, bytes16 stateHash);
    event RunSaved(uint256 indexed runId, address indexed player, uint16 game, uint256 score, bytes details);

    error HubPaused();
    error UnknownGame();
    error GameAlreadyListed();
    error GameIsPaused();
    error FeeTooHigh();
    error WrongFee();
    error RunNotOpen();
    error NotYourRun();
    error TooEarly();
    error SignatureExpired();
    error BadSignature();
    error ZeroAddress();
    error TransferFailed();

    /**
     * @param admin       Holds the admin role, and to start with every other role too.
     * @param adminDelay  Seconds a new admin has to wait before accepting the role.
     * @param registry_   The SessionRegistry that says who session keys play for. Fixed for good.
     * @param signer_     The backend key that signs verified results.
     */
    constructor(address admin, uint48 adminDelay, address registry_, address signer_)
        AccessControlDefaultAdminRules(adminDelay, admin)
        EIP712("HairGames Hub V2", "2")
    {
        if (registry_ == address(0) || signer_ == address(0)) revert ZeroAddress();
        registry = ISessionRegistry(registry_);
        _config.signer = signer_;
        _grantRole(GAME_MANAGER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(TREASURER_ROLE, admin);
        emit SignerSet(signer_);
    }

    // ---- Playing ---------------------------------------------------------------------------------

    /**
     * Opens a run of `game` for the player (the caller, or the wallet its session key plays for).
     * @param params Game-specific start data, e.g. a level or a difficulty; the backend reads it from
     *               RunStarted before signing the result.
     */
    function startRun(uint16 game, bytes32 params) external payable returns (uint256 runId) {
        Config memory c = _config;
        if (c.paused) revert HubPaused();
        Game memory g = games[game];
        if (!g.listed) revert UnknownGame();
        if (g.paused) revert GameIsPaused();
        if (msg.value != g.startFee) revert WrongFee();

        address player = registry.playerFor(msg.sender);
        runId = c.runCount + 1;
        _config.runCount = uint64(runId);
        runs[runId] = Run({player: player, startedAt: uint40(block.timestamp), game: game, open: true});
        emit RunStarted(runId, player, game, msg.sender, params);
    }

    /**
     * Records that a run is still being played, as cheaply as a call can: no checks, no storage and no
     * fee, just an event. A checkpoint changes nothing on chain, so checking it here would only cost gas.
     * The backend counts one only if `sender` was the run's player, or a session key playing for them at
     * that block, and if stateHash matches the run's replay.
     * @param stateHash A hash of the game state or inputs so far (16 bytes is plenty for this and costs
     *                  less to post than 32).
     */
    function checkpoint(uint256 runId, bytes16 stateHash) external {
        emit Checkpoint(runId, msg.sender, stateHash);
    }

    /**
     * Saves the result of an open run, signed by the signer after the backend checked it.
     * @param details    Game-specific result data (e.g. level, time and stars), emitted as is.
     * @param notBefore  The result can't be saved before this time (e.g. the run's start plus its length).
     * @param deadline   The signature can't be used after this time.
     * @param r,vs       The signer's compact (EIP-2098) signature over the Result.
     */
    function submitRun(
        uint256 runId,
        uint256 score,
        bytes calldata details,
        uint64 notBefore,
        uint64 deadline,
        bytes32 r,
        bytes32 vs
    ) external payable {
        if (_config.paused) revert HubPaused();
        Run memory run = _openRunOf(runId);
        Game memory g = games[run.game];
        if (g.paused) revert GameIsPaused();
        if (msg.value != g.submitFee) revert WrongFee();
        if (block.timestamp < notBefore) revert TooEarly();
        if (block.timestamp > deadline) revert SignatureExpired();

        Result memory result = Result(runId, run.player, run.game, score, keccak256(details), notBefore, deadline);
        address recovered = ECDSA.recover(_hashTypedDataV4(keccak256(abi.encode(RESULT_TYPEHASH, result))), r, vs);
        if (recovered != _config.signer && recovered != backupSigner) revert BadSignature();

        delete runs[runId];
        emit RunSaved(runId, run.player, run.game, score, details);
    }

    // The open run `runId`, if the caller is its player (their wallet, or their live session key).
    function _openRunOf(uint256 runId) private view returns (Run memory run) {
        run = runs[runId];
        if (!run.open) revert RunNotOpen();
        if (msg.sender != run.player && registry.playerFor(msg.sender) != run.player) revert NotYourRun();
    }

    // ---- Games -----------------------------------------------------------------------------------

    /// Lists a game by its backend name (e.g. "moto_rush" as bytes32) and returns its number.
    function addGame(bytes32 name, uint96 startFee, uint96 submitFee) external onlyRole(GAME_MANAGER_ROLE) returns (uint16 game) {
        if (name == bytes32(0)) revert UnknownGame();
        if (gameOf[name] != 0) revert GameAlreadyListed();
        if (startFee > MAX_FEE || submitFee > MAX_FEE) revert FeeTooHigh();
        game = ++gameCount;
        games[game] = Game({listed: true, paused: false, startFee: startFee, submitFee: submitFee});
        gameName[game] = name;
        gameOf[name] = game;
        emit GameListed(game, name, startFee, submitFee);
    }

    function setGameFees(uint16 game, uint96 startFee, uint96 submitFee) external onlyRole(GAME_MANAGER_ROLE) {
        Game storage g = games[game];
        if (!g.listed) revert UnknownGame();
        if (startFee > MAX_FEE || submitFee > MAX_FEE) revert FeeTooHigh();
        g.startFee = startFee;
        g.submitFee = submitFee;
        emit GameFeesSet(game, startFee, submitFee);
    }

    /// Pauses or resumes one game. Runs already open can't be saved while it's paused.
    function setGamePaused(uint16 game, bool paused_) external onlyRole(PAUSER_ROLE) {
        Game storage g = games[game];
        if (!g.listed) revert UnknownGame();
        g.paused = paused_;
        emit GamePausedSet(game, paused_);
    }

    /// Pauses or resumes every game (starts and saves; checkpoints are bare logs and carry on).
    function setPaused(bool paused_) external onlyRole(PAUSER_ROLE) {
        _config.paused = paused_;
        emit PausedSet(paused_);
    }

    // ---- Admin -----------------------------------------------------------------------------------

    function setSigner(address signer_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (signer_ == address(0)) revert ZeroAddress();
        _config.signer = signer_;
        emit SignerSet(signer_);
    }

    /// A second accepted signer, for rotating the backend key without downtime; address(0) turns it off.
    function setBackupSigner(address signer_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        backupSigner = signer_;
        emit BackupSignerSet(signer_);
    }

    function withdrawFees(address payable to, uint256 amount) external onlyRole(TREASURER_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        emit FeesWithdrawn(to, amount);
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ---- Views -----------------------------------------------------------------------------------

    function signer() external view returns (address) {
        return _config.signer;
    }

    function runCount() external view returns (uint256) {
        return _config.runCount;
    }

    function paused() external view returns (bool) {
        return _config.paused;
    }
}
