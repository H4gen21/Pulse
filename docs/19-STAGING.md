# 19 — Staging Environment

Staging runs the full Pulse flow (setup → ping → expiry → Chainlink payout → emails) in minutes
instead of months, on Base Sepolia or a local Anvil fork. Production code and production rules
are unchanged.

## How it works

| | Production | Staging |
|---|---|---|
| Contract | `contracts/InheritanceGuard.sol` | `contracts/testnet/InheritanceGuardStaging.sol` |
| `minTimeout()` | 60 days | **15 seconds** |
| `maxTimeout()` | 730 days | 730 days |
| Everything else | — | identical (inherits `InheritanceGuard`, overrides only the two bounds) |
| Deploy script | `script/Deploy.s.sol` | `script/DeployStaging.s.sol` (refuses any chain except 84532, 31337, 11155111) |
| Frontend | days slider, 60–730 | sticky **STAGING** banner; period input in seconds / minutes / days; countdown in seconds under 1 hour |

- BR-01 bounds come from `minTimeout()` / `maxTimeout()` (`public pure virtual`). The frontend reads
  them from the deployed contract (`useTimeoutBounds()` in `hooks/useGuardContract.ts`) and falls
  back to 60/730 days if the read fails, e.g. against a contract deployed before these getters existed.
- `NEXT_PUBLIC_PULSE_ENV=staging` turns on the staging UI. It is **ignored when
  `NEXT_PUBLIC_CHAIN_ID=8453`** (Base mainnet), so a misconfigured production deploy can't show
  short-timer controls.
- **The staging contract must never reach mainnet.** `pnpm check:staging` (also a CI step) fails
  if anything outside `contracts/testnet/` or `test/` imports `InheritanceGuardStaging`. The only
  exception is `script/DeployStaging.s.sol`, which has to import it to deploy it.
- `test/InheritanceGuardStaging.t.sol` proves production rejects a 15-second period and staging
  accepts it.

## Vercel "staging" preview branch

Create a `staging` git branch. In Vercel → Settings → Environment Variables, add these for the
**Preview** environment, scoped to the `staging` branch (Vercel lets a Preview variable target one
branch):

| Variable | Staging value |
|---|---|
| `NEXT_PUBLIC_PULSE_ENV` | `staging` |
| `NEXT_PUBLIC_CHAIN_ID` | `84532` |
| `NEXT_PUBLIC_GUARD_CONTRACT_ADDRESS` | the `InheritanceGuardStaging` address |
| `NEXT_PUBLIC_GUARD_DEPLOY_BLOCK` | block the staging contract was deployed in |
| `RPC_URL` | Base Sepolia RPC (server side) |
| `NEXT_PUBLIC_RPC_URL` | optional; a domain-restricted browser key |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | can be shared with production |
| `NEXTAUTH_SECRET` | **different** from production (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | leave **unset**; SIWE accepts Vercel branch hosts automatically |
| `DATABASE_URL` / `DIRECT_URL` | a **separate** Supabase project or database, so staging vaults and notification rows never mix with production |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | optional; falls back to in-memory |

`NEXT_PUBLIC_USDC_CONTRACT_ADDRESS` isn't needed: on Base Sepolia the app always uses Circle's
testnet USDC (`lib/contract.ts`). Run `pnpm db:migrate` once against the staging database.

`NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing them.

## Chainlink Automation on staging

1. Deploy: see "Deploying" in the README.
2. Register a **custom logic** upkeep at automation.chain.link (Base Sepolia) pointing at the
   staging address. Leave `checkData` empty (one rotating 200-owner window) or use
   `abi.encode(start, window)` shards.
3. **Gas limit:** at least `60,000 + 10 × 90,000 = 960,000` for a 10-heir guard; use 2,000,000.
   If the limit can't cover the first due owner, `performUpkeep` reverts with `InsufficientGas`.
   Chainlink's simulation then skips sending, so no LINK is spent and the upkeep shows the error.
4. Copy the upkeep's **forwarder** address and call `setForwarder(<forwarder>, true)` from the
   deployer wallet.

## Test checklist

Use two wallets (owner, plus at least two heirs) and Circle testnet USDC from faucet.circle.com.

- [ ] **Setup:** approve e.g. 1.00 USDC, create a vault with three heirs at 33.33 / 33.33 / 33.34 %,
      period 2 minutes. `GuardSetup` appears in the activity feed and a `GUARD_SETUP` row is
      created per heir email in `NotificationLog`.
- [ ] **Ping:** "I'm still here" restarts the countdown; `deadlineOf(owner)` moves forward; `Pinged` in the feed.
- [ ] **Countdown:** below 1 hour it switches to a single seconds counter; at 0 it shows "Deadline passed".
- [ ] **Expiry:** `isExpired(owner)` returns true; `checkUpkeep(0x)` returns `true` with the owner in `performData`.
- [ ] **Chainlink performUpkeep:** the upkeep fires within a block or two. Only the forwarder can call it
      (another wallet gets `NotForwarder`).
- [ ] **Heirs paid, dust to last:** with 1.000001 USDC approved (1,000,001 base units), heirs 1 and 2
      get 0.3333 and heir 3 gets 0.333401 (its exact share 0.3334 plus 1 unit of dust).
      `BeneficiaryPaid` × 3 and `InheritanceExecuted` with the total.
- [ ] **BR-05:** approve less than your balance → only the approved amount moves; approve 0 → the
      guard executes as a no-op (`InheritanceExecuted` with 0) and nothing reverts.
- [ ] **Blacklisted heir:** on the Anvil fork (below), blacklist heir 1. Heirs 2 and 3 are paid,
      heir 1's share stays with the owner, and `BeneficiaryTransferFailed` is emitted for heir 1.
- [ ] **Revoke + approve(0):** "Revoke" sends `revokeGuard()` then `approve(guard, 0)`; status shows
      revoked, allowance 0, `checkUpkeep` no longer lists the owner.
- [ ] **BR-06 emails:** each (event, tx, recipient) has exactly one `NotificationLog` row;
      replaying `POST /api/vault` with the same tx hash creates no duplicates. (Sending is done by the
      event notifier, which is not built yet; until then, check the rows.)
- [ ] **Production unaffected:** a production build (`NEXT_PUBLIC_PULSE_ENV` unset) shows no
      banner, the days slider, and 60–730 limits.

## Local Anvil fork

Faster than waiting for Base Sepolia blocks, and lets you blacklist heirs. See the README section
"Staging on a local fork" for the exact commands.
