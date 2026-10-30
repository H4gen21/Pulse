// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {InheritanceGuardStaging} from "../contracts/testnet/InheritanceGuardStaging.sol";

/// @notice STAGING deploy (15 s minimum timer). Testnets and local forks only.
///         forge script script/DeployStaging.s.sol:DeployStaging --rpc-url "$RPC_URL" --interactives 1 --broadcast
contract DeployStaging is Script {
    error NotATestnet(uint256 chainId);

    function run() external returns (InheritanceGuardStaging guard) {
        // Base Sepolia, Anvil (default id) and Sepolia only. Base mainnet (8453) is refused.
        if (block.chainid != 84532 && block.chainid != 31337 && block.chainid != 11155111) {
            revert NotATestnet(block.chainid);
        }
        vm.startBroadcast();
        guard = new InheritanceGuardStaging();
        vm.stopBroadcast();
        console.log("InheritanceGuardStaging (TEST ONLY):", address(guard));
        console.log("Owner:", guard.owner());
    }
}
