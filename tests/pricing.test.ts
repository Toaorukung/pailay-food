import { describe, it, expect } from 'vitest';
import { resolveLine, buildLine, computeTotals } from '@/lib/pricing';
import type { MenuCatalog, MenuItem, PublicSettings } from '@/lib/types';

/**
 * Money maths and option validation.
 *
 * These are the paths where a bug is invisible: nothing crashes, the guest is
 * simply charged the wrong amount, and nobody notices until the till does not
 * reconcile.
 */

const loc = (th: string) => ({ th, en: th, zh: th });

const padThai: MenuItem = {
  id: 'm-padthai',
  categoryId: 'c-main',
  name: loc('ผัดไทย'),
  description: loc(''),
  ingredients: loc('เส้นจันท์ กุ้ง ถั่วลิสง'),
  price: 280,
  imageUrl: '',
  allergens: ['al-peanut', 'al-shellfish'],
  mayContain: ['al-egg'],
  tags: ['noodles'],
  spicyLevel: 1,
  isVegetarian: false,
  isAvailable: true,
  priceOnRequest: false,
  isAlcohol: false,
  sortOrder: 10,
  optionGroups: [
    {
      id: 'g-protein',
      menuId: 'm-padthai',
      name: loc('โปรตีน'),
      type: 'single',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 10,
      options: [
        { id: 'o-prawn', groupId: 'g-protein', name: loc('กุ้ง'), priceDelta: 0, isAvailable: true, sortOrder: 1 },
        { id: 'o-chicken', groupId: 'g-protein', name: loc('ไก่'), priceDelta: -30, isAvailable: true, sortOrder: 2 },
        { id: 'o-sold-out', groupId: 'g-protein', name: loc('ปู'), priceDelta: 90, isAvailable: false, sortOrder: 3 },
      ],
    },
    {
      id: 'g-extras',
      menuId: 'm-padthai',
      name: loc('เพิ่มเติม'),
      type: 'multi',
      required: false,
      minSelect: 0,
      maxSelect: 2,
      sortOrder: 20,
      options: [
        { id: 'o-egg', groupId: 'g-extras', name: loc('ไข่'), priceDelta: 20, isAvailable: true, sortOrder: 1 },
        { id: 'o-noodle', groupId: 'g-extras', name: loc('เส้น'), priceDelta: 40, isAvailable: true, sortOrder: 2 },
        { id: 'o-veg', groupId: 'g-extras', name: loc('ผัก'), priceDelta: 15, isAvailable: true, sortOrder: 3 },
      ],
    },
  ],
};

const soldOut: MenuItem = { ...padThai, id: 'm-gone', isAvailable: false, optionGroups: [] };

const settings: PublicSettings = {
  shopName: 'Test',
  currency: 'THB',
  serviceChargePercent: 0,
  vatPercent: 7,
  vatIncluded: true,
  allergyDisclaimer: loc(''),
  paymentNote: loc(''),
  promptPayName: '',
  minOrderAmount: 0,
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
  generatedAt: new Date().toISOString(),
  categories: [],
  allergens: [],
  items: [padThai, soldOut],
  settings,
};

describe('resolveLine', () => {
  it('prices from the catalog, never from the request', () => {
    const result = resolveLine(catalog, 'm-padthai', ['o-chicken', 'o-egg']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 280 base - 30 chicken + 20 egg
    expect(result.unitPrice).toBe(270);
  });

  it('rejects an option that belongs to a different dish', () => {
    const result = resolveLine(catalog, 'm-padthai', ['o-prawn', 'o-not-real']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('OPTION_INVALID');
  });

  it('rejects a sold-out option', () => {
    const result = resolveLine(catalog, 'm-padthai', ['o-sold-out']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('OPTION_UNAVAILABLE');
  });

  it('requires a choice from a required group', () => {
    const result = resolveLine(catalog, 'm-padthai', []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('OPTION_REQUIRED');
  });

  it('enforces the maximum on a multi-select group', () => {
    const result = resolveLine(catalog, 'm-padthai', [
      'o-prawn', 'o-egg', 'o-noodle', 'o-veg',
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('OPTION_COUNT');
  });

  it('refuses a single-choice group given two picks', () => {
    const result = resolveLine(catalog, 'm-padthai', ['o-prawn', 'o-chicken']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('OPTION_COUNT');
  });

  it('refuses a sold-out dish', () => {
    const result = resolveLine(catalog, 'm-gone', []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ITEM_UNAVAILABLE');
  });
});

describe('cart line identity', () => {
  const resolved = resolveLine(catalog, 'm-padthai', ['o-prawn']);

  it('merges identical dish + options + note', () => {
    if (!resolved.ok) throw new Error('setup failed');
    const a = buildLine(resolved, 1, 'ไม่ใส่ผักชี', false);
    const b = buildLine(resolved, 2, 'ไม่ใส่ผักชี', false);
    expect(a.key).toBe(b.key);
  });

  it('keeps different notes on separate lines', () => {
    if (!resolved.ok) throw new Error('setup failed');
    const a = buildLine(resolved, 1, 'ไม่ใส่ถั่ว', false);
    const b = buildLine(resolved, 1, 'เพิ่มถั่ว', false);
    // "no peanuts" and "extra peanuts" must never collapse into one ticket line.
    expect(a.key).not.toBe(b.key);
  });

  it('treats option order as irrelevant', () => {
    const forward = resolveLine(catalog, 'm-padthai', ['o-prawn', 'o-egg']);
    const reverse = resolveLine(catalog, 'm-padthai', ['o-egg', 'o-prawn']);
    if (!forward.ok || !reverse.ok) throw new Error('setup failed');
    expect(buildLine(forward, 1, '', false).key).toBe(
      buildLine(reverse, 1, '', false).key,
    );
  });
});

describe('computeTotals', () => {
  const line = (unitPrice: number, qty: number) => ({
    key: `k${unitPrice}`,
    menuId: 'm',
    name: loc('x'),
    qty,
    unitPrice,
    options: [],
    note: '',
    allergenAck: false,
    priceOnRequest: false,
    addedAt: '',
  });

  it('extracts VAT from an inclusive price rather than adding it', () => {
    const totals = computeTotals([line(107, 1)], settings);
    expect(totals.subtotal).toBe(107);
    expect(totals.total).toBe(107);
    expect(totals.vat).toBeCloseTo(7, 1);
  });

  it('adds VAT on top when prices are exclusive', () => {
    const totals = computeTotals(
      [line(100, 1)],
      { ...settings, vatIncluded: false },
    );
    expect(totals.total).toBe(107);
    expect(totals.vat).toBe(7);
  });

  it('applies service charge before VAT', () => {
    const totals = computeTotals(
      [line(100, 1)],
      { ...settings, serviceChargePercent: 10, vatIncluded: false },
    );
    expect(totals.serviceCharge).toBe(10);
    expect(totals.total).toBe(117.7);
  });

  it('counts quantities across lines', () => {
    const totals = computeTotals([line(100, 2), line(50, 3)], settings);
    expect(totals.itemCount).toBe(5);
    expect(totals.subtotal).toBe(350);
  });
});
