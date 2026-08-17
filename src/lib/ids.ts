import { randomBytes, createHash } from 'node:crypto';

/** URL-safe random id. 16 bytes = 128 bits — not guessable. */
export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}

/** Short human-quotable id for orders, e.g. "A7K2QX". */
export function shortCode(len = 6): string {
  // No 0/O/1/I — staff read these aloud across a kitchen.
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const buf = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

export function orderId(): string {
  return `O-${shortCode(6)}`;
}

export function paymentId(): string {
  return `P-${shortCode(6)}`;
}

/**
 * Stable key for a cart line. Same dish with the same options and the same
 * note merges into one line and bumps quantity; a different note stays
 * separate, because "no peanuts" and "extra peanuts" are not the same order.
 */
export function cartLineKey(
  menuId: string,
  optionIds: string[],
  note: string,
): string {
  const canonical = [
    menuId,
    [...optionIds].sort().join('|'),
    note.trim(),
  ].join('::');
  return createHash('sha256').update(canonical).digest('base64url').slice(0, 22);
}
