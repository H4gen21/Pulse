// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {InheritanceGuard} from "../contracts/InheritanceGuard.sol";
import {InheritanceGuardStaging} from "../contracts/testnet/InheritanceGuardStaging.sol";

contract StagingToken is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract InheritanceGuardStagingTest is Test {
    InheritanceGuard prod;
    InheritanceGuardStaging staging;
    StagingToken usdc;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address heir = makeAddr("heir");

    function setUp() public {
        prod = new InheritanceGuard();
        staging = new InheritanceGuardStaging();
        staging.setForwarder(keeper, true);
        usdc = new StagingToken();
    }

    function _solo() internal view returns (InheritanceGuard.Beneficiary[] memory b) {
        b = new InheritanceGuard.Beneficiary[](1);
        b[0] = InheritanceGuard.Beneficiary(heir, 10_000);
    }

    function test_ProductionRejects15Seconds() public {
        InheritanceGuard.Beneficiary[] memory b = _solo();
        vm.prank(owner);
        vm.expectRevert(InheritanceGuard.InvalidTimeout.selector);
        prod.setupGuard(address(usdc), 15 seconds, b);
    }

    function test_StagingAccepts15Seconds() public {
        vm.prank(owner);
        staging.setupGuard(address(usdc), 15 seconds, _solo());
        assertEq(staging.deadlineOf(owner), block.timestamp + 15 seconds);
    }

    function test_StagingBounds() public {
        assertEq(staging.minTimeout(), 15 seconds);
        assertEq(staging.maxTimeout(), 730 days);

        InheritanceGuard.Beneficiary[] memory b = _solo();
        vm.startPrank(owner);
        vm.expectRevert(InheritanceGuard.InvalidTimeout.selector);
        staging.setupGuard(address(usdc), 14 seconds, b);
        vm.expectRevert(InheritanceGuard.InvalidTimeout.selector);
        staging.setupGuard(address(usdc), 730 days + 1, b);
        vm.stopPrank();
    }

    function test_StagingFullFlowIn15Seconds() public {
        usdc.mint(owner, 100e6);
        vm.startPrank(owner);
        usdc.approve(address(staging), type(uint256).max);
        staging.setupGuard(address(usdc), 15 seconds, _solo());
        vm.stopPrank();

        vm.warp(block.timestamp + 14);
        (bool needed,) = staging.checkUpkeep("");
        assertFalse(needed);

        vm.warp(block.timestamp + 1);
        bytes memory data;
        (needed, data) = staging.checkUpkeep("");
        assertTrue(needed);
        vm.prank(keeper);
        staging.performUpkeep(data);
        assertEq(usdc.balanceOf(heir), 100e6);
    }
}
