import { withAuth } from 'next-auth/middleware';

// Server-side gate for owner pages: no SIWE session → redirect to the landing page.
// Wallet-switch detection (session wallet ≠ connected wallet) is handled client-side by useAuthGuard.
export default withAuth({
  callbacks: { authorized: ({ token }) => !!token?.address },
  pages: { signIn: '/' },
});

export const config = { matcher: ['/vault/:path*'] };
