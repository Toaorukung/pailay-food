import { scrypt } from '@noble/hashes/scrypt';
import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing with scrypt.
 *
 * scrypt over argon2 here purely for deployment reasons: @noble/hashes is pure
 * JavaScript, so there is no native binary to fail on a serverless runtime.
 * The parameters below are the memory-hard settings scrypt was designed for —
 * 32 MB per attempt, which makes offline cracking of a leaked Sheet expensive.
 *
 * Stored format: scrypt$N$r$p$<salt-b64>$<hash-b64>
 */

const N = 32_768;
const r = 8;
const p = 1;
const DK_LEN = 32;
const SALT_BYTES = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const dk = scrypt(new TextEncoder().encode(password.normalize('NFKC')), salt, {
    N, r, p, dkLen: DK_LEN,
  });
  return [
    'scrypt',
    N,
    r,
    p,
    Buffer.from(salt).toString('base64'),
    Buffer.from(dk).toString('base64'),
  ].join('$');
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const params = { N: Number(nStr), r: Number(rStr), p: Number(pStr) };
  if (
    !Number.isInteger(params.N) ||
    !Number.isInteger(params.r) ||
    !Number.isInteger(params.p) ||
    // Refuse absurd parameters from a tampered Sheet cell — otherwise a
    // hand-edited row could turn every login attempt into a memory bomb.
    params.N > 1 << 20 ||
    params.r > 32 ||
    params.p > 16
  ) {
    return false;
  }

  let expected: Buffer;
  try {
    expected = Buffer.from(hashB64, 'base64');
  } catch {
    return false;
  }
  if (expected.length !== DK_LEN) return false;

  const dk = Buffer.from(
    scrypt(new TextEncoder().encode(password.normalize('NFKC')), Buffer.from(saltB64, 'base64'), {
      ...params,
      dkLen: DK_LEN,
    }),
  );

  return timingSafeEqual(dk, expected);
}
