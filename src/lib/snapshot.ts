import { getCart } from './cart';
import { sessionOrders, billableTotal, unpricedItems } from './orders';
import { getPayment } from './payments';
import { computeTotals } from './pricing';
import { getCatalog } from './menu-cache';
import type { Cart, GuestSession, Order, Payment } from './types';

/**
 * Everything the guest UI needs in one round trip: session state, cart, order
 * history, and the live payment. The client polls this while waiting for the
 * kitchen or for slip approval, so it is deliberately a single cheap Redis
 * read set rather than several endpoints.
 */
export interface SessionSnapshot {
  session: PublicSession;
  cart: Cart;
  cartTotals: ReturnType<typeof computeTotals>;
  orders: Order[];
  /** Sum of priced lines only. Partial while `awaitingPricing` is non-empty. */
  billTotal: number;
  /**
   * Lines the kitchen still has to weigh and price. Checkout is blocked until
   * this is empty, and the bill page says so rather than showing a total the
   * guest would be wrong to trust.
   */
  awaitingPricing: { orderId: string; itemId: string; name: string; qty: number }[];
  payment: PublicPayment | null;
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

  const payment = session.activePaymentId
    ? await getPayment(session.activePaymentId)
    : null;

  return {
    session: publicSession(session),
    cart,
    cartTotals: computeTotals(cart.lines, catalog.settings),
    orders,
    billTotal: billableTotal(orders),
    awaitingPricing: unpricedItems(orders),
    payment: payment ? publicPayment(payment) : null,
    menuVersion: catalog.version,
  };
}
