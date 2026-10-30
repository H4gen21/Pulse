# 17 — Pre-Mainnet Security Audit Checklist

Legend: ✅ handled in code · ⚠️ partially handled / needs follow-up · ☐ todo

## A. Smart contract (`contracts/InheritanceGuard.sol`)

| # | Risk | Status | Notes |
|---|---|---|---|
| A1 | **Reentrancy** via token callbacks (ERC-777-style hooks, malicious tokens) | ✅ | `nonReentrant` on every state-changing entry point; `executeFor` deactivates the guard **before** any transfer (CEI). |
| A2 | **Untrusted `performData`** (fake owners, early execution) | ✅ | Every owner is re-checked with `isExpired()` inside `performUpkeep`; `performUpkeep` is restricted to the Chainlink **forwarder**. |
| A3 | **Batch DoS**: one reverting transfer (blacklisted USDC heir, paused token) blocks every owner | ✅ | Per-owner `try this.executeFor(o)`; a failure emits `InheritanceFailed`. |
| A4 | **Gas griefing**: force `executeFor` out of gas to deactivate a guard | ✅ | Only the forwarder can call; an empty revert reason (a possible OOG) leaves the guard active so it's retried. |
| A5 | **Unbounded loops** in `checkUpkeep` with many owners | ⚠️ | Batched (`MAX_BATCH = 20`) and shardable through `checkData`. Load-test with N owners and register multiple upkeeps if needed. |
| A6 | **Allowance race condition** (classic `approve` front-run) | ✅ / ⚠️ | Not exploitable here: the spender is the immutable contract, not an EOA. The UI resets the allowance to 0 on revoke. For USDT-style tokens that require `approve(0)` first, add that step in the UI. |
| A7 | **Unlimited approvals** | ⚠️ | The UI asks for an explicit cap (default 1,000 USDC). Never default to `maxUint256`; tell users the cap is the maximum that can ever move. |
| A8 | Execution amount > what the owner holds | ✅ | `min(balanceOf, allowance)`, and 0 skips without a revert (BR-05). |
| A9 | Rounding loss | ✅ | Dust goes to the last heir; the fuzz test proves conservation (BR-03). |
| A10 | Invalid heir configuration | ✅ | Sum == 10,000, ≥ 100 BPS each, ≤ 10 heirs, no zero address, no self, no duplicates. |
| A11 | **Fee-on-transfer / rebasing / upgradeable tokens** | ⚠️ | Heirs would receive less than computed. Mitigation: allowlist tokens (USDC only for v1) and document it. |
| A12 | Owner compromise (attacker pings forever) | ⚠️ | Inherent in the design; document it. A key-loss scenario is the intended trigger. |
| A13 | Timestamp manipulation | ✅ | Validators can shift `block.timestamp` by seconds; irrelevant at a 60-day granularity. |
| A14 | Admin key risk (`Ownable` → `setForwarder`) | ⚠️ | A malicious owner could only set a forwarder that executes **already-expired** guards early-ish, never non-expired ones. Still, move ownership to a Safe multisig and consider `renounceOwnership()` once the forwarder is set. |
| A15 | Wrong chain / wrong contract address in the frontend | ✅ | Wagmi is limited to the configured chain; the API verifies events come from `GUARD_ADDRESS`. |
| A16 | Static analysis + external review | ☐ | Slither and Aderyn clean; at least one independent audit or a Code4rena/Sherlock contest before holding real TVL. |
| A17 | Source verification | ☐ | Verify on Basescan; publish the deployment address and commit hash. |

## B. Web2 / API

| # | Risk | Status | Notes |
|---|---|---|---|
| B1 | **Broken authentication** (spoofing another wallet) | ✅ | SIWE (EIP-4361) via `viem/siwe` `verifySiweMessage` checks the domain, nonce, expiry and signature, with ERC-1271/6492 support for smart wallets. |
| B2 | SIWE **replay** | ✅ | The nonce is the NextAuth CSRF token, bound to an httpOnly cookie; messages expire after 10 minutes. |
| B2b | Unauthenticated page access | ✅ | `middleware.ts` redirects `/vault/*` without a SIWE session. |
| B3 | **IDOR**: writing someone else's vault | ✅ | `owner` always comes from the session, never from the body; the tx must emit `GuardSetup(owner = session)`. |
| B4 | **Client-supplied config tampering** | ✅ | Timeout, BPS and token are read from the chain, not from the request. |
| B5 | **SQL / NoSQL injection** | ✅ | Prisma parameterises every query; no `$queryRawUnsafe`. Keep it that way (add a lint rule or grep in CI). |
| B6 | **Input validation** | ✅ | zod schemas on every body and query; addresses and emails are normalised to lowercase. |
| B7 | **Rate limiting** | ⚠️ | An in-memory limiter exists, but on Vercel each instance has its own memory. Replace it with `@upstash/ratelimit` (Redis) before mainnet. Also enable Vercel Firewall rules. |
| B8 | **PII leakage** (heir emails) | ✅ | `GET` only returns emails to the owning session. ☐ Encrypt emails at rest (pgcrypto or app-level AES-GCM) and add a retention policy. |
| B9 | **Email abuse / spam** (BR-06) | ✅ / ☐ | DB-level unique key on (event, tx, recipient). ☐ The sender must only act on indexed on-chain events, never on API input. ☐ Configure SPF/DKIM/DMARC. |
| B10 | **Secrets** | ⚠️ | `.env*` is gitignored. ☐ **Rotate the DB password and NEXTAUTH_SECRET** (copies sit in several Downloads folders); revoke the now-unused Google OAuth client and delete GOOGLE_CLIENT_* from `.env.local`. ☐ Separate secrets per environment. |
| B11 | CSRF on POST | ✅ | NextAuth session cookie is `SameSite=Lax`; JSON body plus content type. ☐ Optionally check `Origin` on POST. |
| B12 | **Security headers** | ⚠️ | `next.config.mjs` sets `X-Frame-Options: DENY`, HSTS, `nosniff` and `Referrer-Policy`. ☐ Add a CSP (allow WalletConnect relay + RPC origins). |
| B13 | **Supply chain** (wallet libs are a prime target) | ⚠️ | Lockfile committed, `--frozen-lockfile` in CI. ☐ Dependabot/Renovate, `pnpm audit` in CI, pin RainbowKit/wagmi minors. |
| B14 | **RPC trust** | ⚠️ | Use a dedicated RPC (`RPC_URL`, e.g. Alchemy/QuickNode) rather than the public endpoint, for reliability and rate limits. |
| B15 | Error leakage | ✅ | Generic 5xx messages; details only in server logs. |
| B16 | Monitoring | ☐ | Alert on `InheritanceFailed`, on upkeep LINK balance, and on 5xx rate (Sentry + OpenZeppelin Defender Monitor or Tenderly). |
