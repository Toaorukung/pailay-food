import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env';

/**
 * Google OAuth 2.0 authorization-code flow, implemented directly.
 *
 * Hand-rolled rather than pulled from a framework because the whole surface is
 * about sixty lines and the security-relevant steps are then visible in one
 * place: CSRF state, id_token signature verification against Google's JWKS,
 * issuer/audience/expiry checks, and a hard requirement that the email is
 * verified. All four matter; skipping any one of them turns "sign in with
 * Google" into "sign in as anyone".
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export const OAUTH_STATE_COOKIE = 'pf_oauth_state';

export function redirectUri(): string {
  return `${env.appUrl}/api/admin/auth/google/callback`;
}

/**
 * The state value is signed rather than stored server-side, so the callback
 * needs no shared state to validate it. The cookie carries the same value; a
 * request whose state does not match its cookie is a cross-site forgery.
 */
export function makeState(): string {
  const nonce = randomBytes(16).toString('base64url');
  const sig = createHmac('sha256', env.sessionSecret)
    .update(nonce)
    .digest('base64url')
    .slice(0, 20);
  return `${nonce}.${sig}`;
}

export function verifyState(state: string | undefined, cookie: string | undefined): boolean {
  if (!state || !cookie) return false;
  if (state.length !== cookie.length) return false;
  if (!timingSafeEqual(Buffer.from(state), Buffer.from(cookie))) return false;

  const idx = state.lastIndexOf('.');
  if (idx <= 0) return false;
  const expected = createHmac('sha256', env.sessionSecret)
    .update(state.slice(0, idx))
    .digest('base64url')
    .slice(0, 20);
  const got = state.slice(idx + 1);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // Force account choice: shared front-desk devices otherwise sign the
    // previous member of staff straight back in.
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleIdentity {
  email: string;
  name: string;
  picture: string;
}

export async function exchangeCode(code: string): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error('Google response had no id_token');

  const { payload } = await jwtVerify(data.id_token, JWKS, {
    issuer: ISSUERS,
    audience: env.googleClientId,
  });

  const email = typeof payload.email === 'string' ? payload.email : '';
  if (!email) throw new Error('Google identity had no email');
  if (payload.email_verified !== true) {
    // An unverified Google address can be one the user does not control.
    throw new Error('Google email is not verified');
  }

  return {
    email: email.toLowerCase(),
    name: typeof payload.name === 'string' ? payload.name : email,
    picture: typeof payload.picture === 'string' ? payload.picture : '',
  };
}

export function googleConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}
