// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BestGameVoting
/// @notice Daily "Best Game Award" voting. All vote counters are keyed by a
///         rolling day index derived from block.timestamp, so counts reset
///         automatically for every user at the same instant — 00:01:00 UTC —
///         with no keeper, cron job, or owner transaction required.
contract BestGameVoting is Ownable2Step, Pausable, ReentrancyGuard {
    /*  Constants  */

    uint256 public constant SECONDS_PER_DAY = 1 days;
    /// @dev Shifts the day boundary from 00:00:00 UTC to 00:01:00 UTC.
    uint256 public constant RESET_OFFSET = 1 minutes;
    uint256 public constant MAX_VOTES_PER_DAY = 10;

    /*  Storage  */

    struct Game {
        string key;   // off-chain identifier, e.g. "space_shooter"
        bool active;
    }

    Game[] private _games;
    mapping(string => uint256) private _gameIdByKey; // 1-based; 0 = unregistered

    // day => gameId => total votes cast for that game
    mapping(uint256 => mapping(uint256 => uint256)) private _gameVotesByDay;
    // day => user => gameId => votes that user cast for that game
    mapping(uint256 => mapping(address => mapping(uint256 => uint256))) private _userGameVotesByDay;
    // day => user => total votes that user has cast (across all games)
    mapping(uint256 => mapping(address => uint256)) private _userVotesToday;
    // gameId => total votes ever cast for that game — persists across day resets
    mapping(uint256 => uint256) private _gameVotesAllTime;

    /*  Events  */

    event GameAdded(uint256 indexed gameId, string key);
    event GameActiveSet(uint256 indexed gameId, bool active);
    event Voted(
        address indexed voter,
        uint256 indexed gameId,
        uint256 indexed day,
        uint256 userVotesToday,
        uint256 gameVotesToday
    );

    /*  Errors  */

    error EmptyKey();
    error GameKeyTaken();
    error GameNotFound();
    error GameInactive();
    error DailyLimitReached();

    constructor(address initialOwner) Ownable(initialOwner) {}

    /*  Day math  */

    /// @notice Current voting day index. Increments at 00:01:00 UTC.
    function currentVotingDay() public view returns (uint256) {
        if (block.timestamp < RESET_OFFSET) return 0;
        return (block.timestamp - RESET_OFFSET) / SECONDS_PER_DAY;
    }

    /// @notice Absolute UNIX timestamp of the next 00:01:00 UTC reset.
    function nextResetTimestamp() public view returns (uint256) {
        return (currentVotingDay() + 1) * SECONDS_PER_DAY + RESET_OFFSET;
    }

    /// @notice Seconds remaining until the next reset.
    function timeUntilReset() external view returns (uint256) {
        return nextResetTimestamp() - block.timestamp;
    }

    /*  Game registry (owner-managed)  */

    function addGame(string calldata key) external onlyOwner returns (uint256 gameId) {
        if (bytes(key).length == 0) revert EmptyKey();
        if (_gameIdByKey[key] != 0) revert GameKeyTaken();

        _games.push(Game({ key: key, active: true }));
        gameId = _games.length - 1;
        _gameIdByKey[key] = gameId + 1;

        emit GameAdded(gameId, key);
    }

    function setGameActive(uint256 gameId, bool active) external onlyOwner {
        _requireGameExists(gameId);
        _games[gameId].active = active;
        emit GameActiveSet(gameId, active);
    }

    function gameCount() external view returns (uint256) {
        return _games.length;
    }

    function getGame(uint256 gameId) external view returns (string memory key, bool active) {
        _requireGameExists(gameId);
        Game storage g = _games[gameId];
        return (g.key, g.active);
    }

    function gameIdForKey(string calldata key) external view returns (uint256) {
        uint256 stored = _gameIdByKey[key];
        if (stored == 0) revert GameNotFound();
        return stored - 1;
    }

    /// @notice Every registered game, for building an id<->key map client-side.
    function getGames()
        external
        view
        returns (uint256[] memory gameIds, string[] memory keys, bool[] memory active)
    {
        uint256 n = _games.length;
        gameIds = new uint256[](n);
        keys = new string[](n);
        active = new bool[](n);
        for (uint256 i = 0; i < n; i++) {
            gameIds[i] = i;
            keys[i] = _games[i].key;
            active[i] = _games[i].active;
        }
    }

    /*  Voting  */

    /// @notice Cast one vote for `gameId` for the current voting day.
    function vote(uint256 gameId) external whenNotPaused nonReentrant {
        _requireGameExists(gameId);
        if (!_games[gameId].active) revert GameInactive();

        uint256 day = currentVotingDay();
        uint256 usedToday = _userVotesToday[day][msg.sender];
        if (usedToday >= MAX_VOTES_PER_DAY) revert DailyLimitReached();

        _userVotesToday[day][msg.sender] = usedToday + 1;
        _userGameVotesByDay[day][msg.sender][gameId] += 1;
        uint256 newGameTotal = _gameVotesByDay[day][gameId] + 1;
        _gameVotesByDay[day][gameId] = newGameTotal;
        _gameVotesAllTime[gameId] += 1;

        emit Voted(msg.sender, gameId, day, usedToday + 1, newGameTotal);
    }

    /*  Reads  */

    /// @notice Votes `user` has left before hitting today's cap.
    function votesRemaining(address user) public view returns (uint256) {
        uint256 used = _userVotesToday[currentVotingDay()][user];
        return used >= MAX_VOTES_PER_DAY ? 0 : MAX_VOTES_PER_DAY - used;
    }

    /// @notice Per-game breakdown of votes `user` cast today, plus totals.
    function getUserVotes(address user)
        external
        view
        returns (
            uint256[] memory gameIds,
            string[] memory keys,
            uint256[] memory votesPerGame,
            uint256 votesUsedToday,
            uint256 votesLeftToday
        )
    {
        uint256 day = currentVotingDay();
        uint256 n = _games.length;
        gameIds = new uint256[](n);
        keys = new string[](n);
        votesPerGame = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            gameIds[i] = i;
            keys[i] = _games[i].key;
            votesPerGame[i] = _userGameVotesByDay[day][user][i];
        }

        votesUsedToday = _userVotesToday[day][user];
        votesLeftToday = votesUsedToday >= MAX_VOTES_PER_DAY ? 0 : MAX_VOTES_PER_DAY - votesUsedToday;
    }

    /// @notice Today's vote tally for every registered game.
    function getAllVotes()
        external
        view
        returns (
            uint256[] memory gameIds,
            string[] memory keys,
            uint256[] memory votes,
            uint256 totalVotes
        )
    {
        uint256 day = currentVotingDay();
        uint256 n = _games.length;
        gameIds = new uint256[](n);
        keys = new string[](n);
        votes = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            gameIds[i] = i;
            keys[i] = _games[i].key;
            uint256 v = _gameVotesByDay[day][i];
            votes[i] = v;
            totalVotes += v;
        }
    }

    /// @notice All-time vote tally for every registered game — never reset,
    ///         unlike getAllVotes() which only reflects the current day.
    function getAllTimeVotes()
        external
        view
        returns (
            uint256[] memory gameIds,
            string[] memory keys,
            uint256[] memory votes,
            uint256 totalVotes
        )
    {
        uint256 n = _games.length;
        gameIds = new uint256[](n);
        keys = new string[](n);
        votes = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            gameIds[i] = i;
            keys[i] = _games[i].key;
            uint256 v = _gameVotesAllTime[i];
            votes[i] = v;
            totalVotes += v;
        }
    }

    /*  Internal  */

    function _requireGameExists(uint256 gameId) internal view {
        if (gameId >= _games.length) revert GameNotFound();
    }

    /*  Admin  */

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
