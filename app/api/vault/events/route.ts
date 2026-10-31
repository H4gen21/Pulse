import { NextResponse } from 'next/server';
import { address as addressSchema } from '@/lib/validation';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { stringifyWithBigints } from '@/lib/guard-events';
import { LogScanError, logScanner } from '@/lib/guard-log-scan';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/vault/events?owner=0x… — the owner's Pulse events, newest first (public on-chain data).
 * Logs are read here with the server RPC so the browser never calls eth_getLogs.
 * Bigints are encoded as "123n" strings (see parseWithBigints).
 */
export async function GET(req: Request) {
  if (!(await rateLimit(`events:${clientIp(req)}`, 30))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  const parsed = addressSchema.safeParse(new URL(req.url).searchParams.get('owner'));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid or missing owner' }, { status: 400 });

  try {
    const body = await logScanner().getOwnerEvents(parsed.data);
    return new NextResponse(stringifyWithBigints(body), {
      headers: {
        'Content-Type': 'application/json',
        // Same answer for everyone; let the CDN absorb repeat loads.
        'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30',
      },
    });
  } catch (e) {
    console.error('GET /api/vault/events', e instanceof LogScanError ? `${e.code}: ${e.message}` : e);
    return NextResponse.json({ error: 'Activity is temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
