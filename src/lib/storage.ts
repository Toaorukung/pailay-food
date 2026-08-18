import { kv } from './kv';
import { blobConfigured } from './demo';
import { randomId } from './ids';

/**
 * Image storage with a fallback.
 *
 * Configured deployments use Vercel Blob. Without it, images go into the KV
 * store instead, addressed by an unguessable id. That keeps slip upload and
 * menu photos working on a machine with no cloud accounts.
 *
 * The KV path is only sensible for modest volumes — a few hundred slips, not a
 * year of them — which matches the situation it exists for.
 */

const KV_SCHEME = 'kv://';
const IMAGE_TTL_SECONDS = 60 * 60 * 24 * 60;

export interface StoredImage {
  /** Opaque locator. Either an https Blob URL or a `kv://` reference. */
  url: string;
}

export async function putImage(
  prefix: string,
  data: Buffer,
  contentType: string,
  extension: string,
): Promise<StoredImage> {
  const id = `${prefix}/${randomId(12)}.${extension}`;

  if (blobConfigured()) {
    const { put } = await import('@vercel/blob');
    const blob = await put(id, data, {
      access: 'public',
      contentType,
      addRandomSuffix: true,
      cacheControlMaxAge: prefix === 'slips' ? 0 : 60 * 60 * 24 * 30,
    });
    return { url: blob.url };
  }

  const key = `img:${randomId(16)}`;
  await kv().set(
    key,
    { contentType, data: data.toString('base64') },
    { ex: IMAGE_TTL_SECONDS },
  );
  return { url: `${KV_SCHEME}${key}` };
}

export function isKvImage(url: string): boolean {
  return url.startsWith(KV_SCHEME);
}

export async function readImage(
  url: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (isKvImage(url)) {
    const stored = await kv()
      .get<{ contentType: string; data: string }>(url.slice(KV_SCHEME.length))
      .catch(() => null);
    if (!stored) return null;
    return {
      body: Buffer.from(stored.data, 'base64'),
      contentType: stored.contentType,
    };
  }

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return {
    body: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') ?? 'image/jpeg',
  };
}

/**
 * The address a browser can fetch. Blob URLs are already public; KV-backed
 * images are served through a route that reads them back out.
 *
 * Slips never go through this — they are admin evidence and are served only
 * through the authenticated proxy.
 */
export function publicImageUrl(url: string): string {
  return isKvImage(url)
    ? `/api/img/${encodeURIComponent(url.slice(KV_SCHEME.length))}`
    : url;
}
