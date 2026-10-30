# Pulse — Automated Non-Custodial Crypto Inheritance Guard

> **Auth update:** Google sign-in was removed. Pulse uses Sign-In With Ethereum (SIWE) only; see `docs/18-AUTH-INTEGRATION.md`. Mentions of Google Auth below are superseded.

Pulse is a decentralized, non-custodial Dead Man's Switch built on Base. It allows crypto holders to configure an automated inheritance plan while keeping **100% self-custody** of their assets in their personal wallet. 

If the owner's wallet remains inactive beyond their configured timeout (minimum 60 days), **Chainlink Automation** automatically triggers the smart contract to pull the approved ERC-20 allowance and disburse funds directly into the beneficiaries' wallets—requiring zero manual claims, zero third-party custodians, and zero phishing exposure for heirs.

---

## Key Features

- **100% Non-Custodial:** Your funds stay in your wallet. Pulse uses standard ERC-20 `approve` spending caps rather than locking tokens in a vault.
- **Push-Model Disbursement:** Heirs receive tokens directly in their wallets upon timer expiration—no claim portals or wallet signatures required.
- **Smart Remainder & Dust Sweeping:** Uneven percentage splits (e.g., $33\% / 33\% / 33\%$) automatically allocate the leftover $1\%$ and any integer division rounding dust to the final beneficiary ($33\% / 33\% / 34\%$), ensuring zero trapped funds.
- **Hybrid Onboarding:** Combines Google Authentication with Web3 wallet binding and a clean, MetaMask-inspired minimalist UI.
- **One-Click Heartbeat:** Reset your countdown timer anytime with a single **"I'M ALIVE"** transaction.

---

## Documentation Suite (`/docs`)

| Document | Description |
| :--- | :--- |
| [`docs/01-PRD.md`](./docs/01-PRD.md) | Product Overview, Goals, Scope, Functional & Non-Functional Requirements |
| [`docs/02-UX-AND-FLOWS.md`](./docs/02-UX-AND-FLOWS.md) | Hybrid IA Scheme, Sitemap, Task Flow, Screen Inventory & System States |
| [`docs/03-ARCHITECTURE-AND-TECH-SPEC.md`](./docs/03-ARCHITECTURE-AND-TECH-SPEC.md) | System Architecture, Tech Stack, Prisma DB Schema & REST API Spec |
| [`docs/04-BLOCKCHAIN-AND-SECURITY-SPEC.md`](./docs/04-BLOCKCHAIN-AND-SECURITY-SPEC.md) | Solidity Contract (`InheritanceGuard.sol`), Chainlink Keepers & Security Invariants |

---

## Quick Start (Local Development)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-username/pulse-inheritance.git
cd pulse-inheritance
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in the values (names only are listed there; never commit real values).

### 3. Initialize Database & Run Dev Server
```bash
npx prisma migrate deploy
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## Smart Contract Testing (Foundry)
```bash
cd contracts
forge build
forge test -vvv
```