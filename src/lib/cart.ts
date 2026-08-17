import { kv, K, SESSION_TTL_SECONDS } from './kv';
import { emptyCart, resolveLine, buildLine, type ResolveError } from './pricing';
import type { Cart, CartLine, MenuCatalog } from './types';

/**
 * Carts live only in Redis. They are working state, not a business record —
 * nothing about a cart belongs in the spreadsheet until it becomes an order.
 *
 * A villa can have several phones on the same session, all editing the same
 * cart. Read-modify-write without coordination silently loses items when two
 * people tap "add" at once, so every mutation runs under a short lock.
 */

const LOCK_TTL_MS = 3_000;
const LOCK_WAIT_MS = 2_000;

async function withCartLock<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockKey = `lock:cart:${sessionId}`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  let held = false;

  while (Date.now() < deadline) {
    const got = await kv()
      .set(lockKey, 1, { nx: true, px: LOCK_TTL_MS })
      .catch(() => null);
    if (got) {
      held = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 40));
  }

  try {
    return await fn();
  } finally {
    if (held) await kv().del(lockKey).catch(() => {});
  }
  // Note: if the lock could not be acquired within the window we proceed
  // anyway. Blocking a hungry guest for a lock is worse than the rare lost
  // increment, and the deadline is generous relative to a Redis round trip.
}

export async function getCart(sessionId: string): Promise<Cart> {
  const cart = await kv().get<Cart>(K.cart(sessionId)).catch(() => null);
  return cart ?? emptyCart(sessionId);
}

async function saveCart(cart: Cart): Promise<Cart> {
  const next = { ...cart, updatedAt: new Date().toISOString() };
  await kv().set(K.cart(cart.sessionId), next, { ex: SESSION_TTL_SECONDS });
  return next;
}

export interface CartMutation {
  ok: boolean;
  cart: Cart;
  error?: string;
  code?: ResolveError['code'];
}

export async function addToCart(
  sessionId: string,
  catalog: MenuCatalog,
  input: {
    menuId: string;
    qty: number;
    optionIds: string[];
    note: string;
    allergenAck: boolean;
  },
): Promise<CartMutation> {
  const resolved = resolveLine(catalog, input.menuId, input.optionIds);
  if (!resolved.ok) {
    return {
      ok: false,
      cart: await getCart(sessionId),
      error: resolved.error,
      code: resolved.code,
    };
  }

  return withCartLock(sessionId, async () => {
    const cart = await getCart(sessionId);
    const line = buildLine(resolved, input.qty, input.note, input.allergenAck);

    const existing = cart.lines.find((l) => l.key === line.key);
    if (existing) {
      // Same dish, same options, same note — merge instead of stacking
      // duplicate rows on the kitchen ticket.
      existing.qty = Math.min(99, existing.qty + line.qty);
      existing.allergenAck = existing.allergenAck || line.allergenAck;
    } else {
      cart.lines.push(line);
    }

    return { ok: true, cart: await saveCart(cart) };
  });
}

/** qty 0 removes the line. */
export async function setLineQty(
  sessionId: string,
  key: string,
  qty: number,
): Promise<CartMutation> {
  return withCartLock(sessionId, async () => {
    const cart = await getCart(sessionId);
    const idx = cart.lines.findIndex((l) => l.key === key);
    if (idx === -1) {
      return { ok: false, cart, error: 'ไม่พบรายการในตะกร้า' };
    }
    if (qty <= 0) cart.lines.splice(idx, 1);
    else cart.lines[idx].qty = qty;
    return { ok: true, cart: await saveCart(cart) };
  });
}

export async function clearCart(sessionId: string): Promise<Cart> {
  await kv().del(K.cart(sessionId)).catch(() => {});
  return emptyCart(sessionId);
}

/**
 * Re-checks a whole cart against the live catalog just before it becomes an
 * order. Between adding a dish and pressing "order" the kitchen may have 86'd
 * it or an admin may have changed the price — the guest must not be billed
 * from a stale copy.
 */
export function revalidateCart(
  cart: Cart,
  catalog: MenuCatalog,
): { lines: CartLine[]; removed: CartLine[]; repriced: CartLine[] } {
  const lines: CartLine[] = [];
  const removed: CartLine[] = [];
  const repriced: CartLine[] = [];

  for (const line of cart.lines) {
    const resolved = resolveLine(
      catalog,
      line.menuId,
      line.options.map((o) => o.optionId),
    );
    if (!resolved.ok) {
      removed.push(line);
      continue;
    }
    if (resolved.unitPrice !== line.unitPrice) {
      repriced.push({ ...line });
      lines.push({ ...line, unitPrice: resolved.unitPrice, name: resolved.item.name });
    } else {
      lines.push({ ...line, name: resolved.item.name });
    }
  }

  return { lines, removed, repriced };
}
