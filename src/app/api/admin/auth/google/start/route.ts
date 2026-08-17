import { NextResponse, type NextRequest } from 'next/server';
import { googleAuthUrl, makeState, googleConfigured, OAUTH_STATE_COOKIE } from '@/lib/admin/google';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.redirect(
      new URL('/admin/login?error=google_not_configured', req.url),
    );
  }

  const state = makeState();
  const res = NextResponse.redirect(googleAuthUrl(state));

  // The matching half of the CSRF check. Short-lived because the round trip
  // to Google and back takes seconds, not hours.
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
