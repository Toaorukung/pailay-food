/**
 * Fixed secrets for tests. Real values never appear here — these exist only so
 * the HMAC and cookie-signing helpers have something deterministic to work
 * with.
 */
process.env.TABLE_SECRET ??= 'test-table-secret-do-not-use-in-production';
process.env.SESSION_SECRET ??= 'test-session-secret-do-not-use-in-production';
process.env.CRON_SECRET ??= 'test-cron-secret';
process.env.NEXT_PUBLIC_APP_URL ??= 'https://example.test';
process.env.PROMPTPAY_ID ??= '0812345678';
