// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {InheritanceGuard} from "../contracts/InheritanceGuard.sol";

/// @notice Production deploy (60–730 day bounds). The broadcasting wallet becomes the owner.
///         forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --interactives 1 --broadcast
///         Then register the Chainlink upkeep and call setForwarder(<forwarder>, true).
contract Deploy is Script {
    function run() external returns (InheritanceGuard guard) {
        vm.startBroadcast();
        guard = new InheritanceGuard();
        vm.stopBroadcast();
        console.log("InheritanceGuard (production):", address(guard));
        console.log("Owner:", guard.owner());
    }
}
