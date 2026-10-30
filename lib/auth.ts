import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createHash } from 'node:crypto';
import { parseSiweMessage } from 'viem/siwe';
import { publicClient } from './chain';
import { prisma } from './prisma';

/**
 * Hosts a SIWE message may name: NEXTAUTH_URL plus Vercel's production, branch and deployment
 * hosts. VERCEL_URL alone is the per-deployment host, not the production alias users visit.
 */
export function allowedHosts(env: Record<string, string | undefined> = process.env) {
  const hosts = new Set<string>();
  for (const u of [env.NEXTAUTH_URL, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_BRANCH_URL, env.VERCEL_URL]) {
    if (!u) continue;
    try {
      hosts.add(new URL(u.includes('://') ? u : `https://${u}`).host);
    } catch {
      // ignore malformed values
    }
  }
  if (!hosts.size) hosts.add('localhost:3000');
  return hosts;
}

/**
 * The NextAuth CSRF token, read from its signed cookie (`token|sha256(token + secret)`).
 * Replaces getCsrfToken(), which fetched /api/auth/csrf over HTTP from NEXTAUTH_URL/VERCEL_URL.
 */
export function csrfNonce(cookieHeader: string | undefined, secret = process.env.NEXTAUTH_SECRET): string | null {
  if (!cookieHeader || !secret) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== '__Host-next-auth.csrf-token' && name !== 'next-auth.csrf-token') continue;
    const [token, hash] = decodeURIComponent(rest.join('=')).split('|');
    if (token && hash === createHash('sha256').update(`${token}${secret}`).digest('hex')) return token;
  }
  return null;
}

const header = (headers: Record<string, unknown> | undefined, name: string) => {
  const v = headers?.[name];
  return typeof v === 'string' ? v : undefined;
};

// Sign-In With Ethereum (EIP-4361). The wallet address is the user's identity;
// the NextAuth CSRF token doubles as the single-use SIWE nonce.
const siweProvider = CredentialsProvider({
  id: 'siwe',
  name: 'Ethereum',
  credentials: {
    message: { label: 'Message', type: 'text' },
    signature: { label: 'Signature', type: 'text' },
  },
  async authorize(credentials, req) {
    if (!credentials?.message || !credentials.signature) return null;
    try {
      const message = credentials.message;
      const { address, domain, expirationTime } = parseSiweMessage(message);
      const nonce = csrfNonce(header(req.headers, 'cookie'));
      // The message must name the host this request arrived on, and that host must be ours.
      const host = header(req.headers, 'x-forwarded-host')?.split(',')[0].trim() ?? header(req.headers, 'host');
      if (!address || !nonce || !domain || domain !== host || !allowedHosts().has(domain)) return null;
      if (expirationTime && expirationTime.getTime() < Date.now()) return null;

      // verifySiweMessage checks nonce, domain, time window and the signature
      // (EOA via ecrecover, smart wallets via ERC-1271/6492).
      const valid = await publicClient.verifySiweMessage({
        message,
        signature: credentials.signature as `0x${string}`,
        nonce,
        domain,
      });
      if (!valid) return null;

      const walletAddress = address.toLowerCase();
      await prisma.owner.upsert({ where: { walletAddress }, update: {}, create: { walletAddress } });
      return { id: walletAddress };
    } catch {
      return null;
    }
  },
});

export const authOptions: NextAuthOptions = {
  providers: [siweProvider],
  session: { strategy: 'jwt', maxAge: 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user, account }) {
      if (user && account?.provider === 'siwe') token.address = user.id as `0x${string}`;
      return token;
    },
    async session({ session, token }) {
      session.address = token.address;
      return session;
    },
  },
  pages: { signIn: '/' },
};
