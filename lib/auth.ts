import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getCsrfToken } from 'next-auth/react';
import { parseSiweMessage } from 'viem/siwe';
import { publicClient } from './chain';
import { prisma } from './prisma';

function appHost() {
  const url = process.env.NEXTAUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  return new URL(url).host;
}

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
      const nonce = await getCsrfToken({ req: { headers: req.headers } });
      if (!address || !nonce || domain !== appHost()) return null;
      if (expirationTime && expirationTime.getTime() < Date.now()) return null;

      // verifySiweMessage checks nonce, domain, time window and the signature
      // (EOA via ecrecover, smart wallets via ERC-1271/6492).
      const valid = await publicClient.verifySiweMessage({
        message,
        signature: credentials.signature as `0x${string}`,
        nonce,
        domain: appHost(),
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
