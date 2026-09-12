import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getTables } from '@/lib/tables';
import { createOrJoinSession, sessionCookie } from '@/lib/session';
import { verifyLineIdToken } from '@/lib/line';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { parseLocale, LOCALE_COOKIE } from '@/i18n/locale';
import { parseBody } from '@/lib/validation';
import { fail } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const enterSchema = z.object({
  /** The villa slug the guest picked on the entry screen. */
  villa: z.string().min(1).max(64),
  /**
   * The LIFF id token, when the guest opened the link inside LINE. Verified
   * against LINE here — a plain user id from the browser is worthless, since
   * anyone could send someone else's and start receiving their confirmations.
   */
  idToken: z.string().max(4000).optional(),
});

/**
 * Turns "I am staying in villa 3" into a session.
 *
 * It is a separate route from the guest app itself so that the session cookie
 * can be set on the response before the browser navigates. Without that,
 * opening the page would either be a server-side redirect loop or a flash of
 * an uninitialised session while client-side code races to create one.
 */
export async function POST(req: NextRequest) {
  const limit = await rateLimit('session', clientIp(req));
  if (!limit.ok) {
    return fail('มีการเข้าใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', 429);
  }

  const body = await parseBody(req, enterSchema);
  if (!body.ok) return fail(body.error);

  const tables = await getTables();
  const table = tables.find((t) => t.slug === body.data.villa);

  if (!table) return fail('ไม่พบวิลล่านี้', 404, { code: 'BAD_LINK' });
  if (!table.isActive) {
    return fail('วิลล่านี้ยังไม่เปิดใช้งานระบบสั่งอาหาร', 403, { code: 'INACTIVE' });
  }

  const locale = parseLocale(req.cookies.get(LOCALE_COOKIE)?.value);

  // A token that fails to verify is treated as no token at all. The guest gets
  // to order either way; they just will not receive a LINE confirmation, which
  // is a far better failure than refusing them the menu.
  const profile = body.data.idToken
    ? await verifyLineIdToken(body.data.idToken)
    : null;

  const session = await createOrJoinSession(
    table,
    locale,
    profile?.userId ?? '',
  );

  const res = NextResponse.json({
    ok: true,
    sessionId: session.id,
    slug: table.slug,
  });

  // Attached to this exact response, so the browser has it before it navigates.
  const { name, value, options } = sessionCookie(session.id);
  res.cookies.set(name, value, options);
  return res;
}
