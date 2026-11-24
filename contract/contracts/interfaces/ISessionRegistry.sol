// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// What other contracts need from SessionRegistry: who a caller plays for.
interface ISessionRegistry {
    /// The wallet a live session key plays for, or address(0) if `key` isn't a live session key.
    function ownerOf(address key) external view returns (address);

    /// The player behind a call: the wallet a live session key plays for, otherwise the caller itself.
    function playerFor(address caller) external view returns (address);
}
