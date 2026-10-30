'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Abi, TransactionReceipt } from 'viem';
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { chain } from '@/lib/chain';
import { describeTxError } from '@/lib/tx-errors';

export type TxCall = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

export type TxStep = {
  label: string;
  detail?: string;
  call: () => TxCall;
  /** Runs after the receipt succeeds; throwing stops the flow with that message. */
  onConfirmed?: (receipt: TransactionReceipt) => void | Promise<void>;
};

export type TxPhase = 'idle' | 'wallet' | 'confirming' | 'finishing' | 'success' | 'error';

export type TxFlow = ReturnType<typeof useTxFlow>;

/**
 * Runs one or more contract writes in order: simulate (so reverts decode against the ABI),
 * writeContract, then useWaitForTransactionReceipt. Each step starts after the previous one is mined.
 */
export function useTxFlow({ onDone }: { onDone?: () => void } = {}) {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: chain.id });
  const { writeContractAsync } = useWriteContract();

  const [steps, setSteps] = useState<TxStep[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<TxPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}`>();
  const [hashes, setHashes] = useState<`0x${string}`[]>([]);
  const [hidden, setHidden] = useState(false);
  const handled = useRef<string | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const receipt = useWaitForTransactionReceipt({ hash, chainId: chain.id, query: { enabled: !!hash } });

  const send = useCallback(
    async (step: TxStep) => {
      setError(null);
      setHash(undefined);
      if (!address) {
        setError('Connect your wallet first.');
        setPhase('error');
        return;
      }
      if (chainId !== chain.id) {
        setError(`Switch your wallet to ${chain.name} first.`);
        setPhase('error');
        return;
      }
      setPhase('wallet');
      try {
        const call = step.call();
        await publicClient!.simulateContract({ ...call, account: address } as never);
        const h = await writeContractAsync({ ...call, chainId: chain.id } as never);
        setHash(h);
        setHashes((p) => [...p, h]);
        setPhase('confirming');
      } catch (e) {
        setError(describeTxError(e));
        setPhase('error');
      }
    },
    [address, chainId, publicClient, writeContractAsync],
  );

  const start = useCallback(
    (next: TxStep[]) => {
      setSteps(next);
      setHidden(false);
      setIndex(0);
      setHashes([]);
      handled.current = null;
      void send(next[0]);
    },
    [send],
  );

  useEffect(() => {
    if (phase !== 'confirming' || !hash || handled.current === hash) return;
    if (receipt.isError) {
      handled.current = hash;
      setError(describeTxError(receipt.error));
      setPhase('error');
      return;
    }
    const r = receipt.data;
    if (!r) return;
    handled.current = hash;
    if (r.status !== 'success') {
      setError('The transaction was mined but reverted. Nothing changed on-chain.');
      setPhase('error');
      return;
    }
    setPhase('finishing');
    void (async () => {
      try {
        await steps[index].onConfirmed?.(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Follow-up step failed.');
        setPhase('error');
        return;
      }
      if (index + 1 < steps.length) {
        setIndex(index + 1);
        void send(steps[index + 1]);
      } else {
        setPhase('success');
        onDoneRef.current?.();
      }
    })();
  }, [phase, hash, receipt.data, receipt.isError, receipt.error, steps, index, send]);

  const busy = phase === 'wallet' || phase === 'confirming' || phase === 'finishing';
  return {
    start,
    /** The modal is shown unless the user hid a pending tx; errors always reopen it. */
    open: phase === 'error' || (phase !== 'idle' && !hidden),
    close: () => (busy ? setHidden(true) : (setPhase('idle'), setError(null), setSteps([]))),
    retry: () => {
      setHidden(false);
      if (steps[index]) void send(steps[index]);
    },
    phase,
    error,
    steps,
    index,
    hashes,
    busy,
  };
}
