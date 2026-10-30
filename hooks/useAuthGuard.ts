'use client';

import { useAccount } from 'wagmi';
import { useSession } from 'next-auth/react';
import { chain } from '@/lib/chain';

/** loading → disconnected → wrong-network → signed-out → ready. Drives <AuthGate> and the nav locks. */
export type GateState = 'loading' | 'disconnected' | 'wrong-network' | 'signed-out' | 'ready';

export const sameAddress = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Where the visitor stands with owner-only pages. Never redirects: pages render a locked
 * preview instead. "Signed in" means a SIWE session for the wallet that is connected right now.
 */
export function useAuthGuard() {
  const { address, isConnected, isReconnecting, chainId } = useAccount();
  const { data: session, status } = useSession();

  const signedIn = isConnected && status === 'authenticated' && sameAddress(session?.address, address);
  const state: GateState =
    status === 'loading' || isReconnecting
      ? 'loading'
      : !isConnected || !address
        ? 'disconnected'
        : chainId !== chain.id
          ? 'wrong-network'
          : signedIn
            ? 'ready'
            : 'signed-out';

  return { address, state, signedIn };
}
