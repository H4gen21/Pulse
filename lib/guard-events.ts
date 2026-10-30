import { getAbiItem, type AbiEvent, type PublicClient } from 'viem';
import { guardAbi, GUARD_ADDRESS } from './contract';
import type { TerminalEvent } from './guard-status';

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

// Block the contract was deployed in; scanning from 0 is slow and many RPCs reject it.
const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_GUARD_DEPLOY_BLOCK || 0);
const CHUNK = 10_000n; // fallback window for RPCs that cap the getLogs block range
const MAX_CHUNKS = 30;

const eventItems = GUARD_EVENTS.map((name) => getAbiItem({ abi: guardAbi, name }) as AbiEvent);

async function scan(client: PublicClient, owner: `0x${string}`, fromBlock: bigint, toBlock: bigint) {
  // Every Pulse event has `owner` as its first indexed topic, so the RPC filters for us.
  const results = await Promise.all(
    eventItems.map((event) =>
      client.getLogs({ address: GUARD_ADDRESS, event, args: { owner }, fromBlock, toBlock } as never),
    ),
  );
  return results.flat().map(
    (l): GuardEvent => {
      const log = l as unknown as {
        eventName: GuardEventName;
        args: Record<string, unknown>;
        transactionHash: `0x${string}`;
        blockNumber: bigint;
        logIndex: number;
      };
      return {
        name: log.eventName,
        args: log.args,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
      };
    },
  );
}

const byNewest = (a: GuardEvent, b: GuardEvent) =>
  a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1;

/** All Pulse events for `owner`, newest first. Falls back to a chunked backwards scan. */
export async function fetchGuardEvents(client: PublicClient, owner: `0x${string}`): Promise<GuardEvent[]> {
  const latest = await client.getBlockNumber();
  let events: GuardEvent[];
  try {
    events = await scan(client, owner, DEPLOY_BLOCK, latest);
  } catch {
    events = [];
    let to = latest;
    for (let i = 0; i < MAX_CHUNKS && to >= DEPLOY_BLOCK; i++) {
      const from = to - CHUNK + 1n > DEPLOY_BLOCK ? to - CHUNK + 1n : DEPLOY_BLOCK;
      const chunk = await scan(client, owner, from, to);
      events.push(...chunk);
      // Status only depends on events since the most recent setup.
      if (chunk.some((e) => e.name === 'GuardSetup')) break;
      to = from - 1n;
    }
  }
  return events.sort(byNewest);
}

/** Attach block timestamps to the newest `limit` events. */
export async function withTimestamps(client: PublicClient, events: GuardEvent[], limit = 25) {
  const head = events.slice(0, limit);
  const blocks = [...new Set(head.map((e) => e.blockNumber))];
  const times = new Map(
    await Promise.all(
      blocks.map(async (n) => [n, Number((await client.getBlock({ blockNumber: n })).timestamp)] as const),
    ),
  );
  return head.map((e) => ({ ...e, timestamp: times.get(e.blockNumber) }));
}

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
