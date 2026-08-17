import { getSession, cookieSessionIdFrom } from '@/lib/session';
import { buildSnapshot } from '@/lib/snapshot';
import { handler, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Read-only poll target.
 *
 * Unlike the mutating routes this tolerates a CLOSED session — the guest keeps
 * their receipt after checkout, and the bill page polls here while waiting for
 * staff to approve a slip. Cookie ownership is still required: a session id in
 * someone else's hands must not reveal what a villa ordered.
 */
export const GET = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;

  if (cookieSessionIdFrom(req) !== sessionId) {
    return fail('กรุณาสแกน QR ในวิลล่า', 403, { code: 'NOT_YOUR_SESSION' });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return fail('ไม่พบเซสชันนี้', 404, { code: 'NOT_FOUND' });
  }

  const snapshot = await buildSnapshot(session);
  return Response.json(
    { ok: true, ...snapshot },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
