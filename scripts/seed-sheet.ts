/**
 * Creates every tab the app expects, writes the header rows, and optionally
 * fills in starter content.
 *
 * Safe to re-run: existing tabs are left alone and headers are rewritten in
 * place, so adding a column to HEADERS and re-running is the migration path.
 * Sample rows are only written to tabs that are completely empty, so this will
 * never scribble over a live menu.
 *
 *   npm run seed            # structure + starter content
 *   npm run seed -- --bare  # structure only
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { createHmac } from 'node:crypto';

// .env.local wins, matching Next.js' own precedence.
loadEnv({ path: '.env.local', override: true });

const { HEADERS, TABS, colLetter } = await import('../src/lib/sheets/schema');
const { batchGet, batchUpdate, append, listTabs, addTabs } = await import(
  '../src/lib/sheets/client'
);
const { hashPassword } = await import('../src/lib/admin/password');
const { CATEGORIES, ALLERGENS, ITEMS, validate } = await import('./menu-data');

const bare = process.argv.includes('--bare');

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\n  Missing ${name} in .env.local — see .env.example\n`);
    process.exit(1);
  }
  return value;
}

required('GOOGLE_SERVICE_ACCOUNT_KEY_BASE64');
required('GOOGLE_SHEET_ID');
const tableSecret = required('TABLE_SECRET');

// Redis is not required to seed. The Sheets client uses it to cache its access
// token, and falls back to an in-process store when it is absent — which is
// exactly right for a one-shot script. Vercel's Upstash integration also names
// these KV_REST_API_*, so demanding the UPSTASH_ spelling would reject a
// perfectly configured project.
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);

const tabNames = Object.values(TABS);

async function main() {
  console.log('Reading spreadsheet…');
  const existing = new Set((await listTabs()).map((t) => t.title));

  const missing = tabNames.filter((t) => !existing.has(t));
  if (missing.length > 0) {
    console.log(`Creating tabs: ${missing.join(', ')}`);
    await addTabs(missing);
  } else {
    console.log('All tabs already exist.');
  }

  console.log('Writing header rows…');
  await batchUpdate(
    tabNames.map((tab) => ({
      range: `${tab}!A1:${colLetter(HEADERS[tab].length)}1`,
      values: [HEADERS[tab]],
    })),
  );

  if (bare) {
    console.log('\nDone (structure only).');
    return;
  }

  // Only seed tabs that hold nothing but the header row.
  const contentTabs = [
    TABS.Categories,
    TABS.Allergens,
    TABS.Menu,
    TABS.MenuOptionGroups,
    TABS.MenuOptions,
    TABS.Tables,
    TABS.Settings,
    TABS.AdminUsers,
  ];
  const ranges = contentTabs.map(
    (tab) => `${tab}!A1:${colLetter(HEADERS[tab].length)}`,
  );
  const current = await batchGet(ranges);
  const isEmpty = (tab: string, i: number) =>
    (current[ranges[i]] ?? []).length <= 1;

  const seeds = buildSeeds();

  for (let i = 0; i < contentTabs.length; i++) {
    const tab = contentTabs[i];
    const rows = seeds[tab];
    if (!rows || rows.length === 0) continue;
    if (!isEmpty(tab, i)) {
      console.log(`Skipping ${tab} — already has data.`);
      continue;
    }
    console.log(`Seeding ${tab} (${rows.length} rows)…`);
    await append(`${tab}!A1`, rows);
  }

  const signature = createHmac('sha256', tableSecret)
    .update('table:v-villa1')
    .digest('base64url')
    .slice(0, 16);

  console.log(`
Done.

  Demo villa QR link:
    ${appUrl}/t/v-villa1?k=${signature}

  Admin sign-in (change this immediately):
    username: owner
    password: pailay-admin

  Next steps:
    1. npm run dev
    2. Open the QR link above on your phone (needs HTTPS for geolocation —
       use a Vercel preview deployment or a tunnel, not localhost).
    3. Sign in at /admin/login and set a real password:
       npm run hash-password -- "your-new-password"
`);
}

/** Header-ordered rows, so `toRow` semantics stay in one place: this file. */
function row(tab: keyof typeof TABS, record: Record<string, unknown>): string[] {
  return HEADERS[TABS[tab]].map((h) => {
    const v = record[h];
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) return v.join(',');
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  });
}

function buildSeeds(): Record<string, string[][]> {
  // The menu itself lives in menu-data.ts — transcribed from the printed
  // boards. Its `validate()` runs before anything is written, because a bad
  // allergen id in a seafood menu is a safety bug, not a typo.
  const problems = validate();
  if (problems.length > 0) {
    console.error('\n  Menu data failed validation:\n');
    for (const p of problems) console.error(`    - ${p}`);
    console.error('');
    process.exit(1);
  }

  const groupRows: string[][] = [];
  const optionRows: string[][] = [];

  for (const item of ITEMS) {
    for (const group of item.groups ?? []) {
      groupRows.push(
        row('MenuOptionGroups', {
          id: group.id,
          menu_id: item.id,
          name_th: group.th, name_en: group.en, name_zh: group.zh,
          type: group.type,
          required: group.required,
          min_select: group.required ? 1 : 0,
          max_select: group.max,
          sort_order: groupRows.length * 10 + 10,
        }),
      );
      group.options.forEach((option, i) => {
        optionRows.push(
          row('MenuOptions', {
            id: option.id,
            group_id: group.id,
            name_th: option.th, name_en: option.en, name_zh: option.zh,
            price_delta: option.delta,
            is_available: true,
            sort_order: (i + 1) * 10,
          }),
        );
      });
    }
  }

  return {
    [TABS.Categories]: CATEGORIES.map((c) =>
      row('Categories', {
        id: c.id, name_th: c.th, name_en: c.en, name_zh: c.zh,
        icon: c.icon, sort_order: c.order, is_active: true,
      }),
    ),

    [TABS.Allergens]: ALLERGENS.map((a) =>
      row('Allergens', {
        id: a.id, name_th: a.th, name_en: a.en, name_zh: a.zh,
        icon: a.icon, is_active: true,
      }),
    ),

    [TABS.Menu]: ITEMS.map((m) =>
      row('Menu', {
        id: m.id, category_id: m.cat,
        name_th: m.th, name_en: m.en, name_zh: m.zh,
        desc_th: m.descTh ?? '', desc_en: m.descEn ?? '', desc_zh: m.descZh ?? '',
        price: m.price, image_url: '',
        ingredients_th: m.ingTh ?? '',
        ingredients_en: m.ingEn ?? '',
        ingredients_zh: m.ingZh ?? '',
        allergens: m.allergens ?? [],
        may_contain: m.may ?? [],
        tags: m.tags ?? [],
        spicy_level: m.spicy ?? 0,
        is_vegetarian: m.veg ?? false,
        is_available: true,
        sort_order: m.order ?? 100,
        price_on_request: m.onRequest ?? false,
        is_alcohol: m.alcohol ?? false,
      }),
    ),

    [TABS.MenuOptionGroups]: groupRows,
    [TABS.MenuOptions]: optionRows,

    // Replace the coordinates with each villa's real position — the geofence
    // compares against these, and the QR print sheet reads the labels.
    [TABS.Tables]: [1, 2, 3, 4, 5, 6].map((n) =>
      row('Tables', {
        id: `v-villa${n}`,
        label: `Villa ${n}`,
        villa: `Villa ${n}`,
        // Cha-am, Phetchaburi. Approximate — set the real pin per villa in
        // the admin screen before printing the QR codes.
        lat: 12.8,
        lng: 99.9667,
        radius_m: 300,
        is_active: true,
      }),
    ),

    [TABS.Settings]: [
      ['shop_name', 'ไปเล วิลล่า', 'ชื่อร้านที่แสดงบนหัวหน้าเว็บและ QR'],
      ['currency', 'THB', 'สกุลเงิน'],
      ['service_charge_percent', '0', 'ค่าบริการ % (0 = ไม่คิด)'],
      ['vat_percent', '0', 'ภาษีมูลค่าเพิ่ม % (0 = ไม่แสดงบรรทัด VAT)'],
      ['vat_included', 'TRUE', 'TRUE = ราคาที่ตั้งไว้รวม VAT แล้ว (ถอดออกมาแสดงเฉย ๆ)'],
      ['min_order_amount', '0', 'ยอดสั่งขั้นต่ำ'],
      ['promptpay_name', 'ไปเล วิลล่า', 'ชื่อบัญชีผู้รับเงิน แสดงใต้ QR'],
      ['contact_phone', '095-151-9501', 'เบอร์ติดต่อ แสดงในเมนูที่ต้องสอบถามราคา'],

      ['allergy_disclaimer_th', 'ครัวของเราปรุงอาหารทะเลหลายชนิดในพื้นที่เดียวกัน จึงไม่สามารถรับประกันได้ว่าปราศจากสารก่อภูมิแพ้ 100% หากแพ้รุนแรง กรุณาแจ้งพนักงานโดยตรง', ''],
      ['allergy_disclaimer_en', 'Our kitchen handles many kinds of seafood in a shared space, so we cannot guarantee any dish is 100% allergen-free. If your allergy is severe, please speak to staff directly.', ''],
      ['allergy_disclaimer_zh', '我们的厨房在同一区域处理多种海鲜，无法保证任何菜品完全不含过敏原。如有严重过敏，请直接告知工作人员。', ''],

      ['payment_note_th', 'สแกน QR ด้านล่างเพื่อชำระเงิน แล้วอัปโหลดสลิปเพื่อยืนยัน', ''],
      ['payment_note_en', 'Scan the QR below to pay, then upload your slip to confirm.', ''],
      ['payment_note_zh', '扫描下方二维码付款，然后上传付款凭证以确认。', ''],

      // Shown to the guest immediately before checkout: the villa's own
      // artwork, plus the same rules as selectable text underneath.
      ['service_notice_enabled', 'TRUE', 'TRUE = แสดงหน้าเงื่อนไขบริการก่อนชำระเงิน'],
      ['service_notice_image', '/notice/service.jpg', 'รูปประกาศ อัปโหลดใหม่แล้ววางลิงก์ที่นี่ได้'],
      ['service_notice_th', [
        'รับออเดอร์ 10:00-20:00 น. (ออเดอร์สุดท้าย 20:00 น.)',
        'จัดส่งฟรีเมื่อสั่งครบ 500 บาทขึ้นไป',
        'ระยะเวลาจัดส่งประมาณ 1 ชั่วโมง ขึ้นอยู่กับคิวอาหารและระยะทาง',
        'อาหารเช้า สั่งล่วงหน้าไม่เกิน 17:00 น. ของวันก่อน ขั้นต่ำ 10 ท่าน ส่งถึงไม่เกิน 08:30 น.',
        'เครื่องดื่ม น้ำแข็ง ถ่านปิ้งย่าง กรุณาสั่งก่อน 17:00 น.',
        'กิจกรรมทางน้ำ ขั้นต่ำ 1 ชั่วโมงต่อกิจกรรม รอบสุดท้าย 18:00 น. มัดจำ 50% ของราคากิจกรรม',
        'ทีมงานใช้เวลาเดินทางถึงบ้านพักประมาณ 30 นาที กรุณาเผื่อเวลาจองล่วงหน้า',
        'สอบถามเพิ่มเติม โทร 095-151-9501',
      ].join('\n'), 'ข้อความใต้รูป บรรทัดละหัวข้อ'],
      ['service_notice_en', [
        'Orders taken 10:00-20:00 (last order 20:00).',
        'Free delivery on orders over 500 THB.',
        'Delivery takes about 1 hour, depending on the kitchen queue and distance.',
        'Breakfast must be ordered by 17:00 the day before, minimum 10 guests, delivered by 08:30.',
        'Drinks, ice and barbecue charcoal must be ordered before 17:00.',
        'Water activities: minimum 1 hour each, last session 18:00, 50% deposit required.',
        'Our team needs about 30 minutes to reach the villa — please book ahead.',
        'Questions: call 095-151-9501.',
      ].join('\n'), ''],
      ['service_notice_zh', [
        '接单时间 10:00-20:00（最后点单 20:00）。',
        '消费满 500 泰铢免费配送。',
        '配送约需 1 小时，视厨房排队与路程而定。',
        '早餐需于前一天 17:00 前预订，最少 10 位，08:30 前送达。',
        '饮料、冰块与烧烤木炭请于 17:00 前订购。',
        '水上活动每项最少 1 小时，最后一场 18:00，需付 50% 订金。',
        '工作人员前往别墅约需 30 分钟，请提前预订。',
        '咨询请拨 095-151-9501。',
      ].join('\n'), ''],

      ['alcohol_min_age', '20', 'อายุขั้นต่ำในการสั่งเครื่องดื่มแอลกอฮอล์'],
      ['alcohol_notice_th', 'เครื่องดื่มแอลกอฮอล์จำหน่ายเฉพาะผู้มีอายุ 20 ปีบริบูรณ์ขึ้นไป พนักงานอาจขอตรวจบัตรประชาชนหรือพาสปอร์ตตอนส่ง', ''],
      ['alcohol_notice_en', 'Alcohol is sold only to people aged 20 and over. Staff may ask to see ID or a passport on delivery.', ''],
      ['alcohol_notice_zh', '酒精饮品仅售予 20 岁及以上人士，送货时工作人员可能查验身份证件或护照。', ''],
    ],

    [TABS.AdminUsers]: [
      row('AdminUsers', {
        id: 'u-owner',
        email: '',
        username: 'owner',
        // Starter credential. The seed output tells the operator to change it,
        // and the README repeats the instruction.
        password_hash: hashPassword('pailay-admin'),
        name: 'เจ้าของร้าน',
        role: 'OWNER',
        is_active: true,
        created_at: new Date().toISOString(),
      }),
    ],
  };
}

main().catch((err) => {
  console.error('\nSeed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
