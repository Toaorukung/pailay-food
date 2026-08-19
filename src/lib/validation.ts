import { z } from 'zod';
import { LOCALES } from './types';

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
});

export const placeOrderSchema = z.object({
  /** Guards against a double-tap creating two identical orders. */
  idempotencyKey: z.string().min(8).max(64),
});

export const rejectPaymentSchema = z.object({
  paymentId: z.string().min(1).max(64),
  reason: z.string().min(1).max(300),
});

export const orderStatusSchema = z.object({
  orderId: z.string().min(1).max(64),
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

export const tableSchema = z.object({
  id: z.string().max(64).optional(),
  label: z.string().min(1).max(80),
  villa: z.string().max(80).default(''),
  // First segment of the printed link. Restricted to URL-safe characters so
  // the QR encodes cleanly and the slug cannot smuggle a path separator.
  slug: z
    .string()
    .max(40)
    .regex(/^[a-z0-9-]*$/, 'ใช้ได้เฉพาะ a-z, 0-9 และ - เท่านั้น')
    .default(''),
  // Second segment. Blank is fine — the app derives a stable code from the
  // villa id — but changing it invalidates every QR already printed.
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
