import { requireAdmin } from '@/lib/admin/auth';
import { hashPassword } from '@/lib/admin/password';
import { TABS } from '@/lib/sheets/schema';
import { listRows, upsertRow, deleteRow } from '@/lib/sheets/crud';
import { sheetsConfigured } from '@/lib/demo';
import {
  createAdminUserSchema,
  updateAdminUserSchema,
  parseBody,
} from '@/lib/validation';
import { audit } from '@/lib/audit';
import { clientIp } from '@/lib/ratelimit';
import { shortCode } from '@/lib/ids';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'OWNER');
  if (!auth.ok) return auth.response;

  const rows = await listRows(TABS.AdminUsers);
  const users = rows
    .filter((r) => r.id)
    .map((r) => ({
      id: r.id,
      email: r.email || '',
      username: r.username || '',
      name: r.name || r.username || r.email || '',
      role: r.role || 'STAFF',
      isActive: r.is_active === 'TRUE' || r.is_active === 'true',
      hasPassword: Boolean(r.password_hash && r.password_hash.trim().length > 0),
      createdAt: r.created_at || '',
    }));

  return ok({ users, currentUserId: auth.admin.id });
});

export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'OWNER');
  if (!auth.ok) return auth.response;

  if (!sheetsConfigured()) {
    return fail('ไม่ได้เชื่อมต่อ Google Sheet', 503);
  }

  const body = await parseBody(req, createAdminUserSchema);
  if (!body.ok) return fail(body.error);

  const rows = await listRows(TABS.AdminUsers);
  const usernameLower = body.data.username.toLowerCase();
  const emailLower = body.data.email.toLowerCase();

  const conflict = rows.find(
    (r) =>
      r.username.toLowerCase() === usernameLower ||
      (emailLower && r.email.toLowerCase() === emailLower),
  );

  if (conflict) {
    if (conflict.username.toLowerCase() === usernameLower) {
      return fail('ชื่อผู้ใช้ (Username) นี้มีอยู่ในระบบแล้ว', 400);
    }
    return fail('อีเมลนี้มีอยู่ในระบบแล้ว', 400);
  }

  const passwordHash = body.data.password.trim()
    ? hashPassword(body.data.password.trim())
    : '';

  const record = {
    id: `u-${shortCode()}`,
    email: emailLower,
    username: usernameLower,
    password_hash: passwordHash,
    name: body.data.name.trim(),
    role: body.data.role,
    is_active: body.data.isActive ? 'TRUE' : 'FALSE',
    created_at: new Date().toISOString(),
  };

  await upsertRow(TABS.AdminUsers, record);
  await audit(
    auth.admin,
    'create_user',
    record.id,
    { username: record.username, role: record.role },
    clientIp(req),
  );

  return ok({ id: record.id });
});

export const PATCH = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'OWNER');
  if (!auth.ok) return auth.response;

  if (!sheetsConfigured()) {
    return fail('ไม่ได้เชื่อมต่อ Google Sheet', 503);
  }

  const body = await parseBody(req, updateAdminUserSchema);
  if (!body.ok) return fail(body.error);

  if (body.data.id === auth.admin.id) {
    if (!body.data.isActive) {
      return fail('ไม่สามารถระงับการใช้งานบัญชีที่คุณกำลังใช้งานอยู่ได้', 400);
    }
    if (body.data.role !== 'OWNER') {
      return fail('ไม่สามารถลดระดับสิทธิ์ของบัญชีตนเองได้', 400);
    }
  }

  const rows = await listRows(TABS.AdminUsers);
  const existing = rows.find((r) => r.id === body.data.id);
  if (!existing) {
    return fail('ไม่พบผู้ใช้งานนี้', 404);
  }

  const usernameLower = body.data.username.toLowerCase();
  const emailLower = body.data.email.toLowerCase();

  const conflict = rows.find(
    (r) =>
      r.id !== body.data.id &&
      (r.username.toLowerCase() === usernameLower ||
        (emailLower && r.email.toLowerCase() === emailLower)),
  );

  if (conflict) {
    if (conflict.username.toLowerCase() === usernameLower) {
      return fail('ชื่อผู้ใช้ (Username) นี้มีอยู่ในระบบแล้ว', 400);
    }
    return fail('อีเมลนี้มีอยู่ในระบบแล้ว', 400);
  }

  let passwordHash = existing.password_hash || '';
  if (body.data.password && body.data.password.trim().length > 0) {
    passwordHash = hashPassword(body.data.password.trim());
  }

  const record = {
    id: body.data.id,
    email: emailLower,
    username: usernameLower,
    password_hash: passwordHash,
    name: body.data.name.trim(),
    role: body.data.role,
    is_active: body.data.isActive ? 'TRUE' : 'FALSE',
    created_at: existing.created_at || new Date().toISOString(),
  };

  await upsertRow(TABS.AdminUsers, record);
  await audit(
    auth.admin,
    'update_user',
    record.id,
    {
      username: record.username,
      role: record.role,
      changedPassword: Boolean(body.data.password && body.data.password.trim().length > 0),
    },
    clientIp(req),
  );

  return ok({ id: record.id });
});

export const DELETE = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'OWNER');
  if (!auth.ok) return auth.response;

  if (!sheetsConfigured()) {
    return fail('ไม่ได้เชื่อมต่อ Google Sheet', 503);
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return fail('ต้องระบุ ID ผู้ใช้', 400);

  if (id === auth.admin.id) {
    return fail('ไม่สามารถลบบัญชีที่คุณกำลังใช้งานอยู่ได้', 400);
  }

  const success = await deleteRow(TABS.AdminUsers, id);
  if (!success) {
    return fail('ไม่พบผู้ใช้งานนี้ หรือลบไม่สำเร็จ', 404);
  }

  await audit(auth.admin, 'delete_user', id, {}, clientIp(req));
  return ok({ success: true });
});
