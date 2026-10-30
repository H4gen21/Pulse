// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AutomationCompatibleInterface} from
    "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

/// @title Pulse InheritanceGuard
/// @notice Non-custodial dead man's switch. Funds stay in the owner's wallet; the contract
///         only holds a scoped ERC-20 allowance and pulls it to heirs after inactivity.
contract InheritanceGuard is AutomationCompatibleInterface, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─── Constants (Business Rules) ──────────────────────────────────────────
    uint256 public constant MIN_TIMEOUT = 60 days; // BR-01
    uint256 public constant MAX_TIMEOUT = 730 days; // BR-01
    uint16 public constant TOTAL_BPS = 10_000; // BR-02
    uint16 public constant MIN_BPS_PER_HEIR = 100; // 1%
    uint256 public constant MAX_BENEFICIARIES = 10;
    uint256 public constant MAX_BATCH = 20; // max owners executed per performUpkeep

    // ─── Types ───────────────────────────────────────────────────────────────
    struct Beneficiary {
        address wallet;
        uint16 bps;
    }

    struct GuardConfig {
        address token;
        uint256 timeoutDuration;
        uint256 lastPingTimestamp;
        bool isActive;
    }

    // ─── State ───────────────────────────────────────────────────────────────
    mapping(address => GuardConfig) public guards;
    mapping(address => Beneficiary[]) internal beneficiaries;
    address[] public activeOwners;
    mapping(address => uint256) internal activeIndex; // 1-based; 0 = not in activeOwners

    /// @notice Chainlink Automation forwarder; the only address allowed to call performUpkeep.
    address public forwarder;

    // ─── Events ──────────────────────────────────────────────────────────────
    event GuardSetup(address indexed owner, address indexed token, uint256 timeoutDuration, uint256 beneficiaryCount);
    event Pinged(address indexed owner, uint256 nextDeadline);
    event GuardRevoked(address indexed owner);
    event BeneficiaryPaid(address indexed owner, address indexed wallet, uint256 amount);
    event InheritanceExecuted(address indexed owner, address indexed token, uint256 totalAmount);
    event InheritanceFailed(address indexed owner, bytes reason);
    event ForwarderUpdated(address indexed forwarder);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error InvalidToken();
    error InvalidTimeout();
    error InvalidBeneficiaryCount();
    error InvalidBeneficiary(uint256 index);
    error DuplicateBeneficiary(uint256 index);
    error BpsSumMismatch(uint256 total);
    error GuardNotActive();
    error NotForwarder();
    error OnlySelf();

    constructor() Ownable(msg.sender) {}

    // ─── Owner actions ───────────────────────────────────────────────────────

    /// @notice Create or replace the caller's guard. Caller must separately `approve` this contract.
    function setupGuard(address token, uint256 timeoutDuration, Beneficiary[] calldata input) external nonReentrant {
        if (token == address(0)) revert InvalidToken();
        if (timeoutDuration < MIN_TIMEOUT || timeoutDuration > MAX_TIMEOUT) revert InvalidTimeout();
        uint256 n = input.length;
        if (n == 0 || n > MAX_BENEFICIARIES) revert InvalidBeneficiaryCount();

        uint256 total;
        for (uint256 i; i < n; ++i) {
            Beneficiary calldata b = input[i];
            if (b.wallet == address(0) || b.wallet == msg.sender || b.bps < MIN_BPS_PER_HEIR) {
                revert InvalidBeneficiary(i);
            }
            for (uint256 j; j < i; ++j) {
                if (input[j].wallet == b.wallet) revert DuplicateBeneficiary(i);
            }
            total += b.bps;
        }
        if (total != TOTAL_BPS) revert BpsSumMismatch(total); // BR-02

        delete beneficiaries[msg.sender];
        for (uint256 i; i < n; ++i) {
            beneficiaries[msg.sender].push(input[i]);
        }

        guards[msg.sender] = GuardConfig({
            token: token,
            timeoutDuration: timeoutDuration,
            lastPingTimestamp: block.timestamp,
            isActive: true
        });
        _addActive(msg.sender);

        emit GuardSetup(msg.sender, token, timeoutDuration, n);
    }

    /// @notice Proof of life. BR-04: next deadline = block.timestamp + timeoutDuration.
    function ping() external nonReentrant {
        GuardConfig storage g = guards[msg.sender];
        if (!g.isActive) revert GuardNotActive();
        g.lastPingTimestamp = block.timestamp;
        emit Pinged(msg.sender, block.timestamp + g.timeoutDuration);
    }

    /// @notice Cancel the guard. Owners should also reset their allowance to 0 (done by the UI).
    function revokeGuard() external nonReentrant {
        if (!guards[msg.sender].isActive) revert GuardNotActive();
        _deactivate(msg.sender);
        emit GuardRevoked(msg.sender);
    }

    // ─── Chainlink Automation ────────────────────────────────────────────────

    /// @param checkData empty to scan all owners, or abi.encode(uint256 start, uint256 count)
    ///        so several upkeeps can shard a large owner set.
    function checkUpkeep(bytes calldata checkData)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint256 len = activeOwners.length;
        uint256 start;
        uint256 end = len;
        if (checkData.length > 0) {
            (uint256 s, uint256 c) = abi.decode(checkData, (uint256, uint256));
            start = s;
            end = s + c < len ? s + c : len;
        }

        address[] memory due = new address[](MAX_BATCH);
        uint256 found;
        for (uint256 i = start; i < end && found < MAX_BATCH; ++i) {
            address o = activeOwners[i];
            if (isExpired(o)) due[found++] = o;
        }
        if (found == 0) return (false, "");

        assembly {
            mstore(due, found)
        }
        return (true, abi.encode(due));
    }

    /// @dev performData is untrusted: every owner is re-validated. One owner's failing
    ///      transfer cannot block the rest of the batch.
    function performUpkeep(bytes calldata performData) external override nonReentrant {
        if (msg.sender != forwarder) revert NotForwarder();
        address[] memory due = abi.decode(performData, (address[]));
        uint256 n = due.length < MAX_BATCH ? due.length : MAX_BATCH;
        for (uint256 i; i < n; ++i) {
            address o = due[i];
            if (!isExpired(o)) continue; // BR-05
            try this.executeFor(o) {}
            catch (bytes memory reason) {
                // Empty reason may mean out-of-gas: keep the guard active so it is retried.
                // A real revert (e.g. blacklisted heir) deactivates it; funds stay with the owner.
                if (reason.length > 0) _deactivate(o);
                emit InheritanceFailed(o, reason);
            }
        }
    }

    /// @dev External only so performUpkeep can isolate failures with try/catch.
    function executeFor(address o) external {
        if (msg.sender != address(this)) revert OnlySelf();

        GuardConfig memory g = guards[o];
        Beneficiary[] memory bens = beneficiaries[o];
        _deactivate(o); // effects before interactions

        IERC20 token = IERC20(g.token);
        uint256 balance = token.balanceOf(o);
        uint256 allowance = token.allowance(o, address(this));
        uint256 amount = balance < allowance ? balance : allowance; // BR-05

        if (amount > 0) {
            uint256 distributed;
            uint256 last = bens.length - 1;
            for (uint256 i; i < last; ++i) {
                uint256 share = (amount * bens[i].bps) / TOTAL_BPS;
                distributed += share;
                if (share > 0) token.safeTransferFrom(o, bens[i].wallet, share);
                emit BeneficiaryPaid(o, bens[i].wallet, share);
            }
            uint256 lastShare = amount - distributed; // BR-03: dust goes to the last heir
            if (lastShare > 0) token.safeTransferFrom(o, bens[last].wallet, lastShare);
            emit BeneficiaryPaid(o, bens[last].wallet, lastShare);
        }

        emit InheritanceExecuted(o, g.token, amount);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setForwarder(address f) external onlyOwner {
        forwarder = f;
        emit ForwarderUpdated(f);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function isExpired(address o) public view returns (bool) {
        GuardConfig storage g = guards[o];
        return g.isActive && block.timestamp >= g.lastPingTimestamp + g.timeoutDuration;
    }

    function getBeneficiaries(address o) external view returns (Beneficiary[] memory) {
        return beneficiaries[o];
    }

    function activeOwnersCount() external view returns (uint256) {
        return activeOwners.length;
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _addActive(address o) internal {
        if (activeIndex[o] != 0) return;
        activeOwners.push(o);
        activeIndex[o] = activeOwners.length;
    }

    function _deactivate(address o) internal {
        guards[o].isActive = false;
        uint256 idx = activeIndex[o];
        if (idx == 0) return;
        uint256 lastIdx = activeOwners.length;
        if (idx != lastIdx) {
            address moved = activeOwners[lastIdx - 1];
            activeOwners[idx - 1] = moved;
            activeIndex[moved] = idx;
        }
        activeOwners.pop();
        activeIndex[o] = 0;
    }
}
