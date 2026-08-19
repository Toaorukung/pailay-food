import {
  CATEGORIES,
  ALLERGENS,
  ITEMS,
  type SeedItem,
} from '../../scripts/menu-data';
import { SETTINGS_DEFAULTS } from '../lib/sheets/repo';
import { fallbackCode } from '../lib/villa-link';
import type {
  Allergen,
  Category,
  MenuCatalog,
  MenuItem,
  MenuOptionGroup,
  PublicSettings,
  VillaTable,
} from '../lib/types';

/**
 * The printed menu, compiled into the app.
 *
 * Same source of truth the seed script writes to the spreadsheet, so a
 * standalone deployment and a Sheets-backed one serve identical dishes,
 * prices, options and allergen data. This is a fallback for when no
 * spreadsheet is configured — not a separate demo menu that could drift.
 */

const loc = (th: string, en: string, zh: string) => ({ th, en, zh });

function groups(item: SeedItem): MenuOptionGroup[] {
  return (item.groups ?? []).map((g, gi) => ({
    id: g.id,
    menuId: item.id,
    name: loc(g.th, g.en, g.zh),
    type: g.type,
    required: g.required,
    minSelect: g.required ? 1 : 0,
    maxSelect: g.max,
    sortOrder: (gi + 1) * 10,
    options: g.options.map((o, oi) => ({
      id: o.id,
      groupId: g.id,
      name: loc(o.th, o.en, o.zh),
      priceDelta: o.delta,
      isAvailable: true,
      sortOrder: (oi + 1) * 10,
    })),
  }));
}

const categories: Category[] = CATEGORIES.map((c) => ({
  id: c.id,
  name: loc(c.th, c.en, c.zh),
  icon: c.icon,
  sortOrder: c.order,
  isActive: true,
})).sort((a, b) => a.sortOrder - b.sortOrder);

const allergens: Allergen[] = ALLERGENS.map((a) => ({
  id: a.id,
  name: loc(a.th, a.en, a.zh),
  icon: a.icon,
  isActive: true,
}));

const items: MenuItem[] = ITEMS.map((m) => ({
  id: m.id,
  categoryId: m.cat,
  name: loc(m.th, m.en, m.zh),
  description: loc(m.descTh ?? '', m.descEn ?? '', m.descZh ?? ''),
  ingredients: loc(m.ingTh ?? '', m.ingEn ?? '', m.ingZh ?? ''),
  price: m.price,
  imageUrl: '',
  allergens: m.allergens ?? [],
  mayContain: m.may ?? [],
  tags: m.tags ?? [],
  spicyLevel: m.spicy ?? 0,
  isVegetarian: m.veg ?? false,
  isAvailable: true,
  sortOrder: m.order ?? 100,
  priceOnRequest: m.onRequest ?? false,
  isAlcohol: m.alcohol ?? false,
  optionGroups: groups(m),
})).sort((a, b) => a.sortOrder - b.sortOrder);

/**
 * Settings for a standalone run. Values that only make sense once the villa
 * has configured them (PromptPay account, exact coordinates) stay at their
 * defaults, and the UI already handles them being blank.
 */
const settings: PublicSettings = {
  shopName: 'ไปเล วิลล่า',
  currency: 'THB',
  serviceChargePercent: 0,
  vatPercent: 0,
  vatIncluded: true,
  minOrderAmount: 0,
  promptPayName: 'ไปเล วิลล่า',
  contactPhone: '095-151-9501',
  allergyDisclaimer: loc(
    SETTINGS_DEFAULTS.allergy_disclaimer_th,
    SETTINGS_DEFAULTS.allergy_disclaimer_en,
    SETTINGS_DEFAULTS.allergy_disclaimer_zh,
  ),
  paymentNote: loc(
    SETTINGS_DEFAULTS.payment_note_th,
    SETTINGS_DEFAULTS.payment_note_en,
    SETTINGS_DEFAULTS.payment_note_zh,
  ),
  welcomeEnabled: true,
  welcomeImage: '/notice/welcome.jpg',
  serviceNoticeEnabled: true,
  serviceNoticeImage: '/notice/service.jpg',
  serviceNotice: loc(
    [
      'รับออเดอร์ 10:00-20:00 น. (ออเดอร์สุดท้าย 20:00 น.)',
      'จัดส่งฟรีเมื่อสั่งครบ 500 บาทขึ้นไป',
      'ระยะเวลาจัดส่งประมาณ 1 ชั่วโมง ขึ้นอยู่กับคิวอาหารและระยะทาง',
      'อาหารเช้า สั่งล่วงหน้าไม่เกิน 17:00 น. ของวันก่อน ขั้นต่ำ 10 ท่าน ส่งถึงไม่เกิน 08:30 น.',
      'เครื่องดื่ม น้ำแข็ง ถ่านปิ้งย่าง กรุณาสั่งก่อน 17:00 น.',
      'กิจกรรมทางน้ำ ขั้นต่ำ 1 ชั่วโมงต่อกิจกรรม รอบสุดท้าย 18:00 น. มัดจำ 50%',
      'ทีมงานใช้เวลาเดินทางถึงบ้านพักประมาณ 30 นาที กรุณาเผื่อเวลาจองล่วงหน้า',
      'สอบถามเพิ่มเติม โทร 095-151-9501',
    ].join('\n'),
    [
      'Orders taken 10:00-20:00 (last order 20:00).',
      'Free delivery on orders over 500 THB.',
      'Delivery takes about 1 hour, depending on the kitchen queue and distance.',
      'Breakfast must be ordered by 17:00 the day before, minimum 10 guests, delivered by 08:30.',
      'Drinks, ice and barbecue charcoal must be ordered before 17:00.',
      'Water activities: minimum 1 hour each, last session 18:00, 50% deposit required.',
      'Our team needs about 30 minutes to reach the villa — please book ahead.',
      'Questions: call 095-151-9501.',
    ].join('\n'),
    [
      '接单时间 10:00-20:00（最后点单 20:00）。',
      '消费满 500 泰铢免费配送。',
      '配送约需 1 小时，视厨房排队与路程而定。',
      '早餐需于前一天 17:00 前预订，最少 10 位，08:30 前送达。',
      '饮料、冰块与烧烤木炭请于 17:00 前订购。',
      '水上活动每项最少 1 小时，最后一场 18:00，需付 50% 订金。',
      '工作人员前往别墅约需 30 分钟，请提前预订。',
      '咨询请拨 095-151-9501。',
    ].join('\n'),
  ),
  alcoholMinAge: 20,
  alcoholNotice: loc(
    SETTINGS_DEFAULTS.alcohol_notice_th,
    SETTINGS_DEFAULTS.alcohol_notice_en,
    SETTINGS_DEFAULTS.alcohol_notice_zh,
  ),
};

export function bundledCatalog(version: number): MenuCatalog {
  return {
    version,
    generatedAt: new Date().toISOString(),
    categories,
    allergens,
    items,
    settings,
  };
}

/**
 * Six villas at the Cha-am coordinates from the seed script. The geofence is
 * advisory, so an approximate pin only affects whether staff see an "outside
 * the property" badge — it never blocks an order.
 */
export const BUNDLED_TABLES: VillaTable[] = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: `v-villa${n}`,
  label: `Villa ${n}`,
  villa: `Villa ${n}`,
  slug: `villa-${n}`,
  qrCode: fallbackCode(`v-villa${n}`),
  lat: 12.8,
  lng: 99.9667,
  radiusM: 300,
  isActive: true,
}));
