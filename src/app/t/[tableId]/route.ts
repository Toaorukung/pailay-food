import { NextResponse, type NextRequest } from 'next/server';
import { verifyTable } from '@/lib/qr';
import { getTable } from '@/lib/tables';
import { createOrJoinSession, sessionCookie } from '@/lib/session';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { parseLocale, LOCALE_COOKIE } from '@/i18n/locale';

export const dynamic = 'force-dynamic';

/**
 * The QR landing point.
 *
 * A printed sticker points here. This handler mints (or re-joins) a session
 * and bounces the guest to /s/<sessionId>, which is the only place ordering
 * happens. Keeping the entry point separate from the ordering URL is what lets
 * a single printed code work forever while each visit gets a fresh, revocable
 * session id.
 *
 * It has to be a Route Handler rather than a page: setting a cookie during a
 * Server Component render is not allowed in Next 15.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tableId: string }> },
) {
  const { tableId } = await params;
  const url = new URL(req.url);
  const signature = url.searchParams.get('k') ?? undefined;

  if (!verifyTable(tableId, signature)) {
    // Wrong or missing signature: either a hand-typed URL or someone probing
    // for valid table ids. Same generic page either way.
    return NextResponse.redirect(new URL('/invalid', req.url), 302);
  }

  const limit = await rateLimit('session', clientIp(req));
  if (!limit.ok) {
    return NextResponse.redirect(new URL('/invalid?reason=busy', req.url), 302);
  }

  const table = await getTable(tableId);
  if (!table || !table.isActive) {
    return NextResponse.redirect(new URL('/invalid?reason=table', req.url), 302);
  }

  const locale = parseLocale(req.cookies.get(LOCALE_COOKIE)?.value);
  const session = await createOrJoinSession(table, locale);

  const response = NextResponse.redirect(
    new URL(`/s/${session.id}`, req.url),
    302,
  );

  // Attached to this exact response rather than through cookies(), so the
  // browser is guaranteed to hold it before it follows the redirect. Without
  // the cookie the very next page load looks like a forwarded link.
  const { name, value, options } = sessionCookie(session.id);
  response.cookies.set(name, value, options);

  return response;
}
