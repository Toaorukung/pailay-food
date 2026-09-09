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

/**
 * Environment namespace for every key below.
 *
 * Vercel's Upstash integration attaches KV_REST_API_* to Preview and
 * Development as well as Production, so a preview deployment talks to the
 * live Redis. A preview build has no Sheets credentials, so it serves the
 * bundled menu — and would write that bundled menu into `menu:cache`, which
 * real guests read. It would also claim `table:open:{id}`, sending someone
 * who scans a printed QR into a preview session and losing their order onto
 * a bill nobody is watching.
 *
 * Production keys stay bare, so nothing existing has to move. Preview and
 * development deployments get their own prefix and can no longer touch live
 * state. A local run is left bare on purpose: `.env.local` here holds the
 * production credentials, and the seed and repair scripts are meant to bust
 * the real caches. Set KV_NAMESPACE to override in either direction —
 * `KV_NAMESPACE=local` isolates a laptop, `KV_NAMESPACE=` targets production
 * deliberately.
 */
function keyNamespace(): string {
  const explicit = process.env.KV_NAMESPACE;
  if (explicit !== undefined) return explicit.trim() ? `${explicit.trim()}:` : '';
  const env = process.env.VERCEL_ENV;
  return env && env !== 'production' ? `${env}:` : '';
}

const NS = keyNamespace();
const k = (key: string) => NS + key;

/** True when this process is writing to its own prefixed slice of Redis. */
export function kvNamespace(): string {
  return NS;
}

/** Key namespace. Kept in one place so nothing collides by accident. */
export const K = {
  menu: k('menu:cache'),
  menuVersion: k('menu:version'),
  tables: k('tables:cache'),
  bookings: k('bookings:cache'),
  session: (id: string) => k(`sess:${id}`),
  tableOpenSession: (tableId: string) => k(`table:open:${tableId}`),
  cart: (sessionId: string) => k(`cart:${sessionId}`),
  sessionOrders: (sessionId: string) => k(`sess:orders:${sessionId}`),
  order: (id: string) => k(`order:${id}`),
  liveOrders: k('orders:live'),
  payment: (id: string) => k(`pay:${id}`),
  pendingPayments: k('pay:pending'),
  syncQueue: k('sync:queue'),
  syncDead: k('sync:dead'),
  syncLock: k('sync:lock'),
  syncSeen: (key: string) => k(`sync:seen:${key}`),
  rateLimit: (bucket: string, id: string) => k(`rl:${bucket}:${id}`),
  ordersByDay: (day: string) => k(`orders:day:${day}`),
  openSessions: k('sessions:open'),
  sheetsCallCount: (minute: string) => k(`metrics:sheets:${minute}`),
  googleToken: k('google:access_token'),
  adminLoginFail: (id: string) => k(`admin:fail:${id}`),
  diagPing: k('diag:ping'),
} as const;

/** Seconds. Session lives 12h unless closed sooner. */
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
/** Menu cache TTL. Busted explicitly on every admin write, so this is a floor. */
export const MENU_TTL_SECONDS = 300;
