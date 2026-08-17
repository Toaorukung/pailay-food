import { requireAdmin } from '@/lib/admin/auth';
import { setOrderStatus, repriceOrderItem } from '@/lib/orders';
import { getCatalog } from '@/lib/menu-cache';
import { orderStatusSchema, repriceSchema, parseBody } from '@/lib/validation';
import { audit } from '@/lib/audit';
import { clientIp } from '@/lib/ratelimit';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Kitchen display status transitions. */
export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'STAFF');
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, orderStatusSchema);
  if (!body.ok) return fail(body.error);

  const order = await setOrderStatus(body.data.orderId, body.data.status);
  if (!order) return fail('ไม่พบออเดอร์', 404);

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
 * what a guest pays, and it happens after the guest has already agreed to
 * order. The order's totals are rebuilt from its lines, and both the line and
 * the audit log record who set the figure.
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
