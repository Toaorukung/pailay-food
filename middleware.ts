import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Gates the admin pages.
 *
 * This is a convenience layer only: it keeps unauthenticated browsers off the
 * admin screens so they never see a half-rendered dashboard. It is NOT the
 * authorisation boundary — every admin API route independently verifies the
 * session and the required role. Middleware protects pages; it does not
 * protect the data behind them.
 *
 * Runs on the edge runtime, so it uses jose rather than node:crypto.
 */

const ADMIN_COOKIE = 'pf_admin';
const PUBLIC_ADMIN_PATHS = ['/admin/login'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;

  if (!token || !secret) return redirectToLogin(req);

  try {
    await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: 'pailay-food',
      audience: 'pailay-admin',
    });
  } catch {
    return redirectToLogin(req);
  }

  return NextResponse.next();
}

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  // Bounce the user back to where they were headed after signing in.
  url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/:path*'],
};
