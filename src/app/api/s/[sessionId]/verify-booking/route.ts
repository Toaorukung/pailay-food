import { requireSession, guardResponse, updateSession } from '@/lib/session';
import { verifyGuestBooking } from '@/lib/booking';
import { verifyBookingSchema, parseBody } from '@/lib/validation';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Verifies guest phone number against the booking sheet (บันทึกการจอง).
 * If valid and currently within stay dates, updates session with verified name & phone.
 */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId);
  if (!guard.ok) return guardResponse(guard);

  const body = await parseBody(req, verifyBookingSchema);
  if (!body.ok) return fail(body.error);

  const result = await verifyGuestBooking(
    body.data.phone,
    Date.now(),
    guard.session.villa || guard.session.tableLabel,
  );
  if (!result.ok || !result.booking) {
    return fail(result.error ?? 'ไม่สามารถยืนยันข้อมูลผู้เข้าพักได้', 400, {
      reason: result.reason,
      booking: result.booking,
    });
  }

  const session = await updateSession(sessionId, {
    guestPhone: result.booking.phone,
    guestName: result.booking.name,
    ...(result.booking.villa ? { villa: result.booking.villa } : {}),
  });

  return ok({
    guestName: session?.guestName ?? result.booking.name,
    guestPhone: session?.guestPhone ?? result.booking.phone,
    villa: result.booking.villa,
    booking: result.booking,
  });
});

