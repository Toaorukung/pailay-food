import { requireAdmin } from '@/lib/admin/auth';
import { liveOrders } from '@/lib/orders';
import { sessionPayments } from '@/lib/payments';
import { listOpenSessions } from '@/lib/session';
import { syncHealth } from '@/lib/sheets/queue';
import { handler } from '@/lib/api';
import type { Order, Payment } from '@/lib/types';
import { isConfirmed } from '@/lib/types';

export const dynamic = 'force-dynamic';

export interface AdminLive {
  ok: true;
  orders: Order[];
  /**
   * Every payment belonging to an order in `orders`, keyed by order id.
   *
   * Keyed rather than listed because every screen asks the same question about
   * one order at a time — "has this been paid for" — and the answer no longer
   * lives on the order itself.
   */
  payments: Record<string, Payment>;
  openSessions: {
    id: string;
    tableLabel: string;
    villa: string;
    status: string;
    openedAt: string;
    guestName: string;
    guestPhone: string;
    allergyProfile: string[];
    geoStatus: string;
    distanceM: number | null;
  }[];
  stats: {
    revenueToday: number;
    ordersToday: number;
    activeOrders: number;
    /** Waiting for a member of staff to check them with the guest. */
    pendingConfirm: number;
    /** Confirmed orders with no transfer slip recorded against them yet. */
    awaitingSlip: number;
    /** Lines the kitchen still has to weigh before a ticket can be confirmed. */
    awaitingPricing: number;
  };
  sync: { pending: number; dead: number };
  serverTime: string;
}

/**
 * One endpoint feeds the whole admin cockpit — dashboard, confirm queue,
 * kitchen display and slip queue all poll this.
 *
 * Polling rather than SSE, deliberately. On serverless, an SSE stream pins a
 * function instance open for as long as the tab is; with a handful of staff
 * devices open all service, that is a lot of held concurrency to save a couple
 * of seconds of latency. A 4-second poll from three tablets is a rounding
 * error, survives wifi drops without reconnect logic, and reads entirely from
 * Redis.
 */
export const GET = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'STAFF');
  if (!auth.ok) return auth.response;

  const [orders, sessions, sync] = await Promise.all([
    liveOrders(24),
    listOpenSessions(),
    syncHealth(),
  ]);

  // One mget for the whole board rather than a lookup per card.
  const rows = await sessionPayments(orders.map((o) => o.paymentId));
  const payments: Record<string, Payment> = {};
  for (const payment of rows) payments[payment.orderId] = payment;

  const today = new Date().toISOString().slice(0, 10);
  // Revenue means money recorded, not food requested. A confirmed order with
  // no slip against it is a debt, not a sale — which is exactly what the
  // awaitingSlip figure beside it is counting.
  const todays = orders.filter(
    (o) => o.createdAt.startsWith(today) && isConfirmed(o.status),
  );
  const settledToday = todays.filter(
    (o) => payments[o.id]?.status === 'APPROVED',
  );

  const body: AdminLive = {
    ok: true,
    orders,
    payments,
    openSessions: sessions.map((s) => ({
      id: s.id,
      tableLabel: s.tableLabel,
      villa: s.villa,
      status: s.status,
      openedAt: s.openedAt,
      guestName: s.guestName,
      guestPhone: s.guestPhone ?? '',
      allergyProfile: s.allergyProfile,
      geoStatus: s.geoStatus,
      distanceM: s.distanceM,
    })),
    stats: {
      revenueToday:
        Math.round(settledToday.reduce((n, o) => n + o.total, 0) * 100) / 100,
      ordersToday: todays.length,
      activeOrders: orders.filter(
        (o) => o.status === 'NEW' || o.status === 'COOKING',
      ).length,
      pendingConfirm: orders.filter((o) => o.status === 'PENDING_CONFIRM').length,
      awaitingSlip: orders.filter(
        (o) => isConfirmed(o.status) && payments[o.id]?.status !== 'APPROVED',
      ).length,
      awaitingPricing: orders.filter(
        (o) =>
          o.status === 'PENDING_CONFIRM' &&
          o.items.some((i) => i.priceOnRequest && !i.pricedAt),
      ).length,
    },
    sync,
    serverTime: new Date().toISOString(),
  };

  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
});
