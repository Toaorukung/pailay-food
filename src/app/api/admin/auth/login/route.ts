import { loginWithPassword, issueAdminSession } from '@/lib/admin/auth';
import { loginSchema, parseBody } from '@/lib/validation';
import { clientIp } from '@/lib/ratelimit';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, loginSchema);
  if (!body.ok) return fail(body.error);

  const result = await loginWithPassword(
    body.data.username,
    body.data.password,
    clientIp(req),
  );

  if (!result.ok) return fail(result.error, result.status);

  await issueAdminSession(result.session);
  return ok({ admin: { name: result.session.name, role: result.session.role } });
});
