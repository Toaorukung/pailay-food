import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  parseBookingDate,
  isWithinStayWindow,
} from '@/lib/booking';

describe('normalizePhone', () => {
  it('keeps clean 10-digit numbers', () => {
    expect(normalizePhone('0816270687')).toBe('0816270687');
    expect(normalizePhone('0922415661')).toBe('0922415661');
  });

  it('strips dashes, spaces, and brackets', () => {
    expect(normalizePhone('081-627-0687')).toBe('0816270687');
    expect(normalizePhone('(081) 627 0687')).toBe('0816270687');
    expect(normalizePhone('081 627 0687')).toBe('0816270687');
  });

  it('converts +66 international prefix to 0', () => {
    expect(normalizePhone('+66816270687')).toBe('0816270687');
    expect(normalizePhone('66816270687')).toBe('0816270687');
  });

  it('handles null, undefined, empty, and dashes', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
    expect(normalizePhone('-')).toBe('');
  });
});

describe('parseBookingDate', () => {
  it('parses ISO format YYYY-MM-DD HH:mm', () => {
    const epoch = parseBookingDate('2026-09-11 14:00');
    expect(epoch).not.toBeNull();
    // 2026-09-11 14:00 Bangkok (UTC+7) = 2026-09-11 07:00:00 UTC
    const d = new Date(epoch!);
    expect(d.toISOString()).toBe('2026-09-11T07:00:00.000Z');
  });

  it('parses DMY format D/M/YYYY, HH:mm:ss', () => {
    const epoch = parseBookingDate('21/3/2025, 14:00:00');
    expect(epoch).not.toBeNull();
    // 2025-03-21 14:00 Bangkok (UTC+7) = 2025-03-21 07:00:00 UTC
    const d = new Date(epoch!);
    expect(d.toISOString()).toBe('2025-03-21T07:00:00.000Z');
  });

  it('converts Buddhist Era years (> 2400) to Gregorian', () => {
    const epoch = parseBookingDate('15/4/2568, 11:00:00');
    expect(epoch).not.toBeNull();
    const d = new Date(epoch!);
    expect(d.getUTCFullYear()).toBe(2025);
  });

  it('returns null for cancelled bookings or invalid values', () => {
    expect(parseBookingDate('ยกเลิกการเข้าพัก')).toBeNull();
    expect(parseBookingDate('ยกเลิก')).toBeNull();
    expect(parseBookingDate('-')).toBeNull();
    expect(parseBookingDate('')).toBeNull();
    expect(parseBookingDate(null)).toBeNull();
  });
});

describe('isWithinStayWindow', () => {
  const checkIn = parseBookingDate('2026-09-08 14:00')!;
  const checkOut = parseBookingDate('2026-09-11 11:00')!;

  it('denies ordering on check-in day before check-in time (e.g. 13:59)', () => {
    // 2026-09-08 13:59 Bangkok
    const now = parseBookingDate('2026-09-08 13:59')!;
    expect(isWithinStayWindow(now, checkIn, checkOut)).toBe(false);
  });

  it('allows ordering right at check-in time (14:00)', () => {
    const now = parseBookingDate('2026-09-08 14:00')!;
    expect(isWithinStayWindow(now, checkIn, checkOut)).toBe(true);
  });

  it('allows ordering during mid-stay', () => {
    // 2026-09-09 12:00 Bangkok
    const now = parseBookingDate('2026-09-09 12:00')!;
    expect(isWithinStayWindow(now, checkIn, checkOut)).toBe(true);
  });

  it('allows ordering right up to check-out time (11:00)', () => {
    const now = parseBookingDate('2026-09-11 11:00')!;
    expect(isWithinStayWindow(now, checkIn, checkOut)).toBe(true);
  });

  it('denies ordering on check-out day after check-out time (e.g. 11:01)', () => {
    // 2026-09-11 11:01 Bangkok
    const now = parseBookingDate('2026-09-11 11:01')!;
    expect(isWithinStayWindow(now, checkIn, checkOut)).toBe(false);
  });

  it('denies ordering before check-in day', () => {
    // 2026-09-07 23:30 Bangkok
    const now = parseBookingDate('2026-09-07 23:30')!;
    expect(isWithinStayWindow(now, checkIn, checkOut)).toBe(false);
  });

  it('denies ordering after check-out day', () => {
    // 2026-09-12 01:00 Bangkok
    const now = parseBookingDate('2026-09-12 01:00')!;
    expect(isWithinStayWindow(now, checkIn, checkOut)).toBe(false);
  });
});

