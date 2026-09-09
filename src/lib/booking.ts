import { getSheetValues } from './sheets/client';
import { env } from './env';
import { kv, K } from './kv';

export interface BookingRecord {
  uid: string;
  villa: string;
  name: string;
  phone: string;
  checkInRaw: string;
  checkOutRaw: string;
  checkInTime: number | null; // epoch ms (UTC)
  checkOutTime: number | null; // epoch ms (UTC)
}

export interface BookingVerificationResult {
  ok: boolean;
  reason?: 'NOT_FOUND' | 'OUT_OF_STAY_WINDOW' | 'CANCELLED' | 'INVALID_PHONE';
  error?: string;
  booking?: {
    uid: string;
    villa: string;
    name: string;
    phone: string;
    checkIn: string;
    checkOut: string;
  };
}

const CACHE_TTL_SECONDS = 180; // 3 minutes
const MEMO_TTL_MS = 60 * 1000; // 1 minute in-memory

let memoBookings: { data: BookingRecord[]; expiresAt: number } | null = null;

/**
 * Normalizes phone numbers:
 * - strips non-digits
 * - converts international Thai code +66... to 0...
 */
export function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('66') && digits.length >= 11) {
    digits = '0' + digits.slice(2);
  }
  return digits;
}

/**
 * Parses date string from the booking sheet into UTC epoch ms corresponding to Bangkok time.
 * Supports:
 * - ISO format: "YYYY-MM-DD HH:mm" or "YYYY-MM-DD"
 * - DMY format: "D/M/YYYY, HH:mm:ss" or "DD/MM/YYYY"
 * - Buddhist era year (>2400): subtracted by 543
 * Returns null if cancelled, empty, or unparseable.
 */
export function parseBookingDate(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s.includes('ยกเลิก') || s === '-') return null;

  // 1. Format: YYYY-MM-DD [HH:mm[:ss]]
  const isoMatch = s.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/,
  );
  if (isoMatch) {
    let year = parseInt(isoMatch[1], 10);
    if (year > 2400) year -= 543;
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const hour = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
    const min = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
    const sec = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
    // Bangkok is UTC+7, so UTC hour = hour - 7
    return Date.UTC(year, month, day, hour - 7, min, sec);
  }

  // 2. Format: D/M/YYYY[, HH:mm[:ss]]
  const dmyMatch = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/,
  );
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);
    if (year > 2400) year -= 543;
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    return Date.UTC(year, month, day, hour - 7, min, sec);
  }

  const parsed = Date.parse(s);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Checks if a given timestamp (ms) falls within stay dates/times from the booking sheet.
 * Follows exact check-in and check-out times specified in the sheet ("ข้อ 1 ใช้ตามชีตเลย").
 */
export function isWithinStayWindow(
  nowMs: number,
  checkInMs: number | null,
  checkOutMs: number | null,
): boolean {
  if (!checkInMs || !checkOutMs) return false;
  return nowMs >= checkInMs && nowMs <= checkOutMs;
}

/**
 * Loads all bookings from the Google Sheet 'บันทึกการจอง' tab,
 * caching results in memory and Upstash KV.
 */
export async function loadBookings(): Promise<BookingRecord[]> {
  const now = Date.now();
  if (memoBookings && memoBookings.expiresAt > now) {
    return memoBookings.data;
  }

  // Try hot store cache
  try {
    const cached = await kv().get<{ data: BookingRecord[]; expiresAt: number }>(
      K.bookings,
    );
    if (cached && cached.expiresAt > now) {
      memoBookings = cached;
      return cached.data;
    }
  } catch {
    // ignore cache read errors
  }

  const sheetId = env.bookingSheetId;
  const tabName = env.bookingSheetTab;
  // Row 1 & 2 are empty/headers, Row 3 has column names, Row 4 starts data.
  // Col A: UID, B: บ้านพัก, C: ชื่อผู้จอง, D: เบอร์ติดต่อ, I: เริ่มพักวันที่, J: ถึงวันที
  const range = `${tabName}!A4:J`;

  let rows: string[][] = [];
  try {
    rows = await getSheetValues(sheetId, range);
  } catch (err) {
    console.error('[booking] Failed to fetch sheet values:', err);
    // If we have stale memo data, return it rather than failing completely
    if (memoBookings?.data) return memoBookings.data;
    throw err;
  }

  const records: BookingRecord[] = [];
  for (const row of rows) {
    const uid = String(row[0] ?? '').trim();
    const villa = String(row[1] ?? '').trim();
    const name = String(row[2] ?? '').trim();
    const rawPhone = String(row[3] ?? '').trim();
    const checkInRaw = String(row[8] ?? '').trim();
    const checkOutRaw = String(row[9] ?? '').trim();

    const phone = normalizePhone(rawPhone);
    if (!phone) continue;

    const checkInTime = parseBookingDate(checkInRaw);
    const checkOutTime = parseBookingDate(checkOutRaw);

    records.push({
      uid,
      villa,
      name,
      phone,
      checkInRaw,
      checkOutRaw,
      checkInTime,
      checkOutTime,
    });
  }

  const entry = {
    data: records,
    expiresAt: now + CACHE_TTL_SECONDS * 1000,
  };

  memoBookings = { data: records, expiresAt: now + MEMO_TTL_MS };

  await kv()
    .set(K.bookings, entry, { ex: CACHE_TTL_SECONDS })
    .catch(() => {});

  return records;
}

/**
 * Verifies if a phone number belongs to an active staying guest right now.
 */
export async function verifyGuestBooking(
  phoneInput: string,
  nowMs = Date.now(),
  preferredVilla?: string,
): Promise<BookingVerificationResult> {
  const normalized = normalizePhone(phoneInput);
  if (!normalized || normalized.length < 9) {
    return {
      ok: false,
      reason: 'INVALID_PHONE',
      error: 'เบอร์โทรศัพท์ไม่ถูกต้อง กรุณากรอกเบอร์โทร 9-10 หลัก',
    };
  }

  let all: BookingRecord[];
  try {
    all = await loadBookings();
  } catch (err) {
    console.error('[booking] Error loading bookings from Google Sheet:', err);
    return {
      ok: false,
      error: 'ไม่สามารถเชื่อมต่อระบบตรวจสอบข้อมูลการจองได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง หรือติดต่อเจ้าหน้าที่',
    };
  }

  const matching = all.filter((b) => b.phone === normalized);

  if (matching.length === 0) {
    return {
      ok: false,
      reason: 'NOT_FOUND',
      error:
        'ไม่พบข้อมูลการจองสำหรับเบอร์โทรนี้ กรุณาตรวจสอบเบอร์ที่ใช้ในการจอง หรือติดต่อเจ้าหน้าที่',
    };
  }

  // Look for currently active stays
  const activeBookings = matching.filter((b) =>
    isWithinStayWindow(nowMs, b.checkInTime, b.checkOutTime),
  );

  if (activeBookings.length > 0) {
    let activeBooking = activeBookings[0];
    if (preferredVilla && activeBookings.length > 1) {
      const pv = preferredVilla.trim().toLowerCase();
      const match = activeBookings.find((b) => {
        const bv = b.villa.trim().toLowerCase();
        return bv.includes(pv) || pv.includes(bv);
      });
      if (match) activeBooking = match;
    }

    return {
      ok: true,
      booking: {
        uid: activeBooking.uid,
        villa: activeBooking.villa,
        name: activeBooking.name || 'ผู้เข้าพัก',
        phone: activeBooking.phone,
        checkIn: activeBooking.checkInRaw,
        checkOut: activeBooking.checkOutRaw,
      },
    };
  }

  // None are currently active. Pick the most relevant booking (latest or upcoming)
  // to give the guest an informative date range in the error message.
  const sorted = [...matching].sort((a, b) => {
    const timeA = a.checkInTime ?? 0;
    const timeB = b.checkInTime ?? 0;
    return Math.abs(timeA - nowMs) - Math.abs(timeB - nowMs);
  });

  const closest = sorted[0];
  const checkInDisplay = closest.checkInRaw || 'ไม่ระบุ';
  const checkOutDisplay = closest.checkOutRaw || 'ไม่ระบุ';

  return {
    ok: false,
    reason: 'OUT_OF_STAY_WINDOW',
    error: `เบอร์โทรนี้ไม่อยู่ในช่วงวันเข้าพัก (วันเข้าพัก: ${checkInDisplay} ถึง ${checkOutDisplay}) จึงไม่สามารถสั่งอาหารได้`,
    booking: {
      uid: closest.uid,
      villa: closest.villa,
      name: closest.name,
      phone: closest.phone,
      checkIn: checkInDisplay,
      checkOut: checkOutDisplay,
    },
  };
}

