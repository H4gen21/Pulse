import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';

const isMainnet = Number(process.env.NEXT_PUBLIC_CHAIN_ID) === base.id;

// Browser RPC for contract reads only (event logs come from /api/vault/events). Optional: the
// public RPC works. Never put a server-only key here. No JSON-RPC batching, so one oversized
// request can't fail everything with HTTP 413, and one retry so a failing RPC isn't hammered.
const rpc = http(process.env.NEXT_PUBLIC_RPC_URL || undefined, { batch: false, retryCount: 1, timeout: 15_000 });

export const config = getDefaultConfig({
  appName: 'Pulse Inheritance Guard',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo',
  // Only the configured chain, so users cannot sign transactions on the wrong network.
  chains: isMainnet ? [base] : [baseSepolia],
  transports: isMainnet ? { [base.id]: rpc } : { [baseSepolia.id]: rpc },
  // useReadContracts packs reads into Multicall3 eth_calls; keep each one small.
  batch: { multicall: { batchSize: 1_024, wait: 16 } },
  ssr: true,
});
