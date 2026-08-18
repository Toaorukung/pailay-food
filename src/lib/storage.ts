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
 *
 * The Blob store is private. Payment slips are evidence of a bank transfer and
 * carry the guest's name and the amount; an unguessable public URL is not the
 * same thing as an access check, and a leaked link would stay valid forever.
 * Menu photos share the store and are therefore reached through the same
 * proxy, which costs one cached function call per photo and keeps exactly one
 * storage rule to reason about.
 */

const KV_SCHEME = 'kv://';
const IMAGE_TTL_SECONDS = 60 * 60 * 24 * 60;

/** Blobs live on `<store>.blob.vercel-storage.com`, public or private alike. */
const BLOB_HOST_SUFFIX = '.blob.vercel-storage.com';

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
      access: 'private',
      contentType,
      addRandomSuffix: true,
      // A slip can be re-uploaded after a rejection, so its cached copy must
      // not outlive the review. One minute is the shortest the SDK accepts.
      cacheControlMaxAge: prefix === 'slips' ? 60 : 60 * 60 * 24 * 30,
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

/**
 * True only for URLs inside our own Blob storage.
 *
 * `readImage` fetches whatever it is handed, and the proxy route hands it
 * whatever the caller encoded into the path. Without this check that route is
 * a server-side request forgery gadget — someone could point it at an internal
 * address and read the response through our own domain.
 */
export function isBlobImage(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && parsed.hostname.endsWith(BLOB_HOST_SUFFIX);
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

  if (!isBlobImage(url)) return null;

  const { get } = await import('@vercel/blob');
  const found = await get(url, { access: 'private' }).catch(() => null);
  if (!found || found.statusCode !== 200) return null;

  return {
    body: Buffer.from(await new Response(found.stream).arrayBuffer()),
    contentType: found.blob.contentType || 'image/jpeg',
  };
}

/**
 * The address a browser can fetch.
 *
 * Both backing stores are private, so this is always a path on our own domain.
 * The locator is base64url-encoded rather than placed in the path directly: a
 * Blob URL contains slashes that would otherwise split into extra segments.
 */
export function publicImageUrl(url: string): string {
  return `/api/img/${Buffer.from(url, 'utf8').toString('base64url')}`;
}

/**
 * Recovers the locator from a proxy path segment.
 *
 * Returns null for anything that is not one of our own two locator shapes, so
 * a caller cannot name an arbitrary key or an arbitrary host.
 */
export function decodeImageToken(token: string): string | null {
  const candidates = [
    Buffer.from(token, 'base64url').toString('utf8'),
    // Menu rows written before the switch to Blob hold the older form,
    // `/api/img/img%3A<key>`, and must keep resolving.
    safeDecode(token),
  ];

  for (const value of candidates) {
    if (!value) continue;
    if (value.startsWith('img:')) return `${KV_SCHEME}${value}`;
    if (isKvImage(value) && value.slice(KV_SCHEME.length).startsWith('img:')) return value;
    if (isBlobImage(value)) return value;
  }
  return null;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
