import { clearAdminSession } from '@/lib/admin/auth';
import { handler, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const POST = handler(async () => {
  await clearAdminSession();
  return ok({});
});
