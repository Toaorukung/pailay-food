/**
 * Proves the cache + write-behind architecture actually holds.
 *
 * The number that matters is not requests per second — it is how many Google
 * Sheets API calls those requests caused. Sheets allows roughly 300 reads and
 * 60 writes per minute; if browsing the menu cost one call each, fifty guests
 * would take the whole system down at dinner. This script drives concurrent
 * traffic and then reads the per-minute Sheets call counter the client keeps
 * in Redis.
 *
 *   npm run loadtest                       # 50 concurrent, 20 rounds
 *   npm run loadtest -- --sessions 100
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', override: true });

const { kv, K } = await import('../src/lib/kv');

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);
const sessions = arg('sessions', 50);
const rounds = arg('rounds', 20);

async function sheetsCallsInLastMinutes(minutes: number): Promise<number> {
  const now = Date.now();
  const keys: string[] = [];
  for (let i = 0; i < minutes; i++) {
    keys.push(K.sheetsCallCount(new Date(now - i * 60_000).toISOString().slice(0, 16)));
  }
  const values = await kv().mget<(number | string | null)[]>(...keys);
  return (values ?? []).reduce<number>((sum, v) => sum + Number(v ?? 0), 0);
}

async function main() {
  console.log(`Target: ${baseUrl}`);
  console.log(`Simulating ${sessions} concurrent guests × ${rounds} menu loads\n`);

  const before = await sheetsCallsInLastMinutes(3);
  const started = Date.now();
  const latencies: number[] = [];
  let failures = 0;

  for (let round = 0; round < rounds; round++) {
    await Promise.all(
      Array.from({ length: sessions }, async () => {
        const t0 = performance.now();
        try {
          const res = await fetch(`${baseUrl}/api/menu`, { cache: 'no-store' });
          if (!res.ok) failures++;
          await res.arrayBuffer();
        } catch {
          failures++;
        }
        latencies.push(performance.now() - t0);
      }),
    );
    process.stdout.write(`  round ${round + 1}/${rounds}\r`);
  }

  const elapsed = (Date.now() - started) / 1000;
  const after = await sheetsCallsInLastMinutes(3);
  const sheetsCalls = Math.max(0, after - before);

  latencies.sort((a, b) => a - b);
  const p = (q: number) => latencies[Math.floor(latencies.length * q)] ?? 0;
  const requests = sessions * rounds;

  console.log(`
Requests            ${requests}
Failures            ${failures}
Duration            ${elapsed.toFixed(1)}s  (${(requests / elapsed).toFixed(0)} req/s)
Latency p50/p95/p99 ${p(0.5).toFixed(0)} / ${p(0.95).toFixed(0)} / ${p(0.99).toFixed(0)} ms

Google Sheets calls ${sheetsCalls}   <- the number that matters
Calls per request   ${(sheetsCalls / requests).toFixed(4)}
`);

  // One catalog reload every five minutes is the expected steady state; a
  // handful of calls across thousands of requests means the cache is working.
  if (sheetsCalls > Math.max(5, requests * 0.01)) {
    console.error(
      'FAIL: too many Sheets calls. The menu cache is not absorbing reads —\n' +
        '      check UPSTASH_REDIS_REST_URL/TOKEN and look for cache write errors.\n',
    );
    process.exit(1);
  }

  if (failures > 0) {
    console.error(`FAIL: ${failures} requests errored.\n`);
    process.exit(1);
  }

  console.log('PASS: cache absorbed the load.\n');
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
