import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/auth';
import { listOpenSessions, closeSession, getSession } from '@/lib/session';
import { sessionOrders, billableTotal } from '@/lib/orders';
import { audit } from '@/lib/audit';
import { clientIp } from '@/lib/ratelimit';
import { parseBody } from '@/lib/validation';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

const closeSchema = z.object({
  sessionId: z.string().min(1).max(64),
  reason: z.string().max(300).default(''),
});

export const GET = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'STAFF');
  if (!auth.ok) return auth.response;

  const sessions = await listOpenSessions();
  const withTotals = await Promise.all(
    sessions.map(async (s) => ({
      ...s,
      billTotal: billableTotal(await sessionOrders(s.id)),
    })),
  );
  return ok({ sessions: withTotals });
});

/**
 * Force-close. Used when guests leave without checking out, or pay in cash at
 * reception. The villa's QR immediately starts a clean session on the next
 * scan, and the closed link becomes a receipt.
 */
export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'MANAGER');
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, closeSchema);
  if (!body.ok) return fail(body.error);

  const existing = await getSession(body.data.sessionId);
  if (!existing) return fail('ไม่พบเซสชันนี้', 404);

  const closed = await closeSession(body.data.sessionId);
  await audit(
    auth.admin,
    'session.forceClose',
    body.data.sessionId,
    { reason: body.data.reason, villa: existing.villa },
    clientIp(req),
  );

  return ok({ session: closed });
});
