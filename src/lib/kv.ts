import { Redis } from '@upstash/redis';
import { env } from './env';
import { redisConfigured, warnOnce } from './demo';
import { memoryStore, type MemoryStore } from './memory-store';

/**
 * The hot store. Everything a guest touches lives here — sessions, carts,
 * open orders, the cached menu. Google Sheets is never on the request path.
 *
 * Falls back to an in-process store when Upstash is not configured, so the app
 * runs with no accounts at all. That fallback is correct for a single
 * long-running server and wrong for serverless, where each instance would have
 * its own memory — see memory-store.ts.
 */
type KvClient = Pick<
  Redis,
  | 'get' | 'set' | 'del' | 'incr' | 'expire' | 'mget' | 'mset'
  | 'rpush' | 'lpop' | 'llen' | 'lrange' | 'sadd' | 'zadd' | 'zrem' | 'zrange'
>;

let client: KvClient | null = null;

export function kv(): KvClient {
  if (!client) {
    warnOnce();
    client = redisConfigured()
      ? new Redis({
          url: env.upstashUrl,
          token: env.upstashToken,
          // Upstash's REST API is HTTP; a brief retry absorbs transient blips
          // without us having to thread retry logic through every call site.
          retry: { retries: 3, backoff: (n) => Math.min(2 ** n * 50, 500) },
        })
      : (memoryStore() as unknown as KvClient);
  }
  return client;
}

/** Escape hatch for tests that need to reset between cases. */
export function __resetKvClient(): void {
  client = null;
}

export type { MemoryStore };

/** Key namespace. Kept in one place so nothing collides by accident. */
export const K = {
  menu: 'menu:cache',
  menuVersion: 'menu:version',
  session: (id: string) => `sess:${id}`,
  tableOpenSession: (tableId: string) => `table:open:${tableId}`,
  cart: (sessionId: string) => `cart:${sessionId}`,
  sessionOrders: (sessionId: string) => `sess:orders:${sessionId}`,
  order: (id: string) => `order:${id}`,
  liveOrders: 'orders:live',
  payment: (id: string) => `pay:${id}`,
  pendingPayments: 'pay:pending',
  syncQueue: 'sync:queue',
  syncDead: 'sync:dead',
  syncLock: 'sync:lock',
  syncSeen: (key: string) => `sync:seen:${key}`,
  rateLimit: (bucket: string, id: string) => `rl:${bucket}:${id}`,
  ordersByDay: (day: string) => `orders:day:${day}`,
  openSessions: 'sessions:open',
  sheetsCallCount: (minute: string) => `metrics:sheets:${minute}`,
  googleToken: 'google:access_token',
  adminLoginFail: (id: string) => `admin:fail:${id}`,
} as const;

/** Seconds. Session lives 12h unless closed sooner. */
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
/** Menu cache TTL. Busted explicitly on every admin write, so this is a floor. */
export const MENU_TTL_SECONDS = 300;
