/**
 * Produces a password hash to paste into the AdminUsers tab.
 *
 *   npm run hash-password -- "the new password"
 *
 * Kept as a CLI rather than an admin screen on purpose: creating staff logins
 * is rare, and a self-service password form is one more authenticated write
 * path into the table that controls who can authenticate.
 */

import { hashPassword, verifyPassword } from '../src/lib/admin/password';

const password = process.argv.slice(2).join(' ').trim();

if (!password) {
  console.error('\n  Usage: npm run hash-password -- "your password"\n');
  process.exit(1);
}

if (password.length < 10) {
  console.error(
    '\n  Refusing: use at least 10 characters. This hash guards the till.\n',
  );
  process.exit(1);
}

const hash = hashPassword(password);

// Sanity check — a hash that does not verify would lock someone out silently.
if (!verifyPassword(password, hash)) {
  console.error('\n  Internal error: generated hash failed verification.\n');
  process.exit(1);
}

console.log(`
Paste this into the password_hash column of the AdminUsers tab:

${hash}
`);
