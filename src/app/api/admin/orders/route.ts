import { requireAdmin } from '@/lib/admin/auth';
import {
  cancelOrder,
  confirmOrder,
  repriceOrderItem,
  setOrderStatus,
  updateOrderItems,
} from '@/lib/orders';
import { getCatalog } from '@/lib/menu-cache';
import { pushOrderConfirmed } from '@/lib/line';
import {
  editOrderItemsSchema,
  orderIdSchema,
  orderStatusSchema,
  repriceSchema,
  parseBody,
} from '@/lib/validation';
import { audit } from '@/lib/audit';
import { clientIp } from '@/lib/ratelimit';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Order actions, split by `?action=`:
 *
 *   (none)   kitchen display status transitions — NEW -> COOKING -> SERVED
 *   confirm  release a pending ticket to the kitchen and message the guest
 *   cancel   kill a ticket the guest changed their mind about
 */
export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'STAFF');
  if (!auth.ok) return auth.response;

  const action = new URL(req.url).searchParams.get('action');

  if (action === 'confirm') {
    const body = await parseBody(req, orderIdSchema);
    if (!body.ok) return fail(body.error);

    const result = await confirmOrder(body.data.orderId, auth.admin.name);
    if (!result.ok) return fail(result.error, 409);

    await audit(
      auth.admin,
      'order.confirm',
      result.order.id,
      { total: result.order.total, villa: result.order.villa },
      clientIp(req),
    );

    // The guest is told what was actually confirmed, which may not be what
    // they sent — staff can have removed or repriced a line on the phone.
    // Awaited so a serverless instance is not frozen mid-push, but its outcome
    // never fails the request: the ticket is confirmed either way, and a
    // member of staff can ring a guest whose message did not arrive.
    const catalog = await getCatalog();
    const notified = await pushOrderConfirmed(result.order, catalog.settings);

    return ok({ order: result.order, notified });
  }

  if (action === 'cancel') {
    const body = await parseBody(req, orderIdSchema);
    if (!body.ok) return fail(body.error);

    const order = await cancelOrder(body.data.orderId, auth.admin.name);
    if (!order) return fail('ไม่พบออเดอร์', 404);

    await audit(auth.admin, 'order.cancel', order.id, {}, clientIp(req));
    return ok({ order });
  }

  const body = await parseBody(req, orderStatusSchema);
  if (!body.ok) return fail(body.error);

  const order = await setOrderStatus(body.data.orderId, body.data.status);
  if (!order) {
    return fail('ไม่พบออเดอร์ หรือออเดอร์นี้ยังต้องกดยืนยันก่อน', 409);
  }

  await audit(
    auth.admin,
    'order.status',
    order.id,
    { status: body.data.status },
    clientIp(req),
  );

  return ok({ order });
});

/**
 * Enter the weighed price for a market-price line.
 *
 * Restricted to MANAGER: this is the one place a member of staff can decide
 * what a guest pays. It happens on the confirm screen, before the guest has
 * been told a total — the order's totals are rebuilt from its lines, and both
 * the line and the audit log record who set the figure.
 */
export const PATCH = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'MANAGER');
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, repriceSchema);
  if (!body.ok) return fail(body.error);

  const catalog = await getCatalog();
  const order = await repriceOrderItem(
    body.data.orderId,
    body.data.itemId,
    body.data.unitPrice,
    auth.admin.name,
    catalog.settings,
  );

  if (!order) {
    return fail('ไม่พบรายการ หรือรายการนี้ไม่ใช่แบบถามราคา', 404);
  }

  await audit(
    auth.admin,
    'order.reprice',
    `${body.data.orderId}/${body.data.itemId}`,
    { unitPrice: body.data.unitPrice, orderTotal: order.total },
    clientIp(req),
  );

  return ok({ order });
});

/**
 * Adjust the lines on a pending ticket — "we are out of the sea bass", "make
 * it four not two". Only while the order is still waiting to be confirmed;
 * `updateOrderItems` enforces that, since after confirmation the guest holds a
 * message saying what they are getting.
 */
export const PUT = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'STAFF');
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, editOrderItemsSchema);
  if (!body.ok) return fail(body.error);

  const catalog = await getCatalog();
  const result = await updateOrderItems(
    body.data.orderId,
    body.data.items,
    catalog.settings,
  );
  if (!result.ok) return fail(result.error, 409);

  await audit(
    auth.admin,
    'order.editItems',
    body.data.orderId,
    { items: body.data.items, orderTotal: result.order.total },
    clientIp(req),
  );

  return ok({ order: result.order });
});
