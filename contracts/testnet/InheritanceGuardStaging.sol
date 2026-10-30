// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InheritanceGuard} from "../InheritanceGuard.sol";

/// @title Pulse InheritanceGuard (STAGING)
/// @notice TEST CONTRACT. NEVER DEPLOY TO MAINNET. NEVER POINT PRODUCTION AT IT.
///         Identical to InheritanceGuard except the minimum inactivity period is 15 seconds,
///         so the full setup → expiry → performUpkeep → payout flow can be tested on
///         Base Sepolia or an Anvil fork in minutes. A 15-second timer would let anyone who
///         controls a forwarder drain a real user's approved balance almost immediately.
/// @dev CI fails if anything outside contracts/testnet or test/ imports this contract.
contract InheritanceGuardStaging is InheritanceGuard {
    function minTimeout() public pure override returns (uint256) {
        return 15 seconds;
    }

    function maxTimeout() public pure override returns (uint256) {
        return 730 days;
    }
}
