import { NextResponse, type NextRequest } from 'next/server';
import {
  exchangeCode,
  verifyState,
  OAUTH_STATE_COOKIE,
} from '@/lib/admin/google';
import {
  adminForGoogleEmail,
  issueAdminSession,
  toSession,
} from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Google redirects here with an authorization code.
 *
 * Order matters: validate the CSRF state before spending a code, verify the
 * id_token signature before trusting any claim in it, and check the allowlist
 * before issuing a session. A valid Google account is not by itself
 * permission to run a restaurant.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') ?? undefined;
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;

  const bounce = (error: string) =>
    NextResponse.redirect(new URL(`/admin/login?error=${error}`, req.url));

  if (url.searchParams.get('error')) return bounce('google_denied');
  if (!code) return bounce('google_no_code');
  if (!verifyState(state, cookieState)) return bounce('google_state');

  let identity;
  try {
    identity = await exchangeCode(code);
  } catch (err) {
    console.error('[auth] google exchange failed', err);
    return bounce('google_exchange');
  }

  const user = await adminForGoogleEmail(identity.email);
  if (!user) return bounce('not_allowed');

  await issueAdminSession(toSession(user, 'google'));

  const res = NextResponse.redirect(new URL('/admin', req.url));
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}
