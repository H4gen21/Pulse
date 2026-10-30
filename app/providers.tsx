'use client';

import '@rainbow-me/rainbowkit/styles.css';
import {
  RainbowKitAuthenticationProvider,
  RainbowKitProvider,
  createAuthenticationAdapter,
  darkTheme,
  lightTheme,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { SessionProvider, getCsrfToken, signIn, signOut, useSession } from 'next-auth/react';
import { createSiweMessage } from 'viem/siwe';
import { config } from '@/lib/wagmi';
import { ReactNode, useState } from 'react';
import { ThemeProvider, useTheme } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/Toasts';

const rkOptions = { accentColor: '#AB9FF2', accentColorForeground: '#1E173A', borderRadius: 'large' } as const;

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
  const { theme } = useTheme();
  return (
    <RainbowKitAuthenticationProvider adapter={siweAdapter} status={status}>
      <RainbowKitProvider theme={theme === 'dark' ? darkTheme(rkOptions) : lightTheme(rkOptions)}>
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
          <ThemeProvider>
            <WalletProviders>
              <ToastProvider>{children}</ToastProvider>
            </WalletProviders>
          </ThemeProvider>
        </QueryClientProvider>
      </SessionProvider>
    </WagmiProvider>
  );
}
