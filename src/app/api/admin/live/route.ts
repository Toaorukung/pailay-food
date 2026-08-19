import { requireAdmin } from '@/lib/admin/auth';
import { liveOrders } from '@/lib/orders';
import { pendingPayments } from '@/lib/payments';
import { listOpenSessions } from '@/lib/session';
import { syncHealth } from '@/lib/sheets/queue';
import { handler } from '@/lib/api';
import type { Order, Payment } from '@/lib/types';
import { isPaid } from '@/lib/types';

export const dynamic = 'force-dynamic';

export interface AdminLive {
  ok: true;
  orders: Order[];
  payments: Payment[];
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
    pendingPayments: number;
    /** Orders stuck until staff weigh something. */
    awaitingPricing: number;
    /** Confirmed by the guest but not yet transferred. */
    unpaidOrders: number;
  };
  sync: { pending: number; dead: number };
  serverTime: string;
}

/**
 * One endpoint feeds the whole admin cockpit — dashboard, kitchen display and
 * payment queue all poll this.
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

  const [orders, payments, sessions, sync] = await Promise.all([
    liveOrders(24),
    pendingPayments(),
    listOpenSessions(),
    syncHealth(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  // Revenue means money received, not food requested: an order sitting
  // unpaid is a liability, not a sale.
  const todays = orders.filter(
    (o) => o.createdAt.startsWith(today) && isPaid(o.status),
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
      revenueToday: Math.round(todays.reduce((n, o) => n + o.total, 0) * 100) / 100,
      ordersToday: todays.length,
      activeOrders: orders.filter(
        (o) => o.status === 'NEW' || o.status === 'COOKING',
      ).length,
      awaitingPricing: orders.filter((o) => o.status === 'AWAITING_PRICING').length,
      unpaidOrders: orders.filter((o) => o.status === 'UNPAID').length,
      pendingPayments: payments.length,
    },
    sync,
    serverTime: new Date().toISOString(),
  };

  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
});
