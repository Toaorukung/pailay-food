import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from './env';
import { kv, K, SESSION_TTL_SECONDS } from './kv';
import { randomId } from './ids';
import { persist } from './sheets/queue';
import { TABS } from './sheets/schema';
import type {
  GeoStatus,
  GuestSession,
  Locale,
  SessionStatus,
  VillaTable,
} from './types';
import { DEFAULT_LOCALE } from './types';

export const SESSION_COOKIE = 'pf_sess';

/**
 * Session lifecycle.
 *
 * The printed QR is static per villa. Scanning it mints a fresh random session
 * id and redirects to /s/<id>. That session then lasts the whole stay: the
 * villa orders, pays, eats and orders again on the same link, with no need to
 * scan between rounds.
 *
 * It ends when staff expire it from /admin/sessions. After that the id still
 * serves the villa's full order history — which is the reason it is kept —
 * but every mutating route refuses it, and the next scan of the sticker opens
 * a clean session for the next guest.
 *
 * Two independent checks protect a session, and both are enforced server-side
 * on every mutation, not just when rendering a page:
 *   1. status must be OPEN
 *   2. the caller's signed cookie must name the same session as the URL
 * Check 2 is what stops a guest forwarding their link to someone off-property.
 */

// ── Cookie signing ──────────────────────────────────────────

function sign(sessionId: string): string {
  return createHmac('sha256', env.sessionSecret)
    .update(sessionId)
    .digest('base64url')
    .slice(0, 24);
}

function cookieValue(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

function readCookieValue(raw: string | undefined): string | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return null;
  const id = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = sign(id);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return id;
}

/**
 * Cookie payload and attributes, so a Route Handler can set them directly on
 * the Response it returns. The QR entry point issues a redirect, and attaching
 * the cookie to that exact response is the only way to be certain the guest's
 * browser receives it before it follows the Location header.
 */
export function sessionCookie(sessionId: string) {
  return {
    name: SESSION_COOKIE,
    value: cookieValue(sessionId),
    options: {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    },
  };
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const store = await cookies();
  const { name, value, options } = sessionCookie(sessionId);
  store.set(name, value, options);
}

export async function cookieSessionId(): Promise<string | null> {
  const store = await cookies();
  return readCookieValue(store.get(SESSION_COOKIE)?.value);
}

/** Cookie reader for route handlers that already hold the Request. */
export function cookieSessionIdFrom(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) {
      return readCookieValue(decodeURIComponent(rest.join('=')));
    }
  }
  return null;
}

// ── Store ───────────────────────────────────────────────────

export async function getSession(id: string): Promise<GuestSession | null> {
  if (!id) return null;
  const s = await kv().get<GuestSession>(K.session(id)).catch(() => null);
  return s ?? null;
}

async function saveSession(s: GuestSession): Promise<void> {
  await kv().set(K.session(s.id), s, { ex: SESSION_TTL_SECONDS });
}

/**
 * Scanning the villa QR lands here. If that villa already has an open session,
 * we join it — a family with four phones shares one bill, which is what they
 * expect. Otherwise we mint a new one.
 */
export async function createOrJoinSession(
  table: VillaTable,
  locale: Locale = DEFAULT_LOCALE,
): Promise<GuestSession> {
  const existingId = await kv()
    .get<string>(K.tableOpenSession(table.id))
    .catch(() => null);

  if (existingId) {
    const existing = await getSession(existingId);
    if (existing && existing.status !== 'CLOSED') return existing;
    // Pointer outlived its session (expired key, manual close). Clear it.
    await kv().del(K.tableOpenSession(table.id)).catch(() => {});
  }

  const session: GuestSession = {
    id: randomId(16),
    tableId: table.id,
    tableLabel: table.label,
    villa: table.villa,
    status: 'OPEN',
    openedAt: new Date().toISOString(),
    closedAt: null,
    guestName: '',
    allergyProfile: [],
    geoStatus: 'UNKNOWN',
    distanceM: null,
    locale,
    closedBy: null,
  };

  await saveSession(session);
  await kv().set(K.tableOpenSession(table.id), session.id, {
    ex: SESSION_TTL_SECONDS,
  });
  await kv()
    .zadd(K.openSessions, { score: Date.now(), member: session.id })
    .catch(() => {});

  await persist(TABS.Sessions, session.id, sessionRow(session));
  return session;
}

export async function updateSession(
  id: string,
  patch: Partial<GuestSession>,
): Promise<GuestSession | null> {
  const current = await getSession(id);
  if (!current) return null;
  const next = { ...current, ...patch, id: current.id };
  await saveSession(next);
  await persist(TABS.Sessions, next.id, sessionRow(next));
  return next;
}

/**
 * Ends a stay. Staff do this from /admin/sessions when the villa checks out;
 * nothing else closes a session, so a villa can order, pay, eat and order
 * again all evening on one scan.
 *
 * The id stays readable afterwards — that is the point. The guest keeps a
 * record of every order they placed and what each one cost. It just cannot
 * accept new ones, and the villa's pointer is dropped so the next guest's
 * scan starts clean.
 */
export async function closeSession(
  id: string,
  closedBy: string | null = null,
): Promise<GuestSession | null> {
  const current = await getSession(id);
  if (!current) return null;

  const closed: GuestSession = {
    ...current,
    status: 'CLOSED',
    closedAt: new Date().toISOString(),
    closedBy,
  };
  await saveSession(closed);

  // Only clear the villa pointer if it still points at us — a race with a
  // fresh scan must not orphan the new session.
  const pointer = await kv()
    .get<string>(K.tableOpenSession(current.tableId))
    .catch(() => null);
  if (pointer === id) {
    await kv().del(K.tableOpenSession(current.tableId)).catch(() => {});
  }
  await kv().zrem(K.openSessions, id).catch(() => {});
  await persist(TABS.Sessions, closed.id, sessionRow(closed));
  return closed;
}

function sessionRow(s: GuestSession): Record<string, unknown> {
  return {
    session_id: s.id,
    table_id: s.tableId,
    opened_at: s.openedAt,
    closed_at: s.closedAt ?? '',
    status: s.status,
    guest_name: s.guestName,
    allergy_profile: s.allergyProfile.join(','),
    geo_status: s.geoStatus,
    distance_m: s.distanceM ?? '',
    locale: s.locale,
    closed_by: s.closedBy ?? '',
  };
}

// ── Guards ──────────────────────────────────────────────────

export type Guard =
  | { ok: true; session: GuestSession }
  | { ok: false; status: number; code: GuardFailure; message: string };

export type GuardFailure = 'NOT_FOUND' | 'CLOSED' | 'NOT_YOUR_SESSION';

const MESSAGES: Record<GuardFailure, string> = {
  NOT_FOUND: 'ไม่พบเซสชันนี้ กรุณาสแกน QR ในวิลล่าอีกครั้ง',
  CLOSED: 'เซสชันนี้ปิดแล้ว หากต้องการสั่งอีกครั้ง กรุณาสแกน QR ในวิลล่าใหม่',
  NOT_YOUR_SESSION: 'กรุณาสแกน QR ในวิลล่าเพื่อเริ่มสั่งอาหาร',
};

/** The gate every mutating guest route must pass through. */
export async function requireSession(
  req: Request,
  sessionId: string,
): Promise<Guard> {
  const session = await getSession(sessionId);
  if (!session) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: MESSAGES.NOT_FOUND };
  }

  const fromCookie = cookieSessionIdFrom(req);
  if (fromCookie !== sessionId) {
    return {
      ok: false,
      status: 403,
      code: 'NOT_YOUR_SESSION',
      message: MESSAGES.NOT_YOUR_SESSION,
    };
  }

  if (session.status === 'CLOSED') {
    return { ok: false, status: 403, code: 'CLOSED', message: MESSAGES.CLOSED };
  }

  return { ok: true, session };
}

export function guardResponse(guard: Extract<Guard, { ok: false }>): Response {
  return Response.json(
    { error: guard.message, code: guard.code },
    { status: guard.status },
  );
}

/** Status as seen by a page render — pages are readable, mutations are not. */
export async function pageSessionState(sessionId: string): Promise<{
  session: GuestSession | null;
  isOwner: boolean;
  canOrder: boolean;
}> {
  const session = await getSession(sessionId);
  const owner = (await cookieSessionId()) === sessionId;
  return {
    session,
    isOwner: owner,
    canOrder: Boolean(session && session.status === 'OPEN' && owner),
  };
}

/**
 * Sessions currently open, newest first. Backed by a sorted set so the admin
 * dashboard never has to scan Redis keys.
 */
export async function listOpenSessions(limit = 200): Promise<GuestSession[]> {
  const ids = await kv()
    .zrange<string[]>(K.openSessions, 0, limit - 1, { rev: true })
    .catch(() => [] as string[]);
  if (!ids || ids.length === 0) return [];

  const rows: (GuestSession | null)[] = await kv()
    .mget<(GuestSession | null)[]>(...ids.map((id) => K.session(id)))
    .catch(() => [] as (GuestSession | null)[]);

  const live = rows.filter(
    (s): s is GuestSession => s !== null && s !== undefined && s.status !== 'CLOSED',
  );

  // Prune ids whose session expired out of Redis, so the set does not grow
  // without bound across months of service.
  const alive = new Set(live.map((s) => s.id));
  const stale = ids.filter((id) => !alive.has(id));
  if (stale.length > 0) {
    await kv().zrem(K.openSessions, ...stale).catch(() => {});
  }

  return live.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

export { SESSION_TTL_SECONDS, type SessionStatus, type GeoStatus };
