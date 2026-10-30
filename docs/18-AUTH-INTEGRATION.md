# 18 — Auth (SIWE) Design: Solo MVP

## Recommendation

**Use SIWE (EIP-4361) through NextAuth v4 Credentials + RainbowKit's authentication adapter + `viem/siwe`.** No extra auth service, no email/password, and no extra SIWE library (viem already has it).

Why this setup:
- **Wallet = identity.** Every protected action means "this wallet owns this vault", so the session must prove control of the wallet. Email or OAuth logins can't prove that.
- **RainbowKit does the UX.** After connecting, it asks for the signature automatically and shows the signed-in state in `ConnectButton`.
- **NextAuth does the session.** An httpOnly, signed JWT cookie, plus a CSRF token that doubles as the single-use SIWE nonce. You don't need a nonce table.
- **viem verifies the signature.** `verifySiweMessage` checks the domain, nonce, expiry and signature, including smart-contract wallets (ERC-1271/6492, e.g. Coinbase Smart Wallet).

Skipped on purpose (too much for an MVP): Auth.js v5 migration, a DB session table, refresh tokens, social logins, a multi-wallet account model.

## Flow

```
ConnectButton ─ connect (wagmi)
   │ GET /api/auth/csrf                        → nonce
   │ wallet signs createSiweMessage(...)       (no gas)
   │ signIn('siwe', { message, signature })
   ▼
lib/auth.ts  authorize()
   │ parseSiweMessage → domain == NEXTAUTH_URL host
   │ publicClient.verifySiweMessage({ nonce, domain })
   │ upsert Owner(walletAddress)
   ▼
JWT cookie { address }  (24h)
   ├─ middleware.ts          → /vault/* requires token.address  (server-side redirect)
   ├─ useAuthGuard()         → session wallet must equal connected wallet (client-side)
   └─ requireWallet()        → API routes get a trusted `address` or 401
```

## Files

| File | Role |
|---|---|
| `lib/auth.ts` | `authOptions` with the SIWE CredentialsProvider; jwt/session callbacks put `address` on the session |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth handler |
| `app/providers.tsx` | `WagmiProvider` → `SessionProvider` → `RainbowKitAuthenticationProvider` (adapter) → `RainbowKitProvider` |
| `middleware.ts` | Protects `/vault/*` (the dashboard and setup pages) on the server |
| `hooks/useAuthGuard.ts` | Client gate; `needsSignIn` is true after a wallet switch |
| `lib/session.ts` | `requireWallet()` / `getWallet()` for route handlers |
| `types/next-auth.d.ts` | Types for `session.address` |

## Protecting a route

```ts
import { requireWallet } from '@/lib/session';

export async function POST(req: Request) {
  const auth = await requireWallet();
  if ('error' in auth) return auth.error;   // 401
  const owner = auth.address;                // trusted, lowercase. Never read the owner from the body.
}
```

Pages: put them under `/vault/*` and the middleware covers them. Public pages (`/`, `/verify`) need nothing.

## Rules to keep it secure

1. The SIWE `domain` must match the host in `NEXTAUTH_URL`. Preview deploys fall back to `VERCEL_URL`.
2. Never authorise anything from client-supplied addresses; only from `session.address`.
3. Sensitive actions (ping, revoke, setup) are **on-chain transactions** signed by the wallet itself. The session only protects off-chain data (emails, DB records), so a stolen cookie can't move funds.
4. On wallet switch, ask for a new signature (`needsSignIn`); on disconnect, the adapter's `signOut` clears the cookie.
5. Keep `NEXTAUTH_SECRET` per environment (`openssl rand -base64 32`). Rotating it logs everyone out.
6. Session lifetime is 24h (`session.maxAge`) and the SIWE message expires after 10 minutes.

## Later (post-MVP)

Owner email for "you haven't pinged in a while" reminders: add `POST /api/profile/email` behind `requireWallet()` with magic-link verification, stored on `Owner`. Keep SIWE as the only login.
