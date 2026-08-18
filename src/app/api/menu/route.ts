import { getCatalog } from '@/lib/menu-cache';
import { handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * The public catalog. Identical for every guest, so it is safe to let Vercel's
 * edge cache hold it too — that layer absorbs most of the traffic before it
 * ever reaches a function, on top of the Redis cache behind it.
 */
export const GET = handler(async () => {
  const catalog = await getCatalog();

  return Response.json(catalog, {
    headers: {
      // Short: staff marking a dish sold out should reach guests in seconds,
      // not after a minute of edge cache. The server still rejects an order for
      // an unavailable dish, so this is about not offering it, not about safety.
      'Cache-Control':
        'public, s-maxage=10, stale-while-revalidate=60, max-age=0',
      // Lets the client skip re-parsing when nothing changed.
      ETag: `"menu-${catalog.version}-${catalog.items.length}"`,
    },
  });
});
