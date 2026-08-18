import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/auth';
import { TABS, type TabName } from '@/lib/sheets/schema';
import {
  listRows,
  upsertRow,
  deleteRow,
  deleteMenuItemCascade,
} from '@/lib/sheets/crud';
import { bustMenuCache } from '@/lib/menu-cache';
import { bustTablesCache, getTables } from '@/lib/tables';
import { slugify, fallbackCode, newVillaCode } from '@/lib/villa-link';
import {
  menuItemSchema,
  categorySchema,
  allergenSchema,
  tableSchema,
  optionGroupSchema,
  optionSchema,
  parseBody,
} from '@/lib/validation';
import { audit } from '@/lib/audit';
import { clientIp } from '@/lib/ratelimit';
import { shortCode } from '@/lib/ids';
import { sheetsConfigured } from '@/lib/demo';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * One CRUD surface for every content tab.
 *
 * The tab name arrives in the URL, so it is checked against an explicit
 * allowlist before anything else happens. Without that, `/api/admin/content/
 * AdminUsers` would be a self-service role escalation endpoint.
 */
const EDITABLE = {
  menu: { tab: TABS.Menu, schema: menuItemSchema, prefix: 'm' },
  categories: { tab: TABS.Categories, schema: categorySchema, prefix: 'c' },
  allergens: { tab: TABS.Allergens, schema: allergenSchema, prefix: 'a' },
  tables: { tab: TABS.Tables, schema: tableSchema, prefix: 'v' },
  'option-groups': {
    tab: TABS.MenuOptionGroups,
    schema: optionGroupSchema,
    prefix: 'g',
  },
  options: { tab: TABS.MenuOptions, schema: optionSchema, prefix: 'o' },
} as const satisfies Record<
  string,
  { tab: TabName; schema: z.ZodTypeAny; prefix: string }
>;

type EditableKey = keyof typeof EDITABLE;

function resolve(tab: string) {
  return Object.prototype.hasOwnProperty.call(EDITABLE, tab)
    ? EDITABLE[tab as EditableKey]
    : null;
}

async function bustFor(tab: TabName) {
  if (tab === TABS.Tables) {
    await bustTablesCache();
    return;
  }
  // Everything else the guest sees comes out of the menu catalog.
  await bustMenuCache();
}

type Params = { params: Promise<{ tab: string }> };

export const GET = handler(async (req: Request, { params }: Params) => {
  const auth = await requireAdmin(req, 'STAFF');
  if (!auth.ok) return auth.response;

  const { tab } = await params;
  const target = resolve(tab);
  if (!target) return fail('ไม่รู้จักหมวดข้อมูลนี้', 404);

  return ok({ rows: await listRows(target.tab) });
});

export const POST = handler(async (req: Request, { params }: Params) => {
  const auth = await requireAdmin(req, 'MANAGER');
  if (!auth.ok) return auth.response;

  if (!sheetsConfigured()) {
    return fail(
      'แก้ไขข้อมูลไม่ได้เพราะยังไม่ได้เชื่อม Google Sheet — เมนูตอนนี้มาจากไฟล์ที่ฝังมากับแอป',
      503,
      { code: 'SHEETS_NOT_CONFIGURED' },
    );
  }


  const { tab } = await params;
  const target = resolve(tab);
  if (!target) return fail('ไม่รู้จักหมวดข้อมูลนี้', 404);

  const body = await parseBody(req, target.schema);
  if (!body.ok) return fail(body.error);

  const record = body.data as Record<string, unknown>;
  const existingId = String(record.id ?? '').trim();
  const id = existingId || `${target.prefix}-${shortCode(5).toLowerCase()}`;

  if (target.tab === TABS.Tables) {
    // Blank link fields are resolved at read time, which leaves the printed
    // address invisible in the sheet and unbuildable by the admin list.
    // Settle them here so what is stored is exactly what gets printed.
    //
    // An existing villa gets the same code the runtime was already deriving,
    // so a QR sticker already on a wall keeps working. Only a brand new villa
    // gets a fresh random one.
    const chosenSlug = String(record.slug ?? '').trim();
    if (!chosenSlug) {
      record.slug = slugify(String(record.villa || record.label || id));
    }
    if (!record.qr_code) {
      record.qr_code = existingId ? fallbackCode(id) : newVillaCode();
    }

    // Two villas sharing a slug would make /<slug>/<code> ambiguous, and a
    // guest could land on the wrong villa's bill.
    const villas = await getTables();
    if (villas.some((v) => v.slug === record.slug && v.id !== id)) {
      // A slug the operator typed is their decision to correct.
      if (chosenSlug) {
        return fail(`ชื่อลิงก์ "${record.slug}" ถูกใช้กับวิลล่าอื่นแล้ว`, 409, {
          code: 'SLUG_TAKEN',
        });
      }
      // A derived one is not: slugify keeps only ASCII, so every villa named
      // in Thai reduces to the same fallback. Refusing to save a villa over a
      // name the operator never chose would be a dead end, and the id is
      // unique by construction.
      record.slug = `${record.slug}-${id.replace(/^v-/, '')}`;
    }
  }

  // Arrays live in the Sheet as comma-joined strings; toRow handles that, but
  // being explicit here keeps the stored shape obvious when reading the sheet.
  const result = await upsertRow(target.tab, { ...record, id });
  await bustFor(target.tab);

  await audit(
    auth.admin,
    result.created ? `${tab}.create` : `${tab}.update`,
    id,
    record,
    clientIp(req),
  );

  return ok({ id, created: result.created });
});

export const DELETE = handler(async (req: Request, { params }: Params) => {
  const auth = await requireAdmin(req, 'MANAGER');
  if (!auth.ok) return auth.response;

  if (!sheetsConfigured()) {
    return fail(
      'แก้ไขข้อมูลไม่ได้เพราะยังไม่ได้เชื่อม Google Sheet — เมนูตอนนี้มาจากไฟล์ที่ฝังมากับแอป',
      503,
      { code: 'SHEETS_NOT_CONFIGURED' },
    );
  }


  const { tab } = await params;
  const target = resolve(tab);
  if (!target) return fail('ไม่รู้จักหมวดข้อมูลนี้', 404);

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('ต้องระบุ id', 400);

  // Removing a dish must take its option groups and options with it, or the
  // spreadsheet accumulates orphans that the catalog loader silently ignores.
  if (target.tab === TABS.Menu) {
    await deleteMenuItemCascade(id);
  } else {
    const removed = await deleteRow(target.tab, id);
    if (!removed) return fail('ไม่พบรายการนี้', 404);
  }

  await bustFor(target.tab);
  await audit(auth.admin, `${tab}.delete`, id, {}, clientIp(req));
  return ok({ id });
});
