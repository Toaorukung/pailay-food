/**
 * Currency helpers.
 *
 * Deliberately separate from `pricing.ts`: this module has no Node imports, so
 * client components can format a price without dragging `node:crypto` (via the
 * cart-key hashing in `ids.ts`) into the browser bundle.
 */

/** Baht is quoted to two decimals even though satang are rarely used. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMoney(n: number, currency = 'THB'): string {
  const fixed = round2(n);
  const body = fixed.toLocaleString('th-TH', {
    // Whole baht reads better without ".00" on a menu.
    minimumFractionDigits: Number.isInteger(fixed) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return currency === 'THB' ? `฿${body}` : `${body} ${currency}`;
}
