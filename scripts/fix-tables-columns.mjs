/**
 * Repairs the Tables tab after the villa-link columns were added.
 *
 * The seed script rewrites header row 1 in place but never moves the data
 * beneath it, so inserting `slug` and `qr_code` in the middle of the header
 * list left every existing row one or two cells to the left of its own label:
 * `slug` was reading the latitude, `lat` was reading the radius, and the
 * geofence was comparing against nonsense.
 *
 * This rewrites each row under the current headers. It is idempotent — a row
 * already in the new shape is detected and left alone — so it is safe to run
 * more than once.
 *
 *   node scripts/fix-tables-columns.mjs           # report only
 *   node scripts/fix-tables-columns.mjs --write   # apply
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { createHash } from 'node:crypto';

loadEnv({ path: '.env.local', override: true });

const { JWT } = await import('google-auth-library');

const write = process.argv.includes('--write');
const SHEET = process.env.GOOGLE_SHEET_ID;
const SECRET = process.env.TABLE_SECRET;
const sa = JSON.parse(
  Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString(),
);

const jwt = new JWT({
  email: sa.client_email,
  key: sa.private_key.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const { token } = await jwt.getAccessToken();
const auth = { Authorization: `Bearer ${token}` };

const slugify = (input) =>
  input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'villa';

const code = (id) =>
  createHash('sha256')
    .update(`villa-code:${id}:${SECRET}`)
    .digest('base64url')
    .slice(0, 10);

const res = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values/Tables!A1:I200`,
  { headers: auth },
);
const { values = [] } = await res.json();
const [headers, ...rows] = values;

console.log('headers:', headers.join(' | '));
if (headers[3] !== 'slug' || headers[4] !== 'qr_code') {
  console.error('\n  Unexpected header layout — aborting rather than guessing.\n');
  process.exit(1);
}

const looksNumeric = (v) => v !== '' && v !== undefined && !Number.isNaN(Number(v));

const fixed = [];
for (const row of rows) {
  const [id, label, villa] = row;
  if (!id) continue;

  // A shifted row has a latitude sitting in the slug column. A correct row has
  // a slug there, which never parses as a number.
  const shifted = looksNumeric(row[3]);

  const src = shifted
    ? { lat: row[3] ?? '', lng: row[4] ?? '', radius: row[5] ?? '', active: row[6] ?? '' }
    : { lat: row[5] ?? '', lng: row[6] ?? '', radius: row[7] ?? '', active: row[8] ?? '' };

  const slug = shifted ? slugify(villa || label || id) : row[3] || slugify(villa || label || id);
  const qr = shifted ? code(id) : row[4] || code(id);

  fixed.push({
    shifted,
    row: [id, label ?? '', villa ?? '', slug, qr, src.lat, src.lng, src.radius || '300', src.active || 'TRUE'],
  });
}

console.log('');
for (const f of fixed) {
  console.log(
    `  ${f.shifted ? 'FIX ' : 'ok  '} ${f.row[0].padEnd(10)} slug=${f.row[3].padEnd(10)} code=${f.row[4].padEnd(12)} lat=${f.row[5]} lng=${f.row[6]} r=${f.row[7]} active=${f.row[8]}`,
  );
}

const broken = fixed.filter((f) => f.shifted).length;
console.log(`\n  ${broken} row(s) need repair, ${fixed.length - broken} already correct`);

if (!write) {
  console.log('\n  Dry run. Re-run with --write to apply.\n');
  process.exit(0);
}

const put = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values/Tables!A2:I${fixed.length + 1}?valueInputOption=RAW`,
  {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: fixed.map((f) => f.row) }),
  },
);
console.log(put.ok ? '\n  Written.\n' : `\n  Failed: ${await put.text()}\n`);
