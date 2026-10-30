import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Shared limiter (Upstash Redis) when UPSTASH_REDIS_REST_URL/TOKEN are set. Otherwise, or if Redis
// errors, falls back to an in-memory fixed window: per-instance only on Vercel, but never crashes.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

const limiters = new Map<number, Ratelimit>();
const hits = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

/** Returns true if the request is allowed. `limit` requests per minute per key. */
export async function rateLimit(key: string, limit = 30): Promise<boolean> {
  if (redis) {
    let limiter = limiters.get(limit);
    if (!limiter) {
      limiter = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(limit, '60 s'), prefix: 'pulse:rl' });
      limiters.set(limit, limiter);
    }
    try {
      return (await limiter.limit(key)).success;
    } catch (e) {
      console.error('rate-limit: Upstash unavailable, using in-memory fallback', e);
    }
  }
  return memoryLimit(key, limit, 60_000);
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
