'use client';

import '@rainbow-me/rainbowkit/styles.css';
import {
  RainbowKitAuthenticationProvider,
  RainbowKitProvider,
  createAuthenticationAdapter,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { SessionProvider, getCsrfToken, signIn, signOut, useSession } from 'next-auth/react';
import { createSiweMessage } from 'viem/siwe';
import { config } from '@/lib/wagmi';
import { ReactNode, useState } from 'react';

// RainbowKit drives the SIWE flow: connect → sign message → NextAuth session cookie.
const siweAdapter = createAuthenticationAdapter({
  getNonce: async () => (await getCsrfToken()) ?? '',
  createMessage: ({ nonce, address, chainId }) =>
    createSiweMessage({
      domain: window.location.host,
      address,
      statement: 'Sign in to Pulse. This request does not trigger a transaction or cost gas.',
      uri: window.location.origin,
      version: '1',
      chainId,
      nonce,
      expirationTime: new Date(Date.now() + 10 * 60 * 1000),
    }),
  verify: async ({ message, signature }) => {
    const res = await signIn('siwe', { message, signature, redirect: false });
    return Boolean(res?.ok);
  },
  signOut: async () => {
    await signOut({ redirect: false });
  },
});

function WalletProviders({ children }: { children: ReactNode }) {
  const { status } = useSession();
  return (
    <RainbowKitAuthenticationProvider adapter={siweAdapter} status={status}>
      <RainbowKitProvider
        theme={darkTheme({
          accentColor: '#10b981',
          accentColorForeground: '#020617',
          borderRadius: 'medium',
        })}
      >
        {children}
      </RainbowKitProvider>
    </RainbowKitAuthenticationProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <SessionProvider refetchInterval={0}>
        <QueryClientProvider client={queryClient}>
          <WalletProviders>{children}</WalletProviders>
        </QueryClientProvider>
      </SessionProvider>
    </WagmiProvider>
  );
}
