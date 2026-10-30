# Pulse: Automated Non-Custodial Web3 Inheritance Guard

A zero-custody dead man's switch on Base. Funds stay in the owner's wallet. `InheritanceGuard.sol` holds only a capped ERC-20 allowance, and Chainlink Automation distributes it to heirs after a configurable period of inactivity (60–730 days).

## Quick start

```bash
pnpm install
cp .env.example .env.local          # fill in values
pnpm db:migrate                     # apply prisma/migrations
pnpm dev                            # http://localhost:3000
```

Contracts:
```bash
git clone --depth 1 https://github.com/foundry-rs/forge-std lib-sol/forge-std   # once
pnpm test:contracts
```

## Layout

```
app/
  api/auth/[...nextauth]/route.ts   NextAuth (SIWE) handler
  api/vault/route.ts                GET (public) / POST (SIWE) vault API
  vault/page.tsx                    Owner dashboard (ping / revoke)
  vault/create/page.tsx             Setup wizard (approve → setupGuard → POST /api/vault)
  verify/page.tsx                   Public verifier
contracts/InheritanceGuard.sol      Solidity 0.8.24, OZ v5, Chainlink Automation
test/InheritanceGuard.t.sol         Foundry tests (unit + fuzz)
tests/                              Vitest unit tests
lib/
  auth.ts  session.ts               SIWE auth + requireWallet() helper
  validation.ts                     Business-rule constants & zod schemas (shared UI/API)
  contract.ts  chain.ts  wagmi.ts   ABI, viem public client, wagmi config
middleware.ts                       Server-side gate for /vault/*
prisma/schema.prisma                Owner, Vault, Beneficiary, NotificationLog
docs/                               SDLC docs (see below)
```

## Docs

| Doc | |
|---|---|
| `docs/14-API-SPEC.md` | Request/response schemas for `/api/vault` |
| `docs/15-TESTING-STRATEGY.md` | Foundry / Vitest / Playwright plan and BR coverage map |
| `docs/16-CICD-AND-DEPLOYMENT.md` | GitHub Actions pipeline + Vercel root-directory fix |
| `docs/17-SECURITY-AUDIT-CHECKLIST.md` | Web3 + Web2 pre-mainnet checklist |
| `docs/18-AUTH-INTEGRATION.md` | SIWE auth design for the solo MVP |

## Business rules → code

| Rule | Contract | Off-chain |
|---|---|---|
| BR-01 timeout 60–730d | `MIN_TIMEOUT` / `MAX_TIMEOUT` | `lib/validation.ts` |
| BR-02 BPS == 10,000 | `BpsSumMismatch` | `validateHeirs()` |
| BR-03 dust → last heir | `executeFor` | `splitAmount()` |
| BR-04 ping resets | `ping()` | — |
| BR-05 min(balance, allowance), 0 skips | `executeFor` | — |
| BR-06 one email per event | events | `NotificationLog` unique key |
