import { kv, K } from './kv';
import { orderId as newOrderId } from './ids';
import { computeTotals } from './pricing';
import { round2 } from './money';
import { clearCart, revalidateCart } from './cart';
import { persist } from './sheets/queue';
import { TABS } from './sheets/schema';
import type {
  Cart,
  GuestSession,
  MenuCatalog,
  Order,
  OrderItem,
  OrderStatus,
} from './types';

/**
 * Orders live in Redis and are mirrored into Sheets by the write-behind queue.
 * The kitchen display reads Redis, so a Sheets outage never stops service.
 */

const ORDER_RETENTION_SECONDS = 3 * 24 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 600;

export interface PlaceOrderResult {
  ok: boolean;
  order?: Order;
  error?: string;
  removed?: { name: string }[];
  repriced?: { name: string; was: number; now: number }[];
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
      if (existing) return { ok: true, order: existing };
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

  const totals = computeTotals(lines, catalog.settings);
  const id = newOrderId();
  const createdAt = new Date().toISOString();

  const items: OrderItem[] = lines.map((l, i) => ({
    id: `${id}-${i + 1}`,
    menuId: l.menuId,
    name: l.name,
    qty: l.qty,
    unitPrice: l.unitPrice,
    lineTotal: Math.round((l.unitPrice * l.qty + Number.EPSILON) * 100) / 100,
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
    status: 'NEW',
    items,
    subtotal: totals.subtotal,
    serviceCharge: totals.serviceCharge,
    vat: totals.vat,
    total: totals.total,
    // Snapshotted so the kitchen ticket stays correct even if the guest edits
    // their allergy profile afterwards.
    allergyProfile: session.allergyProfile,
    allergyLabels: session.allergyProfile.map((id) => {
      const allergen = catalog.allergens.find((a) => a.id === id);
      return allergen ? allergen.name.th || allergen.name.en : id;
    }),
    geoStatus: session.geoStatus,
    locale: session.locale,
  };

  await kv().set(K.order(id), order, { ex: ORDER_RETENTION_SECONDS });
  await kv().rpush(K.sessionOrders(session.id), id).catch(() => {});
  await kv()
    .zadd(K.liveOrders, { score: Date.parse(createdAt), member: id })
    .catch(() => {});
  await kv()
    .sadd(K.ordersByDay(createdAt.slice(0, 10)), id)
    .catch(() => {});

  await kv().set(idemKey, id, { ex: IDEMPOTENCY_TTL_SECONDS }).catch(() => {});
  await clearCart(session.id);
  await persistOrder(order);

  return {
    ok: true,
    order,
    removed: removed.map((l) => ({ name: l.name.th || l.name.en })),
    repriced: repriced.map((l) => {
      const now = lines.find((x) => x.key === l.key)?.unitPrice ?? l.unitPrice;
      return { name: l.name.th || l.name.en, was: l.unitPrice, now };
    }),
  };
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

/** Kitchen display feed. Newest first, last 24 hours. */
export async function liveOrders(sinceHours = 24): Promise<Order[]> {
  const since = Date.now() - sinceHours * 60 * 60 * 1000;
  const ids = await kv()
    .zrange<string[]>(K.liveOrders, since, '+inf', { byScore: true })
    .catch(() => [] as string[]);
  const orders = await getOrders(ids ?? []);
  return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function setOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<Order | null> {
  const order = await getOrder(id);
  if (!order) return null;
  const next = { ...order, status };
  await kv().set(K.order(id), next, { ex: ORDER_RETENTION_SECONDS });
  await persist(TABS.Orders, id, {
    order_id: next.id,
    session_id: next.sessionId,
    table_id: next.tableId,
    created_at: next.createdAt,
    status: next.status,
    item_count: next.items.reduce((n, i) => n + i.qty, 0),
    subtotal: next.subtotal,
    service_charge: next.serviceCharge,
    vat: next.vat,
    total: next.total,
  });
  return next;
}

/** Bill for a session: everything not cancelled. */
export function billableTotal(orders: Order[]): number {
  return (
    Math.round(
      orders
        .filter((o) => o.status !== 'CANCELLED')
        .reduce((sum, o) => sum + o.total, 0) * 100 + Number.EPSILON,
    ) / 100
  );
}

/**
 * Lines the kitchen has weighed but nobody has priced yet.
 *
 * Checkout is blocked while this is non-empty. Letting a guest pay a total
 * that silently excludes a kilo of grouper is the one bug in this system that
 * loses real money on every occurrence.
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
 * Order totals are recomputed from the item list rather than adjusted by a
 * delta, so a correction after a typo lands on the right number instead of
 * compounding the mistake.
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

  const item = order.items.find((i) => i.id === itemId);
  if (!item) return null;
  if (!item.priceOnRequest) return null;

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

  // Rebuild the order's money from its lines using the same maths the cart
  // used, so a repriced order and a normal one are totalled identically.
  const totals = computeTotals(
    items.map((i) => ({
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
    })),
    settings,
  );

  const next: Order = {
    ...order,
    items,
    subtotal: totals.subtotal,
    serviceCharge: totals.serviceCharge,
    vat: totals.vat,
    total: totals.total,
  };

  await kv().set(K.order(orderId), next, { ex: ORDER_RETENTION_SECONDS });
  await persistOrder(next);
  return next;
}
