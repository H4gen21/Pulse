import type { TerminalEvent } from './guard-status';

// Client-safe: types, (de)serialization and status helpers only. Log scanning runs on the
// server (lib/guard-log-scan.ts behind GET /api/vault/events); the browser never calls eth_getLogs.

export const GUARD_EVENTS = [
  'GuardSetup',
  'Pinged',
  'GuardRevoked',
  'InheritanceExecuted',
  'InheritanceFailed',
  'BeneficiaryPaid',
  'BeneficiaryTransferFailed',
] as const;
export type GuardEventName = (typeof GUARD_EVENTS)[number];

export type GuardEvent = {
  name: GuardEventName;
  args: Record<string, unknown>;
  txHash: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
  timestamp?: number; // unix seconds
};

/** Body of GET /api/vault/events. `events` is newest first. */
export type GuardEventsResponse = { latest: TerminalEvent | null; events: GuardEvent[] };

// JSON has no bigint: encode as "123n" and revive on the client. Addresses/hashes never match.
const BIGINT_RE = /^-?\d+n$/;
export const stringifyWithBigints = (value: unknown) =>
  JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
export const parseWithBigints = <T>(text: string): T =>
  JSON.parse(text, (_k, v) => (typeof v === 'string' && BIGINT_RE.test(v) ? BigInt(v.slice(0, -1)) : v));

export const byNewest = (a: GuardEvent, b: GuardEvent) =>
  a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1;

export function latestTerminal(events: GuardEvent[]): TerminalEvent | null {
  const e = events.find(
    (x) =>
      x.name === 'GuardSetup' ||
      x.name === 'GuardRevoked' ||
      x.name === 'InheritanceExecuted' ||
      (x.name === 'InheritanceFailed' && x.args.reason !== '0x'), // empty reason keeps the guard active
  );
  return (e?.name as TerminalEvent | undefined) ?? null;
}
