/**
 * Google Sheets schema.
 *
 * Rule that keeps this from becoming brittle: code never addresses a column
 * by index. Row 1 of every tab holds header names, and we map by name. Someone
 * can insert a column in the middle of the spreadsheet and nothing breaks.
 */

export const TABS = {
  Categories: 'Categories',
  Menu: 'Menu',
  MenuOptionGroups: 'MenuOptionGroups',
  MenuOptions: 'MenuOptions',
  Allergens: 'Allergens',
  Tables: 'Tables',
  Sessions: 'Sessions',
  Orders: 'Orders',
  OrderItems: 'OrderItems',
  Payments: 'Payments',
  AdminUsers: 'AdminUsers',
  Settings: 'Settings',
  AuditLog: 'AuditLog',
  SyncDeadLetter: 'SyncDeadLetter',
} as const;

export type TabName = (typeof TABS)[keyof typeof TABS];

export const HEADERS: Record<TabName, string[]> = {
  Categories: ['id', 'name_th', 'name_en', 'name_zh', 'icon', 'sort_order', 'is_active'],
  Menu: [
    'id', 'category_id',
    'name_th', 'name_en', 'name_zh',
    'desc_th', 'desc_en', 'desc_zh',
    'price', 'image_url',
    'ingredients_th', 'ingredients_en', 'ingredients_zh',
    'allergens', 'may_contain', 'tags',
    'spicy_level', 'is_vegetarian', 'is_available', 'sort_order',
    // Sold by weight — the kitchen weighs it, then staff set the real price on
    // the order line. Stored price is 0 and must never be billed as such.
    'price_on_request',
    'is_alcohol',
    // Appended, never slotted in the middle: a live sheet already has rows,
    // and inserting a column mid-list would shift every value to its right.
    // Ordering rules — a per-dish minimum quantity, a time-of-day window
    // ("HH:MM"), and hours of kitchen notice. All blank/0 by default, which
    // means "no rule" so existing rows keep behaving exactly as before.
    'min_qty', 'order_from', 'order_until', 'lead_hours',
  ],
  MenuOptionGroups: [
    'id', 'menu_id', 'name_th', 'name_en', 'name_zh',
    'type', 'required', 'min_select', 'max_select', 'sort_order',
  ],
  MenuOptions: [
    'id', 'group_id', 'name_th', 'name_en', 'name_zh',
    'price_delta', 'is_available', 'sort_order',
  ],
  Allergens: ['id', 'name_th', 'name_en', 'name_zh', 'icon', 'is_active'],
  Tables: [
    'id', 'label', 'villa',
    // The two halves of the printed link, /{slug}/{qr_code}. The slug is
    // readable so a guest can see which villa they are ordering for; the code
    // is random so the link cannot be guessed from the villa name alone.
    'slug', 'qr_code',
    'lat', 'lng', 'radius_m', 'is_active',
  ],
  Sessions: [
    'session_id', 'table_id', 'opened_at', 'closed_at', 'status',
    'guest_name', 'allergy_profile', 'geo_status', 'distance_m', 'locale',
    'closed_by',
    // Appended, not slotted next to guest_name: a column inserted mid-list
    // would shift every value in every existing row of a live sheet.
    'guest_phone',
  ],
  Orders: [
    'order_id', 'session_id', 'table_id', 'created_at', 'status',
    'item_count', 'subtotal', 'service_charge', 'vat', 'total',
  ],
  OrderItems: [
    'order_item_id', 'order_id', 'menu_id', 'name_snapshot',
    'option_ids', 'option_snapshot', 'qty', 'unit_price', 'line_total',
    'note', 'allergen_ack', 'priced_by', 'priced_at',
  ],
  Payments: [
    'payment_id', 'session_id', 'order_ids', 'amount', 'method', 'status',
    'slip_url', 'slip_uploaded_at', 'verified_by', 'verified_at', 'reject_reason',
  ],
  AdminUsers: [
    'id', 'email', 'username', 'password_hash', 'name', 'role',
    'is_active', 'created_at',
  ],
  Settings: ['key', 'value', 'description'],
  AuditLog: ['id', 'at', 'actor', 'action', 'target', 'detail', 'ip'],
  SyncDeadLetter: ['id', 'at', 'tab', 'payload', 'error'],
};

/** Full-tab read range. Column count derived from the header list. */
export function fullRange(tab: TabName): string {
  const cols = HEADERS[tab].length;
  return `${tab}!A1:${colLetter(cols)}`;
}

/** Append target — Sheets figures out the first empty row itself. */
export function appendRange(tab: TabName): string {
  return `${tab}!A1`;
}

export function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export type RawRow = Record<string, string>;

/**
 * Turns a raw values grid into objects keyed by header name.
 * Rows shorter than the header list are padded — Sheets truncates trailing
 * empty cells, so a row ending in blanks arrives short.
 */
export function toObjects(values: string[][]): { rows: RawRow[]; headers: string[] } {
  if (values.length === 0) return { rows: [], headers: [] };
  const headers = values[0].map((h) => String(h ?? '').trim());
  const rows: RawRow[] = [];

  for (let i = 1; i < values.length; i++) {
    const raw = values[i];
    // Skip fully blank rows — users leave them behind when deleting content.
    if (!raw || raw.every((c) => String(c ?? '').trim() === '')) continue;
    const obj: RawRow = {};
    headers.forEach((h, idx) => {
      obj[h] = String(raw[idx] ?? '').trim();
    });
    rows.push(obj);
  }
  return { rows, headers };
}

/** Serialises an object into a row ordered to match the tab's headers. */
export function toRow(tab: TabName, obj: Record<string, unknown>): string[] {
  return HEADERS[tab].map((h) => {
    const v = obj[h];
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) return v.join(',');
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });
}

// ── Cell coercion ───────────────────────────────────────────

export function num(v: string | undefined, fallback = 0): number {
  if (v === undefined || v === '') return fallback;
  // Sheets can hand back "1,250.00" depending on the user's locale format.
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

export function bool(v: string | undefined, fallback = false): boolean {
  if (v === undefined || v === '') return fallback;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'ใช่';
}

export function list(v: string | undefined): string[] {
  if (!v) return [];
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
