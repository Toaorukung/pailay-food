import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getTables } from '@/lib/tables';
import { createOrJoinSession, sessionCookie, updateSession } from '@/lib/session';
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
 * A Route Handler rather than part of the page because it has to set the
 * session cookie, and a Server Component render cannot. The entry screen calls
 * it once the guest has picked a villa, then replaces the URL with the session.
 *
 * Joining beats creating: if the villa already has an open session, every
 * later arrival lands on that same session, so a family with four phones
 * builds one bill. That is the behaviour the villa asked for, and it is also
 * the dangerous one — the join has to be exact, or two phones end up on
 * separate bills and half the order goes missing. `createOrJoinSession` reads
 * the villa's open-session pointer under a single key, so concurrent arrivals
 * converge on one id instead of racing to create two.
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

  const session = await createOrJoinSession(table, locale, profile?.userId ?? '');

  // Prefill the name step with what LINE already knows, so the guest edits a
  // filled field instead of typing their name again. Only when the session has
  // no name yet — never overwrite what someone actually entered.
  if (profile?.displayName && !session.guestName) {
    await updateSession(session.id, { guestName: profile.displayName.slice(0, 80) });
  }

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
