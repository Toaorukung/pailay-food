import { requireSession, guardResponse } from '@/lib/session';
import { getCatalog } from '@/lib/menu-cache';
import { getCart } from '@/lib/cart';
import { placeOrder } from '@/lib/orders';
import { promptPayQr, maskPromptPayId } from '@/lib/promptpay';
import { publicPayment } from '@/lib/snapshot';
import { rateLimit } from '@/lib/ratelimit';
import { placeOrderSchema, parseBody } from '@/lib/validation';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Confirms a cart into an order and raises its payment in one step.
 *
 * Nothing reaches the kitchen from here — the order is created UNPAID (or
 * AWAITING_PRICING if it contains something sold by weight) and only becomes
 * visible to cooks once staff verify the transfer.
 *
 * `requireSession` is the load-bearing line: a session staff have expired
 * returns 403 from this route even with a valid cookie and a hand-crafted
 * request. The page-level checks are convenience; this is the enforcement.
 */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId);
  if (!guard.ok) return guardResponse(guard);

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

  // A QR is only meaningful once the amount is final. An order still waiting
  // on the scale gets its QR later, from the state poll.
  const qr =
    result.order.status === 'UNPAID' && result.payment.amount > 0
      ? await promptPayQr(result.payment.amount).catch((err) => {
          console.error('[order] PromptPay QR failed', err);
          return null;
        })
      : null;

  return ok({
    order: result.order,
    payment: publicPayment(result.payment),
    qr: qr ? { dataUrl: qr.dataUrl, payload: qr.payload } : null,
    promptPayId: maskPromptPayId(),
    promptPayName: catalog.settings.promptPayName,
    paymentNote: catalog.settings.paymentNote,
    removed: result.removed,
    repriced: result.repriced,
  });
});
