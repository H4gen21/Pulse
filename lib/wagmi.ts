import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, baseSepolia } from 'wagmi/chains';

const isMainnet = Number(process.env.NEXT_PUBLIC_CHAIN_ID) === base.id;

export const config = getDefaultConfig({
  appName: 'Pulse Inheritance Guard',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo',
  // Only the configured chain, so users cannot sign transactions on the wrong network.
  chains: isMainnet ? [base] : [baseSepolia],
  ssr: true,
});
