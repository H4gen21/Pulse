import { describe, expect, it } from 'vitest';
import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  UserRejectedRequestError,
  zeroAddress,
} from 'viem';
import { guardAbi } from '@/lib/contract';
import { deadlineOf, deriveStatus, type GuardConfig } from '@/lib/guard-status';
import { latestTerminal, type GuardEvent } from '@/lib/guard-events';
import { describeTxError } from '@/lib/tx-errors';

const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const cfg = (isActive: boolean, token: `0x${string}` = TOKEN): GuardConfig => ({
  token,
  timeoutDuration: 60n * 86_400n,
  lastPingTimestamp: 1_000n,
  isActive,
});
const ev = (name: GuardEvent['name'], block: number, args: Record<string, unknown> = {}): GuardEvent => ({
  name,
  args,
  txHash: `0x${'1'.repeat(64)}`,
  blockNumber: BigInt(block),
  logIndex: 0,
});

describe('deriveStatus', () => {
  it('NONE when never configured', () => {
    expect(deriveStatus(undefined, null)).toBe('NONE');
    expect(deriveStatus(cfg(false, zeroAddress), null)).toBe('NONE');
  });
  it('ACTIVE whenever isActive is set', () => {
    expect(deriveStatus(cfg(true), 'GuardRevoked')).toBe('ACTIVE');
  });
  it('EXECUTED / REVOKED from the latest lifecycle event', () => {
    expect(deriveStatus(cfg(false), 'InheritanceExecuted')).toBe('EXECUTED');
    expect(deriveStatus(cfg(false), 'GuardRevoked')).toBe('REVOKED');
    expect(deriveStatus(cfg(false), 'InheritanceFailed')).toBe('REVOKED');
    expect(deriveStatus(cfg(false), null)).toBe('REVOKED');
  });
  it('deadline = lastPing + timeout', () => {
    expect(deadlineOf(cfg(true))).toBe(1_000n + 60n * 86_400n);
  });
});

describe('latestTerminal', () => {
  it('ignores pings, payouts, and failures that kept the guard active', () => {
    const events = [
      ev('InheritanceFailed', 9, { reason: '0x' }),
      ev('Pinged', 8),
      ev('BeneficiaryPaid', 7),
      ev('InheritanceExecuted', 7),
      ev('GuardSetup', 1),
    ];
    expect(latestTerminal(events)).toBe('InheritanceExecuted');
  });
  it('a re-setup after a revoke wins', () => {
    expect(latestTerminal([ev('GuardSetup', 5), ev('GuardRevoked', 3)])).toBe('GuardSetup');
  });
});

describe('describeTxError', () => {
  const revert = (errorName: string, args?: readonly unknown[]) =>
    new ContractFunctionExecutionError(
      new ContractFunctionRevertedError({
        abi: guardAbi,
        functionName: 'setupGuard',
        data: encodeErrorResult({ abi: guardAbi, errorName, args } as never),
      }),
      { abi: guardAbi, functionName: 'setupGuard', args: [TOKEN, 0n, []] },
    );

  it('decodes custom errors with their arguments', () => {
    expect(describeTxError(revert('BpsSumMismatch', [9_999n]))).toBe('Shares add up to 99.99%. They must total exactly 100%.');
    expect(describeTxError(revert('DuplicateBeneficiary', [1n]))).toBe('Heir 2 is listed twice.');
    expect(describeTxError(revert('InvalidBeneficiary', [0n]))).toMatch(/^Heir 1 is invalid/);
    expect(describeTxError(revert('GuardNotActive'))).toBe("You don't have an active vault.");
    expect(describeTxError(revert('InvalidTimeout'))).toMatch(/60 and 730 days/);
  });

  it('recognises a wallet rejection', () => {
    const e = new BaseError('wrapped', { cause: new UserRejectedRequestError(new Error('User denied')) });
    expect(describeTxError(e)).toBe('You rejected the request in your wallet.');
  });

  it('falls back to a one-line message', () => {
    expect(describeTxError(new Error('boom\nstack'))).toBe('boom');
  });
});
