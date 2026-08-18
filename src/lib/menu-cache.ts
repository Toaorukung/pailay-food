import { kv, K, MENU_TTL_SECONDS } from './kv';
import { loadCatalogFromSheets } from './sheets/repo';
import { standaloneMenu } from './demo';
import { bundledCatalog } from '@/data/bundled-catalog';
import type { MenuCatalog } from './types';

/**
 * The menu cache — the reason the app stays fast on a spreadsheet backend.
 *
 * Steady state: every guest page load costs zero Google Sheets calls. The
 * catalog is stored whole, with a `staleAt` marker rather than a hard TTL, so
 * an expiry never leaves the app with nothing to serve.
 *
 * Refresh is single-flight: when the entry goes stale, one request wins a lock
 * and reloads while everyone else keeps getting the slightly-old copy. Without
 * that, a busy dinner service would fire fifty simultaneous Sheets reads the
 * moment the TTL rolled over, and Google would start returning 429.
 */

interface CacheEntry {
  catalog: MenuCatalog;
  staleAt: number;
}

const CACHE_HOLD_SECONDS = 24 * 60 * 60;
const REFRESH_LOCK = 'menu:refresh:lock';
const REFRESH_LOCK_SECONDS = 30;

/** In-process memo: a warm lambda serving back-to-back requests skips Redis. */
let memo: { entry: CacheEntry; readAt: number } | null = null;
const MEMO_MS = 5_000;

export async function getCatalog(): Promise<MenuCatalog> {
  const now = Date.now();

  if (memo && now - memo.readAt < MEMO_MS) return memo.entry.catalog;

  const entry = await kv()
    .get<CacheEntry>(K.menu)
    .catch(() => null);

  if (entry?.catalog) {
    memo = { entry, readAt: now };
    if (entry.staleAt > now) return entry.catalog;

    // Stale but usable. Refresh in the background if we win the lock.
    const gotLock = await kv()
      .set(REFRESH_LOCK, 1, { nx: true, ex: REFRESH_LOCK_SECONDS })
      .catch(() => null);
    if (gotLock) {
      refresh().catch((err) => console.error('[menu] refresh failed', err));
    }
    return entry.catalog;
  }

  // Genuine cold miss — nothing to serve, so someone has to go to Sheets.
  return refresh();
}

export async function refresh(): Promise<MenuCatalog> {
  const version = await currentVersion();
  // No spreadsheet configured: serve the menu compiled into the app. Same
  // source as the seed script, so the dishes are identical either way.
  const catalog = standaloneMenu()
    ? bundledCatalog(version)
    : await loadCatalogFromSheets(version);
  const entry: CacheEntry = {
    catalog,
    staleAt: Date.now() + MENU_TTL_SECONDS * 1000,
  };
  memo = { entry, readAt: Date.now() };
  await kv()
    .set(K.menu, entry, { ex: CACHE_HOLD_SECONDS })
    .catch((err) => console.error('[menu] cache write failed', err));
  await kv().del(REFRESH_LOCK).catch(() => {});
  return catalog;
}

async function currentVersion(): Promise<number> {
  const v = await kv().get<number>(K.menuVersion).catch(() => null);
  return typeof v === 'number' ? v : 1;
}

/**
 * Called after any admin write that changes what guests see. Bumps the version
 * and drops the cache so the next read reloads. The version is what the client
 * compares against to know its downloaded copy is out of date.
 */
export async function bustMenuCache(): Promise<number> {
  const version = await kv().incr(K.menuVersion).catch(() => Date.now());
  memo = null;
  await kv().del(K.menu).catch(() => {});
  await kv().del(REFRESH_LOCK).catch(() => {});
  return version;
}
