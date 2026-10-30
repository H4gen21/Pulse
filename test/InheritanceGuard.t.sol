// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {InheritanceGuard} from "../contracts/InheritanceGuard.sol";

contract MockUSDC is ERC20 {
    mapping(address => bool) public blocked;

    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function blockAddress(address a) external {
        blocked[a] = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[to], "blocked");
        super._update(from, to, value);
    }
}

contract InheritanceGuardTest is Test {
    InheritanceGuard guard;
    MockUSDC usdc;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address h1 = makeAddr("h1");
    address h2 = makeAddr("h2");
    address h3 = makeAddr("h3");

    function setUp() public {
        guard = new InheritanceGuard();
        guard.setForwarder(keeper);
        usdc = new MockUSDC();
    }

    function _thirds() internal view returns (InheritanceGuard.Beneficiary[] memory b) {
        b = new InheritanceGuard.Beneficiary[](3);
        b[0] = InheritanceGuard.Beneficiary(h1, 3333);
        b[1] = InheritanceGuard.Beneficiary(h2, 3333);
        b[2] = InheritanceGuard.Beneficiary(h3, 3334);
    }

    function _setup(address o, uint256 timeout) internal {
        vm.prank(o);
        guard.setupGuard(address(usdc), timeout, _thirds());
    }

    function _run() internal {
        (bool needed, bytes memory data) = guard.checkUpkeep("");
        assertTrue(needed, "upkeep not needed");
        vm.prank(keeper);
        guard.performUpkeep(data);
    }

    // BR-01
    function test_RevertWhen_TimeoutBelow60Days() public {
        InheritanceGuard.Beneficiary[] memory b = _thirds();
        vm.prank(owner);
        vm.expectRevert(InheritanceGuard.InvalidTimeout.selector);
        guard.setupGuard(address(usdc), 60 days - 1, b);
    }

    function test_RevertWhen_TimeoutAbove730Days() public {
        InheritanceGuard.Beneficiary[] memory b = _thirds();
        vm.prank(owner);
        vm.expectRevert(InheritanceGuard.InvalidTimeout.selector);
        guard.setupGuard(address(usdc), 730 days + 1, b);
    }

    function test_AcceptsExactly60Days() public {
        _setup(owner, 60 days);
        (,,, bool active) = guard.guards(owner);
        assertTrue(active);
    }

    // BR-02
    function test_RevertWhen_BpsNot10000() public {
        InheritanceGuard.Beneficiary[] memory b = _thirds();
        b[2].bps = 3333;
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(InheritanceGuard.BpsSumMismatch.selector, 9999));
        guard.setupGuard(address(usdc), 180 days, b);
    }

    function test_RevertWhen_DuplicateOrSelfHeir() public {
        InheritanceGuard.Beneficiary[] memory b = _thirds();
        b[1].wallet = h1;
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(InheritanceGuard.DuplicateBeneficiary.selector, 1));
        guard.setupGuard(address(usdc), 180 days, b);

        b[1].wallet = owner;
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(InheritanceGuard.InvalidBeneficiary.selector, 1));
        guard.setupGuard(address(usdc), 180 days, b);
    }

    // BR-03: 100 units split 3333/3333/3334 -> 33, 33, 34
    function test_DustGoesToLastBeneficiary() public {
        usdc.mint(owner, 100);
        vm.prank(owner);
        usdc.approve(address(guard), type(uint256).max);
        _setup(owner, 60 days);
        vm.warp(block.timestamp + 60 days);
        _run();
        assertEq(usdc.balanceOf(h1), 33);
        assertEq(usdc.balanceOf(h2), 33);
        assertEq(usdc.balanceOf(h3), 34);
        assertEq(usdc.balanceOf(owner), 0);
    }

    // BR-04
    function test_PingResetsTimer() public {
        _setup(owner, 60 days);
        vm.warp(block.timestamp + 59 days);
        vm.prank(owner);
        guard.ping();
        vm.warp(block.timestamp + 59 days);
        assertFalse(guard.isExpired(owner));
        (bool needed,) = guard.checkUpkeep("");
        assertFalse(needed);
    }

    // BR-05: capped at min(balance, allowance)
    function test_TransferCappedByAllowance() public {
        usdc.mint(owner, 1_000e6);
        vm.prank(owner);
        usdc.approve(address(guard), 300e6);
        _setup(owner, 60 days);
        vm.warp(block.timestamp + 60 days);
        _run();
        assertEq(usdc.balanceOf(h1) + usdc.balanceOf(h2) + usdc.balanceOf(h3), 300e6);
        assertEq(usdc.balanceOf(owner), 700e6);
    }

    function test_ZeroAmountSkipsWithoutRevert() public {
        _setup(owner, 60 days); // no balance, no allowance
        vm.warp(block.timestamp + 60 days);
        _run();
        (,,, bool active) = guard.guards(owner);
        assertFalse(active);
        assertEq(guard.activeOwnersCount(), 0);
    }

    function test_ForgedPerformDataIsRevalidated() public {
        usdc.mint(owner, 100e6);
        vm.prank(owner);
        usdc.approve(address(guard), 100e6);
        _setup(owner, 60 days);
        vm.warp(block.timestamp + 60 days - 1);

        address[] memory forged = new address[](1);
        forged[0] = owner;
        vm.prank(keeper);
        guard.performUpkeep(abi.encode(forged));
        assertEq(usdc.balanceOf(owner), 100e6);
    }

    function test_RevertWhen_PerformUpkeepNotForwarder() public {
        bytes memory data = abi.encode(new address[](0));
        vm.expectRevert(InheritanceGuard.NotForwarder.selector);
        guard.performUpkeep(data);
    }

    function test_RevokeRemovesFromQueue() public {
        _setup(owner, 60 days);
        vm.prank(owner);
        guard.revokeGuard();
        vm.warp(block.timestamp + 61 days);
        (bool needed,) = guard.checkUpkeep("");
        assertFalse(needed);
    }

    function test_FailingOwnerDoesNotBlockOthers() public {
        address other = makeAddr("other");
        address h4 = makeAddr("h4");
        usdc.mint(owner, 100e6);
        usdc.mint(other, 100e6);
        vm.prank(owner);
        usdc.approve(address(guard), type(uint256).max);
        vm.prank(other);
        usdc.approve(address(guard), type(uint256).max);

        _setup(owner, 60 days); // includes h1
        InheritanceGuard.Beneficiary[] memory solo = new InheritanceGuard.Beneficiary[](1);
        solo[0] = InheritanceGuard.Beneficiary(h4, 10_000);
        vm.prank(other);
        guard.setupGuard(address(usdc), 60 days, solo);

        usdc.blockAddress(h1); // every transfer to h1 reverts
        vm.warp(block.timestamp + 60 days);
        _run();

        assertEq(usdc.balanceOf(owner), 100e6, "failed owner keeps funds");
        assertEq(usdc.balanceOf(h4), 100e6, "other owner still executed");
        assertEq(guard.activeOwnersCount(), 0);
    }

    // Heirs always receive exactly min(balance, allowance); nothing is lost to rounding.
    function testFuzz_ConservesAmount(uint256 balance, uint256 allowance, uint16 a, uint16 b) public {
        balance = bound(balance, 0, 1e30);
        allowance = bound(allowance, 0, 1e30);
        a = uint16(bound(a, 100, 9_800));
        b = uint16(bound(b, 100, 9_900 - a));
        InheritanceGuard.Beneficiary[] memory bens = new InheritanceGuard.Beneficiary[](3);
        bens[0] = InheritanceGuard.Beneficiary(h1, a);
        bens[1] = InheritanceGuard.Beneficiary(h2, b);
        bens[2] = InheritanceGuard.Beneficiary(h3, 10_000 - a - b);

        usdc.mint(owner, balance);
        vm.startPrank(owner);
        usdc.approve(address(guard), allowance);
        guard.setupGuard(address(usdc), 60 days, bens);
        vm.stopPrank();
        vm.warp(block.timestamp + 60 days);
        _run();

        uint256 expected = balance < allowance ? balance : allowance;
        assertEq(usdc.balanceOf(h1) + usdc.balanceOf(h2) + usdc.balanceOf(h3), expected);
    }
}
