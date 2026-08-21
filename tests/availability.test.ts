import { describe, it, expect } from 'vitest';
import {
  parseHM,
  formatHM,
  bangkokMinutes,
  orderWindowState,
  itemTimeState,
  minQtyOf,
} from '@/lib/availability';
import type { MenuItem, PublicSettings } from '@/lib/types';

const settings = (over: Partial<PublicSettings> = {}): PublicSettings =>
  ({ orderOpen: '', orderCutoff: '', ...over }) as PublicSettings;

const item = (over: Partial<MenuItem> = {}): MenuItem =>
  ({ orderFrom: '', orderUntil: '', leadHours: 0, minQty: 0, ...over }) as MenuItem;

describe('parseHM / formatHM', () => {
  it('parses valid HH:MM to minutes of day', () => {
    expect(parseHM('00:00')).toBe(0);
    expect(parseHM('17:00')).toBe(1020);
    expect(parseHM('23:59')).toBe(1439);
  });

  it('treats blank and malformed as no bound', () => {
    expect(parseHM('')).toBeNull();
    expect(parseHM(undefined)).toBeNull();
    expect(parseHM('24:00')).toBeNull();
    expect(parseHM('9:5')).toBeNull();
    expect(parseHM('17.00')).toBeNull();
  });

  it('round-trips through formatHM', () => {
    expect(formatHM(1020)).toBe('17:00');
    expect(formatHM(0)).toBe('00:00');
    expect(formatHM(1439)).toBe('23:59');
  });
});

describe('bangkokMinutes', () => {
  // Thailand is UTC+7 with no DST, so the wall clock is a fixed offset.
  it('reads the clock in Thailand regardless of host timezone', () => {
    expect(bangkokMinutes(new Date('2026-08-21T00:00:00Z'))).toBe(7 * 60);
    expect(bangkokMinutes(new Date('2026-08-21T10:30:00Z'))).toBe(17 * 60 + 30);
  });

  it('wraps past midnight into the next Thai day', () => {
    // 18:30 UTC is 01:30 the next day in Bangkok.
    expect(bangkokMinutes(new Date('2026-08-21T18:30:00Z'))).toBe(90);
  });
});

describe('orderWindowState', () => {
  it('is open around the clock when both bounds are blank', () => {
    expect(orderWindowState(settings(), 0).open).toBe(true);
    expect(orderWindowState(settings(), 1439).open).toBe(true);
  });

  it('refuses before opening', () => {
    const s = settings({ orderOpen: '10:00', orderCutoff: '21:00' });
    expect(orderWindowState(s, 9 * 60)).toMatchObject({ open: false, code: 'BEFORE_OPEN' });
  });

  it('refuses at and after the cutoff', () => {
    const s = settings({ orderOpen: '10:00', orderCutoff: '21:00' });
    expect(orderWindowState(s, 21 * 60)).toMatchObject({ open: false, code: 'AFTER_CUTOFF' });
    expect(orderWindowState(s, 20 * 60 + 59).open).toBe(true);
  });

  it('accepts inside the window', () => {
    const s = settings({ orderOpen: '10:00', orderCutoff: '21:00' });
    expect(orderWindowState(s, 15 * 60).open).toBe(true);
  });
});

describe('itemTimeState', () => {
  it('is orderable with no rules set', () => {
    expect(itemTimeState(item(), settings(), 12 * 60).orderable).toBe(true);
  });

  it('enforces a per-item cutoff (drinks before 17:00)', () => {
    const drink = item({ orderUntil: '17:00' });
    expect(itemTimeState(drink, settings(), 16 * 60 + 59).orderable).toBe(true);
    expect(itemTimeState(drink, settings(), 17 * 60)).toMatchObject({
      orderable: false,
      code: 'AFTER_ITEM_CUTOFF',
    });
  });

  it('enforces a per-item opening time', () => {
    const lunch = item({ orderFrom: '11:00' });
    expect(itemTimeState(lunch, settings(), 10 * 60)).toMatchObject({
      orderable: false,
      code: 'BEFORE_ITEM_OPEN',
    });
    expect(itemTimeState(lunch, settings(), 11 * 60).orderable).toBe(true);
  });

  it('closes a lead-time dish once too little of the day is left', () => {
    // 6h notice against a 20:00 villa cutoff -> last order 14:00.
    const roast = item({ leadHours: 6 });
    const s = settings({ orderCutoff: '20:00' });
    expect(itemTimeState(roast, s, 13 * 60 + 59).orderable).toBe(true);
    expect(itemTimeState(roast, s, 14 * 60 + 1)).toMatchObject({
      orderable: false,
      code: 'LEAD_TOO_LATE',
      lastOrderMin: 14 * 60,
    });
  });

  it('measures lead time against the dish cutoff when it has one', () => {
    // Own cutoff 18:00 wins over the villa cutoff for the lead maths.
    const roast = item({ leadHours: 2, orderUntil: '18:00' });
    const s = settings({ orderCutoff: '21:00' });
    expect(itemTimeState(roast, s, 15 * 60 + 59).orderable).toBe(true);
    expect(itemTimeState(roast, s, 16 * 60 + 1)).toMatchObject({
      orderable: false,
      code: 'LEAD_TOO_LATE',
    });
  });

  it('ignores lead time when no cutoff exists to measure against', () => {
    const roast = item({ leadHours: 6 });
    expect(itemTimeState(roast, settings(), 23 * 60).orderable).toBe(true);
  });
});

describe('minQtyOf', () => {
  it('floors at 1 even when unset', () => {
    expect(minQtyOf(item({ minQty: 0 }))).toBe(1);
  });
  it('returns the configured minimum', () => {
    expect(minQtyOf(item({ minQty: 16 }))).toBe(16);
  });
});
