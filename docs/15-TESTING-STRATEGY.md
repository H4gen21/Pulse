# 15 — Testing Strategy

| Layer | Tool | Location | Command | Gate |
|---|---|---|---|---|
| Smart contract unit + fuzz | **Foundry** (forge) | `test/*.t.sol` | `pnpm test:contracts` | CI, required |
| Contract invariants | Foundry invariant tests | `test/invariant/` (todo) | `forge test --mt invariant` | CI, pre-mainnet |
| Static analysis | Slither, Aderyn | — | `slither .` | pre-audit |
| Shared TS logic | **Vitest** | `tests/*.test.ts` | `pnpm test` | CI, required |
| API routes | Vitest + mocked Prisma/viem | `tests/api/` (todo) | `pnpm test` | CI, required |
| E2E | **Playwright** + Anvil fork + test wallet | `e2e/` (todo) | `pnpm e2e` | CI on main |
| Manual | Base Sepolia + real Chainlink upkeep | — | checklist below | before every release |

**Why Foundry instead of Hardhat:** tests are written in Solidity, fuzzing is built in, `vm.warp` makes the 60–730 day timelines trivial, and it's much faster. Hardhat only matters if you need its plugin ecosystem; nothing here does.

## 1. Smart contract (done: 14 tests, all passing)

`test/InheritanceGuard.t.sol` covers each business rule:

| Rule | Test |
|---|---|
| BR-01 | `test_RevertWhen_TimeoutBelow60Days`, `test_RevertWhen_TimeoutAbove730Days`, `test_AcceptsExactly60Days` |
| BR-02 | `test_RevertWhen_BpsNot10000`, `test_RevertWhen_DuplicateOrSelfHeir` |
| BR-03 | `test_DustGoesToLastBeneficiary` (100 → 33/33/34), `testFuzz_ConservesAmount` (512 runs: heirs receive exactly `min(balance, allowance)`) |
| BR-04 | `test_PingResetsTimer` |
| BR-05 | `test_TransferCappedByAllowance`, `test_ZeroAmountSkipsWithoutRevert`, `test_ForgedPerformDataIsRevalidated` |
| RBAC | `test_RevertWhen_PerformUpkeepNotForwarder` |
| Liveness | `test_RevokeRemovesFromQueue`, `test_FailingOwnerDoesNotBlockOthers` (a blacklisted heir doesn't block other owners) |

**Add before mainnet:**
- **Invariant suite** (handler-based): `activeOwners.length == count(isActive)`; `activeIndex` stays consistent after any sequence of setup/revoke/execute; the contract's token balance is always 0 (it never custodies funds).
- **Fork test** against real Base USDC (`forge test --fork-url $BASE_RPC`), because USDC has a blacklist and is upgradeable.
- **Gas test**: `checkUpkeep` with 5,000 active owners stays under the Chainlink check gas limit; otherwise shard with `checkData = abi.encode(start, count)`.
- Coverage target: 100% lines and branches on `InheritanceGuard.sol` (`forge coverage`).

## 2. Frontend & API

**Unit (Vitest, done: 10 tests):** `lib/validation.ts` (dust split matches the contract, BPS/heir rules, request schema normalisation). Keep all business-rule math in `lib/validation.ts` so the UI, the API and the tests share a single implementation.

**API route tests (todo):** call the exported `GET`/`POST` handlers directly with a `Request`; mock `@/lib/prisma`, `@/lib/chain` (`publicClient`) and `getServerSession`. Cases:
- POST without a session → 401
- POST with someone else's `setupGuard` tx → 422
- POST with a reverted tx → 422
- POST with a heir list that differs from the chain → 422
- POST twice with the same tx → still exactly one `NotificationLog` per email (BR-06)
- GET from a non-owner → no `email` fields
- Rate limiter → 429

**E2E (Playwright, todo):**
1. `anvil --fork-url $BASE_SEPOLIA_RPC`, then deploy the contract with `forge script`.
2. Inject a deterministic test wallet. Use a mock EIP-1193 provider (e.g. `@johanneskares/wallet-mock` or a custom `window.ethereum` backed by a viem local account) so there are no MetaMask popups.
3. Flows: connect + SIWE → setup (approve + setupGuard) → dashboard countdown → ping → `anvil_increaseTime` past the timeout → call `performUpkeep` as the forwarder → `/verify` shows `EXECUTED`.
4. Run against `next build && next start`, with Postgres in a CI service container.

## 3. Manual release checklist (Base Sepolia)

- [ ] Deploy, verify on Basescan, `setForwarder(<upkeep forwarder>)`
- [ ] Register a custom-logic upkeep and fund it with LINK
- [ ] Setup with a 60-day timeout. To test execution quickly, deploy a test build with `MIN_TIMEOUT = 5 minutes` (**never** to mainnet)
- [ ] Ping, revoke (allowance reset to 0), re-setup
- [ ] Execution with the balance below the allowance and with the allowance below the balance
- [ ] Exactly one setup email and one execution email per heir
