import { z } from 'zod';
import { GUEST_FIELD_TYPES, LOCALES } from './types';

/** Per the brief: at most 500 characters of notes on any one menu line. */
export const NOTE_MAX_LENGTH = 500;

/** Control characters that would corrupt a kitchen ticket or a Sheets cell. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Cleans a guest note. Newlines and tabs survive; other control characters do
 * not. Deliberately does NOT HTML-escape — React escapes at render time, and
 * escaping here would store mangled text that reads wrong on a printed ticket.
 */
export function sanitizeNote(input: string): string {
  return input
    .replace(CONTROL_CHARS, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

export const noteSchema = z
  .string()
  .max(NOTE_MAX_LENGTH, `หมายเหตุต้องไม่เกิน ${NOTE_MAX_LENGTH} ตัวอักษร`)
  .transform(sanitizeNote)
  // Re-check after sanitising. The transform can only shorten, but stating the
  // guarantee explicitly keeps it true if the transform ever changes.
  .refine((s) => s.length <= NOTE_MAX_LENGTH, {
    message: `หมายเหตุต้องไม่เกิน ${NOTE_MAX_LENGTH} ตัวอักษร`,
  });

export const localeSchema = z.enum(LOCALES);

export const addToCartSchema = z.object({
  menuId: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(50),
  optionIds: z.array(z.string().min(1).max(64)).max(30).default([]),
  note: noteSchema.default(''),
  allergenAck: z.boolean().default(false),
  /** Guest confirmed they are old enough. Only consulted for alcohol lines. */
  ageConfirmed: z.boolean().default(false),
});

export const repriceSchema = z.object({
  orderId: z.string().min(1).max(64),
  itemId: z.string().min(1).max(64),
  unitPrice: z.number().min(0).max(1_000_000),
});

export const updateCartLineSchema = z.object({
  key: z.string().min(1).max(64),
  qty: z.number().int().min(0).max(50),
});

export const geoReportSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).default(0),
});

/**
 * A phone number as a guest types it: digits with the usual separators, and
 * deliberately loose about the shape so a foreign number still passes. The
 * digit count is the real check — it is what stops a stray character being
 * stored as a number staff would later try to ring.
 */
export const guestPhoneSchema = z
  .string()
  .max(40)
  .transform((s) => s.trim())
  .refine(
    (s) => s === '' || (/^[0-9+\-() ]+$/.test(s) && s.replace(/\D/g, '').length >= 8),
    { message: 'เบอร์โทรศัพท์ไม่ถูกต้อง' },
  );

/**
 * Every field is optional and nothing is defaulted, so each caller writes only
 * what it collected. The onboarding steps send name and phone before the guest
 * has seen the allergen list; sending an absent field as an empty string here
 * would wipe an answer the guest already gave.
 */
export const allergyProfileSchema = z.object({
  allergens: z.array(z.string().min(1).max(64)).max(40).optional(),
  guestName: z.string().max(80).optional(),
  guestPhone: guestPhoneSchema.optional(),
  /**
   * Answers to the villa's own intake questions, keyed by field id. Only the
   * raw values arrive; the label stored beside each one is taken from the
   * catalog server-side, so a guest cannot invent a question or reword one.
   */
  guestExtra: z.record(z.string().max(64), z.string().max(500)).optional(),
});

export const verifyBookingSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(8, 'กรุณากรอกเบอร์โทรศัพท์')
    .max(40)
    .refine(
      (s) => /^[0-9+\-() ]+$/.test(s) && s.replace(/\D/g, '').length >= 8,
      { message: 'เบอร์โทรศัพท์ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' },
    ),
});

export const placeOrderSchema = z.object({
  /** Guards against a double-tap creating two identical orders. */
  idempotencyKey: z.string().min(8).max(64),
});

export const orderIdSchema = z.object({
  orderId: z.string().min(1).max(64),
});

export const paymentIdSchema = z.object({
  paymentId: z.string().min(1).max(64),
});

/**
 * Staff adjusting a pending ticket on the phone with the guest. A quantity of
 * 0 removes the line; the server refuses to empty an order this way, since
 * "cancel it" is a different button with a different meaning.
 */
export const editOrderItemsSchema = z.object({
  orderId: z.string().min(1).max(64),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1).max(64),
        qty: z.number().int().min(0).max(99),
      }),
    )
    .min(1)
    .max(60),
});

export const replaceOrderItemSchema = z.object({
  orderId: z.string().min(1).max(64),
  itemId: z.string().min(1).max(64),
  menuId: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(99).default(1),
  optionIds: z.array(z.string().min(1).max(64)).default([]),
  note: z.string().max(500).default(''),
});

export const addOrderItemSchema = z.object({
  orderId: z.string().min(1).max(64),
  menuId: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(99).default(1),
  optionIds: z.array(z.string().min(1).max(64)).default([]),
  note: z.string().max(500).default(''),
});

export const orderStatusSchema = z.object({
  orderId: z.string().min(1).max(64),
  // PENDING_CONFIRM is deliberately absent: a ticket only leaves the confirm
  // queue through the confirm action, which is what messages the guest.
  status: z.enum(['NEW', 'COOKING', 'SERVED', 'CANCELLED']),
});

export const loginSchema = z.object({
  username: z.string().min(1).max(80),
  password: z.string().min(1).max(200),
});

// ── Admin content schemas ───────────────────────────────────

const localizedFields = (prefix: string) => ({
  [`${prefix}_th`]: z.string().max(300).default(''),
  [`${prefix}_en`]: z.string().max(300).default(''),
  [`${prefix}_zh`]: z.string().max(300).default(''),
});

/** A whole number that tolerates the admin form's empty-field null and ''. */
const nonNegIntField = (max: number) =>
  z.preprocess(
    (v) => (v === null || v === undefined || v === '' ? 0 : v),
    z.number().int().min(0).max(max),
  );

/** "HH:MM" or blank. Blank means the bound is open. */
const hmField = z.preprocess(
  (v) => (v === null || v === undefined ? '' : v),
  z
    .string()
    .max(5)
    .refine((s) => s === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(s), {
      message: 'เวลาต้องเป็นรูปแบบ HH:MM เช่น 17:00',
    })
    .default(''),
);

export const menuItemSchema = z.object({
  id: z.string().max(64).optional(),
  category_id: z.string().min(1).max(64),
  ...localizedFields('name'),
  ...localizedFields('desc'),
  ...localizedFields('ingredients'),
  price: z.number().min(0).max(1_000_000),
  image_url: z.string().max(600).default(''),
  allergens: z.array(z.string().max(64)).max(40).default([]),
  may_contain: z.array(z.string().max(64)).max(40).default([]),
  tags: z.array(z.string().max(40)).max(30).default([]),
  spicy_level: z.number().int().min(0).max(5).default(0),
  is_vegetarian: z.boolean().default(false),
  is_available: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(9999).default(100),
  price_on_request: z.boolean().default(false),
  is_alcohol: z.boolean().default(false),
  // Ordering rules. The admin form sends an empty number field as null, so
  // these coerce null/'' back to a sane default rather than rejecting it.
  min_qty: nonNegIntField(999),
  lead_hours: nonNegIntField(168),
  order_from: hmField,
  order_until: hmField,
})
  // A market-price dish with a price attached would be billed at that price
  // and silently undercharge the villa for a kilo of grouper.
  .refine((v) => !v.price_on_request || v.price === 0, {
    message: 'รายการที่ตั้งเป็น "ถามราคา" ต้องตั้งราคาเป็น 0',
    path: ['price'],
  })
  .refine((v) => v.price_on_request || v.price > 0, {
    message: 'ราคาต้องมากกว่า 0 หรือติ๊ก "ถามราคา"',
    path: ['price'],
  });

export const categorySchema = z.object({
  id: z.string().max(64).optional(),
  ...localizedFields('name'),
  icon: z.string().max(16).default(''),
  sort_order: z.number().int().min(0).max(9999).default(100),
  is_active: z.boolean().default(true),
});

export const allergenSchema = z.object({
  id: z.string().max(64).optional(),
  ...localizedFields('name'),
  icon: z.string().max(16).default(''),
  is_active: z.boolean().default(true),
});

/**
 * An extra question on the way in. Only the Thai label is insisted on: a villa
 * that serves Thai guests should not be blocked from adding a question because
 * it has no Chinese translation ready, and the guest app already falls back to
 * Thai for any language left blank.
 */
export const guestFieldSchema = z
  .object({
    id: z.string().max(64).optional(),
    // Spelled out rather than spread from localizedFields: the refinements
    // below read these keys by name, and a computed spread erases them from
    // the inferred type.
    label_th: z.string().max(300).default(''),
    label_en: z.string().max(300).default(''),
    label_zh: z.string().max(300).default(''),
    type: z.enum(GUEST_FIELD_TYPES),
    options_th: z.string().max(600).default(''),
    options_en: z.string().max(600).default(''),
    options_zh: z.string().max(600).default(''),
    required: z.boolean().default(false),
    sort_order: z.number().int().min(0).max(9999).default(100),
    is_active: z.boolean().default(true),
  })
  .refine((v) => v.label_th.trim().length > 0, {
    message: 'ต้องตั้งชื่อฟิลด์ภาษาไทย',
    path: ['label_th'],
  })
  // A select with no choices renders as a dropdown the guest cannot answer,
  // which for a required question is a dead end they cannot get past.
  .refine((v) => v.type !== 'select' || v.options_th.trim().length > 0, {
    message: 'ชนิด "ตัวเลือก" ต้องมีรายการให้เลือกอย่างน้อย 1 รายการ',
    path: ['options_th'],
  });

export const tableSchema = z.object({
  id: z.string().max(64).optional(),
  label: z.string().min(1).max(80),
  villa: z.string().max(80).default(''),
  // The villa's own address segment, /{slug}/{sessionId}. Restricted to
  // URL-safe characters so a slug cannot smuggle a path separator.
  slug: z
    .string()
    .max(40)
    .regex(/^[a-z0-9-]*$/, 'ใช้ได้เฉพาะ a-z, 0-9 และ - เท่านั้น')
    .default(''),
  // Left over from the printed-QR era. Nothing reads it any more; the column
  // stays so existing sheet rows round-trip unchanged.
  qr_code: z
    .string()
    .max(40)
    .regex(/^[A-Za-z0-9_-]*$/, 'ใช้ได้เฉพาะตัวอักษร ตัวเลข _ และ -')
    .default(''),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  radius_m: z.number().int().min(10).max(20_000).default(300),
  is_active: z.boolean().default(true),
});

export const optionGroupSchema = z.object({
  id: z.string().max(64).optional(),
  menu_id: z.string().min(1).max(64),
  ...localizedFields('name'),
  type: z.enum(['single', 'multi']).default('single'),
  required: z.boolean().default(false),
  min_select: z.number().int().min(0).max(30).default(0),
  max_select: z.number().int().min(1).max(30).default(1),
  sort_order: z.number().int().min(0).max(9999).default(100),
});

export const optionSchema = z.object({
  id: z.string().max(64).optional(),
  group_id: z.string().min(1).max(64),
  ...localizedFields('name'),
  price_delta: z.number().min(-1_000_000).max(1_000_000).default(0),
  is_available: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(9999).default(100),
});

export const settingsSchema = z.object({
  entries: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        value: z.string().max(2000),
      }),
    )
    .max(200),
});

export const createAdminUserSchema = z.object({
  name: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้').max(80),
  username: z
    .string()
    .trim()
    .min(2, 'Username ต้องมีอย่างน้อย 2 ตัวอักษร')
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ตัวเลข _ และ -'),
  email: z
    .string()
    .trim()
    .email('รูปแบบอีเมลไม่ถูกต้อง')
    .or(z.literal(''))
    .default(''),
  password: z
    .string()
    .min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
    .max(100)
    .or(z.literal(''))
    .default(''),
  role: z.enum(['OWNER', 'MANAGER', 'STAFF']).default('STAFF'),
  isActive: z.boolean().default(true),
  permissions: z.array(z.string()).default([]),
});

export const updateAdminUserSchema = z.object({
  id: z.string().min(1, 'ต้องระบุ ID ผู้ใช้'),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้').max(80),
  username: z
    .string()
    .trim()
    .min(2, 'Username ต้องมีอย่างน้อย 2 ตัวอักษร')
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ตัวเลข _ และ -'),
  email: z
    .string()
    .trim()
    .email('รูปแบบอีเมลไม่ถูกต้อง')
    .or(z.literal(''))
    .default(''),
  password: z
    .string()
    .min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
    .max(100)
    .or(z.literal(''))
    .optional(),
  role: z.enum(['OWNER', 'MANAGER', 'STAFF']),
  isActive: z.boolean(),
  permissions: z.array(z.string()).optional(),
});

/** Parses a JSON body, returning a typed error instead of throwing. */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; error: string }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, error: 'Invalid JSON body' };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const first = result.error.errors[0];
    return {
      ok: false,
      error: first ? `${first.path.join('.')}: ${first.message}` : 'Invalid input',
    };
  }
  return { ok: true, data: result.data };
}
