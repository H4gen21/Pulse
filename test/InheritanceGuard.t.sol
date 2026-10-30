// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
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

/// USDT-style: transfer/transferFrom/approve return nothing.
contract NoBoolToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

    function approve(address spender, uint256 amt) external {
        allowance[msg.sender][spender] = amt;
    }

    function transferFrom(address from, address to, uint256 amt) external {
        require(balanceOf[from] >= amt && allowance[from][msg.sender] >= amt);
        allowance[from][msg.sender] -= amt;
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
    }
}

/// balanceOf always reverts.
contract BrokenToken {
    function balanceOf(address) external pure returns (uint256) {
        revert("broken");
    }

    function allowance(address, address) external pure returns (uint256) {
        return type(uint256).max;
    }
}

/// Tries to re-enter the guard from inside transferFrom.
contract ReentrantToken is ERC20 {
    InheritanceGuard public guard;
    bool public reentryBlocked;

    constructor() ERC20("Evil", "EVL") {}

    function setGuard(InheritanceGuard g) external {
        guard = g;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function transferFrom(address from, address to, uint256 amt) public override returns (bool) {
        try guard.ping() {}
        catch (bytes memory reason) {
            reentryBlocked = bytes4(reason) == bytes4(keccak256("ReentrancyGuardReentrantCall()"));
        }
        return super.transferFrom(from, to, amt);
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
        guard.setForwarder(keeper, true);
        usdc = new MockUSDC();
    }

    function _thirds() internal view returns (InheritanceGuard.Beneficiary[] memory b) {
        b = new InheritanceGuard.Beneficiary[](3);
        b[0] = InheritanceGuard.Beneficiary(h1, 3333);
        b[1] = InheritanceGuard.Beneficiary(h2, 3333);
        b[2] = InheritanceGuard.Beneficiary(h3, 3334);
    }

    function _solo(address heir) internal pure returns (InheritanceGuard.Beneficiary[] memory b) {
        b = new InheritanceGuard.Beneficiary[](1);
        b[0] = InheritanceGuard.Beneficiary(heir, 10_000);
    }

    function _setup(address o, uint256 timeout) internal {
        vm.prank(o);
        guard.setupGuard(address(usdc), timeout, _thirds());
    }

    function _fund(address o, uint256 amount) internal {
        usdc.mint(o, amount);
        vm.prank(o);
        usdc.approve(address(guard), type(uint256).max);
    }

    function _run() internal {
        (bool needed, bytes memory data) = guard.checkUpkeep("");
        assertTrue(needed, "upkeep not needed");
        vm.prank(keeper);
        guard.performUpkeep(data);
    }

    function _active(address o) internal view returns (bool active) {
        (,,, active) = guard.guards(o);
    }

    function _perform(address[] memory owners) internal {
        vm.prank(keeper);
        guard.performUpkeep(abi.encode(owners));
    }

    // ─── BR-01 ───────────────────────────────────────────────────────────────

    function test_ProductionBounds() public view {
        assertEq(guard.minTimeout(), 60 days);
        assertEq(guard.maxTimeout(), 730 days);
    }

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

    function test_AcceptsExactBounds() public {
        _setup(owner, 60 days);
        assertTrue(_active(owner));
        _setup(owner, 730 days);
        assertTrue(_active(owner));
    }

    // ─── BR-02 and setup validation ──────────────────────────────────────────

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

    function test_RevertWhen_MoreThan10Heirs() public {
        InheritanceGuard.Beneficiary[] memory b = new InheritanceGuard.Beneficiary[](11);
        for (uint256 i; i < 11; ++i) {
            b[i] = InheritanceGuard.Beneficiary(address(uint160(0x1000 + i)), i == 10 ? 1000 : 900);
        }
        vm.prank(owner);
        vm.expectRevert(InheritanceGuard.InvalidBeneficiaryCount.selector);
        guard.setupGuard(address(usdc), 180 days, b);
    }

    function test_RevertWhen_TokenHasNoCode() public {
        InheritanceGuard.Beneficiary[] memory b = _thirds();
        vm.prank(owner);
        vm.expectRevert(InheritanceGuard.InvalidToken.selector);
        guard.setupGuard(makeAddr("eoa"), 180 days, b);
    }

    // ─── BR-03 ───────────────────────────────────────────────────────────────

    // 100 units split 3333/3333/3334 -> 33, 33, 34
    function test_DustGoesToLastBeneficiary() public {
        _fund(owner, 100);
        _setup(owner, 60 days);
        vm.warp(block.timestamp + 60 days);
        _run();
        assertEq(usdc.balanceOf(h1), 33);
        assertEq(usdc.balanceOf(h2), 33);
        assertEq(usdc.balanceOf(h3), 34);
        assertEq(usdc.balanceOf(owner), 0);
    }

    // ─── BR-04 ───────────────────────────────────────────────────────────────

    function test_PingResetsTimer() public {
        _setup(owner, 60 days);
        vm.warp(block.timestamp + 59 days);
        vm.prank(owner);
        guard.ping();
        assertEq(guard.deadlineOf(owner), block.timestamp + 60 days);
        vm.warp(block.timestamp + 59 days);
        assertFalse(guard.isExpired(owner));
        (bool needed,) = guard.checkUpkeep("");
        assertFalse(needed);
    }

    function test_DeadlineOfIsZeroWithoutActiveGuard() public {
        assertEq(guard.deadlineOf(owner), 0);
        _setup(owner, 90 days);
        assertEq(guard.deadlineOf(owner), block.timestamp + 90 days);
        vm.prank(owner);
        guard.revokeGuard();
        assertEq(guard.deadlineOf(owner), 0);
    }

    // ─── BR-05 ───────────────────────────────────────────────────────────────

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

    function test_TransferCappedByBalance() public {
        _fund(owner, 50e6); // unlimited allowance
        _setup(owner, 60 days);
        vm.warp(block.timestamp + 60 days);
        _run();
        assertEq(usdc.balanceOf(h1) + usdc.balanceOf(h2) + usdc.balanceOf(h3), 50e6);
    }

    function test_ZeroAmountIsSafeNoOp() public {
        _setup(owner, 60 days); // no balance, no allowance
        vm.warp(block.timestamp + 60 days);
        vm.expectEmit(true, true, false, true, address(guard));
        emit InheritanceGuard.InheritanceExecuted(owner, address(usdc), 0);
        _run();
        assertFalse(_active(owner));
        assertEq(guard.activeOwnersCount(), 0);
    }

    // ─── Per-heir failure isolation ──────────────────────────────────────────

    function test_BlacklistedHeirDoesNotBlockOthers() public {
        _fund(owner, 100e6);
        _setup(owner, 60 days);
        usdc.blockAddress(h1); // every transfer to h1 reverts
        vm.warp(block.timestamp + 60 days);

        vm.expectEmit(true, true, false, true, address(guard));
        emit InheritanceGuard.BeneficiaryTransferFailed(owner, h1, 33.33e6);
        vm.expectEmit(true, true, false, true, address(guard));
        emit InheritanceGuard.BeneficiaryPaid(owner, h2, 33.33e6);
        vm.expectEmit(true, true, false, true, address(guard));
        emit InheritanceGuard.BeneficiaryPaid(owner, h3, 33.34e6);
        vm.expectEmit(true, true, false, true, address(guard));
        emit InheritanceGuard.InheritanceExecuted(owner, address(usdc), 66.67e6);
        _run();

        assertEq(usdc.balanceOf(h1), 0);
        assertEq(usdc.balanceOf(h2), 33.33e6);
        assertEq(usdc.balanceOf(h3), 33.34e6, "dust still goes to the last heir");
        assertEq(usdc.balanceOf(owner), 33.33e6, "failed share stays with the owner");
        assertFalse(_active(owner));
    }

    function test_BlacklistedLastHeirKeepsDustWithOwner() public {
        _fund(owner, 100);
        _setup(owner, 60 days);
        usdc.blockAddress(h3);
        vm.warp(block.timestamp + 60 days);
        _run();
        assertEq(usdc.balanceOf(h1), 33);
        assertEq(usdc.balanceOf(h2), 33);
        assertEq(usdc.balanceOf(owner), 34);
    }

    function test_FailingOwnerDoesNotBlockOthers() public {
        address other = makeAddr("other");
        address h4 = makeAddr("h4");
        BrokenToken broken = new BrokenToken();

        vm.prank(owner);
        guard.setupGuard(address(broken), 60 days, _thirds());
        _fund(other, 100e6);
        vm.prank(other);
        guard.setupGuard(address(usdc), 60 days, _solo(h4));
        vm.warp(block.timestamp + 60 days);

        vm.expectEmit(true, false, false, true, address(guard));
        emit InheritanceGuard.InheritanceFailed(
            owner, abi.encodeWithSelector(InheritanceGuard.TokenCallFailed.selector)
        );
        _run();

        assertEq(usdc.balanceOf(h4), 100e6, "other owner still executed");
        assertEq(guard.activeOwnersCount(), 0, "broken guard does not jam the queue");
    }

    // ─── Token compatibility ─────────────────────────────────────────────────

    function test_SupportsTokensThatReturnNoBool() public {
        NoBoolToken usdt = new NoBoolToken();
        usdt.mint(owner, 100);
        vm.startPrank(owner);
        usdt.approve(address(guard), type(uint256).max);
        guard.setupGuard(address(usdt), 60 days, _thirds());
        vm.stopPrank();
        vm.warp(block.timestamp + 60 days);
        _run();
        assertEq(usdt.balanceOf(h1), 33);
        assertEq(usdt.balanceOf(h2), 33);
        assertEq(usdt.balanceOf(h3), 34);
    }

    function test_ReentrancyIsBlocked() public {
        ReentrantToken evil = new ReentrantToken();
        evil.setGuard(guard);
        evil.mint(owner, 100);
        vm.startPrank(owner);
        evil.approve(address(guard), type(uint256).max);
        guard.setupGuard(address(evil), 60 days, _thirds());
        vm.stopPrank();
        vm.warp(block.timestamp + 60 days);
        _run();
        assertTrue(evil.reentryBlocked(), "ping re-entry should hit nonReentrant");
        assertEq(evil.balanceOf(h3), 34);
        assertFalse(_active(owner));
    }

    // ─── Chainlink Automation ────────────────────────────────────────────────

    function test_RevertWhen_PerformUpkeepNotForwarder() public {
        bytes memory data = abi.encode(new address[](0));
        vm.expectRevert(InheritanceGuard.NotForwarder.selector);
        guard.performUpkeep(data);
    }

    function test_SetForwarderAddsAndRemoves() public {
        address second = makeAddr("second");
        guard.setForwarder(second, true);
        assertTrue(guard.isForwarder(second));
        assertTrue(guard.isForwarder(keeper));

        guard.setForwarder(keeper, false);
        bytes memory data = abi.encode(new address[](0));
        vm.prank(keeper);
        vm.expectRevert(InheritanceGuard.NotForwarder.selector);
        guard.performUpkeep(data);
        vm.prank(second);
        guard.performUpkeep(data);
    }

    function test_RevertWhen_SetForwarderNotOwner() public {
        vm.prank(keeper);
        vm.expectRevert();
        guard.setForwarder(keeper, true);
    }

    function test_ForgedPerformDataIsRevalidated() public {
        _fund(owner, 100e6);
        _setup(owner, 60 days);
        vm.warp(block.timestamp + 60 days - 1);

        address[] memory forged = new address[](1);
        forged[0] = owner;
        _perform(forged);
        assertEq(usdc.balanceOf(owner), 100e6);
        assertTrue(_active(owner));
    }

    function test_DuplicateOwnerInPerformDataPaysOnce() public {
        _fund(owner, 100e6);
        _setup(owner, 60 days);
        vm.warp(block.timestamp + 60 days);

        address[] memory dup = new address[](3);
        (dup[0], dup[1], dup[2]) = (owner, owner, owner);
        _perform(dup);
        assertEq(usdc.balanceOf(h1) + usdc.balanceOf(h2) + usdc.balanceOf(h3), 100e6);
    }

    function test_RevokeRemovesFromQueue() public {
        _setup(owner, 60 days);
        vm.prank(owner);
        guard.revokeGuard();
        vm.warp(block.timestamp + 61 days);
        (bool needed,) = guard.checkUpkeep("");
        assertFalse(needed);
    }

    function _setupMany(uint256 count) internal returns (address[] memory owners) {
        owners = new address[](count);
        for (uint256 i; i < count; ++i) {
            owners[i] = address(uint160(0xA000 + i));
            vm.prank(owners[i]);
            guard.setupGuard(address(usdc), 60 days, _solo(h1));
        }
    }

    function test_CheckUpkeepWindowIsBounded() public {
        _setupMany(30);
        vm.warp(block.timestamp + 60 days);

        (bool needed, bytes memory data) = guard.checkUpkeep(abi.encode(uint256(5), uint256(3)));
        assertTrue(needed);
        address[] memory due = abi.decode(data, (address[]));
        assertEq(due.length, 3);
        assertEq(due[0], address(uint160(0xA000 + 5)));

        (needed,) = guard.checkUpkeep(abi.encode(uint256(30), uint256(10)));
        assertFalse(needed, "start past the end");

        (needed, data) = guard.checkUpkeep(abi.encode(uint256(0), type(uint256).max));
        assertEq(abi.decode(data, (address[])).length, guard.MAX_EXECUTIONS_PER_UPKEEP());
    }

    function test_PerformUpkeepCapsExecutions() public {
        address[] memory owners = _setupMany(25);
        vm.warp(block.timestamp + 60 days);
        _perform(owners);
        assertEq(guard.activeOwnersCount(), 25 - guard.MAX_EXECUTIONS_PER_UPKEEP());
        _run();
        assertEq(guard.activeOwnersCount(), 0);
    }

    function test_EmptyCheckDataRotatesThroughLargeSets() public {
        uint256 total = guard.MAX_SCAN_WINDOW() + 50;
        _setupMany(total);
        vm.warp(block.timestamp + 60 days);
        // Each block scans a different slice; keep upkeeping until every guard has executed.
        for (uint256 i; i < 100 && guard.activeOwnersCount() > 0; ++i) {
            vm.roll(block.number + 1);
            (bool needed, bytes memory data) = guard.checkUpkeep("");
            if (!needed) continue;
            vm.prank(keeper);
            guard.performUpkeep(data);
        }
        assertEq(guard.activeOwnersCount(), 0);
    }

    function test_RevertWhen_GasTooLowForFirstOwner() public {
        _fund(owner, 100e6);
        _setup(owner, 60 days);
        vm.warp(block.timestamp + 60 days);
        address[] memory due = new address[](1);
        due[0] = owner;

        uint256 needed = guard.GAS_PER_OWNER() + 3 * guard.GAS_PER_HEIR();
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(InheritanceGuard.InsufficientGas.selector, needed));
        guard.performUpkeep{gas: 200_000}(abi.encode(due));
        assertTrue(_active(owner), "retried by the next upkeep");

        _perform(due);
        assertEq(usdc.balanceOf(owner), 0);
    }

    function test_LowGasStopsAfterFirstOwnerInsteadOfFailingHeirs() public {
        address other = makeAddr("other");
        address h4 = makeAddr("h4");
        _fund(owner, 100e6);
        _fund(other, 100e6);
        vm.prank(owner);
        guard.setupGuard(address(usdc), 60 days, _solo(h4));
        _setup(other, 60 days); // 3 heirs: needs more gas than is left after the first owner
        vm.warp(block.timestamp + 60 days);
        address[] memory due = new address[](2);
        (due[0], due[1]) = (owner, other);

        vm.recordLogs();
        vm.prank(keeper);
        guard.performUpkeep{gas: 300_000}(abi.encode(due));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            assertTrue(logs[i].topics[0] != InheritanceGuard.BeneficiaryTransferFailed.selector, "no heir failed");
        }
        assertEq(usdc.balanceOf(h4), 100e6, "first owner executed");
        assertTrue(_active(other), "second owner waits for the next upkeep");
        assertEq(usdc.balanceOf(other), 100e6);
    }

    // Heirs receive exactly min(balance, allowance); nothing is lost to rounding.
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
