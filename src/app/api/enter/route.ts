import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getTables } from '@/lib/tables';
import { createOrJoinSession, sessionCookie, updateSession } from '@/lib/session';
import { verifyGuestBooking } from '@/lib/booking';
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
  /** Booking phone number required for login and stay verification */
  phone: z
    .string()
    .trim()
    .min(8, 'กรุณากรอกเบอร์โทรศัพท์')
    .max(40)
    .refine(
      (s) => /^[0-9+\-() ]+$/.test(s) && s.replace(/\D/g, '').length >= 8,
      { message: 'เบอร์โทรศัพท์ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' },
    ),
  /**
   * The LIFF id token, when the guest opened the link inside LINE. Verified
   * against LINE here — a plain user id from the browser is worthless, since
   * anyone could send someone else's and start receiving their confirmations.
   */
  idToken: z.string().max(4000).optional(),
});

/**
 * Turns "I am staying in villa 3 and my booking phone is 081XXXXXXX" into a session.
 *
 * Sessions are ONLY created or joined after successful booking and stay window verification
 * against the resort's master Google Sheet (บันทึกการจอง).
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

  // 1. Verify guest booking against the Google Sheet BEFORE creating any session!
  const bookingCheck = await verifyGuestBooking(
    body.data.phone,
    Date.now(),
    table.villa || table.label,
  );

  if (!bookingCheck.ok || !bookingCheck.booking) {
    return fail(
      bookingCheck.error ?? 'ไม่สามารถยืนยันข้อมูลผู้เข้าพักได้',
      400,
      { reason: bookingCheck.reason, booking: bookingCheck.booking },
    );
  }

  const locale = parseLocale(req.cookies.get(LOCALE_COOKIE)?.value);

  // A token that fails to verify is treated as no token at all. The guest gets
  // to order either way; they just will not receive a LINE confirmation, which
  // is a far better failure than refusing them the menu.
  const profile = body.data.idToken
    ? await verifyLineIdToken(body.data.idToken)
    : null;

  // 2. Open / Join session ONLY after successful booking verification!
  const session = await createOrJoinSession(table, locale, profile?.userId ?? '');

  await updateSession(session.id, {
    guestName: bookingCheck.booking.name || profile?.displayName || 'ผู้เข้าพัก',
    guestPhone: bookingCheck.booking.phone,
    ...(bookingCheck.booking.villa ? { villa: bookingCheck.booking.villa } : {}),
  });

  const res = NextResponse.json({
    ok: true,
    sessionId: session.id,
    slug: table.slug,
    guestName: bookingCheck.booking.name,
    guestPhone: bookingCheck.booking.phone,
    villa: bookingCheck.booking.villa,
  });

  // Attached to this exact response, so the browser has it before it navigates.
  const { name, value, options } = sessionCookie(session.id);
  res.cookies.set(name, value, options);
  return res;
}
