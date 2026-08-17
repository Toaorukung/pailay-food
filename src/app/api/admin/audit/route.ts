import { requireAdmin } from '@/lib/admin/auth';
import { listRows } from '@/lib/sheets/crud';
import { TABS } from '@/lib/sheets/schema';
import { handler, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Owner-only: the audit trail records who did what, including to each other. */
export const GET = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'OWNER');
  if (!auth.ok) return auth.response;

  const limit = Math.min(
    500,
    Number(new URL(req.url).searchParams.get('limit') ?? 200) || 200,
  );

  const rows = await listRows(TABS.AuditLog);
  const recent = rows
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
    .slice(0, limit);

  return ok({ entries: recent });
});
