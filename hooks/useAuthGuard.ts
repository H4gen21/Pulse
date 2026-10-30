'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useSession } from 'next-auth/react';

/**
 * Gate for owner-only pages. "Authenticated" means the wallet is connected AND
 * a SIWE session exists for that same address (so API calls will be authorized).
 */
export function useAuthGuard({ redirectTo = '/' }: { redirectTo?: string } = {}) {
  const router = useRouter();
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const { data: session, status } = useSession();

  const isLoading = isConnecting || isReconnecting || status === 'loading';
  const sessionMatchesWallet =
    !!address && !!session?.address && session.address.toLowerCase() === address.toLowerCase();
  const isAuthenticated = isConnected && status === 'authenticated' && sessionMatchesWallet;

  useEffect(() => {
    if (!isLoading && !isConnected) router.replace(redirectTo);
  }, [isLoading, isConnected, redirectTo, router]);

  return {
    address,
    isConnected,
    isConnecting: isLoading,
    isAuthenticated,
    /** Connected, but the SIWE signature is still needed (or belongs to another wallet). */
    needsSignIn: isConnected && !isLoading && !isAuthenticated,
  };
}
