'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReadContracts } from 'wagmi';
import { chain } from '@/lib/chain';
import { erc20Abi, guardAbi, GUARD_ADDRESS, USDC_ADDRESS } from '@/lib/contract';
import { parseWithBigints, type GuardEventsResponse } from '@/lib/guard-events';
import { deriveStatus, toGuardConfig, type GuardStatus } from '@/lib/guard-status';
import { MAX_TIMEOUT_SEC, MIN_TIMEOUT_SEC } from '@/lib/validation';

export type Beneficiary = { wallet: `0x${string}`; bps: number };

/** Guard config + heirs for any owner (public data). */
export function useGuard(owner?: `0x${string}`) {
  const enabled = !!owner;
  const reads = useReadContracts({
    allowFailure: false,
    contracts: owner
      ? [
          { chainId: chain.id, address: GUARD_ADDRESS, abi: guardAbi, functionName: 'guards', args: [owner] },
          { chainId: chain.id, address: GUARD_ADDRESS, abi: guardAbi, functionName: 'getBeneficiaries', args: [owner] },
        ]
      : [],
    query: { enabled },
  });
  const [cfgTuple, bens] = (reads.data ?? []) as unknown as [
    readonly [`0x${string}`, bigint, bigint, boolean] | undefined,
    readonly Beneficiary[] | undefined,
  ];
  return {
    config: cfgTuple ? toGuardConfig(cfgTuple) : undefined,
    beneficiaries: bens ?? [],
    isLoading: reads.isLoading,
    error: reads.error,
    refetch: reads.refetch,
  };
}

/**
 * BR-01 bounds in seconds, read from the deployed contract (60/730 days in production,
 * 15 s/730 days on InheritanceGuardStaging). Until the read lands, or if the contract
 * predates these getters, it falls back to the production constants.
 */
export function useTimeoutBounds() {
  const reads = useReadContracts({
    allowFailure: false,
    contracts: [
      { chainId: chain.id, address: GUARD_ADDRESS, abi: guardAbi, functionName: 'minTimeout' },
      { chainId: chain.id, address: GUARD_ADDRESS, abi: guardAbi, functionName: 'maxTimeout' },
    ],
    query: { staleTime: Infinity },
  });
  const [min, max] = (reads.data ?? []) as unknown as [bigint | undefined, bigint | undefined];
  return {
    min: min === undefined ? MIN_TIMEOUT_SEC : Number(min),
    max: max === undefined ? MAX_TIMEOUT_SEC : Number(max),
    fromContract: min !== undefined && max !== undefined,
    isLoading: reads.isLoading,
  };
}

/** The owner's USDC balance and the allowance granted to the guard. */
export function useUsdc(owner?: `0x${string}`) {
  const reads = useReadContracts({
    allowFailure: false,
    contracts: owner
      ? [
          { chainId: chain.id, address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [owner] },
          { chainId: chain.id, address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [owner, GUARD_ADDRESS] },
        ]
      : [],
    query: { enabled: !!owner },
  });
  const [balance, allowance] = (reads.data ?? []) as unknown as [bigint | undefined, bigint | undefined];
  return { balance, allowance, isLoading: reads.isLoading, refetch: reads.refetch };
}

/**
 * Pulse events for an owner (newest first, with timestamps) from GET /api/vault/events. Logs are
 * read on the server; the browser never calls eth_getLogs. Starts after the first paint so it can
 * never hold up the page, and fails fast (one retry) into the feed's own error state.
 */
export function useGuardEvents(owner?: `0x${string}`) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return useQuery({
    queryKey: ['guard-events', chain.id, owner?.toLowerCase()],
    enabled: !!owner && mounted,
    staleTime: 15_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }): Promise<GuardEventsResponse> => {
      const res = await fetch(`/api/vault/events?owner=${owner}`, { signal });
      const text = await res.text();
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          msg = JSON.parse(text).error ?? msg;
        } catch {}
        throw new Error(msg);
      }
      return parseWithBigints<GuardEventsResponse>(text);
    },
  });
}

/** Status from config + events. Falls back to `fallback` (e.g. the API's cached status) without logs. */
export function useGuardStatus(owner?: `0x${string}`, fallback?: GuardStatus) {
  const guard = useGuard(owner);
  const events = useGuardEvents(owner);
  let status = deriveStatus(guard.config, events.data?.latest ?? null);
  if (status === 'REVOKED' && !events.data && fallback === 'EXECUTED') status = 'EXECUTED';
  return { ...guard, status, events };
}

export type VaultApi = {
  status: 'UNCONFIGURED' | 'ACTIVE' | 'REVOKED' | 'EXECUTED';
  txHash: `0x${string}` | null;
  beneficiaries: { position: number; walletAddress: string; bpsShare: number; email?: string | null }[];
};

/** GET /api/vault: off-chain record (setup tx, cached status; emails only for the signed-in owner). */
export function useVaultApi(owner?: `0x${string}`) {
  return useQuery({
    queryKey: ['vault-api', owner],
    enabled: !!owner,
    retry: 1,
    queryFn: async (): Promise<VaultApi> => {
      const res = await fetch(`/api/vault?address=${owner}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      return data;
    },
  });
}
