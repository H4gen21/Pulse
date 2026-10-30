import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem';
import { chain } from './chain';
import { IS_STAGING } from './pulse-env';

// Readable messages for InheritanceGuard custom errors (lib/abi), keyed by error name.
const MESSAGES: Record<string, (args: readonly unknown[]) => string> = {
  InvalidToken: () => 'The token address is invalid.',
  InvalidTimeout: () =>
    IS_STAGING ? 'The period is outside the staging contract’s limits.' : 'The period must be between 60 and 730 days.',
  InvalidBeneficiaryCount: () => 'Add between 1 and 10 heirs.',
  InvalidBeneficiary: ([i]) =>
    `Heir ${Number(i) + 1} is invalid: it can't be empty, your own wallet, or less than 1%.`,
  DuplicateBeneficiary: ([i]) => `Heir ${Number(i) + 1} is listed twice.`,
  BpsSumMismatch: ([total]) => `Shares add up to ${Number(total) / 100}%. They must total exactly 100%.`,
  GuardNotActive: () => "You don't have an active vault.",
  NotForwarder: () => 'Only Chainlink Automation can do that.',
  TokenCallFailed: () => 'The token contract did not respond as expected.',
};

/** Turn a wagmi/viem error into one sentence a person can act on. */
export function describeTxError(e: unknown): string {
  if (!(e instanceof BaseError)) return e instanceof Error ? e.message.split('\n')[0] : 'Transaction failed.';

  const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
  if (revert instanceof ContractFunctionRevertedError) {
    const name = revert.data?.errorName;
    if (name && MESSAGES[name]) return MESSAGES[name](revert.data?.args ?? []);
    if (revert.reason) return `The contract rejected this: ${revert.reason}`;
  }
  if (e.walk((x) => x instanceof UserRejectedRequestError || (x as { code?: number }).code === 4001)) {
    return 'You rejected the request in your wallet.';
  }
  const names = new Set<string>();
  e.walk((x) => {
    names.add((x as Error).name);
    return false;
  });
  if (names.has('ChainMismatchError') || names.has('ConnectorChainMismatchError')) {
    return `Switch your wallet to ${chain.name} and try again.`;
  }
  if (names.has('InsufficientFundsError')) return `Not enough ETH on ${chain.name} to pay for gas.`;
  return e.shortMessage || 'Transaction failed.';
}
