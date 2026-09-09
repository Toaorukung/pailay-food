import { batchGet } from './client';
import { sheetsConfigured } from '../demo';
import { slugify, fallbackCode } from '../villa-link';
import { TABS, fullRange, toObjects, num, bool, list, type RawRow } from './schema';
import type {
  AdminUser,
  AdminRole,
  Allergen,
  Category,
  GuestField,
  GuestFieldType,
  Localized,
  MenuCatalog,
  MenuItem,
  MenuOption,
  MenuOptionGroup,
  PublicSettings,
  VillaTable,
} from '../types';
import { GUEST_FIELD_TYPES } from '../types';

function loc(r: RawRow, prefix: string): Localized {
  return {
    th: r[`${prefix}_th`] ?? '',
    en: r[`${prefix}_en`] ?? '',
    zh: r[`${prefix}_zh`] ?? '',
  };
}

// ── Settings ────────────────────────────────────────────────

export const SETTINGS_DEFAULTS: Record<string, string> = {
  shop_name: 'Pailay Food',
  currency: 'THB',
  service_charge_percent: '0',
  vat_percent: '0',
  vat_included: 'TRUE',
  min_order_amount: '0',
  // Blank means the villa takes orders around the clock. A villa that closes
  // its order book at night fills these in — order_cutoff is the 21:00 last
  // order, order_open the morning it starts taking them.
  order_open: '',
  order_cutoff: '',
  promptpay_name: '',
  allergy_disclaimer_th:
    'ครัวของเราปรุงอาหารหลายชนิดในพื้นที่เดียวกัน จึงไม่สามารถรับประกันได้ว่าปราศจากสารก่อภูมิแพ้ 100% หากแพ้รุนแรง กรุณาแจ้งพนักงานโดยตรง',
  allergy_disclaimer_en:
    'Our kitchen handles many ingredients in a shared space, so we cannot guarantee any dish is 100% allergen-free. If your allergy is severe, please speak to staff directly.',
  allergy_disclaimer_zh:
    '我们的厨房在同一区域处理多种食材，无法保证任何菜品完全不含过敏原。如有严重过敏，请直接告知工作人员。',
  payment_note_th: 'สแกน QR ด้านล่างเพื่อชำระเงิน แล้วอัปโหลดสลิปเพื่อยืนยัน',
  payment_note_en: 'Scan the QR below to pay, then upload your slip to confirm.',
  payment_note_zh: '扫描下方二维码付款，然后上传付款凭证以确认。',
  contact_phone: '',
  // Defaults are deliberately empty rather than invented: an unconfigured
  // notice shows nothing instead of showing rules the villa never agreed to.
  welcome_enabled: 'TRUE',
  // Unlike the service notice, this artwork ships with the app, so the welcome
  // step works on a sheet that has never heard of the key. A villa that wants
  // its own picture overwrites the value; one that wants no welcome at all
  // sets welcome_enabled to FALSE.
  welcome_image: '/notice/welcome.jpg',
  service_notice_enabled: 'TRUE',
  service_notice_image: '',
  service_notice_th: '',
  service_notice_en: '',
  service_notice_zh: '',
  alcohol_min_age: '20',
  alcohol_notice_th:
    'เครื่องดื่มแอลกอฮอล์จำหน่ายเฉพาะผู้มีอายุ 20 ปีบริบูรณ์ขึ้นไป',
  alcohol_notice_en: 'Alcohol is sold only to people aged 20 and over.',
  alcohol_notice_zh: '酒精饮品仅售予 20 岁及以上人士。',
};

function settingsFrom(rows: RawRow[]): Record<string, string> {
  const map: Record<string, string> = { ...SETTINGS_DEFAULTS };
  for (const r of rows) {
    if (r.key) map[r.key] = r.value ?? '';
  }
  return map;
}

function publicSettings(map: Record<string, string>): PublicSettings {
  return {
    shopName: map.shop_name,
    currency: map.currency || 'THB',
    serviceChargePercent: num(map.service_charge_percent),
    vatPercent: num(map.vat_percent),
    vatIncluded: bool(map.vat_included, true),
    minOrderAmount: num(map.min_order_amount),
    orderOpen: map.order_open ?? '',
    orderCutoff: map.order_cutoff ?? '',
    promptPayName: map.promptpay_name ?? '',
    allergyDisclaimer: {
      th: map.allergy_disclaimer_th,
      en: map.allergy_disclaimer_en,
      zh: map.allergy_disclaimer_zh,
    },
    paymentNote: {
      th: map.payment_note_th,
      en: map.payment_note_en,
      zh: map.payment_note_zh,
    },
    contactPhone: map.contact_phone ?? '',
    welcomeEnabled: bool(map.welcome_enabled, true),
    welcomeImage: map.welcome_image ?? '',
    serviceNoticeEnabled: bool(map.service_notice_enabled, true),
    serviceNoticeImage: map.service_notice_image ?? '',
    serviceNotice: {
      th: map.service_notice_th ?? '',
      en: map.service_notice_en ?? '',
      zh: map.service_notice_zh ?? '',
    },
    alcoholMinAge: num(map.alcohol_min_age, 20),
    alcoholNotice: {
      th: map.alcohol_notice_th ?? '',
      en: map.alcohol_notice_en ?? '',
      zh: map.alcohol_notice_zh ?? '',
    },
  };
}

// ── Guest intake fields ─────────────────────────────────────

function localizedList(r: RawRow, prefix: string): {
  th: string[];
  en: string[];
  zh: string[];
} {
  return {
    th: list(r[`${prefix}_th`]),
    en: list(r[`${prefix}_en`]),
    zh: list(r[`${prefix}_zh`]),
  };
}

function guestFieldsFrom(rows: RawRow[]): GuestField[] {
  return rows
    .filter((r) => r.id && r.label_th)
    .map((r) => ({
      id: r.id,
      label: loc(r, 'label'),
      type: (GUEST_FIELD_TYPES as readonly string[]).includes(r.type)
        ? (r.type as GuestFieldType)
        : 'text',
      options: localizedList(r, 'options'),
      required: bool(r.required, false),
      sortOrder: num(r.sort_order, 999),
      isActive: bool(r.is_active, true),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Read on its own rather than in the catalog's single batch, and forgiving of
 * failure on purpose.
 *
 * A spreadsheet set up before this feature existed has no GuestFields tab at
 * all, and one unknown range fails the whole batchGet — which would take the
 * menu down until somebody re-ran the seed. Asking no extra questions is the
 * right behaviour for a villa that never configured any, so a missing tab is
 * an empty list, not an outage.
 */
async function loadGuestFields(): Promise<GuestField[]> {
  const range = fullRange(TABS.GuestFields);
  try {
    const res = await batchGet([range]);
    return guestFieldsFrom(toObjects(res[range] ?? []).rows);
  } catch {
    return [];
  }
}

// ── Catalog ─────────────────────────────────────────────────

/**
 * Reads everything the guest menu needs in ONE Sheets API call.
 *
 * Only ever called on a cache miss. In steady state this runs at most once
 * every few minutes for the whole fleet, not once per guest.
 */
export async function loadCatalogFromSheets(version: number): Promise<MenuCatalog> {
  const ranges = [
    fullRange(TABS.Categories),
    fullRange(TABS.Menu),
    fullRange(TABS.MenuOptionGroups),
    fullRange(TABS.MenuOptions),
    fullRange(TABS.Allergens),
    fullRange(TABS.Settings),
  ];
  const [res, guestFields] = await Promise.all([
    batchGet(ranges),
    loadGuestFields(),
  ]);

  const categories: Category[] = toObjects(res[ranges[0]] ?? [])
    .rows.filter((r) => r.id)
    .map((r) => ({
      id: r.id,
      name: loc(r, 'name'),
      icon: r.icon ?? '',
      sortOrder: num(r.sort_order, 999),
      isActive: bool(r.is_active, true),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const allergens: Allergen[] = toObjects(res[ranges[4]] ?? [])
    .rows.filter((r) => r.id)
    .map((r) => ({
      id: r.id,
      name: loc(r, 'name'),
      icon: r.icon ?? '',
      isActive: bool(r.is_active, true),
    }));

  const options: MenuOption[] = toObjects(res[ranges[3]] ?? [])
    .rows.filter((r) => r.id && r.group_id)
    .map((r) => ({
      id: r.id,
      groupId: r.group_id,
      name: loc(r, 'name'),
      priceDelta: num(r.price_delta),
      isAvailable: bool(r.is_available, true),
      sortOrder: num(r.sort_order, 999),
    }));

  const optionsByGroup = new Map<string, MenuOption[]>();
  for (const o of options) {
    const arr = optionsByGroup.get(o.groupId);
    if (arr) arr.push(o);
    else optionsByGroup.set(o.groupId, [o]);
  }
  for (const arr of optionsByGroup.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const groups: MenuOptionGroup[] = toObjects(res[ranges[2]] ?? [])
    .rows.filter((r) => r.id && r.menu_id)
    .map((r) => {
      const type = r.type === 'multi' ? 'multi' : 'single';
      const groupOptions = optionsByGroup.get(r.id) ?? [];
      const required = bool(r.required, false);
      return {
        id: r.id,
        menuId: r.menu_id,
        name: loc(r, 'name'),
        type,
        required,
        // A required single-choice group means exactly one pick; the Sheet
        // does not have to spell that out.
        minSelect: num(r.min_select, required ? 1 : 0),
        maxSelect: num(r.max_select, type === 'single' ? 1 : groupOptions.length),
        sortOrder: num(r.sort_order, 999),
        options: groupOptions,
      } satisfies MenuOptionGroup;
    });

  const groupsByMenu = new Map<string, MenuOptionGroup[]>();
  for (const g of groups) {
    const arr = groupsByMenu.get(g.menuId);
    if (arr) arr.push(g);
    else groupsByMenu.set(g.menuId, [g]);
  }
  for (const arr of groupsByMenu.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const items: MenuItem[] = toObjects(res[ranges[1]] ?? [])
    .rows.filter((r) => r.id)
    .map((r) => ({
      id: r.id,
      categoryId: r.category_id ?? '',
      name: loc(r, 'name'),
      description: loc(r, 'desc'),
      ingredients: loc(r, 'ingredients'),
      price: num(r.price),
      imageUrl: r.image_url ?? '',
      allergens: list(r.allergens),
      mayContain: list(r.may_contain),
      tags: list(r.tags),
      spicyLevel: num(r.spicy_level),
      isVegetarian: bool(r.is_vegetarian),
      isAvailable: bool(r.is_available, true),
      sortOrder: num(r.sort_order, 999),
      priceOnRequest: bool(r.price_on_request),
      isAlcohol: bool(r.is_alcohol),
      minQty: num(r.min_qty),
      orderFrom: r.order_from ?? '',
      orderUntil: r.order_until ?? '',
      leadHours: num(r.lead_hours),
      optionGroups: groupsByMenu.get(r.id) ?? [],
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const settingsMap = settingsFrom(toObjects(res[ranges[5]] ?? []).rows);

  return {
    version,
    generatedAt: new Date().toISOString(),
    categories,
    allergens,
    items,
    guestFields: guestFields.filter((f) => f.isActive),
    settings: publicSettings(settingsMap),
  };
}

// ── Other tabs ──────────────────────────────────────────────

export async function loadTables(): Promise<VillaTable[]> {
  const range = fullRange(TABS.Tables);
  const res = await batchGet([range]);
  return toObjects(res[range] ?? [])
    .rows.filter((r) => r.id)
    .map((r) => ({
      id: r.id,
      label: r.label || r.id,
      villa: r.villa ?? '',
      // Older rows predate these columns. Deriving a stable fallback from the
      // id keeps existing villas reachable instead of 404ing until someone
      // edits every row by hand.
      slug: r.slug || slugify(r.villa || r.label || r.id),
      qrCode: r.qr_code || fallbackCode(r.id),
      lat: r.lat === '' ? null : num(r.lat),
      lng: r.lng === '' ? null : num(r.lng),
      radiusM: num(r.radius_m, 300),
      isActive: bool(r.is_active, true),
    }));
}

export async function loadAdminUsers(): Promise<AdminUser[]> {
  // Standalone: one owner account so the admin screens are reachable. The
  // password still goes through the same scrypt verification — this is a
  // default credential, not a bypass, and the dashboard says to change it.
  if (!sheetsConfigured()) {
    const { hashPassword } = await import('../admin/password');
    return [
      {
        id: 'u-owner',
        email: (process.env.DEMO_ADMIN_EMAIL ?? '').toLowerCase(),
        username: 'owner',
        passwordHash: hashPassword(
          process.env.DEMO_ADMIN_PASSWORD || 'pailay-admin',
        ),
        name: 'เจ้าของร้าน',
        role: 'OWNER',
        isActive: true,
      },
    ];
  }

  const range = fullRange(TABS.AdminUsers);
  const res = await batchGet([range]);
  return toObjects(res[range] ?? [])
    .rows.filter((r) => r.id)
    .map((r) => ({
      id: r.id,
      email: (r.email ?? '').toLowerCase(),
      username: (r.username ?? '').toLowerCase(),
      passwordHash: r.password_hash ?? '',
      name: r.name || r.username || r.email,
      role: (['OWNER', 'MANAGER', 'STAFF'].includes(r.role)
        ? r.role
        : 'STAFF') as AdminRole,
      isActive: bool(r.is_active, true),
    }));
}

export async function loadSettingsMap(): Promise<Record<string, string>> {
  if (!sheetsConfigured()) return { ...SETTINGS_DEFAULTS };

  const range = fullRange(TABS.Settings);
  const res = await batchGet([range]);
  return settingsFrom(toObjects(res[range] ?? []).rows);
}

export { publicSettings };

/** Reads any tab as raw header-keyed objects. Used by admin list screens. */
export async function loadRaw(tab: keyof typeof TABS): Promise<RawRow[]> {
  const range = fullRange(TABS[tab]);
  const res = await batchGet([range]);
  return toObjects(res[range] ?? []).rows;
}
