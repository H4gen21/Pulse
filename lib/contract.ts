import { base, baseSepolia } from 'viem/chains';
import { inheritanceGuardAbi } from './abi/inheritanceGuard';

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID) === base.id ? base.id : baseSepolia.id;

export const GUARD_ADDRESS = (process.env.NEXT_PUBLIC_GUARD_CONTRACT_ADDRESS ?? '0x') as `0x${string}`;

// Circle's native USDC, from https://developers.circle.com/stablecoins/usdc-contract-addresses
// (Base Sepolia verified on-chain: symbol USDC, 6 decimals). Base mainnet must be set via
// NEXT_PUBLIC_USDC_CONTRACT_ADDRESS after checking the same page; the env var is ignored on testnet.
const OFFICIAL_USDC: Partial<Record<number, `0x${string}`>> = {
  [baseSepolia.id]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};
export const USDC_ADDRESS = (OFFICIAL_USDC[chainId] ??
  (chainId === base.id ? process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS : undefined) ??
  '0x') as `0x${string}`;

// Full ABI (incl. custom errors, so viem can decode reverts). Regenerate with `forge build && pnpm abi:gen`.
export const guardAbi = inheritanceGuardAbi;

export const erc20Abi = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

export type HeirInput = { wallet: `0x${string}`; bps: number };

// Write calls used by the UI (fed to hooks/useTxFlow).
export const calls = {
  approve: (amount: bigint) =>
    ({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [GUARD_ADDRESS, amount] }) as const,
  setupGuard: (token: `0x${string}`, timeoutSeconds: bigint, heirs: HeirInput[]) =>
    ({ address: GUARD_ADDRESS, abi: guardAbi, functionName: 'setupGuard', args: [token, timeoutSeconds, heirs] }) as const,
  ping: () => ({ address: GUARD_ADDRESS, abi: guardAbi, functionName: 'ping', args: [] }) as const,
  revokeGuard: () => ({ address: GUARD_ADDRESS, abi: guardAbi, functionName: 'revokeGuard', args: [] }) as const,
};
