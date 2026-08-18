/**
 * Connects a Google Sheet to this project.
 *
 *   npm run connect-sheet -- <path-to-key.json> <sheet-id-or-url>
 *
 * Exists so the service-account private key never has to be pasted anywhere.
 * The file is read locally, encoded, written to .env.local, and pushed
 * straight to Vercel's encrypted environment. Nothing is printed except the
 * account email, which is not a secret and is the value you have to share the
 * spreadsheet with.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [keyPath, sheetArg] = process.argv.slice(2);

function die(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!keyPath || !sheetArg) {
  die(
    'Usage: npm run connect-sheet -- <path-to-key.json> <sheet-id-or-url>\n' +
      '  ตัวอย่าง: npm run connect-sheet -- "C:/Users/me/Downloads/key.json" 1AbC…xyz',
  );
}

if (!existsSync(keyPath)) die(`ไม่พบไฟล์: ${keyPath}`);

// Accept either the bare id or the whole spreadsheet URL.
const sheetId =
  sheetArg.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1] ?? sheetArg.trim();
if (!/^[A-Za-z0-9_-]{20,}$/.test(sheetId)) {
  die(`Sheet id ดูไม่ถูกต้อง: ${sheetId}`);
}

const raw = readFileSync(keyPath, 'utf8');
let key: { client_email?: string; private_key?: string; type?: string };
try {
  key = JSON.parse(raw);
} catch {
  die('ไฟล์นี้ไม่ใช่ JSON — ตอนสร้าง key ต้องเลือก JSON ไม่ใช่ P12');
}

if (key.type !== 'service_account' || !key.client_email || !key.private_key) {
  die('ไฟล์นี้ไม่ใช่ service account key — ดาวน์โหลดใหม่จาก KEYS → ADD KEY → JSON');
}

const base64 = Buffer.from(raw, 'utf8').toString('base64');

// ── .env.local ──────────────────────────────────────────────
const envFile = '.env.local';
const current = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';

function upsert(body: string, name: string, value: string): string {
  const line = `${name}="${value}"`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  return pattern.test(body) ? body.replace(pattern, line) : `${body.trimEnd()}\n${line}\n`;
}

let next = current;
next = upsert(next, 'GOOGLE_SHEET_ID', sheetId);
next = upsert(next, 'GOOGLE_SERVICE_ACCOUNT_KEY_BASE64', base64);
writeFileSync(envFile, next, 'utf8');
console.log(`  ✓ เขียนลง ${envFile}`);

// ── Vercel ──────────────────────────────────────────────────
function pushToVercel(name: string, value: string): boolean {
  let pushed = false;
  for (const target of ['production', 'preview', 'development']) {
    try {
      execFileSync('npx', ['vercel', 'env', 'add', name, target, '--force'], {
        input: value,
        stdio: ['pipe', 'ignore', 'ignore'],
        shell: process.platform === 'win32',
      });
      pushed = true;
    } catch {
      // A target that does not exist yet is not a failure worth stopping for.
    }
  }
  return pushed;
}

const linked = existsSync('.vercel/project.json');
if (linked) {
  const ok =
    pushToVercel('GOOGLE_SHEET_ID', sheetId) &&
    pushToVercel('GOOGLE_SERVICE_ACCOUNT_KEY_BASE64', base64);
  console.log(
    ok
      ? '  ✓ ส่งขึ้น Vercel แล้ว'
      : '  ! ส่งขึ้น Vercel ไม่สำเร็จ — ใส่เองในหน้า Project Settings → Environment Variables',
  );
} else {
  console.log('  – ยังไม่ได้ลิงก์ Vercel ข้ามขั้นตอนนั้นไป');
}

console.log(`
  แชร์ Google Sheet ให้อีเมลนี้ สิทธิ์ Editor:

      ${key.client_email}

  ขั้นนี้ลืมบ่อยที่สุด ถ้าลืมจะได้ error 403 ตอน seed

  จากนั้น:
      npm run seed          เขียนเมนู 109 รายการลงชีต
      npx vercel deploy --prod --yes
`);
