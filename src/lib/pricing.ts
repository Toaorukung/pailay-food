import { cartLineKey } from './ids';
import { round2 } from './money';
import type {
  Cart,
  CartLine,
  CartLineOption,
  MenuCatalog,
  MenuItem,
} from './types';

/**
 * Server-side price resolution.
 *
 * The client never sends a price. It sends a menu id, option ids, a quantity
 * and a note; everything with a currency attached is looked up here from the
 * cached catalog. A tampered request can at worst order the wrong dish — it
 * can never change what that dish costs.
 */

export interface ResolveError {
  ok: false;
  error: string;
  code:
    | 'ITEM_NOT_FOUND'
    | 'ITEM_UNAVAILABLE'
    | 'OPTION_INVALID'
    | 'OPTION_UNAVAILABLE'
    | 'OPTION_REQUIRED'
    | 'OPTION_COUNT';
}

export interface ResolvedLine {
  ok: true;
  item: MenuItem;
  options: CartLineOption[];
  unitPrice: number;
}

export function resolveLine(
  catalog: MenuCatalog,
  menuId: string,
  optionIds: string[],
): ResolvedLine | ResolveError {
  const item = catalog.items.find((i) => i.id === menuId);
  if (!item) {
    return { ok: false, code: 'ITEM_NOT_FOUND', error: 'ไม่พบรายการอาหารนี้' };
  }
  if (!item.isAvailable) {
    return { ok: false, code: 'ITEM_UNAVAILABLE', error: 'รายการนี้หมดชั่วคราว' };
  }

  const wanted = new Set(optionIds);
  const chosen: CartLineOption[] = [];

  for (const group of item.optionGroups) {
    const picks = group.options.filter((o) => wanted.has(o.id));

    for (const pick of picks) {
      if (!pick.isAvailable) {
        return {
          ok: false,
          code: 'OPTION_UNAVAILABLE',
          error: `ตัวเลือก "${pick.name.th || pick.name.en}" หมดชั่วคราว`,
        };
      }
      wanted.delete(pick.id);
      chosen.push({
        groupId: group.id,
        optionId: pick.id,
        name: pick.name,
        priceDelta: pick.priceDelta,
      });
    }

    const min = group.required ? Math.max(1, group.minSelect) : group.minSelect;
    if (picks.length < min) {
      return {
        ok: false,
        code: 'OPTION_REQUIRED',
        error: `กรุณาเลือก "${group.name.th || group.name.en}"`,
      };
    }
    const max = group.type === 'single' ? 1 : group.maxSelect;
    if (picks.length > max) {
      return {
        ok: false,
        code: 'OPTION_COUNT',
        error: `"${group.name.th || group.name.en}" เลือกได้ไม่เกิน ${max} อย่าง`,
      };
    }
  }

  // Anything left over referenced an option that does not belong to this dish.
  if (wanted.size > 0) {
    return {
      ok: false,
      code: 'OPTION_INVALID',
      error: 'ตัวเลือกไม่ถูกต้องสำหรับรายการนี้',
    };
  }

  // Market-price dishes carry no price until the kitchen weighs them. Option
  // deltas are ignored rather than applied to a zero base — "+50 for grilled"
  // on an unknown price is not a price.
  const unitPrice = item.priceOnRequest
    ? 0
    : round2(item.price + chosen.reduce((sum, o) => sum + o.priceDelta, 0));

  return { ok: true, item, options: chosen, unitPrice };
}

export function buildLine(
  resolved: ResolvedLine,
  qty: number,
  note: string,
  allergenAck: boolean,
): CartLine {
  const optionIds = resolved.options.map((o) => o.optionId);
  return {
    key: cartLineKey(resolved.item.id, optionIds, note),
    menuId: resolved.item.id,
    name: resolved.item.name,
    qty,
    unitPrice: resolved.unitPrice,
    options: resolved.options,
    note,
    allergenAck,
    priceOnRequest: resolved.item.priceOnRequest,
    addedAt: new Date().toISOString(),
  };
}

export interface Totals {
  subtotal: number;
  serviceCharge: number;
  vat: number;
  total: number;
  itemCount: number;
  /**
   * How many lines are still waiting on a weighed price. Any total shown while
   * this is above zero is a partial total, and the UI has to say so.
   */
  unpricedCount: number;
}

/**
 * Bill maths.
 *
 * `vatIncluded` matters in Thailand: most small venues quote VAT-inclusive
 * prices, so VAT is extracted from the subtotal for display rather than added
 * on top. Getting this backwards silently overcharges every guest, so the two
 * paths are kept explicit rather than folded together.
 */
export function computeTotals(
  lines: CartLine[],
  settings: MenuCatalog['settings'],
): Totals {
  const subtotal = round2(
    lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0),
  );
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);
  const unpricedCount = lines.filter(
    (l) => l.priceOnRequest && l.unitPrice <= 0,
  ).length;

  const serviceCharge = round2(
    (subtotal * settings.serviceChargePercent) / 100,
  );
  const base = subtotal + serviceCharge;

  let vat: number;
  let total: number;
  if (settings.vatIncluded) {
    // Price already contains VAT — show the portion, do not add it.
    vat = round2(base - base / (1 + settings.vatPercent / 100));
    total = round2(base);
  } else {
    vat = round2((base * settings.vatPercent) / 100);
    total = round2(base + vat);
  }

  return { subtotal, serviceCharge, vat, total, itemCount, unpricedCount };
}

export function emptyCart(sessionId: string): Cart {
  return { sessionId, lines: [], updatedAt: new Date().toISOString() };
}

// Re-exported so server code has one obvious import for money handling.
export { round2, formatMoney } from './money';
