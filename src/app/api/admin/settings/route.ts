import { requireAdmin } from '@/lib/admin/auth';
import { loadSettingsMap, SETTINGS_DEFAULTS } from '@/lib/sheets/repo';
import { writeSettings } from '@/lib/sheets/crud';
import { bustMenuCache } from '@/lib/menu-cache';
import { settingsSchema, parseBody } from '@/lib/validation';
import { audit } from '@/lib/audit';
import { clientIp } from '@/lib/ratelimit';
import { handler, fail, ok } from '@/lib/api';
import { sheetsConfigured } from '@/lib/demo';
import { cleanLineToken } from '@/lib/line';
import { kv, K } from '@/lib/kv';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'MANAGER');
  if (!auth.ok) return auth.response;

  const isOwner = auth.admin.role === 'OWNER';
  const rawSettings = await loadSettingsMap();
  const settings = { ...rawSettings };
  const defaults = { ...SETTINGS_DEFAULTS };

  // Only OWNER can view or edit sensitive LINE credentials
  if (!isOwner) {
    delete settings.line_channel_token;
    delete defaults.line_channel_token;
    delete settings.line_channel_id;
    delete defaults.line_channel_id;
    delete settings.line_channel_secret;
    delete defaults.line_channel_secret;
  }

  return ok({ settings, defaults, isOwner });
});

/** Owner-only: these values move money (service charge, VAT, PromptPay name) and sensitive credentials. */
export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'OWNER');
  if (!auth.ok) return auth.response;

  if (!sheetsConfigured()) {
    return fail(
      'แก้ไขข้อมูลไม่ได้เพราะยังไม่ได้เชื่อม Google Sheet — เมนูตอนนี้มาจากไฟล์ที่ฝังมากับแอป',
      503,
      { code: 'SHEETS_NOT_CONFIGURED' },
    );
  }

  const body = await parseBody(req, settingsSchema);
  if (!body.ok) return fail(body.error);

  // Update line_channel_id and line_channel_secret in Redis
  const idEntry = body.data.entries.find((e) => e.key === 'line_channel_id');
  if (idEntry?.value) {
    await kv().set(K.lineChannelId, idEntry.value.trim()).catch(() => {});
  }
  const secretEntry = body.data.entries.find((e) => e.key === 'line_channel_secret');
  if (secretEntry?.value) {
    await kv().set(K.lineChannelSecret, secretEntry.value.trim()).catch(() => {});
  }

  // Sanitize line_channel_token and update hot cache in Redis
  const tokenEntry = body.data.entries.find((e) => e.key === 'line_channel_token');
  if (tokenEntry) {
    tokenEntry.value = cleanLineToken(tokenEntry.value);
    if (tokenEntry.value) {
      await kv().set(K.lineToken, tokenEntry.value, { ex: 86400 * 30 }).catch(() => {});
    } else {
      await kv().del(K.lineToken).catch(() => {});
    }
  }

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
