import { describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, HttpRequestError, pad, toHex, type Hex, type RpcLog } from 'viem';
import { guardAbi } from '@/lib/contract';
import { createLogScanner, MAX_CHUNK, rangeLimitFrom, type LogClient } from '@/lib/guard-log-scan';
import { parseWithBigints, stringifyWithBigints } from '@/lib/guard-events';

const GUARD = '0x2baed723524ccd5315084941351191c9a6e77037' as Hex;
const OWNER = '0x20abcdef0123456789abcdef0123456789a1c876' as Hex;
const OTHER = '0x1111111111111111111111111111111111111111' as Hex;
const DEPLOY = 1_000_000;

type FakeLog = { block: number; owner: Hex; kind: 'Pinged' | 'GuardRevoked' };

function rpcLog({ block, owner, kind }: FakeLog, i: number): RpcLog {
  const topics = encodeEventTopics({ abi: guardAbi, eventName: kind, args: { owner } } as never) as Hex[];
  return {
    address: GUARD,
    topics: topics as [Hex, ...Hex[]],
    data: kind === 'Pinged' ? encodeAbiParameters([{ type: 'uint256' }], [BigInt(block) * 2n]) : '0x',
    blockNumber: toHex(block),
    blockHash: pad(toHex(block)),
    transactionHash: pad(toHex(block * 10 + i)),
    transactionIndex: '0x0',
    logIndex: toHex(i),
    removed: false,
  };
}

/** A chain whose RPC enforces `maxRange` blocks per eth_getLogs, like sepolia.base.org (200) or Alchemy free (10). */
function fakeChain(opts: { head: number; logs: FakeLog[]; maxRange?: number; rangeError?: (n: number) => Error }) {
  const getLogs = vi.fn(async (f: { address: Hex; fromBlock: Hex; toBlock: Hex; topics: (Hex | Hex[] | null)[] }) => {
    const from = Number(f.fromBlock);
    const to = Number(f.toBlock);
    const span = to - from + 1;
    if (opts.maxRange && span > opts.maxRange) {
      throw opts.rangeError?.(opts.maxRange) ?? new Error(`eth_getLogs is limited to a ${opts.maxRange} range`);
    }
    const [sigs, ownerTopic] = f.topics as [Hex[], Hex];
    return opts.logs
      .map((l, i) => ({ l, raw: rpcLog(l, i) }))
      .filter(({ l, raw }) => l.block >= from && l.block <= to && sigs.includes(raw.topics[0]!) && raw.topics[1] === ownerTopic)
      .map(({ raw }) => raw);
  });
  const client: LogClient = {
    getBlockNumber: vi.fn(async () => BigInt(opts.head)),
    getBlock: vi.fn(async ({ blockNumber }) => ({ timestamp: blockNumber * 2n })),
    getCode: vi.fn(async ({ blockNumber }) => (blockNumber === undefined || blockNumber >= BigInt(DEPLOY) ? '0x6080' : undefined) as Hex | undefined),
    getLogs,
  };
  return { client, getLogs };
}

const windows = (getLogs: ReturnType<typeof fakeChain>['getLogs']) =>
  getLogs.mock.calls.map(([f]) => [Number(f.fromBlock), Number(f.toBlock)] as const);

describe('createLogScanner', () => {
  it('scans forward from the deploy block in ≤10k windows, filtered by the owner topic', async () => {
    const { client, getLogs } = fakeChain({
      head: DEPLOY + 35_000,
      logs: [
        { block: DEPLOY + 10, owner: OWNER, kind: 'Pinged' },
        { block: DEPLOY + 25_000, owner: OTHER, kind: 'Pinged' },
        { block: DEPLOY + 34_999, owner: OWNER, kind: 'GuardRevoked' },
      ],
    });
    const scanner = createLogScanner({ client, guard: GUARD, deployBlock: DEPLOY });
    const res = await scanner.getOwnerEvents(OWNER);

    expect(res.events.map((e) => e.name)).toEqual(['GuardRevoked', 'Pinged']); // newest first, OTHER filtered out
    expect(res.latest).toBe('GuardRevoked');
    expect(res.events[1].args.nextDeadline).toBe(BigInt(DEPLOY + 10) * 2n);
    expect(res.events[0].timestamp).toBe((DEPLOY + 34_999) * 2);

    const w = windows(getLogs);
    expect(w[0][0]).toBe(DEPLOY); // starts at the deploy block, never block 0
    expect(w.at(-1)![1]).toBe(DEPLOY + 35_000);
    for (const [a, b] of w) expect(b - a + 1).toBeLessThanOrEqual(MAX_CHUNK);
    for (let i = 1; i < w.length; i++) expect(w[i][0]).toBe(w[i - 1][1] + 1); // contiguous, forward
    for (const [f] of getLogs.mock.calls) {
      expect(f.address).toBe(GUARD);
      expect(f.topics[1]).toBe(pad(OWNER));
      expect((f.topics[0] as Hex[]).length).toBe(7); // all seven events in one request
    }
  });

  it('shrinks the window to the limit an HTTP 413 names (sepolia.base.org) and keeps it', async () => {
    const err = (n: number) =>
      new HttpRequestError({ url: 'https://sepolia.base.org', status: 413, details: `{"code":-32614,"message":"eth_getLogs is limited to a ${n} range"}` });
    const { client, getLogs } = fakeChain({ head: DEPLOY + 2_000, maxRange: 200, rangeError: err, logs: [{ block: DEPLOY + 1_999, owner: OWNER, kind: 'Pinged' }] });
    const scanner = createLogScanner({ client, guard: GUARD, deployBlock: DEPLOY });
    const res = await scanner.getOwnerEvents(OWNER);
    expect(res.events).toHaveLength(1);
    const ok = windows(getLogs).filter(([a, b]) => b - a + 1 <= 200);
    expect(ok.length).toBe(11); // 2001 blocks / 200
    expect(getLogs.mock.calls.length).toBeLessThan(20);
  });

  it('gives up without spending requests when the RPC range is far too small (Alchemy free tier: 10 blocks)', async () => {
    const { client, getLogs } = fakeChain({
      head: DEPLOY + 400_000,
      maxRange: 10,
      rangeError: () => new Error('Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range.'),
      logs: [],
    });
    const scanner = createLogScanner({ client, guard: GUARD, deployBlock: DEPLOY });
    await expect(scanner.getOwnerEvents(OWNER)).rejects.toMatchObject({ code: 'RANGE_TOO_SMALL' });
    expect(getLogs.mock.calls.length).toBeLessThanOrEqual(4); // one wave, then stops
  });

  it('caches briefly, dedupes concurrent loads, then scans only new blocks', async () => {
    let t = 0;
    const chain = { head: DEPLOY + 5_000 };
    const { client, getLogs } = fakeChain({ head: 0, logs: [{ block: DEPLOY + 6_000, owner: OWNER, kind: 'Pinged' }] });
    client.getBlockNumber = vi.fn(async () => BigInt(chain.head));
    const scanner = createLogScanner({ client, guard: GUARD, deployBlock: DEPLOY, now: () => t });

    const [a, b] = await Promise.all([scanner.getOwnerEvents(OWNER), scanner.getOwnerEvents(OWNER)]);
    expect(a).toEqual(b);
    expect(getLogs).toHaveBeenCalledTimes(1);

    t = 5_000;
    await scanner.getOwnerEvents(OWNER);
    expect(getLogs).toHaveBeenCalledTimes(1); // fresh cache, no RPC

    t = 20_000;
    chain.head = DEPLOY + 7_000;
    const res = await scanner.getOwnerEvents(OWNER);
    expect(getLogs).toHaveBeenCalledTimes(2);
    expect(windows(getLogs)[1]).toEqual([DEPLOY + 5_001, DEPLOY + 7_000]); // incremental, forward
    expect(res.events).toHaveLength(1);
  });

  it('finds the deploy block by binary search when no env var is set', async () => {
    const { client, getLogs } = fakeChain({ head: DEPLOY + 100, logs: [] });
    const scanner = createLogScanner({ client, guard: GUARD });
    await scanner.getOwnerEvents(OWNER);
    expect(windows(getLogs)[0]).toEqual([DEPLOY, DEPLOY + 100]);
  });

  it('surfaces non-range RPC errors instead of retrying forever', async () => {
    const { client, getLogs } = fakeChain({ head: DEPLOY + 100, logs: [] });
    getLogs.mockRejectedValue(new Error('connection reset'));
    const scanner = createLogScanner({ client, guard: GUARD, deployBlock: DEPLOY });
    await expect(scanner.getOwnerEvents(OWNER)).rejects.toMatchObject({ code: 'RPC' });
    expect(getLogs).toHaveBeenCalledTimes(1);
  });
});

describe('rangeLimitFrom', () => {
  it.each([
    ['eth_getLogs is limited to a 200 range', 200],
    ['Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range.', 10],
    ['ranges over 10000 blocks are not supported on free plan', 10_000],
    ['query returned more than 10000 results', 0],
    ['block range is too large', 0],
  ])('%s -> %d', (msg, n) => expect(rangeLimitFrom(new Error(msg))).toBe(n));
  it('ignores unrelated errors', () => expect(rangeLimitFrom(new Error('execution reverted'))).toBeUndefined());
});

describe('bigint JSON round trip', () => {
  it('keeps bigints and leaves hex strings alone', () => {
    const v = { a: 12n, b: '0x12', c: [3n], d: '42' };
    expect(parseWithBigints(stringifyWithBigints(v))).toEqual(v);
  });
});
