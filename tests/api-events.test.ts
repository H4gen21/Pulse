import { beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER = '0x20abcdef0123456789abcdef0123456789a1c876';

const allowed = vi.hoisted(() => ({ value: true }));
const getOwnerEvents = vi.hoisted(() => vi.fn());
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => allowed.value, clientIp: () => '127.0.0.1' }));
vi.mock('@/lib/guard-log-scan', async (orig) => ({
  ...(await orig<object>()),
  logScanner: () => ({ getOwnerEvents }),
}));

import { GET } from '@/app/api/vault/events/route';
import { LogScanError } from '@/lib/guard-log-scan';
import { parseWithBigints } from '@/lib/guard-events';

const get = (q: string) => GET(new Request(`http://localhost/api/vault/events${q}`));

beforeEach(() => {
  allowed.value = true;
  getOwnerEvents.mockReset();
});

describe('GET /api/vault/events', () => {
  it('returns events with bigints encoded, cacheable at the CDN', async () => {
    getOwnerEvents.mockResolvedValue({
      latest: 'GuardSetup',
      events: [{ name: 'Pinged', args: { nextDeadline: 99n }, txHash: '0xab', blockNumber: 7n, logIndex: 0, timestamp: 1 }],
    });
    const res = await get(`?owner=${OWNER.toUpperCase().replace('0X', '0x')}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('s-maxage=15');
    const body = parseWithBigints<{ events: { args: { nextDeadline: bigint }; blockNumber: bigint }[] }>(await res.text());
    expect(body.events[0].args.nextDeadline).toBe(99n);
    expect(body.events[0].blockNumber).toBe(7n);
    expect(getOwnerEvents).toHaveBeenCalledWith(OWNER); // normalized to lowercase
  });

  it('400 on a missing or bad owner', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?owner=0x123')).status).toBe(400);
    expect(getOwnerEvents).not.toHaveBeenCalled();
  });

  it('429 when rate limited, before touching the RPC', async () => {
    allowed.value = false;
    const res = await get(`?owner=${OWNER}`);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(getOwnerEvents).not.toHaveBeenCalled();
  });

  it('503 with a generic message (no RPC details) when the scan fails', async () => {
    getOwnerEvents.mockRejectedValue(new LogScanError('RPC allows 10-block windows at https://secret-rpc', 'RANGE_TOO_SMALL'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await get(`?owner=${OWNER}`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Activity is temporarily unavailable' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    err.mockRestore();
  });
});
