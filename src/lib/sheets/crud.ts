import { batchGet, batchUpdate, append, listTabs, addTabs, SheetsError } from './client';
import {
  HEADERS,
  TABS,
  appendRange,
  colLetter,
  fullRange,
  toObjects,
  toRow,
  DEFAULT_GUEST_FIELD_ROWS,
  type RawRow,
  type TabName,
} from './schema';
import { sheetsConfigured } from '../demo';
import { kv } from '../kv';

/**
 * Admin content writes.
 *
 * Unlike guest activity, these go to Google Sheets synchronously. The menu
 * cache is rebuilt from the spreadsheet, so if an edit were merely queued the
 * cache bust would race the write and the admin would see their change vanish.
 * Admin writes are also rare — a few dozen a day against tens of thousands of
 * guest actions — so the round trip costs nothing that matters.
 */

/** The id column is the first header of every content tab. */
function idColumn(tab: TabName): string {
  return HEADERS[tab][0];
}

/** Tab title -> numeric sheetId, needed for structural edits. Cached. */
let tabIdCache: Map<string, number> | null = null;

interface TabSnapshot {
  rows: RawRow[];
  /** id -> 1-based spreadsheet row number. */
  rowNumbers: Map<string, number>;
}

export async function ensureTab(tab: TabName): Promise<void> {
  try {
    const tabs = await listTabs();
    if (!tabs.some((t) => t.title === tab)) {
      await addTabs([tab]);
      tabIdCache = null;
      if (HEADERS[tab]) {
        await append(`${tab}!A1`, [HEADERS[tab]]);
        if (tab === TABS.GuestFields) {
          const defaultRows = DEFAULT_GUEST_FIELD_ROWS.map((r) =>
            toRow(TABS.GuestFields, r),
          );
          await append(appendRange(TABS.GuestFields), defaultRows);
          await kv().set('sheet:guest-fields:seeded', '1').catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error(`[sheets] Failed to ensure tab ${tab}:`, err);
  }
}

async function readTab(tab: TabName): Promise<TabSnapshot> {
  const range = fullRange(tab);
  let values: string[][] = [];
  try {
    const res = await batchGet([range]);
    values = res[range] ?? [];
  } catch (err) {
    if (err instanceof SheetsError && err.status === 400) {
      // Tab missing in spreadsheet (e.g. GuestFields) — ensure tab in background & return empty
      // Tab missing in spreadsheet (e.g. GuestFields) — ensure tab with defaults & return defaults
      ensureTab(tab).catch(() => {});
      if (tab === TABS.GuestFields) {
        const defaultRows = DEFAULT_GUEST_FIELD_ROWS;
        const rowNumbers = new Map<string, number>();
        defaultRows.forEach((r, idx) => rowNumbers.set(r.id, idx + 2));
        return { rows: defaultRows, rowNumbers };
      }
      return { rows: [], rowNumbers: new Map() };
    }
    throw err;
  }

  // If GuestFields tab exists but has no data rows and hasn't been seeded yet, seed defaults
  if (tab === TABS.GuestFields && values.length <= 1) {
    const seededKey = 'sheet:guest-fields:seeded';
    const alreadySeeded = await kv().get(seededKey).catch(() => null);
    if (!alreadySeeded) {
      try {
        const seededRows = DEFAULT_GUEST_FIELD_ROWS.map((r) =>
          toRow(TABS.GuestFields, r),
        );
        await append(appendRange(TABS.GuestFields), seededRows);
        await kv().set(seededKey, '1').catch(() => {});
        const defaultRows = DEFAULT_GUEST_FIELD_ROWS;
        const rowNumbers = new Map<string, number>();
        defaultRows.forEach((r, idx) => rowNumbers.set(r.id, idx + 2));
        return { rows: defaultRows, rowNumbers };
      } catch (err) {
        console.error('[sheets] Failed to seed default guest fields:', err);
      }
    }
  }

  const { rows } = toObjects(values);

  const key = idColumn(tab);
  const rowNumbers = new Map<string, number>();

  // Walk the raw grid rather than the parsed rows: blank lines are skipped by
  // the parser but still occupy spreadsheet rows, so parsed index + 2 would
  // drift and we would overwrite the wrong record.
  const headers = (values[0] ?? []).map((h) => String(h ?? '').trim());
  const idIdx = headers.indexOf(key);
  if (idIdx !== -1) {
    for (let i = 1; i < values.length; i++) {
      const id = String(values[i]?.[idIdx] ?? '').trim();
      if (id) rowNumbers.set(id, i + 1);
    }
  }

  return { rows, rowNumbers };
}

const ROWS_CACHE_SECONDS = 120;
const rowsCacheKey = (tab: TabName) => `sheetrows:${tab}`;

/**
 * Read a tab for display, cached briefly.
 *
 * Every admin screen reads its tab on load, and a Sheets round trip is
 * 300-800ms — clicking between Menu, Categories and Allergens paid that toll
 * each time. The cache is dropped explicitly after any write through
 * `invalidateRows`, so an edit is still visible immediately; the TTL only
 * covers changes made directly in the spreadsheet by hand.
 */
export async function listRows(tab: TabName): Promise<RawRow[]> {
  // No spreadsheet: the admin list screens render empty rather than surfacing
  // a Google auth failure. Writes are refused earlier with a clear message.
  if (!sheetsConfigured()) return [];
  if (!sheetsConfigured()) {
    return tab === TABS.GuestFields ? DEFAULT_GUEST_FIELD_ROWS : [];
  }

  const cached = await kv()
    .get<RawRow[]>(rowsCacheKey(tab))
    .catch(() => null);
  if (cached) return cached;

  const { rows } = await readTab(tab);
  await kv()
    .set(rowsCacheKey(tab), rows, { ex: ROWS_CACHE_SECONDS })
    .catch(() => {});
  return rows;
}

/** Called after any write so the admin sees their own edit, not the cache. */
export async function invalidateRows(tab: TabName): Promise<void> {
  await kv().del(rowsCacheKey(tab)).catch(() => {});
}

export interface UpsertResult {
  id: string;
  created: boolean;
}

/**
 * Creates or replaces a whole record. The caller always supplies every field,
 * so a partial update cannot silently blank a column it forgot about.
 */
export async function upsertRow(
  tab: TabName,
  record: Record<string, unknown>,
): Promise<UpsertResult> {
  const key = idColumn(tab);
  const id = String(record[key] ?? '').trim();
  if (!id) throw new Error(`upsertRow(${tab}) requires a non-empty ${key}`);

  const { rowNumbers } = await readTab(tab);
  const existing = rowNumbers.get(id);
  const values = [toRow(tab, record)];

  if (existing) {
    const lastCol = colLetter(HEADERS[tab].length);
    await batchUpdate([
      { range: `${tab}!A${existing}:${lastCol}${existing}`, values },
    ]);
    await invalidateRows(tab);
    return { id, created: false };
  }

  try {
    await append(appendRange(tab), values);
  } catch (err) {
    if (err instanceof SheetsError && err.status === 400) {
      await ensureTab(tab);
      await append(appendRange(tab), values);
    } else {
      throw err;
    }
  }
  await invalidateRows(tab);
  return { id, created: true };
}

/** Writes many records in one pass — used by reordering and bulk toggles. */
export async function upsertMany(
  tab: TabName,
  records: Record<string, unknown>[],
): Promise<void> {
  if (records.length === 0) return;
  const key = idColumn(tab);
  const { rowNumbers } = await readTab(tab);
  const lastCol = colLetter(HEADERS[tab].length);

  const updates: { range: string; values: string[][] }[] = [];
  const additions: string[][] = [];

  for (const record of records) {
    const id = String(record[key] ?? '').trim();
    if (!id) continue;
    const row = toRow(tab, record);
    const at = rowNumbers.get(id);
    if (at) updates.push({ range: `${tab}!A${at}:${lastCol}${at}`, values: [row] });
    else additions.push(row);
  }

  if (updates.length > 0) await batchUpdate(updates);
  if (additions.length > 0) {
    try {
      await append(appendRange(tab), additions);
    } catch (err) {
      if (err instanceof SheetsError && err.status === 400) {
        await ensureTab(tab);
        await append(appendRange(tab), additions);
      } else {
        throw err;
      }
    }
  }
  await invalidateRows(tab);
}

async function sheetIdFor(tab: TabName): Promise<number> {
  if (!tabIdCache) {
    tabIdCache = new Map((await listTabs()).map((t) => [t.title, t.sheetId]));
  }
  const id = tabIdCache.get(tab);
  if (id === undefined) throw new SheetsError(`Tab "${tab}" not found`, 404);
  return id;
}

export async function deleteRow(tab: TabName, id: string): Promise<boolean> {
  const { rowNumbers } = await readTab(tab);
  const at = rowNumbers.get(id);
  if (!at) return false;

  const sheetId = await sheetIdFor(tab);
  const { batchUpdateSpreadsheet } = await import('./client-structural');
  await batchUpdateSpreadsheet([
    {
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          // API row indices are 0-based and end-exclusive; our row numbers are
          // 1-based, so row 5 is [4, 5).
          startIndex: at - 1,
          endIndex: at,
        },
      },
    },
  ]);
  await invalidateRows(tab);
  return true;
}

/** Deleting a menu item orphans its option groups and their options. */
export async function deleteMenuItemCascade(menuId: string): Promise<void> {
  const groups = (await listRows(TABS.MenuOptionGroups)).filter(
    (g) => g.menu_id === menuId,
  );
  for (const group of groups) {
    const options = (await listRows(TABS.MenuOptions)).filter(
      (o) => o.group_id === group.id,
    );
    for (const option of options) {
      await deleteRow(TABS.MenuOptions, option.id);
    }
    await deleteRow(TABS.MenuOptionGroups, group.id);
  }
  await deleteRow(TABS.Menu, menuId);
}

/** Settings live as key/value rows rather than one row per setting group. */
export async function writeSettings(
  entries: { key: string; value: string }[],
): Promise<void> {
  const existing = await listRows(TABS.Settings);
  const known = new Map(existing.map((r) => [r.key, r]));

  await upsertMany(
    TABS.Settings,
    entries.map((e) => ({
      key: e.key,
      value: e.value,
      description: known.get(e.key)?.description ?? '',
    })),
  );
}
