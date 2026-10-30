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
    uint16 public constant TOTAL_BPS = 10_000; // BR-02
    uint16 public constant MIN_BPS_PER_HEIR = 100; // 1%
    uint256 public constant MAX_BENEFICIARIES = 10;
    uint256 public constant MAX_EXECUTIONS_PER_UPKEEP = 20; // owners executed per performUpkeep
    uint256 public constant MAX_SCAN_WINDOW = 200; // owners inspected per checkUpkeep
    /// @dev performUpkeep only starts an owner while GAS_PER_OWNER + heirs * GAS_PER_HEIR remains,
    ///      so a low gas limit can never make a healthy heir's transfer fail and forfeit their
    ///      share. Later owners wait for the next upkeep; if not even the first fits, it reverts
    ///      with InsufficientGas so the problem is visible (and gas estimation finds the limit).
    uint256 public constant GAS_PER_OWNER = 60_000;
    uint256 public constant GAS_PER_HEIR = 90_000;

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

    /// @notice Chainlink Automation forwarders allowed to call performUpkeep (one per upkeep).
    mapping(address => bool) public isForwarder;

    // ─── Events ──────────────────────────────────────────────────────────────
    event GuardSetup(address indexed owner, address indexed token, uint256 timeoutDuration, uint256 beneficiaryCount);
    event Pinged(address indexed owner, uint256 nextDeadline);
    event GuardRevoked(address indexed owner);
    event BeneficiaryPaid(address indexed owner, address indexed wallet, uint256 amount);
    /// @notice The transfer to `wallet` failed (e.g. USDC-blacklisted); `amount` stays with the owner.
    event BeneficiaryTransferFailed(address indexed owner, address indexed wallet, uint256 amount);
    /// @param totalAmount sum actually paid to heirs (excludes failed transfers)
    event InheritanceExecuted(address indexed owner, address indexed token, uint256 totalAmount);
    /// @notice The token's balanceOf/allowance could not be read. The guard is deactivated and
    ///         nothing moves. `reason` is never empty.
    event InheritanceFailed(address indexed owner, bytes reason);
    event ForwarderUpdated(address indexed forwarder, bool allowed);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error InvalidToken();
    error InvalidTimeout();
    error InvalidBeneficiaryCount();
    error InvalidBeneficiary(uint256 index);
    error DuplicateBeneficiary(uint256 index);
    error BpsSumMismatch(uint256 total);
    error GuardNotActive();
    error NotForwarder();
    error TokenCallFailed();
    error InsufficientGas(uint256 needed);

    constructor() Ownable(msg.sender) {}

    // ─── Timeout bounds (BR-01) ──────────────────────────────────────────────

    /// @notice Shortest allowed inactivity period. Production: 60 days.
    function minTimeout() public pure virtual returns (uint256) {
        return 60 days;
    }

    /// @notice Longest allowed inactivity period. Production: 730 days.
    function maxTimeout() public pure virtual returns (uint256) {
        return 730 days;
    }

    // ─── Owner actions ───────────────────────────────────────────────────────

    /// @notice Create or replace the caller's guard. Caller must separately `approve` this contract.
    function setupGuard(address token, uint256 timeoutDuration, Beneficiary[] calldata input) external nonReentrant {
        if (token.code.length == 0) revert InvalidToken();
        if (timeoutDuration < minTimeout() || timeoutDuration > maxTimeout()) revert InvalidTimeout();
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

    /// @param checkData abi.encode(uint256 start, uint256 window) to scan a fixed shard (window is
    ///        capped at MAX_SCAN_WINDOW), or empty to scan one MAX_SCAN_WINDOW slice that rotates
    ///        with block.number, so a single upkeep still reaches every owner over time.
    function checkUpkeep(bytes calldata checkData)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint256 len = activeOwners.length;
        uint256 start;
        uint256 window = MAX_SCAN_WINDOW;
        if (checkData.length > 0) {
            (start, window) = abi.decode(checkData, (uint256, uint256));
            if (window > MAX_SCAN_WINDOW) window = MAX_SCAN_WINDOW;
        } else if (len > window) {
            start = (block.number * window) % len;
        }
        if (start >= len) return (false, "");
        uint256 end = len - start > window ? start + window : len;

        address[] memory due = new address[](MAX_EXECUTIONS_PER_UPKEEP);
        uint256 found;
        for (uint256 i = start; i < end && found < MAX_EXECUTIONS_PER_UPKEEP; ++i) {
            address o = activeOwners[i];
            if (isExpired(o)) due[found++] = o;
        }
        if (found == 0) return (false, "");

        assembly {
            mstore(due, found)
        }
        return (true, abi.encode(due));
    }

    /// @dev performData is untrusted: every owner is re-validated on-chain, duplicates are
    ///      skipped (the first execution deactivates the guard), and one owner's or heir's
    ///      failure cannot block anyone else.
    function performUpkeep(bytes calldata performData) external override nonReentrant {
        if (!isForwarder[msg.sender]) revert NotForwarder();
        address[] memory due = abi.decode(performData, (address[]));
        uint256 n = due.length < MAX_EXECUTIONS_PER_UPKEEP ? due.length : MAX_EXECUTIONS_PER_UPKEEP;
        uint256 executed;
        for (uint256 i; i < n; ++i) {
            address o = due[i];
            if (!isExpired(o)) continue; // BR-05
            uint256 needed = GAS_PER_OWNER + beneficiaries[o].length * GAS_PER_HEIR;
            if (gasleft() < needed) {
                if (executed == 0) revert InsufficientGas(needed);
                break;
            }
            _execute(o);
            ++executed;
        }
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setForwarder(address f, bool allowed) external onlyOwner {
        isForwarder[f] = allowed;
        emit ForwarderUpdated(f, allowed);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    /// @notice lastPingTimestamp + timeoutDuration, or 0 when the owner has no active guard.
    function deadlineOf(address o) public view returns (uint256) {
        GuardConfig storage g = guards[o];
        return g.isActive ? g.lastPingTimestamp + g.timeoutDuration : 0;
    }

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

    function _execute(address o) internal {
        GuardConfig memory g = guards[o];
        Beneficiary[] memory bens = beneficiaries[o];
        _deactivate(o); // effects before interactions

        IERC20 token = IERC20(g.token);
        (bool okB, uint256 balance) = _readUint(g.token, abi.encodeCall(IERC20.balanceOf, (o)));
        (bool okA, uint256 allowance) = _readUint(g.token, abi.encodeCall(IERC20.allowance, (o, address(this))));
        if (!okB || !okA) {
            emit InheritanceFailed(o, abi.encodeWithSelector(TokenCallFailed.selector));
            return;
        }
        uint256 amount = balance < allowance ? balance : allowance; // BR-05: zero is a no-op

        uint256 paid;
        if (amount > 0) {
            uint256 distributed;
            uint256 last = bens.length - 1;
            for (uint256 i; i <= last; ++i) {
                // BR-03: integer shares; the last heir receives the dust.
                uint256 share = i == last ? amount - distributed : (amount * bens[i].bps) / TOTAL_BPS;
                distributed += share;
                if (share == 0) continue;
                if (token.trySafeTransferFrom(o, bens[i].wallet, share)) {
                    paid += share;
                    emit BeneficiaryPaid(o, bens[i].wallet, share);
                } else {
                    emit BeneficiaryTransferFailed(o, bens[i].wallet, share);
                }
            }
        }

        emit InheritanceExecuted(o, g.token, paid);
    }

    /// @dev Static call returning a uint256; false on revert, missing code or short return data.
    function _readUint(address target, bytes memory data) internal view returns (bool ok, uint256 value) {
        bytes memory ret;
        (ok, ret) = target.staticcall(data);
        if (!ok || ret.length < 32) return (false, 0);
        value = abi.decode(ret, (uint256));
    }

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
