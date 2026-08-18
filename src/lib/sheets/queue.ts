import { after } from 'next/server';
import { kv, K } from '../kv';
import { sheetsConfigured } from '../demo';
import { append, batchUpdate } from './client';
import {
  HEADERS,
  TABS,
  appendRange,
  colLetter,
  toRow,
  type TabName,
} from './schema';

/**
 * Write-behind queue.
 *
 * Nothing a guest does waits on Google Sheets. Writes land in Redis instantly
 * and a drain pass batches them into the spreadsheet: one API call per tab per
 * pass, no matter how many rows. Fifty simultaneous orders cost one call.
 *
 * Every record is an upsert keyed by its own id. The first write appends and
 * remembers which row it landed on; later writes rewrite that exact row. That
 * row map is also the idempotency mechanism — replaying an op cannot create a
 * duplicate.
 */

export interface SyncOp {
  tab: TabName;
  id: string;
  obj: Record<string, unknown>;
  attempts: number;
  queuedAt: string;
}

const rowKey = (tab: TabName, id: string) => `sheetrow:${tab}:${id}`;
const MAX_ATTEMPTS = 4;
const BATCH_LIMIT = 500;
const LOCK_TTL_SECONDS = 55;

/** Queue a record for eventual persistence. Never throws into the caller. */
export async function enqueue(
  tab: TabName,
  id: string,
  obj: Record<string, unknown>,
): Promise<void> {
  // Nowhere to sync to. Redis already holds the authoritative operational
  // copy, so the app is fully functional; only the spreadsheet mirror is
  // missing, and queueing rows nobody will ever drain just leaks memory.
  if (!sheetsConfigured()) return;

  const op: SyncOp = { tab, id, obj, attempts: 0, queuedAt: new Date().toISOString() };
  try {
    await kv().rpush(K.syncQueue, JSON.stringify(op));
  } catch (err) {
    // Redis is down. The guest's action already succeeded from their point of
    // view, so swallow it and let the cron pass pick things up once Redis is
    // back. Losing the Sheet row is bad, but failing the order is worse.
    console.error('[sync] enqueue failed', tab, id, err);
  }
}

/**
 * Schedules a drain after the current response is sent. This is what makes
 * the Sheet feel near-real-time without the cron plan tier mattering — the
 * cron job is only a safety net for retries.
 */
export function scheduleDrain(): void {
  try {
    after(async () => {
      await drain().catch((err) => console.error('[sync] drain failed', err));
    });
  } catch {
    // `after` is unavailable outside a request scope (scripts, tests).
  }
}

/** Queue a record and schedule the drain in one step. */
export async function persist(
  tab: TabName,
  id: string,
  obj: Record<string, unknown>,
): Promise<void> {
  await enqueue(tab, id, obj);
  scheduleDrain();
}

interface DrainResult {
  processed: number;
  appended: number;
  updated: number;
  failed: number;
  skipped: boolean;
}

export async function drain(): Promise<DrainResult> {
  if (!sheetsConfigured()) {
    return { processed: 0, appended: 0, updated: 0, failed: 0, skipped: true };
  }

  const empty: DrainResult = {
    processed: 0, appended: 0, updated: 0, failed: 0, skipped: false,
  };

  // Single-flight. Two concurrent drains could append the same id twice
  // before either records a row number.
  const gotLock = await kv().set(K.syncLock, Date.now(), {
    nx: true,
    ex: LOCK_TTL_SECONDS,
  });
  if (!gotLock) return { ...empty, skipped: true };

  try {
    const raw = await kv().lpop<string[]>(K.syncQueue, BATCH_LIMIT);
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (items.length === 0) return empty;

    const ops: SyncOp[] = [];
    for (const entry of items) {
      try {
        ops.push(typeof entry === 'string' ? JSON.parse(entry) : (entry as SyncOp));
      } catch {
        /* unparseable entry — drop it rather than wedge the queue */
      }
    }

    // Collapse repeats: an order that went NEW -> COOKING -> SERVED inside one
    // window becomes a single write of its final state.
    const latest = new Map<string, SyncOp>();
    for (const op of ops) latest.set(`${op.tab}::${op.id}`, op);
    const collapsed = [...latest.values()];

    const rowNumbers = await lookupRows(collapsed);

    const appendsByTab = new Map<TabName, SyncOp[]>();
    const updates: { range: string; values: string[][] }[] = [];
    let updatedCount = 0;

    for (const op of collapsed) {
      const row = rowNumbers.get(`${op.tab}::${op.id}`);
      if (row) {
        const lastCol = colLetter(HEADERS[op.tab].length);
        updates.push({
          range: `${op.tab}!A${row}:${lastCol}${row}`,
          values: [toRow(op.tab, op.obj)],
        });
        updatedCount++;
      } else {
        const arr = appendsByTab.get(op.tab);
        if (arr) arr.push(op);
        else appendsByTab.set(op.tab, [op]);
      }
    }

    const failed: SyncOp[] = [];
    let appendedCount = 0;

    // One batchUpdate covers every changed row across every tab.
    if (updates.length > 0) {
      try {
        await batchUpdate(updates);
      } catch (err) {
        console.error('[sync] batchUpdate failed', err);
        for (const op of collapsed) {
          if (rowNumbers.has(`${op.tab}::${op.id}`)) failed.push(op);
        }
        updatedCount = 0;
      }
    }

    // One append per tab, carrying all of that tab's new rows.
    for (const [tab, tabOps] of appendsByTab) {
      try {
        const result = await append(
          appendRange(tab),
          tabOps.map((op) => toRow(tab, op.obj)),
        );
        appendedCount += tabOps.length;
        if (result) {
          const pairs: Record<string, string> = {};
          tabOps.forEach((op, i) => {
            pairs[rowKey(tab, op.id)] = String(result.firstRow + i);
          });
          await kv().mset(pairs).catch(() => {
            // Losing the row map only means a future update appends a second
            // row instead of rewriting. Not worth failing the drain over.
          });
        }
      } catch (err) {
        console.error('[sync] append failed', tab, err);
        failed.push(...tabOps);
      }
    }

    await requeueOrBury(failed);

    return {
      processed: collapsed.length,
      appended: appendedCount,
      updated: updatedCount,
      failed: failed.length,
      skipped: false,
    };
  } finally {
    await kv().del(K.syncLock).catch(() => {});
  }
}

async function lookupRows(ops: SyncOp[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ops.length === 0) return map;
  const keys = ops.map((op) => rowKey(op.tab, op.id));
  const values = await kv()
    .mget<(string | number | null)[]>(...keys)
    .catch(() => [] as (string | number | null)[]);
  ops.forEach((op, i) => {
    const v = values?.[i];
    if (v !== null && v !== undefined && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n) && n > 1) map.set(`${op.tab}::${op.id}`, n);
    }
  });
  return map;
}

async function requeueOrBury(failed: SyncOp[]): Promise<void> {
  if (failed.length === 0) return;
  const retry: string[] = [];
  const dead: string[][] = [];

  for (const op of failed) {
    const attempts = op.attempts + 1;
    if (attempts < MAX_ATTEMPTS) {
      retry.push(JSON.stringify({ ...op, attempts }));
    } else {
      dead.push([
        `${op.tab}:${op.id}`,
        new Date().toISOString(),
        op.tab,
        JSON.stringify(op.obj).slice(0, 40_000),
        `failed after ${attempts} attempts`,
      ]);
    }
  }

  if (retry.length > 0) {
    await kv().rpush(K.syncQueue, ...retry).catch(() => {});
  }
  if (dead.length > 0) {
    // Keep the dead letters in Redis too — the admin dashboard reads from
    // there, so the alert shows even if the Sheet itself is what is broken.
    await kv().rpush(K.syncDead, ...dead.map((d) => JSON.stringify(d))).catch(() => {});
    await append(appendRange(TABS.SyncDeadLetter), dead).catch(() => {});
  }
}

/** Queue depth + dead letters, for the admin health widget. */
export async function syncHealth(): Promise<{ pending: number; dead: number }> {
  const [pending, dead] = await Promise.all([
    kv().llen(K.syncQueue).catch(() => 0),
    kv().llen(K.syncDead).catch(() => 0),
  ]);
  return { pending: pending ?? 0, dead: dead ?? 0 };
}
