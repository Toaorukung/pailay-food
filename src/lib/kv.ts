import { Redis } from '@upstash/redis';
import { env } from './env';

/**
 * The hot store. Everything a guest touches lives here — sessions, carts,
 * open orders, the cached menu. Google Sheets is never on the request path.
 */
let client: Redis | null = null;

export function kv(): Redis {
  if (!client) {
    client = new Redis({
      url: env.upstashUrl,
      token: env.upstashToken,
      // Upstash's REST API is HTTP; a brief retry absorbs transient blips
      // without us having to thread retry logic through every call site.
      retry: { retries: 3, backoff: (n) => Math.min(2 ** n * 50, 500) },
    });
  }
  return client;
}

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
