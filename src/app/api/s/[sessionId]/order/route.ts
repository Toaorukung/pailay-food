import { requireSession, guardResponse } from '@/lib/session';
import { getCatalog } from '@/lib/menu-cache';
import { getCart } from '@/lib/cart';
import { placeOrder } from '@/lib/orders';
import { rateLimit } from '@/lib/ratelimit';
import { placeOrderSchema, parseBody } from '@/lib/validation';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Sends the cart to the kitchen.
 *
 * `requireSession` here is the load-bearing line for the whole "old link stops
 * working" requirement — a CLOSED session returns 403 from this route even
 * with a perfectly valid cookie and a hand-crafted request. The page-level
 * checks are convenience; this is the enforcement.
 */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId);
  if (!guard.ok) return guardResponse(guard);

  const limit = await rateLimit('order', sessionId);
  if (!limit.ok) return fail('สั่งอาหารถี่เกินไป กรุณารอสักครู่', 429);

  const body = await parseBody(req, placeOrderSchema);
  if (!body.ok) return fail(body.error);

  const [catalog, cart] = await Promise.all([
    getCatalog(),
    getCart(sessionId),
  ]);

  const result = await placeOrder(
    guard.session,
    cart,
    catalog,
    body.data.idempotencyKey,
  );

  if (!result.ok) {
    return fail(result.error ?? 'ส่งออเดอร์ไม่สำเร็จ', 400, {
      removed: result.removed,
    });
  }

  return ok({
    order: result.order,
    removed: result.removed,
    repriced: result.repriced,
  });
});
