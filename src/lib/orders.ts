import { kv, K } from './kv';
import { orderId as newOrderId, paymentId as newPaymentId } from './ids';
import { computeTotals, resolveLine } from './pricing';
import { round2 } from './money';
import { clearCart, revalidateCart } from './cart';
import {
  bangkokMinutes,
  orderWindowState,
  windowMessageTH,
  itemTimeState,
  itemStateMessageTH,
  minQtyOf,
  minQtyMessageTH,
} from './availability';
import { persist } from './sheets/queue';
import { TABS } from './sheets/schema';
import type {
  Cart,
  CartLine,
  GuestSession,
  MenuCatalog,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
} from './types';
import { isConfirmed } from './types';

/**
 * Orders live in Redis and are mirrored into Sheets by the write-behind queue.
 * The kitchen display reads Redis, so a Sheets outage never stops service.
 *
 * An order is checked by a human before it is cooked. Confirming a cart
 * creates the order as PENDING_CONFIRM together with the payment record it
 * will eventually be settled against, and notifies staff on Lark. Staff open
 * /admin/pending, ring the villa, adjust or price whatever needs it, and
 * confirm — which is the moment the order reaches the kitchen and the guest
 * gets their confirmation on LINE.
 *
 * Money is not part of that path. The guest pays off the app and an admin
 * uploads the slip against the payment afterwards, so nothing about payment
 * state can stop food being cooked.
 */

const ORDER_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 600;

export interface PlaceOrderResult {
  ok: boolean;
  order?: Order;
  payment?: Payment;
  error?: string;
  removed?: { name: string }[];
  repriced?: { name: string; was: number; now: number }[];
  /**
   * This idempotency key had already produced an order — a double tap or a
   * retry after a dropped response. The caller gets the original order back,
   * and must not repeat anything it does on a real placement (notifying staff
   * twice for one ticket is exactly the confusion the queue exists to avoid).
   */
  duplicate?: boolean;
}

export async function placeOrder(
  session: GuestSession,
  cart: Cart,
  catalog: MenuCatalog,
  idempotencyKey: string,
): Promise<PlaceOrderResult> {
  // A double-tap on a slow connection must not produce two identical orders.
  const idemKey = `order:idem:${session.id}:${idempotencyKey}`;
  const claimed = await kv()
    .set(idemKey, 'pending', { nx: true, ex: IDEMPOTENCY_TTL_SECONDS })
    .catch(() => 'skip');

  if (!claimed) {
    const existingId = await kv().get<string>(idemKey).catch(() => null);
    if (existingId && existingId !== 'pending') {
      const existing = await getOrder(existingId);
      if (existing) {
        const payment = await kv()
          .get<Payment>(K.payment(existing.paymentId))
          .catch(() => null);
        return {
          ok: true,
          order: existing,
          payment: payment ?? undefined,
          duplicate: true,
        };
      }
    }
    return { ok: false, error: 'กำลังส่งออเดอร์อยู่ กรุณารอสักครู่' };
  }

  if (cart.lines.length === 0) {
    await kv().del(idemKey).catch(() => {});
    return { ok: false, error: 'ตะกร้าว่าง' };
  }

  // Prices and availability are re-read from the catalog here, not taken from
  // the cart snapshot the guest has been carrying around.
  const { lines, removed, repriced } = revalidateCart(cart, catalog);

  if (lines.length === 0) {
    await kv().del(idemKey).catch(() => {});
    return {
      ok: false,
      error: 'รายการในตะกร้าหมดทั้งหมด กรุณาเลือกใหม่',
      removed: removed.map((l) => ({ name: l.name.th || l.name.en })),
    };
  }

  // Time-of-day and quantity rules, enforced here where they cannot be
  // bypassed. The guest UI shows the same limits, but the page is convenience;
  // a hand-crafted request past the cutoff is refused right here.
  const nowMin = bangkokMinutes();
  const window = orderWindowState(catalog.settings, nowMin);
  if (!window.open) {
    await kv().del(idemKey).catch(() => {});
    return { ok: false, error: windowMessageTH(window) };
  }

  for (const line of lines) {
    const item = catalog.items.find((i) => i.id === line.menuId);
    if (!item) continue;
    const name = line.name.th || line.name.en;

    const timeState = itemTimeState(item, catalog.settings, nowMin);
    if (!timeState.orderable) {
      await kv().del(idemKey).catch(() => {});
      return { ok: false, error: itemStateMessageTH(name, timeState) };
    }

    const min = minQtyOf(item);
    if (item.minQty > 0 && line.qty < min) {
      await kv().del(idemKey).catch(() => {});
      return { ok: false, error: minQtyMessageTH(name, min) };
    }
  }

  const totals = computeTotals(lines, catalog.settings);
  const id = newOrderId();
  const paymentId = newPaymentId();
  const createdAt = new Date().toISOString();

  const items: OrderItem[] = lines.map((l, i) => ({
    id: `${id}-${i + 1}`,
    menuId: l.menuId,
    name: l.name,
    qty: l.qty,
    unitPrice: l.unitPrice,
    lineTotal: round2(l.unitPrice * l.qty),
    options: l.options,
    note: l.note,
    allergenAck: l.allergenAck,
    priceOnRequest: l.priceOnRequest,
    pricedBy: null,
    pricedAt: null,
  }));

  const order: Order = {
    id,
    sessionId: session.id,
    tableId: session.tableId,
    tableLabel: session.tableLabel,
    villa: session.villa,
    createdAt,
    // Every ticket waits for a member of staff, whether or not it holds
    // anything sold by weight. Pricing the scale lines is one of the things
    // they do on the confirm screen, not a separate state to get stuck in.
    status: 'PENDING_CONFIRM',
    items,
    subtotal: totals.subtotal,
    serviceCharge: totals.serviceCharge,
    vat: totals.vat,
    total: totals.total,
    paymentId,
    lineUserId: session.lineUserId ?? '',
    confirmedAt: null,
    confirmedBy: null,
    // Snapshotted so the kitchen ticket stays correct even if the guest edits
    // their allergy profile afterwards.
    allergyProfile: session.allergyProfile,
    allergyLabels: session.allergyProfile.map((allergenId) => {
      const allergen = catalog.allergens.find((a) => a.id === allergenId);
      return allergen ? allergen.name.th || allergen.name.en : allergenId;
    }),
    geoStatus: session.geoStatus,
    locale: session.locale,
  };

  const payment: Payment = {
    id: paymentId,
    sessionId: session.id,
    tableLabel: session.tableLabel,
    villa: session.villa,
    orderId: id,
    amount: order.total,
    method: 'promptpay',
    status: 'PENDING',
    slipUrl: null,
    slipUploadedAt: null,
    verifiedBy: null,
    verifiedAt: null,
    rejectReason: null,
    createdAt,
  };

  await saveOrder(order);
  await kv().rpush(K.sessionOrders(session.id), id).catch(() => {});
  await kv()
    .zadd(K.liveOrders, { score: Date.parse(createdAt), member: id })
    .catch(() => {});
  await kv()
    .sadd(K.ordersByDay(createdAt.slice(0, 10)), id)
    .catch(() => {});

  const { savePayment } = await import('./payments');
  await savePayment(payment);

  await kv().set(idemKey, id, { ex: IDEMPOTENCY_TTL_SECONDS }).catch(() => {});
  await clearCart(session.id);

  return {
    ok: true,
    order,
    payment,
    removed: removed.map((l) => ({ name: l.name.th || l.name.en })),
    repriced: repriced.map((l) => {
      const now = lines.find((x) => x.key === l.key)?.unitPrice ?? l.unitPrice;
      return { name: l.name.th || l.name.en, was: l.unitPrice, now };
    }),
  };
}

async function saveOrder(order: Order): Promise<Order> {
  await kv().set(K.order(order.id), order, { ex: ORDER_RETENTION_SECONDS });
  await persistOrder(order);
  return order;
}

async function persistOrder(order: Order): Promise<void> {
  await persist(TABS.Orders, order.id, {
    order_id: order.id,
    session_id: order.sessionId,
    table_id: order.tableId,
    created_at: order.createdAt,
    status: order.status,
    item_count: order.items.reduce((n, i) => n + i.qty, 0),
    subtotal: order.subtotal,
    service_charge: order.serviceCharge,
    vat: order.vat,
    total: order.total,
    confirmed_at: order.confirmedAt ?? '',
    confirmed_by: order.confirmedBy ?? '',
  });

  for (const item of order.items) {
    await persist(TABS.OrderItems, item.id, {
      order_item_id: item.id,
      order_id: order.id,
      menu_id: item.menuId,
      name_snapshot: item.name.th || item.name.en,
      option_ids: item.options.map((o) => o.optionId).join(','),
      option_snapshot: item.options
        .map((o) => o.name.th || o.name.en)
        .join(' / '),
      qty: item.qty,
      unit_price: item.unitPrice,
      line_total: item.lineTotal,
      note: item.note,
      allergen_ack: item.allergenAck,
      priced_by: item.pricedBy ?? '',
      priced_at: item.pricedAt ?? '',
    });
  }
}

// ── Reads ───────────────────────────────────────────────────

export async function getOrder(id: string): Promise<Order | null> {
  return (await kv().get<Order>(K.order(id)).catch(() => null)) ?? null;
}

export async function getOrders(ids: string[]): Promise<Order[]> {
  if (ids.length === 0) return [];
  const rows: (Order | null)[] = await kv()
    .mget<(Order | null)[]>(...ids.map((id) => K.order(id)))
    .catch(() => [] as (Order | null)[]);
  // An id can outlive its record once the retention window passes; drop those
  // rather than letting a null through into the kitchen display.
  return rows.filter((o): o is Order => o !== null && o !== undefined);
}

export async function sessionOrders(sessionId: string): Promise<Order[]> {
  const ids = await kv()
    .lrange<string>(K.sessionOrders(sessionId), 0, -1)
    .catch(() => [] as string[]);
  return getOrders(ids ?? []);
}

/**
 * Kitchen display feed.
 *
 * Deliberately returns every order, paid or not: the display filters to the
 * cooking columns itself, and the same feed drives the dashboard, which needs
 * to show what is still waiting on a price or a slip.
 */
export async function liveOrders(sinceHours = 24): Promise<Order[]> {
  const since = Date.now() - sinceHours * 60 * 60 * 1000;
  const ids = await kv()
    .zrange<string[]>(K.liveOrders, since, '+inf', { byScore: true })
    .catch(() => [] as string[]);
  const orders = await getOrders(ids ?? []);
  return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Transitions ─────────────────────────────────────────────

export async function setOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<Order | null> {
  const order = await getOrder(id);
  if (!order) return null;
  // A ticket nobody has confirmed must not be dragged onto the board by hand:
  // confirming is what messages the guest, and skipping it would start the
  // kitchen on food the guest was never told about. Cancelling is allowed —
  // that is a legitimate way to kill a pending ticket.
  if (order.status === 'PENDING_CONFIRM' && status !== 'CANCELLED') return null;
  return saveOrder({ ...order, status });
}

/**
 * Staff release a ticket to the kitchen.
 *
 * The single gate in the whole flow. Everything downstream keys off it: the
 * order appears on the kitchen display, its payment joins the queue of slips
 * an admin still has to upload, and the guest is messaged on LINE.
 *
 * Refuses while any market-price line is still unpriced. Confirming one would
 * put a ticket into the kitchen and a message in the guest's hand with a total
 * that is missing a kilo of grouper, and the guest has already been told what
 * they owe by then.
 */
export async function confirmOrder(
  id: string,
  adminName: string,
): Promise<{ ok: true; order: Order } | { ok: false; error: string }> {
  const order = await getOrder(id);
  if (!order) return { ok: false, error: 'ไม่พบออเดอร์' };
  if (isConfirmed(order.status)) return { ok: true, order };
  if (order.status === 'CANCELLED') {
    return { ok: false, error: 'ออเดอร์นี้ถูกยกเลิกไปแล้ว' };
  }
  if (order.items.length === 0) {
    return { ok: false, error: 'ออเดอร์นี้ไม่เหลือรายการแล้ว กรุณายกเลิกแทน' };
  }
  if (order.items.some((i) => i.priceOnRequest && !i.pricedAt)) {
    return { ok: false, error: 'ยังมีรายการที่ต้องใส่ราคาก่อนยืนยัน' };
  }

  const confirmed = await saveOrder({
    ...order,
    status: 'NEW',
    confirmedAt: new Date().toISOString(),
    confirmedBy: adminName,
  });

  // The order is now real money owed, so it joins the list of slips an admin
  // has to upload against.
  const { updatePaymentAmount, markAwaitingSlip } = await import('./payments');
  await updatePaymentAmount(confirmed.paymentId, confirmed.total);
  await markAwaitingSlip(confirmed.paymentId);

  return { ok: true, order: confirmed };
}

/** Staff kill a ticket — the guest changed their mind on the phone. */
export async function cancelOrder(
  id: string,
  adminName: string,
): Promise<Order | null> {
  const order = await getOrder(id);
  if (!order) return null;
  if (order.status === 'CANCELLED') return order;

  const cancelled = await saveOrder({
    ...order,
    status: 'CANCELLED',
    confirmedBy: adminName,
    confirmedAt: order.confirmedAt ?? new Date().toISOString(),
  });

  // Nothing is owed on a cancelled ticket, so it leaves the slip queue.
  const { dropFromSlipQueue } = await import('./payments');
  await dropFromSlipQueue(cancelled.paymentId);
  return cancelled;
}

/**
 * Rebuilds an order's money from its lines.
 *
 * Totals are always recomputed from the item list rather than adjusted by a
 * delta, so a correction after a typo lands on the right number instead of
 * compounding the mistake — and so a repriced order and an ordinary one are
 * totalled by exactly the same code.
 */
export function retotal(
  order: Order,
  items: OrderItem[],
  settings: MenuCatalog['settings'],
): Order {
  const lines: CartLine[] = items.map((i) => ({
    key: i.id,
    menuId: i.menuId,
    name: i.name,
    qty: i.qty,
    unitPrice: i.unitPrice,
    options: i.options,
    note: i.note,
    allergenAck: i.allergenAck,
    priceOnRequest: i.priceOnRequest,
    addedAt: order.createdAt,
  }));
  const totals = computeTotals(lines, settings);

  return {
    ...order,
    items,
    subtotal: totals.subtotal,
    serviceCharge: totals.serviceCharge,
    vat: totals.vat,
    total: totals.total,
  };
}

export interface OrderItemEdit {
  itemId: string;
  /** 0 removes the line. */
  qty: number;
}

/**
 * Staff adjust a ticket while they have the guest on the phone — "we are out
 * of the sea bass", "make it four not two".
 *
 * Only while the order is still pending. Once it is confirmed the guest has
 * been sent a message saying what they are getting, and quietly editing behind
 * that message is how a bill stops matching what anyone agreed to.
 */
export async function updateOrderItems(
  orderId: string,
  edits: OrderItemEdit[],
  settings: MenuCatalog['settings'],
): Promise<{ ok: true; order: Order } | { ok: false; error: string }> {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: 'ไม่พบออเดอร์' };
  if (order.status !== 'PENDING_CONFIRM') {
    return { ok: false, error: 'แก้ไขได้เฉพาะออเดอร์ที่ยังรอคอนเฟิร์มเท่านั้น' };
  }

  const byId = new Map(edits.map((e) => [e.itemId, e.qty]));
  const unknown = edits.filter((e) => !order.items.some((i) => i.id === e.itemId));
  if (unknown.length > 0) return { ok: false, error: 'ไม่พบรายการที่จะแก้ไข' };

  const items = order.items
    .map((item) => {
      const qty = byId.get(item.id);
      if (qty === undefined || qty === item.qty) return item;
      return { ...item, qty, lineTotal: round2(item.unitPrice * qty) };
    })
    .filter((item) => item.qty > 0);

  if (items.length === 0) {
    return { ok: false, error: 'ลบรายการทั้งหมดไม่ได้ — ให้ยกเลิกออเดอร์แทน' };
  }

  const next = retotal(order, items, settings);
  await saveOrder(next);

  const { updatePaymentAmount } = await import('./payments');
  await updatePaymentAmount(next.paymentId, next.total);

  return { ok: true, order: next };
}

export interface ReplaceOrderItemInput {
  orderId: string;
  itemId: string;
  menuId: string;
  qty: number;
  optionIds?: string[];
  note?: string;
}

/**
 * Staff replace a dish on a pending ticket with another menu item — e.g. when
 * an item is sold out or the guest requests a swap over the phone.
 */
export async function replaceOrderItem(
  input: ReplaceOrderItemInput,
  catalog: MenuCatalog,
): Promise<{ ok: true; order: Order } | { ok: false; error: string }> {
  const order = await getOrder(input.orderId);
  if (!order) return { ok: false, error: 'ไม่พบออเดอร์' };
  if (order.status !== 'PENDING_CONFIRM') {
    return { ok: false, error: 'แก้ไขได้เฉพาะออเดอร์ที่ยังรอคอนเฟิร์มเท่านั้น' };
  }

  const existingIdx = order.items.findIndex((i) => i.id === input.itemId);
  if (existingIdx === -1) {
    return { ok: false, error: 'ไม่พบรายการที่ต้องการเปลี่ยน' };
  }

  const resolved = resolveLine(catalog, input.menuId, input.optionIds ?? []);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const qty = Math.max(1, input.qty);
  const newItem: OrderItem = {
    id: `${order.id}-${Date.now().toString(36).slice(-4)}`,
    menuId: resolved.item.id,
    name: resolved.item.name,
    qty,
    unitPrice: resolved.unitPrice,
    lineTotal: round2(resolved.unitPrice * qty),
    options: resolved.options,
    note: (input.note ?? '').trim().slice(0, 500),
    allergenAck: true,
    priceOnRequest: resolved.item.priceOnRequest,
    pricedAt: null,
    pricedBy: null,
  };

  const items = [...order.items];
  items[existingIdx] = newItem;

  const next = retotal(order, items, catalog.settings);
  await saveOrder(next);

  const { updatePaymentAmount } = await import('./payments');
  await updatePaymentAmount(next.paymentId, next.total);

  return { ok: true, order: next };
}

export interface AddOrderItemInput {
  orderId: string;
  menuId: string;
  qty: number;
  optionIds?: string[];
  note?: string;
}

/**
 * Staff add an extra dish to a pending ticket upon guest request during confirmation.
 */
export async function addOrderItem(
  input: AddOrderItemInput,
  catalog: MenuCatalog,
): Promise<{ ok: true; order: Order } | { ok: false; error: string }> {
  const order = await getOrder(input.orderId);
  if (!order) return { ok: false, error: 'ไม่พบออเดอร์' };
  if (order.status !== 'PENDING_CONFIRM') {
    return { ok: false, error: 'เพิ่มรายการได้เฉพาะออเดอร์ที่ยังรอคอนเฟิร์มเท่านั้น' };
  }

  const resolved = resolveLine(catalog, input.menuId, input.optionIds ?? []);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const qty = Math.max(1, input.qty);
  const newItem: OrderItem = {
    id: `${order.id}-${Date.now().toString(36).slice(-4)}`,
    menuId: resolved.item.id,
    name: resolved.item.name,
    qty,
    unitPrice: resolved.unitPrice,
    lineTotal: round2(resolved.unitPrice * qty),
    options: resolved.options,
    note: (input.note ?? '').trim().slice(0, 500),
    allergenAck: true,
    priceOnRequest: resolved.item.priceOnRequest,
    pricedAt: null,
    pricedBy: null,
  };

  const items = [...order.items, newItem];
  const next = retotal(order, items, catalog.settings);
  await saveOrder(next);

  const { updatePaymentAmount } = await import('./payments');
  await updatePaymentAmount(next.paymentId, next.total);

  return { ok: true, order: next };
}

// ── Money ───────────────────────────────────────────────────

/**
 * Whether an order counts as money in.
 *
 * Payment happens outside the app, so an order's own status says nothing about
 * it — the answer lives on the payment record, which an admin marks settled by
 * uploading the transfer slip. Anything with no payment record found is
 * treated as unsettled, which is the safe direction to be wrong in.
 */
export function isSettled(
  order: Order,
  paymentStatus: Payment['status'] | undefined,
): boolean {
  return isConfirmed(order.status) && paymentStatus === 'APPROVED';
}

/** What the villa has actually paid across the whole session. */
export function paidTotal(
  orders: Order[],
  paymentStatusOf: (order: Order) => Payment['status'] | undefined,
): number {
  return round2(
    orders
      .filter((o) => isSettled(o, paymentStatusOf(o)))
      .reduce((sum, o) => sum + o.total, 0),
  );
}

/**
 * Confirmed but not yet settled — what the villa still owes.
 *
 * Pending tickets are deliberately excluded: staff have not agreed to them
 * yet, and showing a guest an amount owed for food that might be cancelled on
 * the phone is worse than showing nothing.
 */
export function outstandingTotal(
  orders: Order[],
  paymentStatusOf: (order: Order) => Payment['status'] | undefined,
): number {
  return round2(
    orders
      .filter((o) => isConfirmed(o.status) && paymentStatusOf(o) !== 'APPROVED')
      .reduce((sum, o) => sum + o.total, 0),
  );
}

/**
 * Lines the kitchen has to weigh before the ticket can be confirmed.
 *
 * A pending order holding any of these cannot be confirmed, so both the
 * guest's screen and the confirm queue surface them rather than showing a
 * total that is quietly missing a kilo of grouper.
 */
export function unpricedItems(
  orders: Order[],
): { orderId: string; itemId: string; name: string; qty: number }[] {
  return orders
    .filter((o) => o.status !== 'CANCELLED')
    .flatMap((o) =>
      o.items
        .filter((i) => i.priceOnRequest && !i.pricedAt)
        .map((i) => ({
          orderId: o.id,
          itemId: i.id,
          name: i.name.th || i.name.en,
          qty: i.qty,
        })),
    );
}

/**
 * Staff enter the weighed price for one order line.
 *
 * Done on the confirm screen, before the guest is told a total. The order
 * stays pending either way — pricing is one of the things staff do while
 * checking a ticket, not a state change of its own.
 */
export async function repriceOrderItem(
  orderId: string,
  itemId: string,
  unitPrice: number,
  adminName: string,
  settings: MenuCatalog['settings'],
): Promise<Order | null> {
  const order = await getOrder(orderId);
  if (!order) return null;

  const target = order.items.find((i) => i.id === itemId);
  if (!target || !target.priceOnRequest) return null;

  const items = order.items.map((i) =>
    i.id === itemId
      ? {
          ...i,
          unitPrice: round2(unitPrice),
          lineTotal: round2(unitPrice * i.qty),
          pricedBy: adminName,
          pricedAt: new Date().toISOString(),
        }
      : i,
  );

  const next = retotal(order, items, settings);
  await saveOrder(next);

  // The payment was raised with a placeholder amount; it has to follow.
  const { updatePaymentAmount } = await import('./payments');
  await updatePaymentAmount(next.paymentId, next.total);

  return next;
}
