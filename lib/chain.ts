import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';

export const chain = Number(process.env.NEXT_PUBLIC_CHAIN_ID) === base.id ? base : baseSepolia;

// Server-side reads (SIWE verification, tx receipts). RPC_URL is optional; falls back to the public RPC.
export const publicClient = createPublicClient({
  chain,
  transport: http(process.env.RPC_URL),
});
