/**
 * Environment access.
 *
 * Values are read lazily so that `next build` (which runs without runtime
 * secrets) does not explode at import time. Anything genuinely missing blows
 * up on first use, at request time, with a message that says what to set.
 */

function read(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return v;
}

/**
 * A signing secret, with a fixed development fallback.
 *
 * Local runs should not require generating three random strings before the
 * first page loads. Production still refuses to start without real ones —
 * a shared constant would make every deployment's session cookies forgeable
 * by anyone who has read this file.
 */
function readSecret(name: string): string {
  const v = process.env[name];
  if (v) return v;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Missing ${name}. Generate one with: openssl rand -base64 32`,
    );
  }
  return `dev-only-insecure-${name}`;
}

function readOptional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get appUrl() {
    return readOptional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
  },
  get googleServiceAccountKeyBase64() {
    return read('GOOGLE_SERVICE_ACCOUNT_KEY_BASE64');
  },
  get googleSheetId() {
    return read('GOOGLE_SHEET_ID');
  },
  get bookingSheetId() {
    return readOptional('BOOKING_SHEET_ID', '1N0zTpKMuuQSo7T29nk8pmjioV6D4obu09F3lgd8ycq0');
  },
  get bookingSheetTab() {
    return readOptional('BOOKING_SHEET_TAB', 'บันทึกการจอง');
  },
  /**
   * Vercel's Upstash integration injects KV_REST_API_URL / KV_REST_API_TOKEN,
   * while a hand-configured Upstash database uses the UPSTASH_ names. Accept
   * both rather than making the operator rename variables the platform wrote.
   */
  get upstashUrl() {
    return readOptional('UPSTASH_REDIS_REST_URL') || read('KV_REST_API_URL');
  },
  get upstashToken() {
    return readOptional('UPSTASH_REDIS_REST_TOKEN') || read('KV_REST_API_TOKEN');
  },
  get tableSecret() {
    return readSecret('TABLE_SECRET');
  },
  get sessionSecret() {
    return readSecret('SESSION_SECRET');
  },
  get cronSecret() {
    return readSecret('CRON_SECRET');
  },
  get promptPayId() {
    return readOptional('PROMPTPAY_ID', '0951519501');
  },
  get googleClientId() {
    return read('AUTH_GOOGLE_ID');
  },
  get googleClientSecret() {
    return read('AUTH_GOOGLE_SECRET');
  },
  /**
   * LINE. All three are optional: without them the app still runs, guests
   * just arrive as anonymous browsers and get no confirmation message.
   *   liffId              the LIFF app whose endpoint is /order
   *   lineLoginChannelId  the LIFF's LINE Login channel — verifies id tokens
   *   lineChannelToken    Messaging API channel access token — sends pushes
   */
  get liffId() {
    return readOptional('NEXT_PUBLIC_LIFF_ID');
  },
  get lineLoginChannelId() {
    return readOptional('LINE_LOGIN_CHANNEL_ID');
  },
  get lineChannelToken() {
    return readOptional('LINE_CHANNEL_ACCESS_TOKEN');
  },
  /** Lark custom bot webhook. The secret is only set if the bot signs. */
  get larkWebhookUrl() {
    return readOptional('LARK_WEBHOOK_URL');
  },
  get larkWebhookSecret() {
    return readOptional('LARK_WEBHOOK_SECRET');
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
};

/** Service account JSON, decoded from the base64 env var. */
export function serviceAccount(): { client_email: string; private_key: string } {
  let json: unknown;
  try {
    json = JSON.parse(
      Buffer.from(env.googleServiceAccountKeyBase64, 'base64').toString('utf8'),
    );
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 is not valid base64-encoded JSON.',
    );
  }
  const sa = json as { client_email?: string; private_key?: string };
  if (!sa.client_email || !sa.private_key) {
    throw new Error(
      'Service account JSON is missing client_email or private_key.',
    );
  }
  // Keys pasted through some tooling arrive with literal \n sequences.
  return {
    client_email: sa.client_email,
    private_key: sa.private_key.replace(/\\n/g, '\n'),
  };
}
