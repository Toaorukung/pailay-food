/**
 * Standalone mode.
 *
 * The app normally needs three external services: Google Sheets for the system
 * of record, Upstash Redis for hot state, and Vercel Blob for uploaded images.
 * Signing up for all three before you can see a single screen is a bad first
 * five minutes, so each one degrades independently:
 *
 *   no Google Sheets  -> menu comes from the bundled copy of the printed menu,
 *                        and writes that would go to the spreadsheet are dropped
 *   no Upstash Redis  -> in-process store (single machine only — see kv.ts)
 *   no Vercel Blob    -> uploaded images are kept in the KV store instead
 *
 * With none of them configured, `npm run dev` gives a fully working ordering
 * system on localhost. With Redis alone, it works as a real deployment.
 *
 * Nothing here weakens a configured deployment: every check is "is this
 * service absent", never "is this a demo, skip the rule". Session expiry,
 * price recalculation, allergy acknowledgement and the age gate behave
 * identically in both modes.
 */

function has(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export function sheetsConfigured(): boolean {
  return has('GOOGLE_SERVICE_ACCOUNT_KEY_BASE64') && has('GOOGLE_SHEET_ID');
}

export function redisConfigured(): boolean {
  return has('UPSTASH_REDIS_REST_URL') && has('UPSTASH_REDIS_REST_TOKEN');
}

export function blobConfigured(): boolean {
  return has('BLOB_READ_WRITE_TOKEN');
}

/** True when the spreadsheet is absent and the bundled menu is in use. */
export function standaloneMenu(): boolean {
  return !sheetsConfigured();
}

export interface ServiceStatus {
  sheets: boolean;
  redis: boolean;
  blob: boolean;
  /** Persistent across restarts and across serverless instances. */
  durable: boolean;
}

export function serviceStatus(): ServiceStatus {
  const redis = redisConfigured();
  return {
    sheets: sheetsConfigured(),
    redis,
    blob: blobConfigured(),
    durable: redis,
  };
}

let warned = false;

/** One startup line, so nobody wonders why their orders vanished on restart. */
export function warnOnce(): void {
  if (warned) return;
  warned = true;

  const status = serviceStatus();
  if (status.sheets && status.redis && status.blob) return;

  const missing: string[] = [];
  if (!status.sheets) missing.push('Google Sheets (ใช้เมนูที่ฝังมากับแอป · ไม่บันทึกลงชีต)');
  if (!status.redis) missing.push('Upstash Redis (เก็บในหน่วยความจำ · หายเมื่อรีสตาร์ต)');
  if (!status.blob) missing.push('Vercel Blob (เก็บรูปใน KV แทน)');

  console.warn(
    `\n  ⚑ Standalone mode — ยังไม่ได้ตั้งค่า:\n${missing
      .map((m) => `      · ${m}`)
      .join('\n')}\n    ระบบใช้งานได้ครบทุกฟังก์ชัน แต่ข้อมูลยังไม่ถาวร ดู .env.example\n`,
  );
}
