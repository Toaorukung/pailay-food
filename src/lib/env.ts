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
  get upstashUrl() {
    return read('UPSTASH_REDIS_REST_URL');
  },
  get upstashToken() {
    return read('UPSTASH_REDIS_REST_TOKEN');
  },
  get tableSecret() {
    return read('TABLE_SECRET');
  },
  get sessionSecret() {
    return read('SESSION_SECRET');
  },
  get cronSecret() {
    return read('CRON_SECRET');
  },
  get promptPayId() {
    return readOptional('PROMPTPAY_ID');
  },
  get googleClientId() {
    return read('AUTH_GOOGLE_ID');
  },
  get googleClientSecret() {
    return read('AUTH_GOOGLE_SECRET');
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
