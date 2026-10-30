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
pnpm check:staging                  # the staging contract is only imported from contracts/testnet + test
```

## Deploying

Both scripts prompt for the private key (`--interactives 1`); the broadcasting wallet becomes the
contract owner. Load `RPC_URL` into your shell first (e.g. `set -a; source .env; set +a` in Git Bash).

```bash
# Production rules (60–730 days)
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --interactives 1 --broadcast
# Staging (15 s minimum; testnets only, never mainnet)
forge script script/DeployStaging.s.sol:DeployStaging --rpc-url "$RPC_URL" --interactives 1 --broadcast
```

Then register a Chainlink upkeep (gas limit 2,000,000) and call `setForwarder(<forwarder>, true)`.
See `docs/19-STAGING.md`.

## Staging on a local fork

`pnpm dev:fork` starts Anvil forking Base Sepolia (`anvil --fork-url "$RPC_URL" --chain-id 84532`,
reading `RPC_URL` from `.env`) at `http://127.0.0.1:8545`. Real Circle testnet USDC is available on
the fork. In a second terminal:

```bash
R=http://127.0.0.1:8545
# Anvil prints 10 funded dev accounts; account 0 below is Anvil's public test key
DEV=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ME=$(cast wallet address $DEV)

# 1. Deploy staging to the fork
forge script script/DeployStaging.s.sol:DeployStaging --rpc-url $R --private-key $DEV --broadcast
G=<InheritanceGuardStaging address from the output>

# 2. Let yourself act as the Chainlink forwarder
cast send $G 'setForwarder(address,bool)' $ME true --private-key $DEV --rpc-url $R

# 3. Create a 15-second guard from the UI (NEXT_PUBLIC_PULSE_ENV=staging, NEXT_PUBLIC_GUARD_CONTRACT_ADDRESS=$G,
#    wallet on http://127.0.0.1:8545) or with cast: approve USDC, then
#    cast send $G 'setupGuard(address,uint256,(address,uint16)[])' <usdc> 15 '[(<heir>,10000)]' ...

# 4. Jump past the deadline
cast rpc evm_increaseTime 16 --rpc-url $R
cast rpc evm_mine --rpc-url $R

# 5. Run Chainlink's job by hand
DATA=$(cast call $G 'checkUpkeep(bytes)(bool,bytes)' 0x --rpc-url $R | sed -n 2p)
cast send $G 'performUpkeep(bytes)' $DATA --private-key $DEV --rpc-url $R
```

Optional fork-only cheats on Circle USDC (FiatToken v2.2 keeps balances at mapping slot 9, with the
blacklist flag in the top bit):

```bash
USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e
# give <owner> 100 USDC (100,000,000 base units)
cast rpc anvil_setStorageAt $USDC $(cast index address <owner> 9) $(cast to-uint256 100000000) --rpc-url $R
# blacklist <heir> (their transfer fails; BeneficiaryTransferFailed, share stays with the owner)
cast rpc anvil_setStorageAt $USDC $(cast index address <heir> 9) 0x8000000000000000000000000000000000000000000000000000000000000000 --rpc-url $R
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
contracts/testnet/                  InheritanceGuardStaging (15 s minimum; NEVER mainnet)
script/                             forge deploy scripts (production, staging)
test/                               Foundry tests (unit + fuzz, staging bounds)
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
| `docs/19-STAGING.md` | Staging contract, Vercel staging preview, end-to-end test checklist |

## Business rules → code

| Rule | Contract | Off-chain |
|---|---|---|
| BR-01 timeout 60–730d | `minTimeout()` / `maxTimeout()` | `useTimeoutBounds()` (fallback `lib/validation.ts`) |
| BR-02 BPS == 10,000 | `BpsSumMismatch` | `validateHeirs()` |
| BR-03 dust → last heir | `_execute` | `splitAmount()` |
| BR-04 ping resets | `ping()` | — |
| BR-05 min(balance, allowance), 0 skips | `_execute` | — |
| BR-06 one email per event | events | `NotificationLog` unique key |
