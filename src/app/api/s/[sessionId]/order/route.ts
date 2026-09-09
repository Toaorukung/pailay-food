import { requireSession, guardResponse } from '@/lib/session';
import { getCatalog } from '@/lib/menu-cache';
import { getCart } from '@/lib/cart';
import { placeOrder } from '@/lib/orders';
import { notifyNewOrder } from '@/lib/lark';
import { publicPayment } from '@/lib/snapshot';
import { rateLimit } from '@/lib/ratelimit';
import { placeOrderSchema, parseBody } from '@/lib/validation';
import { handler, fail, ok } from '@/lib/api';
import { verifyGuestBooking } from '@/lib/booking';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Confirms a cart into an order.
 *
 * Nothing reaches the kitchen from here. The order is created PENDING_CONFIRM
 * and sits on /admin/pending until a member of staff has checked it with the
 * guest — that is the whole point of the step, and it is also when the guest
 * gets their LINE confirmation.
 *
 * `requireSession` is the load-bearing line: a session staff have expired
 * returns 403 from this route even with a valid cookie and a hand-crafted
 * request. The page-level checks are convenience; this is the enforcement.
 */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId);
  if (!guard.ok) return guardResponse(guard);

  if (!guard.session.guestPhone) {
    return fail(
      'กรุณาเข้าสู่ระบบด้วยเบอร์โทรศัพท์ผู้เข้าพักก่อนส่งออเดอร์',
      403,
    );
  }

  const bookingCheck = await verifyGuestBooking(
    guard.session.guestPhone,
    Date.now(),
    guard.session.villa || guard.session.tableLabel,
  );
  if (!bookingCheck.ok) {
    return fail(
      bookingCheck.error ??
        'เบอร์โทรศัพท์ของคุณไม่อยู่ในช่วงวันเข้าพัก จึงไม่สามารถสั่งอาหารได้',
      403,
    );
  }

  const limit = await rateLimit('order', sessionId);
  if (!limit.ok) return fail('สั่งอาหารถี่เกินไป กรุณารอสักครู่', 429);

  const body = await parseBody(req, placeOrderSchema);
  if (!body.ok) return fail(body.error);

  const [catalog, cart] = await Promise.all([getCatalog(), getCart(sessionId)]);

  const result = await placeOrder(
    guard.session,
    cart,
    catalog,
    body.data.idempotencyKey,
  );

  if (!result.ok || !result.order || !result.payment) {
    return fail(result.error ?? 'ส่งออเดอร์ไม่สำเร็จ', 400, {
      removed: result.removed,
    });
  }

  // Nothing on the guest's screen tells staff to look, so this is what does.
  // Awaited rather than fired into the void: on serverless the function can be
  // frozen the moment the response is written, and a dropped notification is a
  // ticket nobody sees. It is capped at a few seconds and swallows its own
  // errors, so the guest's order never fails because Lark did.
  //
  // Skipped on a replayed idempotency key — a retry is the same ticket, and a
  // second card in the group is a second phone call to the same guest.
  if (!result.duplicate) {
    await notifyNewOrder(result.order, guard.session, catalog.settings);
  }

  return ok({
    order: result.order,
    payment: publicPayment(result.payment),
    removed: result.removed,
    repriced: result.repriced,
  });
});
