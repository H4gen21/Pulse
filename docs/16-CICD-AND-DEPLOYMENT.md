# 16 — CI/CD & Vercel Deployment

## Pipeline (`.github/workflows/ci.yml`)

```
PR / push to main
 ├─ contracts:  pnpm install → clone forge-std → forge fmt --check → build --sizes
 │              → ABI in lib/abi matches the contract → test → coverage
 └─ web:        pnpm install → lint → typecheck → vitest → next build
```

Deployment is handled by **Vercel's Git integration**: every PR gets a Preview URL and `main` deploys to Production. CI does not deploy. Enable "Require status checks" on `main` in GitHub branch protection so broken code can't merge.

Contract deployment stays **manual and out of CI**: a mainnet deployer key must never be a GitHub secret. Use `forge script --account <keystore> --broadcast --verify` from a dev machine or a hardware wallet, then update `NEXT_PUBLIC_GUARD_CONTRACT_ADDRESS` in Vercel.

## Fix for blocker #4 (wrong root directory)

The app is at the **repo root**, but the Vercel project still points at `/pulse-app`, which doesn't exist, so builds fail or deploy an empty app.

1. Vercel → Project → **Settings → General → Root Directory** → clear it (leave it empty / `./`). Save.
2. Framework preset: **Next.js**. Install command: `pnpm install`. Build command: leave the default (`pnpm build`, which runs `prisma generate && next build`).
3. Node.js version: 20.x.
4. **Settings → Environment Variables**: add every key in `.env.example` for Production and Preview. Notes:
   - `NEXTAUTH_URL` = the production domain (e.g. `https://pulse.vercel.app`). Its host **must** equal the SIWE message domain, or every login fails. On preview deployments the code falls back to `VERCEL_URL` automatically.
   - `NEXTAUTH_SECRET` = `openssl rand -base64 32`. Use a different value per environment.
   - `DATABASE_URL`: use a pooled connection string (Neon/Supabase pooler, or Prisma Accelerate) because serverless functions open many connections.
5. Apply migrations to the production DB: `pnpm db:migrate` (`prisma migrate deploy`, uses `DIRECT_URL`).
6. Redeploy: Deployments → latest → **Redeploy**, untick "use existing build cache".

### Verify the redeploy
- [ ] The build log shows `Route (app) … /api/vault` and `/api/auth/[...nextauth]`
- [ ] `GET https://<domain>/api/auth/providers` lists `siwe`
- [ ] `GET https://<domain>/api/vault?address=0x123` → `400`
- [ ] `POST https://<domain>/api/vault` without a cookie → `401`
- [ ] Connect wallet → sign → `GET /api/auth/session` returns your `address`

## Local commands

```bash
pnpm install
cp .env.example .env.local      # fill in values
pnpm db:migrate
pnpm dev                        # http://localhost:3000

git clone --depth 1 https://github.com/foundry-rs/forge-std lib-sol/forge-std   # once
pnpm test:contracts             # forge test
pnpm test                       # vitest
pnpm lint && pnpm typecheck && pnpm build
```
