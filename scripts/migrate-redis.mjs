/**
 * Copies the hot store from one Upstash database to another.
 *
 * Google Sheets is the system of record, so most of what lives in Redis can be
 * rebuilt — but not all of it. An open session, its cart, and the orders on
 * its bill exist only here until the write-behind queue drains. Switching
 * databases without carrying those across would strand whoever is mid-meal:
 * their link stops resolving and the food they already ordered disappears
 * from the bill.
 *
 * Every key is copied with its remaining time to live, so a session that had
 * three hours left still has three hours after the move.
 *
 *   node scripts/migrate-redis.mjs            # report what would move
 *   node scripts/migrate-redis.mjs --write    # do it
 *
 * Source comes from .env.local (KV_REST_API_* or UPSTASH_REDIS_REST_*).
 * Target comes from TARGET_REDIS_URL and TARGET_REDIS_TOKEN.
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', override: true });

const { Redis } = await import('@upstash/redis');

const write = process.argv.includes('--write');
const force = process.argv.includes('--force');

const sourceUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const sourceToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const targetUrl = process.env.TARGET_REDIS_URL;
const targetToken = process.env.TARGET_REDIS_TOKEN;

if (!sourceUrl || !sourceToken) {
  console.error('\n  ไม่พบ Redis ต้นทางใน .env.local\n');
  process.exit(1);
}
if (write && (!targetUrl || !targetToken)) {
  console.error('\n  ต้องระบุปลายทางก่อนจะเขียนจริง:\n');
  console.error('    TARGET_REDIS_URL=… TARGET_REDIS_TOKEN=… npm run migrate:redis -- --write');
  console.error('');
  process.exit(1);
}
if (targetUrl && sourceUrl === targetUrl) {
  console.error('\n  ต้นทางกับปลายทางเป็นตัวเดียวกัน — หยุด\n');
  process.exit(1);
}

const source = new Redis({ url: sourceUrl, token: sourceToken });
// A dry run never touches the target, so it works before there is one.
const target =
  targetUrl && targetToken ? new Redis({ url: targetUrl, token: targetToken }) : null;

const host = (u) => new URL(u).hostname;
console.log('');
console.log('  จาก  ' + host(sourceUrl));
console.log('  ไป   ' + (target ? host(targetUrl) : '(ยังไม่ระบุ — ดูอย่างเดียว)'));
console.log('');

if (target) {
  // Refuse to write into a database that already holds something, unless the
  // operator says otherwise. Overwriting a live store by mistake is the one
  // unrecoverable outcome here.
  const existing = await target.dbsize().catch((err) => {
    console.error('  ต่อปลายทางไม่ได้: ' + (err.cause?.message ?? err.message) + '\n');
    process.exit(1);
  });
  if (existing > 0 && !force) {
    console.error('  ปลายทางมีข้อมูลอยู่แล้ว ' + existing + ' คีย์ — หยุดไว้ก่อน');
    console.error('  ถ้าตั้งใจจะเขียนทับ ใส่ --force\n');
    process.exit(1);
  }
}

const keys = [];
let cursor = '0';
do {
  const [next, batch] = await source.scan(cursor, { count: 500 });
  cursor = String(next);
  keys.push(...batch);
} while (cursor !== '0');

console.log('  พบ ' + keys.length + ' คีย์');

const counts = {};
const skipped = [];

for (const key of keys) {
  const kind = await source.type(key);
  counts[kind] = (counts[kind] ?? 0) + 1;

  if (!write) continue;

  // Read the remaining life before copying, not after: a slow copy would
  // otherwise hand the target a stale figure.
  const ttl = await source.pttl(key);

  switch (kind) {
    case 'string': {
      const value = await source.get(key);
      if (value === null) continue;
      await target.set(key, value);
      break;
    }
    case 'list': {
      const items = await source.lrange(key, 0, -1);
      if (items.length) await target.rpush(key, ...items);
      break;
    }
    case 'set': {
      const members = await source.smembers(key);
      if (members.length) await target.sadd(key, ...members);
      break;
    }
    case 'zset': {
      const flat = await source.zrange(key, 0, -1, { withScores: true });
      const entries = [];
      for (let i = 0; i < flat.length; i += 2) {
        entries.push({ score: Number(flat[i + 1]), member: flat[i] });
      }
      if (entries.length) await target.zadd(key, entries[0], ...entries.slice(1));
      break;
    }
    case 'hash': {
      const map = await source.hgetall(key);
      if (map && Object.keys(map).length) await target.hset(key, map);
      break;
    }
    default:
      skipped.push(key + ' (' + kind + ')');
      continue;
  }

  // -1 means no expiry, -2 means the key vanished between the scan and now.
  if (ttl > 0) await target.pexpire(key, ttl);
}

console.log('');
for (const [kind, n] of Object.entries(counts)) {
  console.log('    ' + kind.padEnd(8) + ' ' + n);
}

if (skipped.length) {
  console.log('\n  ข้ามไป ' + skipped.length + ' คีย์ที่ไม่รู้จักชนิด:');
  skipped.slice(0, 10).forEach((s) => console.log('    ' + s));
}

if (!write) {
  console.log('\n  ยังไม่ได้เขียนอะไร — ใส่ --write เพื่อย้ายจริง\n');
  process.exit(0);
}

const moved = await target.dbsize();
console.log('\n  ปลายทางมี ' + moved + ' คีย์');
console.log(
  moved >= keys.length
    ? '  ย้ายครบ\n'
    : '  ไม่ครบ — ต้นทาง ' + keys.length + ' ปลายทาง ' + moved +
      ' (คีย์ที่หมดอายุระหว่างย้ายก็นับด้วย)\n',
);
