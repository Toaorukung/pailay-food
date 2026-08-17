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
      'Cache-Control':
        'public, s-maxage=60, stale-while-revalidate=300, max-age=0',
      // Lets the client skip re-parsing when nothing changed.
      ETag: `"menu-${catalog.version}-${catalog.items.length}"`,
    },
  });
});
