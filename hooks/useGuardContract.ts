'use client';
import { usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { guardAbi, GUARD_ADDRESS, USDC_ADDRESS, erc20Abi } from '@/lib/contract';

export function useGuard(owner?: `0x${string}`) {
  const { data, refetch, isLoading } = useReadContract({
    address: GUARD_ADDRESS,
    abi: guardAbi,
    functionName: 'guards',
    args: owner ? [owner] : undefined,
    query: { enabled: !!owner },
  });

  const { data: beneficiaries, refetch: refetchBens } = useReadContract({
    address: GUARD_ADDRESS,
    abi: guardAbi,
    functionName: 'getBeneficiaries',
    args: owner ? [owner] : undefined,
    query: { enabled: !!owner },
  });

  return {
    guard: data ? {
      token: data[0],
      timeoutDuration: Number(data[1]),
      lastPingTimestamp: Number(data[2]),
      isActive: data[3],
    } : null,
    beneficiaries: (beneficiaries ?? []) as readonly { wallet: `0x${string}`; bps: number }[],
    isLoading,
    refetch: () => { refetch(); refetchBens(); },
  };
}

export function useGuardWrites() {
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending, error } = useWriteContract();

  // Resolves once the tx is mined; throws if it reverted.
  async function confirm(hash: `0x${string}`) {
    const receipt = await publicClient!.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('Transaction reverted');
    return hash;
  }

  return {
    setupGuard: async (token: `0x${string}`, timeout: bigint, bens: { wallet: `0x${string}`; bps: number }[]) =>
      confirm(await writeContractAsync({
        address: GUARD_ADDRESS, abi: guardAbi, functionName: 'setupGuard',
        args: [token, timeout, bens.map(b => ({ wallet: b.wallet, bps: b.bps }))],
      })),
    ping: async () => confirm(await writeContractAsync({ address: GUARD_ADDRESS, abi: guardAbi, functionName: 'ping' })),
    revoke: async () => confirm(await writeContractAsync({ address: GUARD_ADDRESS, abi: guardAbi, functionName: 'revokeGuard' })),
    approve: async (amount: bigint) => confirm(await writeContractAsync({
      address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve',
      args: [GUARD_ADDRESS, amount],
    })),
    isPending, error,
  };
}
