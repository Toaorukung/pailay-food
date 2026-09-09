import { JWT } from 'google-auth-library';
import { env, serviceAccount } from '../env';
import { kv, K } from '../kv';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Access tokens are cached in two places:
 *   1. module memory — free on warm invocations
 *   2. Upstash      — shared across the whole serverless fleet, so a burst of
 *                     cold starts mints one token, not fifty
 * Google tokens live 3600s; we expire ours early to avoid edge-of-life races.
 */
let memoToken: { token: string; expiresAt: number } | null = null;
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;

async function accessToken(): Promise<string> {
  const now = Date.now();
  if (memoToken && memoToken.expiresAt > now) return memoToken.token;

  const cached = await kv()
    .get<{ token: string; expiresAt: number }>(K.googleToken)
    .catch(() => null);
  if (cached && cached.expiresAt > now) {
    memoToken = cached;
    return cached.token;
  }

  const sa = serviceAccount();
  const jwt = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: SCOPES,
  });
  const res = await jwt.getAccessToken();
  if (!res.token) throw new Error('Google returned no access token.');

  const expiresAt =
    (jwt.credentials.expiry_date ?? now + 3600_000) - TOKEN_SAFETY_MARGIN_MS;
  const entry = { token: res.token, expiresAt };
  memoToken = entry;

  const ttl = Math.max(60, Math.floor((expiresAt - now) / 1000));
  await kv()
    .set(K.googleToken, entry, { ex: ttl })
    .catch(() => {
      /* token caching is an optimisation; never fail a request over it */
    });

  return res.token;
}

/**
 * Counts Sheets API calls per minute. The load test asserts against this —
 * it is the single number that proves the cache+queue architecture works.
 */
async function recordCall() {
  const minute = new Date().toISOString().slice(0, 16);
  await kv()
    .incr(K.sheetsCallCount(minute))
    .then(() => kv().expire(K.sheetsCallCount(minute), 300))
    .catch(() => {});
}

class SheetsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SheetsError';
  }
}

const MAX_ATTEMPTS = 4;

async function request<T>(
  path: string,
  init: RequestInit & { method: string },
  targetSheetId: string = env.googleSheetId,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      // Exponential backoff with jitter. 429 from Sheets means we blew the
      // per-minute quota; hammering it immediately makes it strictly worse.
      const delay = 2 ** attempt * 250 + Math.random() * 250;
      await new Promise((r) => setTimeout(r, delay));
    }

    const token = await accessToken();
    await recordCall();

    let res: Response;
    try {
      res = await fetch(`${API}/${targetSheetId}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
        cache: 'no-store',
      });
    } catch (err) {
      lastError = err;
      continue;
    }

    if (res.ok) return (await res.json()) as T;

    const body = await res.text().catch(() => '');

    // 401 can mean our cached token was revoked early — drop it and retry.
    if (res.status === 401) {
      memoToken = null;
      await kv().del(K.googleToken).catch(() => {});
      lastError = new SheetsError(`Sheets auth failed: ${body}`, 401);
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      lastError = new SheetsError(`Sheets ${res.status}: ${body}`, res.status);
      continue;
    }

    // 400/403/404 are our bug (bad range, sheet not shared) — retrying is
    // pointless and hides the real problem.
    throw new SheetsError(`Sheets ${res.status}: ${body}`, res.status);
  }

  throw lastError instanceof Error
    ? lastError
    : new SheetsError('Sheets request failed', 0);
}

/** Read several ranges in ONE API call. Always prefer this over N reads. */
export async function batchGet(
  ranges: string[],
): Promise<Record<string, string[][]>> {
  if (ranges.length === 0) return {};
  const qs = ranges
    .map((r) => `ranges=${encodeURIComponent(r)}`)
    .join('&');
  const data = await request<{
    valueRanges?: { range: string; values?: string[][] }[];
  }>(`/values:batchGet?${qs}&majorDimension=ROWS`, { method: 'GET' });

  const out: Record<string, string[][]> = {};
  (data.valueRanges ?? []).forEach((vr, i) => {
    // Google normalises the range string ('Menu!A1:Z1000' -> 'Menu!A1:Z1000'),
    // but quoting rules differ, so key by our own input order instead.
    out[ranges[i]] = vr.values ?? [];
  });
  return out;
}

/**
 * Append rows to the bottom of a tab. One call, however many rows.
 *
 * Returns the 1-based row number the first appended row landed on. The sync
 * queue records that so later status updates can rewrite an exact range
 * instead of scanning the sheet to find the row.
 */
export async function append(
  range: string,
  rows: string[][],
): Promise<{ firstRow: number } | null> {
  if (rows.length === 0) return null;
  const data = await request<{ updates?: { updatedRange?: string } }>(
    `/values/${encodeURIComponent(range)}:append` +
      `?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`,
    { method: 'POST', body: JSON.stringify({ values: rows }) },
  );

  // updatedRange looks like "Orders!A57:J59" — we want 57.
  const updated = data.updates?.updatedRange ?? '';
  const match = updated.match(/![A-Z]+(\d+)/);
  return match ? { firstRow: Number(match[1]) } : null;
}

/** Overwrite specific ranges. One call for any number of ranges. */
export async function batchUpdate(
  updates: { range: string; values: string[][] }[],
): Promise<void> {
  if (updates.length === 0) return;
  await request('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: updates }),
  });
}

/** Tab metadata — used by the seed script to know what already exists. */
export async function listTabs(): Promise<{ title: string; sheetId: number }[]> {
  const data = await request<{
    sheets?: { properties?: { title?: string; sheetId?: number } }[];
  }>('?fields=sheets.properties.title,sheets.properties.sheetId', {
    method: 'GET',
  });
  return (data.sheets ?? [])
    .map((s) => ({
      title: s.properties?.title ?? '',
      sheetId: s.properties?.sheetId ?? -1,
    }))
    .filter((s) => s.title);
}

/** Create tabs. Used only by the seed script. */
export async function addTabs(titles: string[]): Promise<void> {
  if (titles.length === 0) return;
  await request(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: titles.map((title) => ({ addSheet: { properties: { title } } })),
    }),
  });
}

/** Read a range from any spreadsheet by sheetId. */
export async function getSheetValues(
  sheetId: string,
  range: string,
): Promise<string[][]> {
  const data = await request<{ values?: string[][] }>(
    `/values/${encodeURIComponent(range)}?majorDimension=ROWS`,
    { method: 'GET' },
    sheetId,
  );
  return data.values ?? [];
}

export { SheetsError };
