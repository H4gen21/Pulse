import {
  createPublicClient,
  encodeEventTopics,
  formatLog,
  http,
  isAddress,
  pad,
  parseEventLogs,
  toHex,
  type Hex,
  type RpcLog,
} from 'viem';
import { chain } from './chain';
import { guardAbi, GUARD_ADDRESS } from './contract';
import { byNewest, GUARD_EVENTS, latestTerminal, type GuardEvent, type GuardEventsResponse } from './guard-events';

// SERVER ONLY. Reads the guard's event logs for one owner and caches them per instance.
//
// Scans forward from the deploy block in windows of at most 10,000 blocks, one eth_getLogs per
// window (all seven events OR-ed in topic0, the owner in topic1, so the RPC does the filtering).
// When the RPC rejects the window size it shrinks to the size the error names (or halves). It
// never sends JSON-RPC batches and stops instead of spending more than MAX_CALLS requests.

if (typeof window !== 'undefined') throw new Error('lib/guard-log-scan is server-only');

export const MAX_CHUNK = 10_000;
const MAX_CALLS = 120; // per request; ~1.2M blocks at full window size
const CONCURRENCY = 4;
const FRESH_MS = 15_000; // serve cached results this long without touching the RPC
const KEEP_MS = 10 * 60_000; // keep the incremental cursor this long
const MAX_ENTRIES = 500;
const TIMESTAMPS = 25; // newest events that get a block timestamp
const MAX_EVENTS = 100; // newest events returned to the client

export class LogScanError extends Error {
  constructor(
    message: string,
    readonly code: 'RANGE_TOO_SMALL' | 'NO_CONTRACT' | 'RPC',
  ) {
    super(message);
    this.name = 'LogScanError';
  }
}

type Filter = { address: Hex; fromBlock: Hex; toBlock: Hex; topics: (Hex | Hex[] | null)[] };
export type LogClient = {
  getBlockNumber(): Promise<bigint>;
  getBlock(args: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
  getCode(args: { address: Hex; blockNumber?: bigint }): Promise<Hex | undefined>;
  getLogs(filter: Filter): Promise<RpcLog[]>;
};

/**
 * If `err` says the block range (or result size) was too large, the window size to try next:
 * the limit named in the message, or 0 to halve. `undefined` for any other error.
 */
export function rangeLimitFrom(err: unknown): number | undefined {
  const parts: string[] = [];
  for (let e = err as { message?: unknown; details?: unknown; status?: unknown; cause?: unknown } | undefined, i = 0; e && i < 6; e = e.cause as typeof e, i++) {
    parts.push(String(e.message ?? ''), String(e.details ?? ''));
    if (e.status === 413) parts.push('payload too large');
  }
  const text = parts.join(' ');
  const named =
    /limited to an? (\d+)(?: block)? range/i.exec(text) ??
    /up to an? (\d+)[- ]block range/i.exec(text) ??
    /ranges? over (\d+) blocks/i.exec(text) ??
    /(?:max(?:imum)?|limit)[^0-9]{0,24}(\d+) blocks/i.exec(text);
  if (named) return Number(named[1]);
  if (/block range|range (?:is )?too (?:large|wide)|too many (?:blocks|results)|more than \d+ results|response size|payload too large|log response size exceeded|query timeout/i.test(text)) return 0;
  return undefined;
}

const TOPIC0: Hex[] = GUARD_EVENTS.map((eventName) => encodeEventTopics({ abi: guardAbi, eventName } as never)[0] as Hex);

export function createLogScanner(opts: { client: LogClient; guard: Hex; deployBlock?: number; now?: () => number }) {
  const { client, guard } = opts;
  const now = opts.now ?? Date.now;
  let chunk = MAX_CHUNK; // remembered across requests once the RPC tells us its limit
  let deployBlock: Promise<number> | undefined;

  type Entry = { events: GuardEvent[]; scannedTo: number; checkedAt: number; times: Map<bigint, number> };
  const cache = new Map<string, Entry>();
  const inflight = new Map<string, Promise<GuardEventsResponse>>();

  /** Earliest block with code at the guard address (binary search), when no env var is set. */
  async function findDeployBlock(): Promise<number> {
    if (opts.deployBlock && opts.deployBlock > 0) return opts.deployBlock;
    const latest = Number(await client.getBlockNumber());
    if (!(await client.getCode({ address: guard }))) throw new LogScanError(`No contract at ${guard}`, 'NO_CONTRACT');
    let lo = 0;
    let hi = latest;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const code = await client.getCode({ address: guard, blockNumber: BigInt(mid) });
      if (code && code !== '0x') hi = mid;
      else lo = mid;
    }
    console.warn(`guard-log-scan: GUARD_DEPLOY_BLOCK is not set; found ${hi}. Set it to skip this search.`);
    return hi;
  }

  async function scan(owner: Hex, from: number, to: number): Promise<GuardEvent[]> {
    const topics = [TOPIC0, pad(owner)];
    const out: GuardEvent[] = [];
    let cursor = from;
    let calls = 0;
    while (cursor <= to) {
      if (calls + Math.ceil((to - cursor + 1) / chunk) > MAX_CALLS) {
        throw new LogScanError(
          `RPC allows ${chunk}-block eth_getLogs windows; ${to - cursor + 1} blocks left would need more than ${MAX_CALLS} requests. Use an RPC with a larger range (LOGS_RPC_URL).`,
          'RANGE_TOO_SMALL',
        );
      }
      const wave: [number, number][] = [];
      while (wave.length < CONCURRENCY && cursor <= to) {
        const end = Math.min(cursor + chunk - 1, to);
        wave.push([cursor, end]);
        cursor = end + 1;
      }
      calls += wave.length;
      const results = await Promise.allSettled(
        wave.map(([a, b]) => client.getLogs({ address: guard, fromBlock: toHex(a), toBlock: toHex(b), topics })),
      );
      const failed = results.findIndex((r) => r.status === 'rejected');
      for (const r of results.slice(0, failed < 0 ? undefined : failed)) {
        const logs = parseEventLogs({ abi: guardAbi, logs: (r as PromiseFulfilledResult<RpcLog[]>).value.map((l) => formatLog(l)) });
        for (const log of logs) {
          out.push({
            name: log.eventName as GuardEvent['name'],
            args: log.args as Record<string, unknown>,
            txHash: log.transactionHash!,
            blockNumber: log.blockNumber!,
            logIndex: log.logIndex!,
          });
        }
      }
      if (failed >= 0) {
        const err = (results[failed] as PromiseRejectedResult).reason;
        const limit = rangeLimitFrom(err);
        if (limit === undefined) throw new LogScanError(`eth_getLogs failed: ${String(err?.shortMessage ?? err?.message ?? err)}`, 'RPC');
        const next = limit > 0 && limit < chunk ? limit : Math.floor(chunk / 2);
        if (next < 1) throw new LogScanError('RPC rejects every eth_getLogs range', 'RANGE_TOO_SMALL');
        chunk = next;
        cursor = wave[failed][0]; // redo from the failed window; later windows in the wave are refetched
      }
    }
    return out;
  }

  async function timestamps(entry: Entry, events: GuardEvent[]) {
    const missing = [...new Set(events.map((e) => e.blockNumber))].filter((n) => !entry.times.has(n));
    for (let i = 0; i < missing.length; i += CONCURRENCY) {
      await Promise.all(
        missing.slice(i, i + CONCURRENCY).map(async (n) => {
          entry.times.set(n, Number((await client.getBlock({ blockNumber: n })).timestamp));
        }),
      );
    }
  }

  async function load(owner: Hex): Promise<GuardEventsResponse> {
    const prev = cache.get(owner);
    const latest = Number(await client.getBlockNumber());
    deployBlock ??= findDeployBlock().catch((e) => {
      deployBlock = undefined; // retry discovery next time
      throw e;
    });
    const start = prev ? prev.scannedTo + 1 : await deployBlock;
    const fresh = start <= latest ? await scan(owner, start, latest) : [];

    const seen = new Set(prev?.events.map((e) => `${e.txHash}:${e.logIndex}`));
    const events = [...(prev?.events ?? []), ...fresh.filter((e) => !seen.has(`${e.txHash}:${e.logIndex}`))].sort(byNewest);
    const entry: Entry = { events, scannedTo: Math.max(latest, prev?.scannedTo ?? 0), checkedAt: now(), times: prev?.times ?? new Map() };
    const head = events.slice(0, TIMESTAMPS);
    await timestamps(entry, head);

    cache.delete(owner); // re-insert so Map order is least-recently-used first
    cache.set(owner, entry);
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    return respond(entry);
  }

  const respond = (entry: Entry): GuardEventsResponse => ({
    latest: latestTerminal(entry.events),
    events: entry.events.slice(0, MAX_EVENTS).map((e) => ({ ...e, timestamp: entry.times.get(e.blockNumber) })),
  });

  /** Events for `owner` (lowercase 0x address), newest first. */
  async function getOwnerEvents(owner: Hex): Promise<GuardEventsResponse> {
    const key = owner.toLowerCase() as Hex;
    const hit = cache.get(key);
    if (hit && now() - hit.checkedAt < FRESH_MS) return respond(hit);
    if (hit && now() - hit.checkedAt > KEEP_MS) cache.delete(key);
    let p = inflight.get(key);
    if (!p) {
      p = load(key).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    return p;
  }

  return { getOwnerEvents };
}

let shared: ReturnType<typeof createLogScanner> | undefined;

/** Process-wide scanner on LOGS_RPC_URL (falls back to RPC_URL, then the chain's public RPC). */
export function logScanner() {
  if (!isAddress(GUARD_ADDRESS)) throw new LogScanError('NEXT_PUBLIC_GUARD_CONTRACT_ADDRESS is not set', 'NO_CONTRACT');
  if (!shared) {
    // One request per call: no JSON-RPC batching, one retry, bounded wait.
    const opts = { batch: false, retryCount: 1, timeout: 10_000 } as const;
    const logs = createPublicClient({ chain, transport: http(process.env.LOGS_RPC_URL || process.env.RPC_URL || undefined, opts) });
    // Deploy-block discovery reads historical code, which pruned log RPCs can't serve: use RPC_URL
    // (or the chain's public RPC; both are archive nodes on Base).
    const archive = createPublicClient({ chain, transport: http(process.env.RPC_URL || undefined, opts) });
    const client: LogClient = {
      getBlockNumber: () => logs.getBlockNumber({ cacheTime: 2_000 }),
      getBlock: (a) => logs.getBlock(a),
      getCode: (a) => archive.getCode(a),
      getLogs: (filter) => logs.request({ method: 'eth_getLogs', params: [filter] }) as Promise<RpcLog[]>,
    };
    const env = Number(process.env.GUARD_DEPLOY_BLOCK || process.env.NEXT_PUBLIC_GUARD_DEPLOY_BLOCK || 0);
    shared = createLogScanner({ client, guard: GUARD_ADDRESS, deployBlock: Number.isFinite(env) ? env : 0 });
  }
  return shared;
}
