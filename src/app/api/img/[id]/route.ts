import { readImage, decodeImageToken } from '@/lib/storage';
import { handler, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Serves menu photos. Public by design — these are the pictures on the menu.
 *
 * Both backing stores are private, so every menu photo is read through here.
 * The token decodes to one of exactly two locator shapes — a `img:` KV key or
 * a URL inside our own Blob store — and anything else is a 404, so this cannot
 * be pointed at an arbitrary key or an arbitrary host.
 *
 * Slips never come through here. They are admin evidence and are served only
 * by the authenticated proxy at /api/admin/slip/[paymentId].
 */
export const GET = handler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const locator = decodeImageToken(id);
    if (!locator) return fail('ไม่พบรูปภาพ', 404);

    const image = await readImage(locator);
    if (!image) return fail('ไม่พบรูปภาพ', 404);

    return new Response(new Uint8Array(image.body), {
      headers: {
        'Content-Type': image.contentType,
        // The locator carries a random id, so a given URL always means the
        // same bytes. Caching hard is what keeps the proxy off the hot path.
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      },
    });
  },
);
