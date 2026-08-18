import { getCart } from './cart';
import {
  sessionOrders,
  paidTotal,
  outstandingTotal,
  unpricedItems,
} from './orders';
import { sessionPayments } from './payments';
import { computeTotals } from './pricing';
import { getCatalog } from './menu-cache';
import type { Cart, GuestSession, Order, Payment } from './types';

/**
 * Everything the guest UI needs in one round trip: session state, the working
 * cart, every order placed on this session with its payment, and the running
 * totals. The client polls this while waiting for the kitchen or for a slip to
 * be checked, so it is deliberately a single cheap Redis read set rather than
 * several endpoints.
 */
export interface SessionSnapshot {
  session: PublicSession;
  cart: Cart;
  cartTotals: ReturnType<typeof computeTotals>;
  /** Oldest first — this is the villa's record of the whole stay. */
  orders: Order[];
  /** Keyed by order id, so a card can show its own payment state. */
  payments: Record<string, PublicPayment>;
  /** Settled and verified. */
  paidTotal: number;
  /** Ordered but not yet confirmed as paid. */
  outstandingTotal: number;
  /**
   * Lines the kitchen still has to weigh. An order holding any of these cannot
   * be paid, and the guest's screen says so rather than showing a total they
   * would be wrong to trust.
   */
  awaitingPricing: { orderId: string; itemId: string; name: string; qty: number }[];
  menuVersion: number;
}

/** The session as the guest is allowed to see it. */
export interface PublicSession {
  id: string;
  tableLabel: string;
  villa: string;
  status: GuestSession['status'];
  guestName: string;
  allergyProfile: string[];
  geoStatus: GuestSession['geoStatus'];
  distanceM: number | null;
  locale: GuestSession['locale'];
  openedAt: string;
  closedAt: string | null;
}

export interface PublicPayment {
  id: string;
  orderId: string;
  status: Payment['status'];
  amount: number;
  rejectReason: string | null;
  slipUploadedAt: string | null;
  hasSlip: boolean;
}

export function publicSession(s: GuestSession): PublicSession {
  return {
    id: s.id,
    tableLabel: s.tableLabel,
    villa: s.villa,
    status: s.status,
    guestName: s.guestName,
    allergyProfile: s.allergyProfile,
    geoStatus: s.geoStatus,
    distanceM: s.distanceM,
    locale: s.locale,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
  };
}

/** Never expose the raw slip URL to the guest side — it is admin evidence. */
export function publicPayment(p: Payment): PublicPayment {
  return {
    id: p.id,
    orderId: p.orderId,
    status: p.status,
    amount: p.amount,
    rejectReason: p.rejectReason,
    slipUploadedAt: p.slipUploadedAt,
    hasSlip: Boolean(p.slipUrl),
  };
}

export async function buildSnapshot(
  session: GuestSession,
): Promise<SessionSnapshot> {
  const [catalog, cart, orders] = await Promise.all([
    getCatalog(),
    getCart(session.id),
    sessionOrders(session.id),
  ]);

  const payments = await sessionPayments(orders.map((o) => o.paymentId));
  const byOrder: Record<string, PublicPayment> = {};
  for (const payment of payments) {
    byOrder[payment.orderId] = publicPayment(payment);
  }

  return {
    session: publicSession(session),
    cart,
    cartTotals: computeTotals(cart.lines, catalog.settings),
    orders,
    payments: byOrder,
    paidTotal: paidTotal(orders),
    outstandingTotal: outstandingTotal(orders),
    awaitingPricing: unpricedItems(orders),
    menuVersion: catalog.version,
  };
}
