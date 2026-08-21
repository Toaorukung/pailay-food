import type { MenuItem, PublicSettings } from './types';

/**
 * When the villa is open and what it can cook right now.
 *
 * Every rule here is a time-of-day rule, and time of day only makes sense in
 * one place: Thailand. The functions run on a Vercel lambda that lives in
 * Singapore and on a guest's phone that could be set to any timezone, so the
 * clock is always read through Asia/Bangkok rather than off the host. A guest
 * in a different timezone still sees the villa's own hours, and the server
 * never disagrees with itself about whether the kitchen is shut.
 */

const TZ = 'Asia/Bangkok';

/** Minutes since midnight for an "HH:MM" string, or null for blank/malformed. */
export function parseHM(value: string | undefined | null): number | null {
  if (!value) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** "HH:MM" for a minutes-of-day value. */
export function formatHM(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Current minutes-of-day in Thailand, whatever the host clock's timezone. */
export function bangkokMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  // Some engines render midnight as "24"; fold it back to 0.
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

// ── Whole-villa order window ────────────────────────────────

export type OrderWindow =
  | { open: true }
  | {
      open: false;
      code: 'BEFORE_OPEN' | 'AFTER_CUTOFF';
      openMin: number | null;
      cutoffMin: number | null;
    };

export function orderWindowState(
  settings: Pick<PublicSettings, 'orderOpen' | 'orderCutoff'>,
  nowMin: number,
): OrderWindow {
  const openMin = parseHM(settings.orderOpen);
  const cutoffMin = parseHM(settings.orderCutoff);
  if (openMin !== null && nowMin < openMin) {
    return { open: false, code: 'BEFORE_OPEN', openMin, cutoffMin };
  }
  if (cutoffMin !== null && nowMin >= cutoffMin) {
    return { open: false, code: 'AFTER_CUTOFF', openMin, cutoffMin };
  }
  return { open: true };
}

// ── Per-dish availability ───────────────────────────────────

export type ItemTimeState =
  | { orderable: true }
  | {
      orderable: false;
      code: 'BEFORE_ITEM_OPEN' | 'AFTER_ITEM_CUTOFF' | 'LEAD_TOO_LATE';
      /** The dish's own from/until bound, for the first two codes. */
      boundMin?: number;
      /** Lead hours and the latest minute it could still be ordered today. */
      leadHours?: number;
      lastOrderMin?: number;
    };

/**
 * Whether this dish can be ordered at `nowMin`, ignoring the whole-villa
 * window (checked separately) and stock (`isAvailable`, checked in pricing).
 * `leadHours` is measured against the dish's own cutoff, falling back to the
 * villa's order cutoff — a six-hour lead with a 20:00 close stops taking
 * orders at 14:00.
 */
export function itemTimeState(
  item: Pick<MenuItem, 'orderFrom' | 'orderUntil' | 'leadHours'>,
  settings: Pick<PublicSettings, 'orderCutoff'>,
  nowMin: number,
): ItemTimeState {
  const from = parseHM(item.orderFrom);
  const until = parseHM(item.orderUntil);

  if (from !== null && nowMin < from) {
    return { orderable: false, code: 'BEFORE_ITEM_OPEN', boundMin: from };
  }
  if (until !== null && nowMin >= until) {
    return { orderable: false, code: 'AFTER_ITEM_CUTOFF', boundMin: until };
  }

  if (item.leadHours > 0) {
    const close = until ?? parseHM(settings.orderCutoff);
    if (close !== null) {
      const lastOrderMin = close - item.leadHours * 60;
      if (nowMin > lastOrderMin) {
        return {
          orderable: false,
          code: 'LEAD_TOO_LATE',
          leadHours: item.leadHours,
          lastOrderMin,
        };
      }
    }
  }

  return { orderable: true };
}

/** The smallest quantity a single line of this dish may carry. Always >= 1. */
export function minQtyOf(item: Pick<MenuItem, 'minQty'>): number {
  return Math.max(1, Math.floor(item.minQty) || 1);
}

// ── Thai messages (server side) ─────────────────────────────
//
// The guest UI renders these through i18n in the visitor's language; these are
// for the server, whose error strings are Thai throughout the codebase.

export function windowMessageTH(state: Exclude<OrderWindow, { open: true }>): string {
  if (state.code === 'BEFORE_OPEN' && state.openMin !== null) {
    return `ยังไม่ถึงเวลาสั่งอาหาร เปิดรับออเดอร์ ${formatHM(state.openMin)} น.`;
  }
  if (state.code === 'AFTER_CUTOFF' && state.cutoffMin !== null) {
    return `หมดเวลาสั่งอาหารสำหรับวันนี้ (สั่งได้ถึง ${formatHM(state.cutoffMin)} น.)`;
  }
  return 'ขณะนี้ปิดรับออเดอร์';
}

export function itemStateMessageTH(
  name: string,
  state: Exclude<ItemTimeState, { orderable: true }>,
): string {
  switch (state.code) {
    case 'BEFORE_ITEM_OPEN':
      return `"${name}" ยังไม่ถึงเวลาสั่ง (เริ่ม ${formatHM(state.boundMin ?? 0)} น.)`;
    case 'AFTER_ITEM_CUTOFF':
      return `"${name}" หมดเวลาสั่งแล้ว (สั่งได้ถึง ${formatHM(state.boundMin ?? 0)} น.)`;
    case 'LEAD_TOO_LATE':
      return `"${name}" ต้องสั่งล่วงหน้าอย่างน้อย ${state.leadHours} ชม. — วันนี้เลยเวลาสั่งแล้ว (สั่งได้ถึง ${formatHM(state.lastOrderMin ?? 0)} น.)`;
  }
}

export function minQtyMessageTH(name: string, min: number): string {
  return `"${name}" ต้องสั่งอย่างน้อย ${min} ที่`;
}
