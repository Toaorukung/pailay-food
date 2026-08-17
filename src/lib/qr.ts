import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env';

/**
 * Printed QR links carry an HMAC so table ids cannot be enumerated. Without
 * it, anyone could hit /t/villa-2 from anywhere and open a session against a
 * villa they are not staying in.
 *
 * The signature is stable for the life of TABLE_SECRET — the QR stickers are
 * physical objects, so rotating that secret means reprinting every one of them.
 */

const SIG_LENGTH = 16;

export function signTable(tableId: string): string {
  return createHmac('sha256', env.tableSecret)
    .update(`table:${tableId}`)
    .digest('base64url')
    .slice(0, SIG_LENGTH);
}

export function verifyTable(tableId: string, sig: string | undefined): boolean {
  if (!sig) return false;
  const expected = signTable(tableId);
  if (sig.length !== expected.length) return false;
  // Constant-time compare so response timing cannot be used to forge a
  // signature byte by byte.
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/** The exact URL that gets encoded into a villa's printed QR code. */
export function tableUrl(tableId: string): string {
  return `${env.appUrl}/t/${encodeURIComponent(tableId)}?k=${signTable(tableId)}`;
}
