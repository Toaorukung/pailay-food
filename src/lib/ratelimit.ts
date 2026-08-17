import { kv, K } from './kv';
import type { NextRequest } from 'next/server';

/**
 * Fixed-window rate limiting on Redis. One INCR per check.
 *
 * Fixed windows can let through up to 2x the limit across a window boundary.
 * For the things guarded here — abusive ordering, slip-upload spam, admin
 * password guessing — that slack does not matter, and the cost of a precise
 * sliding window (a sorted set per identity) is not worth paying on the hot
 * path.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetInSeconds: number;
}

export const LIMITS = {
  /** Placing orders — generous; a big group really does order a lot. */
  order: { limit: 20, windowSeconds: 60 },
  /** Cart edits. */
  cart: { limit: 120, windowSeconds: 60 },
  /** Session creation per IP — stops someone farming session ids. */
  session: { limit: 30, windowSeconds: 300 },
  /** Slip uploads. Each one costs storage and admin attention. */
  slip: { limit: 5, windowSeconds: 600 },
  /** Password guessing. */
  login: { limit: 5, windowSeconds: 900 },
  /** Generic read endpoints. */
  read: { limit: 300, windowSeconds: 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

export async function rateLimit(
  bucket: LimitName,
  identity: string,
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = LIMITS[bucket];
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = K.rateLimit(bucket, `${identity}:${window}`);

  try {
    const count = await kv().incr(key);
    if (count === 1) await kv().expire(key, windowSeconds);
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      resetInSeconds: windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds),
    };
  } catch (err) {
    // Redis unreachable. Failing open keeps the restaurant serving food;
    // failing closed would take the whole ordering system down with the cache.
    console.error('[ratelimit] check failed, allowing', bucket, err);
    return { ok: true, remaining: 0, resetInSeconds: windowSeconds };
  }
}

/** Best-effort client IP behind Vercel's proxy. */
export function clientIp(req: NextRequest | Request): string {
  const h = req.headers;
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return h.get('x-real-ip') ?? 'unknown';
}
