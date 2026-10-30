# PRD: Pulse (Automated Non-Custodial Crypto Inheritance)

> **Auth update:** Google sign-in was removed. Pulse uses Sign-In With Ethereum (SIWE) only; see `docs/18-AUTH-INTEGRATION.md`. Mentions of Google Auth below are superseded.

## 1. Product Overview
A non-custodial crypto inheritance program that allows a user to set an inactivity timer on their wallet. If the wallet remains inactive for a user-defined (x) amount of time (minimum 2 months / 60 days), the designated crypto assets are automatically distributed based on the percentage allocations set by the user (minimum 1% per beneficiary). If the user divides percentages unevenly (e.g., 3 beneficiaries at 33% each, totaling 99%), the system automatically assigns the remaining percentage (the leftover 1%) and any fractional rounding dust to the **last beneficiary** in the list so the total always equals 100%. Once the timer runs out, the crypto is transferred directly from the owner's wallet straight into the beneficiaries' wallets without manual claiming.

## 2. Goals
- Make crypto inheritance simple, fast, and accessible without unnecessary bureaucracy or third-party intermediaries.
- Maintain 100% self-custody while the owner is active (funds never sit in a third-party custodial vault).
- Eliminate mathematical friction and trapped funds by automatically routing leftover percentages and token dust to the final beneficiary.
- Eliminate phishing and claim-scam risks for beneficiaries through automated push-model disbursement.

## 3. Scope

### In-Scope:
- **Google Auth & Wallet Connection:** Seamless onboarding combining Google Authentication with Web3 wallet binding.
- **Setup Guard:** Configuring the inactivity timer, token spending cap (ERC-20 allowance), and beneficiary wallet addresses.
- **Chainlink Integration in Smart Contracts (Timer):** Automated monitoring (`checkUpkeep`) and execution (`performUpkeep`) when the inactivity timer expires.
- **Fractional Division & Remainder Sweeping:** Splitting assets by percentage/Basis Points (BPS) and automatically assigning any unallocated remainder (e.g., the remaining 1% in a 33% x 3 split) plus integer division dust to the last beneficiary.
- **Fund Disbursement:** Direct, automated on-chain transfer (`safeTransferFrom`) from the owner's wallet to the beneficiaries' wallets.
- **Gas Fees:** On-chain gas estimation and handling for approval, setup, heartbeat pings, and automated execution.

### Out-of-Scope:
- **Making a Custodial Vault:** Locking or pooling user funds inside a centralized or custodial smart contract.
- **Notification for Beneficiary:** Off-chain email or SMS alerts to beneficiaries.
- **Diverse Token Selection:** Supporting exotic tokens, NFTs, or multi-chain assets (MVP focuses on a single primary ERC-20 token such as USDC).
- **Auto-Conversion of Tokens:** Built-in DEX swaps or fiat off-ramping during inheritance execution.

## 4. User Roles
- **Asset Owner (Primary User):** Authenticates via Google Auth, connects wallet, configures the inheritance guard, sets the timer and beneficiary percentages, approves token allowances, and performs periodic "I'm Alive" pings.
- **Beneficiary (Passive / Off-Stage Recipient):** Receives the transferred crypto directly into their wallet once the timer expires, requiring zero interaction with the application.
- **Chainlink Keeper (System Actor):** Decentralized automation node that monitors the timer on-chain and triggers the fund disbursement upon expiration.

## 5. Success Criteria
- Crypto is 100% accurately transferred directly to the designated beneficiary wallets once the inactivity timer expires, with the last beneficiary receiving any unallocated remainder percentage (e.g., 33% + 33% + 34%) so zero funds are left behind.
- Asset owners can reset their inactivity timer at any time with a single action ("I'm Alive" ping) before expiration.

## 6. Functional Requirements (FR)

- **FR-01: Authentication & Wallet Binding**
  - The system must allow users to sign in via Google Auth and bind/connect their Web3 wallet (e.g., MetaMask) on the target network.
- **FR-02: Guard Configuration (`setupGuard`)**
  - The system must allow the user to set an inactivity timer with a strict minimum validation of **60 days (2 months)**.
  - The system must allow the user to input one or more beneficiary wallet addresses (`0x...`) and assign each a share percentage (minimum 1% / 100 BPS per beneficiary).
- **FR-03: Automatic Remainder Allocation to Last Beneficiary**
  - If the sum of user-entered percentages is less than 100% (e.g., 3 beneficiaries assigned 33% each = 99%), the system must automatically allocate the remaining percentage (1% / 100 BPS) to the **last beneficiary** in the array (resulting in 33%, 33%, and 34%) and display this adjustment clearly on the UI review state.
  - During smart contract execution, the contract must calculate shares for the first $N - 1$ beneficiaries and transfer the exact remaining transferable balance (`totalAmount - distributedSoFar`) to the last beneficiary (`beneficiaries[length - 1]`).
- **FR-04: Non-Custodial Token Approval**
  - The system must prompt the user to sign an ERC-20 `approve()` transaction setting the maximum spending cap the smart contract is allowed to transfer upon expiration.
- **FR-05: Heartbeat Ping (`ping`)**
  - The system must provide an "I'm Alive" action that updates the `lastPingTimestamp` on-chain to the current `block.timestamp`, resetting the countdown timer back to its full duration.
- **FR-06: Guard Revocation (`revokeGuard`)**
  - The system must allow the user to deactivate their active guard and revoke the smart contract's token allowance back to `0` at any time before expiration.
- **FR-07: Automated Timer Verification & Execution (`checkUpkeep` & `performUpkeep`)**
  - Chainlink Automation must periodically verify whether `block.timestamp >= lastPingTimestamp + timeoutDuration`.
  - When true, the smart contract must calculate `transferableAmount = min(walletBalance, approvedAllowance)` and execute `safeTransferFrom` directly from the owner's wallet to each beneficiary.
- **FR-08: Dynamic Lowest-Fee Network Selection**

When the inactivity timer expires, the automation layer must query current network gas prices across supported destination rails.

The smart contract execution logic must leverage cross-chain messaging or native multi-chain token pools (such as Chainlink CCIP) to direct the token transfer to the beneficiary's address on the network offering the minimum transaction overhead, saving the payout from high congestion gas spikes.

## 7. Non-Functional Requirements (NFR)

- **NFR-01: Security & Non-Custodial Integrity**
  - The smart contract must never hold user funds during the active countdown period.
  - All state-changing contract functions must enforce strict access control (`onlyOwner` for setup, ping, and revoke) and utilize OpenZeppelin's `ReentrancyGuard` and `SafeERC20`.
- **NFR-02: Mathematical Precision (Last-Beneficiary Remainder Sweep)**
  - By calculating exact shares for the first $N - 1$ beneficiaries and sending `totalAmount - sumOfPreviousShares` to the final beneficiary, the smart contract guarantees 100% distribution of the eligible balance with zero trapped wei/dust and fewer division operations.
- **NFR-03: Reliability & Decentralized Uptime**
  - Timer tracking and disbursement execution must rely entirely on on-chain timestamps and Chainlink Automation nodes, ensuring 99.9%+ execution reliability even if the web frontend is offline.
- **NFR-04: Usability & Minimalist UX**
  - The interface must follow a clean, distraction-free layout (MetaMask-style simplicity), automatically resolving uneven splits (like 33/33/33 -> 33/33/34) without blocking the user with frustrating math errors.
- **NFR-05: Gas Efficiency**
  - Smart contract storage variables and loops must be optimized (capping maximum beneficiaries per guard) so that automated execution never exceeds block gas limits.