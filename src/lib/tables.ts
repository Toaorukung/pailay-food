import { kv, K } from './kv';
import { loadTables } from './sheets/repo';
import { standaloneMenu } from './demo';
import { BUNDLED_TABLES } from '@/data/bundled-catalog';
import type { VillaTable } from './types';

/**
 * Villa/table lookup, cached like the menu.
 *
 * Every QR scan needs this, and the list changes maybe once a month. Reading
 * the Tables tab per scan would put a Sheets round trip in front of the very
 * first thing a guest does.
 */

const CACHE_KEY = K.tables;
const STALE_MS = 5 * 60 * 1000;
const HOLD_SECONDS = 24 * 60 * 60;

interface Entry {
  tables: VillaTable[];
  staleAt: number;
}

let memo: Entry | null = null;

export async function getTables(): Promise<VillaTable[]> {
  const now = Date.now();
  if (memo && memo.staleAt > now) return memo.tables;

  const cached = await kv().get<Entry>(CACHE_KEY).catch(() => null);
  if (cached?.tables) {
    memo = cached;
    if (cached.staleAt > now) return cached.tables;
    // Serve the stale copy and refresh behind it — a scan should never wait
    // on Google.
    refreshTables().catch((err) => console.error('[tables] refresh failed', err));
    return cached.tables;
  }

  return refreshTables();
}

export async function refreshTables(): Promise<VillaTable[]> {
  const tables = standaloneMenu() ? BUNDLED_TABLES : await loadTables();
  const entry: Entry = { tables, staleAt: Date.now() + STALE_MS };
  memo = entry;
  await kv().set(CACHE_KEY, entry, { ex: HOLD_SECONDS }).catch(() => {});
  return tables;
}

export async function bustTablesCache(): Promise<void> {
  memo = null;
  await kv().del(CACHE_KEY).catch(() => {});
}

export async function getTable(id: string): Promise<VillaTable | null> {
  const tables = await getTables();
  return tables.find((t) => t.id === id) ?? null;
}
