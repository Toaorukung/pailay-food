import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getTables } from '@/lib/tables';
import { createOrJoinSession, sessionCookie } from '@/lib/session';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { parseLocale, LOCALE_COOKIE } from '@/i18n/locale';
import { parseBody } from '@/lib/validation';
import { fail } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const enterSchema = z.object({
  villa: z.string().min(1).max(64),
  code: z.string().min(1).max(64),
});

/**
 * Turns a scanned villa link into a session.
 *
 * This is a Route Handler rather than part of the page because it has to set
 * the session cookie, and a Server Component render cannot. The page calls it
 * once on arrival and then rewrites the URL to the session.
 *
 * Joining beats creating: if the villa already has an open session, every
 * later scan lands on that same session, so a family with four phones builds
 * one bill. That is the behaviour the villa asked for, and it is also the
 * dangerous one — the join has to be exact, or two phones end up on separate
 * bills and half the order goes missing. `createOrJoinSession` reads the
 * villa's open-session pointer under a single key, so concurrent scans
 * converge on one id instead of racing to create two.
 */
export async function POST(req: NextRequest) {
  const limit = await rateLimit('session', clientIp(req));
  if (!limit.ok) {
    return fail('มีการเข้าใช้งานถี่เกินไป กรุณารอสักครู่แล้วสแกนใหม่', 429);
  }

  const body = await parseBody(req, enterSchema);
  if (!body.ok) return fail(body.error);

  const tables = await getTables();
  const table = tables.find(
    (t) => t.slug === body.data.villa && t.qrCode === body.data.code,
  );

  // A wrong code is the same answer as a wrong villa: the pair has to match,
  // so knowing a villa name is never enough to open a session for it.
  if (!table) return fail('ลิงก์ไม่ถูกต้อง', 404, { code: 'BAD_LINK' });
  if (!table.isActive) {
    return fail('วิลล่านี้ยังไม่เปิดใช้งานระบบสั่งอาหาร', 403, { code: 'INACTIVE' });
  }

  const locale = parseLocale(req.cookies.get(LOCALE_COOKIE)?.value);
  const session = await createOrJoinSession(table, locale);

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
