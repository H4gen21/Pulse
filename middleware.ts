import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';

const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Pages are public: /vault and /vault/create render a locked preview until the wallet signs in.
 * This only guards API writes. Route handlers check the session again (requireWallet).
 */
export async function middleware(req: NextRequest) {
  if (READ_ONLY.has(req.method)) return NextResponse.next();

  // On https NextAuth names the cookie __Secure-next-auth.session-token. Decide from the
  // request itself, not NEXTAUTH_URL, so this always matches the cookie the auth route set.
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim() ?? req.nextUrl.protocol.replace(':', '');
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET, secureCookie: proto === 'https' });

  if (!token?.address) {
    return NextResponse.json({ error: 'Unauthorized: sign in with your wallet' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/api/vault/:path*'] };
