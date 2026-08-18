import { requireAdmin } from '@/lib/admin/auth';
import { kv, K } from '@/lib/kv';
import { serviceStatus } from '@/lib/demo';
import { handler, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Where the milliseconds actually go.
 *
 * Latency guesses are usually wrong — this project spent a day believing the
 * cost was a trans-Pacific hop when the Redis instance had been in Singapore
 * the whole time. This measures each dependency from inside the function, in
 * the region the function really runs in, so the next decision is made on
 * numbers rather than on architecture diagrams.
 */
export const GET = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'MANAGER');
  if (!auth.ok) return auth.response;

  const time = async <T>(fn: () => Promise<T>) => {
    const start = performance.now();
    try {
      await fn();
      return Math.round((performance.now() - start) * 10) / 10;
    } catch {
      return -1;
    }
  };

  // One round trip each, run in sequence so they do not mask one another.
  const redisWrite = await time(() =>
    kv().set('diag:ping', Date.now(), { ex: 60 }),
  );
  const redisRead = await time(() => kv().get('diag:ping'));
  const redisMulti = await time(async () => {
    for (let i = 0; i < 5; i++) await kv().get('diag:ping');
  });
  const menuCache = await time(() => kv().get(K.menu));

  const sheets = await time(async () => {
    const { batchGet } = await import('@/lib/sheets/client');
    const { fullRange, TABS } = await import('@/lib/sheets/schema');
    await batchGet([fullRange(TABS.Tables)]);
  });

  return ok({
    region: process.env.VERCEL_REGION ?? 'unknown',
    services: serviceStatus(),
    ms: {
      redisWrite,
      redisRead,
      /** Five sequential reads — divide by five for a per-call round trip. */
      redisFiveReads: redisMulti,
      menuCacheRead: menuCache,
      sheetsOneCall: sheets,
    },
  });
});
