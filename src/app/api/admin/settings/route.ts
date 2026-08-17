import { requireAdmin } from '@/lib/admin/auth';
import { loadSettingsMap, SETTINGS_DEFAULTS } from '@/lib/sheets/repo';
import { writeSettings } from '@/lib/sheets/crud';
import { bustMenuCache } from '@/lib/menu-cache';
import { settingsSchema, parseBody } from '@/lib/validation';
import { audit } from '@/lib/audit';
import { clientIp } from '@/lib/ratelimit';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'MANAGER');
  if (!auth.ok) return auth.response;

  const settings = await loadSettingsMap();
  return ok({ settings, defaults: SETTINGS_DEFAULTS });
});

/** Owner-only: these values move money (service charge, VAT, PromptPay name). */
export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'OWNER');
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, settingsSchema);
  if (!body.ok) return fail(body.error);

  await writeSettings(body.data.entries);
  await bustMenuCache();

  await audit(
    auth.admin,
    'settings.update',
    'Settings',
    { keys: body.data.entries.map((e) => e.key) },
    clientIp(req),
  );

  return ok({ saved: body.data.entries.length });
});
