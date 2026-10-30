import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';

const OWNER = '0x20abcdef0123456789abcdef0123456789a1c876';
const HEIR = '0x1111111111111111111111111111111111111111';
const SECRET = 'test-secret-not-real';

const serverSession = vi.hoisted(() => ({ value: null as null | { address: string } }));
vi.mock('next-auth', async (orig) => ({ ...(await orig<object>()), getServerSession: async () => serverSession.value }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => true, clientIp: () => '127.0.0.1' }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    vault: {
      findFirst: async () => ({
        status: 'ACTIVE',
        txHash: null,
        beneficiaries: [{ walletAddress: '0x1111111111111111111111111111111111111111', email: 'heir@example.com' }],
      }),
    },
  },
}));
vi.mock('@/lib/chain', async (orig) => ({
  ...(await orig<object>()),
  publicClient: {
    readContract: async ({ functionName }: { functionName: string }) =>
      functionName === 'guards'
        ? ['0x036CbD53842c5426634e7929541eC2318f3dCF7e', 5_184_000n, 1_000n, true]
        : [{ wallet: '0x1111111111111111111111111111111111111111', bps: 10_000 }],
  },
}));

import { middleware } from '@/middleware';
import { allowedHosts, csrfNonce } from '@/lib/auth';
import { GET, POST } from '@/app/api/vault/route';

const env = { ...process.env };
beforeEach(() => {
  process.env.NEXTAUTH_SECRET = SECRET;
  serverSession.value = null;
});
afterEach(() => {
  process.env = { ...env };
});

describe('middleware (API writes)', () => {
  const req = (method: string, cookie?: string) =>
    new NextRequest('https://pulse.example/api/vault', { method, headers: cookie ? { cookie } : {} });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s /api/vault without a session -> 401', async (method) => {
    expect((await middleware(req(method))).status).toBe(401);
  });

  it('lets reads through (GET /api/vault is the public verify endpoint)', async () => {
    expect((await middleware(req('GET'))).headers.get('x-middleware-next')).toBe('1');
  });

  it('finds the __Secure- cookie on https even when NEXTAUTH_URL says http (the production bug)', async () => {
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    const jwt = await encode({ token: { address: OWNER }, secret: SECRET });
    const res = await middleware(req('POST', `__Secure-next-auth.session-token=${jwt}`));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('rejects a token signed with another secret', async () => {
    const jwt = await encode({ token: { address: OWNER }, secret: 'someone-else' });
    expect((await middleware(req('POST', `__Secure-next-auth.session-token=${jwt}`))).status).toBe(401);
  });
});

describe('/api/vault route handlers', () => {
  it('POST without a session -> 401', async () => {
    const res = await POST(new Request('http://localhost/api/vault', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });

  it('GET is public but never returns emails without the owner session', async () => {
    const res = await GET(new Request(`http://localhost/api/vault?address=${OWNER}`));
    expect(res.status).toBe(200);
    expect((await res.json()).beneficiaries[0].walletAddress).toBe(HEIR);
  });

  it('GET hides emails from anyone but the owner, and shows them to the owner', async () => {
    const get = async () => (await (await GET(new Request(`http://localhost/api/vault?address=${OWNER}`))).json()).beneficiaries[0];
    expect(await get()).not.toHaveProperty('email');
    serverSession.value = { address: HEIR };
    expect(await get()).not.toHaveProperty('email');
    serverSession.value = { address: OWNER };
    expect((await get()).email).toBe('heir@example.com');
  });
});

describe('SIWE helpers', () => {
  it('reads the CSRF nonce only from a correctly signed cookie', () => {
    const hash = createHash('sha256').update(`abc123${SECRET}`).digest('hex');
    expect(csrfNonce(`x=1; __Host-next-auth.csrf-token=abc123%7C${hash}`, SECRET)).toBe('abc123');
    expect(csrfNonce(`next-auth.csrf-token=abc123|${hash}`, SECRET)).toBe('abc123');
    expect(csrfNonce(`__Host-next-auth.csrf-token=abc123|${'0'.repeat(64)}`, SECRET)).toBeNull();
    expect(csrfNonce(undefined, SECRET)).toBeNull();
  });

  it('accepts the production alias, not just the per-deployment VERCEL_URL', () => {
    const hosts = allowedHosts({ VERCEL_URL: 'pulse-abc123-team.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'pulse.example' });
    expect([...hosts].sort()).toEqual(['pulse-abc123-team.vercel.app', 'pulse.example']);
    expect([...allowedHosts({})]).toEqual(['localhost:3000']);
  });
});
