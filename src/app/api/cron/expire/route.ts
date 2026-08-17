import { env } from '@/lib/env';
import { listOpenSessions, closeSession, SESSION_TTL_SECONDS } from '@/lib/session';
import { handler, ok, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Closes sessions nobody ever checked out of.
 *
 * Guests wander off without settling up — the villa moves to a room charge, or
 * they simply stop. Leaving those open would mean the next guest in that villa
 * joins the previous party's bill on their first scan, which is the worst
 * possible bug in a system like this.
 */
export const GET = handler(async (req: Request) => {
  const provided = req.headers.get('authorization');
  if (provided !== `Bearer ${env.cronSecret}`) {
    return fail('Unauthorized', 401);
  }

  const cutoff = Date.now() - SESSION_TTL_SECONDS * 1000;
  const sessions = await listOpenSessions(500);
  const stale = sessions.filter((s) => Date.parse(s.openedAt) < cutoff);

  for (const session of stale) {
    await closeSession(session.id);
  }

  return ok({ checked: sessions.length, closed: stale.length });
});
