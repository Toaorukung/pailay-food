import { describe, it, expect } from 'vitest';
import { resolveLine, buildLine, computeTotals } from '@/lib/pricing';
import type { MenuCatalog, MenuItem, PublicSettings } from '@/lib/types';

/**
 * Market-price dishes — whole crab, river prawn, grouper by the kilo.
 *
 * These carry a stored price of 0 that means "unknown", not "free". Every
 * place that adds money up has to keep those two apart, because the failure
 * mode is silent: the guest checks out, pays a total that looks right, and the
 * villa is short a kilo of grouper with nothing in the logs to show it.
 */

const loc = (th: string) => ({ th, en: th, zh: th });

const base = {
  categoryId: 'c-fish',
  description: loc(''),
  ingredients: loc(''),
  imageUrl: '',
  allergens: [],
  mayContain: [],
  tags: [],
  spicyLevel: 0,
  isVegetarian: false,
  isAvailable: true,
  isAlcohol: false,
  minQty: 0,
  orderFrom: '',
  orderUntil: '',
  leadHours: 0,
  sortOrder: 1,
};

const grouper: MenuItem = {
  ...base,
  id: 'm-grouper',
  name: loc('ปลาเก๋า'),
  price: 0,
  priceOnRequest: true,
  optionGroups: [
    {
      id: 'g-cook',
      menuId: 'm-grouper',
      name: loc('วิธีปรุง'),
      type: 'single',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 1,
      options: [
        // A priced option on an unpriced dish: the delta must not become the
        // price of the fish.
        { id: 'o-steam', groupId: 'g-cook', name: loc('นึ่ง'), priceDelta: 50, isAvailable: true, sortOrder: 1 },
      ],
    },
  ],
};

const rice: MenuItem = {
  ...base,
  id: 'm-rice',
  name: loc('ข้าวสวย'),
  price: 30,
  priceOnRequest: false,
  optionGroups: [],
};

const settings: PublicSettings = {
  shopName: 'Test',
  currency: 'THB',
  serviceChargePercent: 0,
  vatPercent: 0,
  vatIncluded: true,
  allergyDisclaimer: loc(''),
  paymentNote: loc(''),
  promptPayName: '',
  minOrderAmount: 0,
  orderOpen: '',
  orderCutoff: '',
  contactPhone: '',
  welcomeEnabled: false,
  welcomeImage: '',
  serviceNoticeEnabled: false,
  serviceNoticeImage: '',
  serviceNotice: loc(''),
  alcoholMinAge: 20,
  alcoholNotice: loc(''),
};

const catalog: MenuCatalog = {
  version: 1,
  generatedAt: '',
  categories: [],
  allergens: [],
  items: [grouper, rice],
  settings,
};

describe('market-price resolution', () => {
  it('resolves to zero rather than to the option delta', () => {
    const result = resolveLine(catalog, 'm-grouper', ['o-steam']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unitPrice).toBe(0);
  });

  it('still validates required options', () => {
    const result = resolveLine(catalog, 'm-grouper', []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('OPTION_REQUIRED');
  });

  it('marks the built line so downstream code can tell 0 from free', () => {
    const resolved = resolveLine(catalog, 'm-grouper', ['o-steam']);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const line = buildLine(resolved, 1, '', false);
    expect(line.priceOnRequest).toBe(true);
    expect(line.unitPrice).toBe(0);
  });

  it('leaves ordinary dishes unflagged', () => {
    const resolved = resolveLine(catalog, 'm-rice', []);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(buildLine(resolved, 1, '', false).priceOnRequest).toBe(false);
  });
});

describe('totals with unpriced lines', () => {
  const line = (item: MenuItem, qty: number, unitPrice: number) => {
    const resolved = resolveLine(catalog, item.id, item.optionGroups.length ? ['o-steam'] : []);
    if (!resolved.ok) throw new Error('fixture failed to resolve');
    return { ...buildLine(resolved, qty, '', false), unitPrice };
  };

  it('counts how many lines are still waiting on a price', () => {
    const totals = computeTotals(
      [line(grouper, 1, 0), line(rice, 2, 30)],
      settings,
    );
    expect(totals.unpricedCount).toBe(1);
  });

  it('excludes unpriced lines from the subtotal instead of billing them at 0', () => {
    const totals = computeTotals([line(grouper, 1, 0), line(rice, 2, 30)], settings);
    // 60 is the rice alone. The grouper contributes nothing *and* is reported
    // as outstanding, so the UI can refuse to present this as a final total.
    expect(totals.subtotal).toBe(60);
    expect(totals.unpricedCount).toBeGreaterThan(0);
  });

  it('stops reporting a line as unpriced once staff set a figure', () => {
    const totals = computeTotals([line(grouper, 2, 450)], settings);
    expect(totals.unpricedCount).toBe(0);
    expect(totals.subtotal).toBe(900);
  });

  it('reports nothing outstanding for an ordinary cart', () => {
    expect(computeTotals([line(rice, 1, 30)], settings).unpricedCount).toBe(0);
  });
});
