import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';

const isMainnet = Number(process.env.NEXT_PUBLIC_CHAIN_ID) === base.id;

// Browser RPC. Optional: the public RPC works, but a provider URL (domain-restricted key)
// makes the activity feed's getLogs reliable. Never put a server-only key here.
const rpc = http(process.env.NEXT_PUBLIC_RPC_URL || undefined);

export const config = getDefaultConfig({
  appName: 'Pulse Inheritance Guard',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo',
  // Only the configured chain, so users cannot sign transactions on the wrong network.
  chains: isMainnet ? [base] : [baseSepolia],
  transports: isMainnet ? { [base.id]: rpc } : { [baseSepolia.id]: rpc },
  ssr: true,
});
