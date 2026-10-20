# System Architecture & Technical Specification

## 1. Tech Stack

- **Frontend Framework:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, Lucide Icons
- **Authentication:** NextAuth.js / Auth.js (Google OAuth 2.0) linked to Web3 Wallet Address
- **Web3 Client Integration:** Wagmi v2, Viem, TanStack Query
- **Database & ORM:** PostgreSQL (Neon / Supabase) + Prisma ORM (strictly for Google Auth session & wallet profile binding; all timer/inheritance truth lives on-chain)
- **Blockchain Network:** Base Sepolia (Testnet) / Base Mainnet
- **Smart Contract Toolchain:** Solidity `^0.8.24`, Foundry, OpenZeppelin Contracts v5
- **Decentralized Automation:** Chainlink Automation (Keepers `AutomationCompatibleInterface`)
- **Deployment:** Vercel (Frontend & Serverless API)

---

## 2. System Architecture Flow

1. **Client Layer (Next.js App):**
   - Minimalist Light UI (Tailwind CSS)
   - Google Auth Session (NextAuth) + Web3 Wallet Hook (Wagmi / Viem)
2. **Off-Chain Backend (Vercel Serverless):**
   - `/api/auth`: Handles Google OAuth 2.0 session lifecycle.
   - `/api/profile`: Binds authenticated Google account to user's `0x` wallet in PostgreSQL via Prisma.
3. **On-Chain Layer (Base L2):**
   - `InheritanceGuard.sol`: Stores guard configurations, beneficiary BPS arrays, and ping timestamps.
   - `USDC Token Contract (ERC-20)`: Holds user funds in self-custody and tracks `allowance(owner, guardContract)`.
4. **Decentralized Automation Layer (Chainlink Keepers):**
   - Polls `checkUpkeep()` on every block.
   - Invokes `performUpkeep()` when `block.timestamp >= lastPingTimestamp + timeoutDuration`, pushing tokens directly from the owner's wallet to the beneficiaries.

---

## 3. Database Schema (`prisma/schema.prisma`)

Because Pulse is strictly non-custodial and does not rely on off-chain email notifications, the database is lightweight and used only to bind the user's Google account to their primary Web3 wallet and cache metadata.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String      @id @default(cuid())
  email         String      @unique
  name          String?
  image         String?
  walletAddress String?     @unique
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  guardCache    GuardCache?
}

model GuardCache {
  id             String   @id @default(cuid())
  userId         String   @unique
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  ownerAddress   String   @unique
  tokenAddress   String
  spendingCap    String
  timeoutSeconds Int
  status         String   // ACTIVE, REVOKED, EXECUTED
  lastSyncedAt   DateTime @default(now())
}
```

---

## 4. API Specification

### 4.1 `POST /api/profile/bind-wallet`
Binds the authenticated Google user session to a connected Web3 wallet address.
- **Auth Required:** Yes (Google Session)
- **Request Payload:** `{ "walletAddress": "0x71C...4F9b" }`
- **Response (`200 OK`):** `{ "success": true, "user": { "email": "user@gmail.com", "walletAddress": "0x71C...4F9b" } }`

### 4.2 `GET /api/guard/[ownerAddress]`
Helper endpoint for the Public Verifier (`/verify`) that reads on-chain guard status via server-side Viem public client.
- **Auth Required:** No (Public Read-Only)
- **Response (`200 OK`):** `{ "isActive": true, "owner": "0x71C...4F9b", "lastPingTimestamp": 1760950000, "timeoutDuration": 5184000, "expiresAt": 1766134000, "remainingSeconds": 5180400 }`