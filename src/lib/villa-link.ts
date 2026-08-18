import { createHash, randomBytes } from 'node:crypto';
import { env } from './env';
import type { VillaTable } from './types';

/**
 * The printed link: `https://<app>/<slug>/<code>`.
 *
 * Two segments, each doing one job. The slug is readable, so a guest glancing
 * at the sticker can tell it is their villa. The code is random, so knowing
 * the villa name is not enough to open a session for it — that is the only
 * thing standing between a passer-by and someone else's bill.
 *
 * Scanning it reaches a session, and a second phone scanning the same sticker
 * while that session is open joins it rather than starting a rival bill. The
 * sticker itself never changes.
 */

/** Latin-safe, lowercase, hyphenated. Thai villa names fall back to the id. */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'villa';
}

/**
 * A deterministic code for rows written before the column existed.
 *
 * Derived from the villa id and the app's table secret, so it is stable across
 * restarts (a link that changed on every deploy would be useless on a printed
 * sticker) and still not guessable from the id alone.
 */
export function fallbackCode(tableId: string): string {
  return createHash('sha256')
    .update(`villa-code:${tableId}:${env.tableSecret}`)
    .digest('base64url')
    .slice(0, 10);
}

/** A fresh code for a newly created villa. */
export function newVillaCode(): string {
  return randomBytes(8).toString('base64url').slice(0, 10);
}

export function villaPath(table: Pick<VillaTable, 'slug' | 'qrCode'>): string {
  return `/${encodeURIComponent(table.slug)}/${encodeURIComponent(table.qrCode)}`;
}

/** Absolute URL, which is what actually goes into the QR image. */
export function villaUrl(table: Pick<VillaTable, 'slug' | 'qrCode'>): string {
  return `${env.appUrl}${villaPath(table)}`;
}

/** Where a guest sits once a session exists. */
export function sessionPath(slug: string, sessionId: string): string {
  return `/${encodeURIComponent(slug)}/${encodeURIComponent(sessionId)}`;
}

/**
 * Villa slugs have to be unique, or `/villa-1/<code>` becomes ambiguous and a
 * guest could land on the wrong bill. Called before saving a villa.
 */
export function slugConflict(
  tables: VillaTable[],
  slug: string,
  selfId: string | null,
): boolean {
  return tables.some((t) => t.slug === slug && t.id !== selfId);
}
