import { zeroAddress } from 'viem';

// The contract stores only `isActive`; NONE / REVOKED / EXECUTED are derived from the
// config plus the most recent lifecycle event for the owner.
export type GuardStatus = 'NONE' | 'ACTIVE' | 'REVOKED' | 'EXECUTED';

export type TerminalEvent = 'GuardSetup' | 'GuardRevoked' | 'InheritanceExecuted' | 'InheritanceFailed';

export type GuardConfig = {
  token: `0x${string}`;
  timeoutDuration: bigint;
  lastPingTimestamp: bigint;
  isActive: boolean;
};

/** `guards(owner)` returns a tuple; name its fields. */
export function toGuardConfig(t: readonly [`0x${string}`, bigint, bigint, boolean]): GuardConfig {
  return { token: t[0], timeoutDuration: t[1], lastPingTimestamp: t[2], isActive: t[3] };
}

/**
 * @param latest the newest of GuardSetup / GuardRevoked / InheritanceExecuted / InheritanceFailed
 *        for this owner, or null when logs are unavailable.
 */
export function deriveStatus(cfg: GuardConfig | undefined, latest: TerminalEvent | null): GuardStatus {
  if (!cfg || cfg.token === zeroAddress) return 'NONE';
  if (cfg.isActive) return 'ACTIVE';
  if (latest === 'InheritanceExecuted') return 'EXECUTED';
  // GuardRevoked, or InheritanceFailed with a revert reason (the contract deactivates the
  // guard and funds stay with the owner). Without logs, an inactive configured guard ended
  // one of these ways; revoked is the conservative label.
  return 'REVOKED';
}

/** The contract has no deadline getter: deadline = lastPingTimestamp + timeoutDuration. */
export function deadlineOf(cfg: GuardConfig): bigint {
  return cfg.lastPingTimestamp + cfg.timeoutDuration;
}
