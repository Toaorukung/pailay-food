import { readImage } from '@/lib/storage';
import { handler, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Serves menu photos held in the KV store, for deployments without Blob
 * storage. Public by design — these are the pictures on the menu.
 *
 * The id is used only as a key lookup, never as a path, so a traversal
 * attempt resolves to a missing key rather than a file on disk. Only keys
 * under the `img:` namespace are reachable.
 */
export const GET = handler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const key = decodeURIComponent(id);

    if (!key.startsWith('img:')) return fail('ไม่พบรูปภาพ', 404);

    const image = await readImage(`kv://${key}`);
    if (!image) return fail('ไม่พบรูปภาพ', 404);

    return new Response(new Uint8Array(image.body), {
      headers: {
        'Content-Type': image.contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  },
);
