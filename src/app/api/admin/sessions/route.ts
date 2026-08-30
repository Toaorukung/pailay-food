import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/auth';
import { listOpenSessions, closeSession, getSession } from '@/lib/session';
import { sessionOrders, paidTotal, outstandingTotal } from '@/lib/orders';
import { sessionPayments } from '@/lib/payments';
import { audit } from '@/lib/audit';
import { clientIp } from '@/lib/ratelimit';
import { parseBody } from '@/lib/validation';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

const closeSchema = z.object({
  sessionId: z.string().min(1).max(64),
  reason: z.string().max(300).default(''),
});

export const GET = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'STAFF');
  if (!auth.ok) return auth.response;

  const sessions = await listOpenSessions();
  const withTotals = await Promise.all(
    sessions.map(async (s) => ({
      ...s,
      ...(await (async () => {
        const orders = await sessionOrders(s.id);
        // Settled is a fact about the payment, not the order: guests pay off
        // the app and an admin records the slip afterwards.
        const payments = await sessionPayments(orders.map((o) => o.paymentId));
        const byOrder = new Map(payments.map((p) => [p.orderId, p.status]));
        const statusOf = (order: (typeof orders)[number]) => byOrder.get(order.id);
        return {
          orderCount: orders.length,
          paidTotal: paidTotal(orders, statusOf),
          outstandingTotal: outstandingTotal(orders, statusOf),
        };
      })()),
    })),
  );
  return ok({ sessions: withTotals });
});

/**
 * Force-close. Used when guests check out, or leave without settling. The next
 * guest who picks that villa on /order gets a clean session, and the closed
 * link becomes the previous guest's receipt.
 */
export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'MANAGER');
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, closeSchema);
  if (!body.ok) return fail(body.error);

  const existing = await getSession(body.data.sessionId);
  if (!existing) return fail('ไม่พบเซสชันนี้', 404);

  const closed = await closeSession(body.data.sessionId, auth.admin.name);
  await audit(
    auth.admin,
    'session.expire',
    body.data.sessionId,
    { reason: body.data.reason, villa: existing.villa },
    clientIp(req),
  );

  return ok({ session: closed });
});
