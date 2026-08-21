/**
 * The real Pailay Villa menu, transcribed from the printed boards in
 * food/detail/.
 *
 * Two structural decisions worth knowing about before editing this file:
 *
 * 1. The printed menu repeats itself because paper has no interactivity —
 *    "หอยเชลล์ผัดฉ่า", "หอยเชลล์ผัดกะเพรา", "หอยเชลล์ผัดพริกเผา" are three
 *    lines at the same price. Here they are one dish with a required cooking
 *    method group. Same for sizes (เล็ก/กลาง/ใหญ่, ถ้วย/หม้อ). That turns
 *    ~260 printed lines into ~110 dishes a guest can actually scan on a phone.
 *
 * 2. Allergens are filled in per dish rather than left blank. This is a
 *    seafood kitchen: shellfish and fish sauce are in almost everything, and
 *    an empty allergens column would make the warning system decorative.
 *    `mayContain` is used where the ingredient is not in the dish but shares
 *    the wok, fryer or grill.
 */

export interface SeedCategory {
  id: string; th: string; en: string; zh: string; icon: string; order: number;
}

export interface SeedAllergen {
  id: string; th: string; en: string; zh: string; icon: string;
}

export interface SeedOption {
  id: string; th: string; en: string; zh: string; delta: number;
}

export interface SeedGroup {
  id: string; th: string; en: string; zh: string;
  type: 'single' | 'multi';
  required: boolean;
  max: number;
  options: SeedOption[];
}

export interface SeedItem {
  id: string;
  cat: string;
  th: string; en: string; zh: string;
  descTh?: string; descEn?: string; descZh?: string;
  ingTh?: string; ingEn?: string; ingZh?: string;
  price: number;
  /** Sold by weight — staff confirm the price before cooking. */
  onRequest?: boolean;
  alcohol?: boolean;
  allergens?: string[];
  may?: string[];
  tags?: string[];
  spicy?: number;
  veg?: boolean;
  groups?: SeedGroup[];
  order?: number;
  /** Ordering rules — see MenuItem. Blank/0 means no rule. */
  minQty?: number;
  orderFrom?: string;
  orderUntil?: string;
  leadHours?: number;
}

// ── Categories ──────────────────────────────────────────────

export const CATEGORIES: SeedCategory[] = [
  { id: 'c-rice',      th: 'ข้าว & เส้น',      en: 'Rice & Noodles',   zh: '饭与面',     icon: '🍚', order: 10 },
  { id: 'c-egg',       th: 'ไข่',              en: 'Egg dishes',       zh: '蛋类',       icon: '🍳', order: 20 },
  { id: 'c-fried',     th: 'ของทอด',           en: 'Fried',            zh: '炸物',       icon: '🍤', order: 30 },
  { id: 'c-crab',      th: 'ปู',               en: 'Crab',             zh: '螃蟹',       icon: '🦀', order: 40 },
  { id: 'c-shrimp',    th: 'กุ้ง',             en: 'Prawn',            zh: '虾',         icon: '🦐', order: 50 },
  { id: 'c-mantis',    th: 'กุ้งกระดาน',       en: 'Mantis shrimp',    zh: '皮皮虾',     icon: '🦞', order: 60 },
  { id: 'c-shell',     th: 'หอย',              en: 'Shellfish',        zh: '贝类',       icon: '🦪', order: 70 },
  { id: 'c-squid',     th: 'หมึก',             en: 'Squid',            zh: '鱿鱼',       icon: '🦑', order: 80 },
  { id: 'c-fish',      th: 'ปลา',              en: 'Fish',             zh: '鱼',         icon: '🐟', order: 90 },
  { id: 'c-fresh',     th: 'ของสด (ชั่งกิโล)', en: 'Fresh, by weight', zh: '鲜货（按公斤）', icon: '🧊', order: 95 },
  { id: 'c-padcha',    th: 'ผัดฉ่า',           en: 'Pad Cha',          zh: '香辣炒',     icon: '🌶',  order: 100 },
  { id: 'c-yam',       th: 'ยำ & ส้มตำ',       en: 'Salads',           zh: '凉拌',       icon: '🥗', order: 110 },
  { id: 'c-tomyum',    th: 'ต้มยำ & ต้มส้ม',   en: 'Tom Yum & Tom Som', zh: '冬阴与酸汤', icon: '🍲', order: 120 },
  { id: 'c-curry',     th: 'แกง',              en: 'Curries',          zh: '咖喱',       icon: '🍛', order: 130 },
  { id: 'c-soup',      th: 'ต้มจืด',           en: 'Clear soup',       zh: '清汤',       icon: '🥣', order: 140 },
  { id: 'c-veg',       th: 'ผัดผัก',           en: 'Vegetables',       zh: '炒时蔬',     icon: '🥬', order: 150 },
  { id: 'c-orsuan',    th: 'ออส่วน',           en: 'Oyster omelette',  zh: '蚝烙',       icon: '🍳', order: 160 },
  { id: 'c-dong',      th: 'ดองน้ำปลา',        en: 'Fish sauce cured', zh: '鱼露腌',     icon: '🦀', order: 170 },
  { id: 'c-porkroast', th: 'หมูหัน',           en: 'Roast suckling pig', zh: '烤乳猪',   icon: '🐷', order: 180 },
  { id: 'c-breakfast', th: 'อาหารเช้า',        en: 'Breakfast',        zh: '早餐',       icon: '🥐', order: 190 },
  { id: 'c-drink',     th: 'เครื่องดื่ม',      en: 'Soft drinks',      zh: '饮料',       icon: '🥤', order: 200 },
  { id: 'c-beer',      th: 'เบียร์ & เหล้า',   en: 'Beer & spirits',   zh: '啤酒与洋酒', icon: '🍺', order: 210 },
  { id: 'c-supply',    th: 'น้ำแข็ง & ถ่าน',   en: 'Ice & charcoal',   zh: '冰块与木炭', icon: '🧊', order: 220 },
];

// ── Allergens ───────────────────────────────────────────────

export const ALLERGENS: SeedAllergen[] = [
  { id: 'al-crustacean', th: 'กุ้ง ปู กั้ง',        en: 'Crustaceans',     zh: '甲壳类',   icon: '🦐' },
  { id: 'al-mollusc',    th: 'หอย หมึก',            en: 'Molluscs',        zh: '贝类鱿鱼', icon: '🦑' },
  { id: 'al-fish',       th: 'ปลา',                 en: 'Fish',            zh: '鱼类',     icon: '🐟' },
  { id: 'al-fishsauce',  th: 'น้ำปลา กะปิ ปลาร้า',  en: 'Fish sauce & shrimp paste', zh: '鱼露虾酱', icon: '🐠' },
  { id: 'al-egg',        th: 'ไข่',                 en: 'Egg',             zh: '蛋类',     icon: '🥚' },
  { id: 'al-dairy',      th: 'นม เนย ชีส',          en: 'Dairy',           zh: '乳制品',   icon: '🥛' },
  { id: 'al-gluten',     th: 'กลูเตน แป้งสาลี',     en: 'Gluten',          zh: '麸质',     icon: '🌾' },
  { id: 'al-soy',        th: 'ถั่วเหลือง ซีอิ๊ว',   en: 'Soy',             zh: '大豆',     icon: '🫘' },
  { id: 'al-peanut',     th: 'ถั่วลิสง',            en: 'Peanuts',         zh: '花生',     icon: '🥜' },
  { id: 'al-sesame',     th: 'งา',                  en: 'Sesame',          zh: '芝麻',     icon: '🌱' },
  { id: 'al-pork',       th: 'หมู',                 en: 'Pork',            zh: '猪肉',     icon: '🐖' },
  { id: 'al-alcohol',    th: 'แอลกอฮอล์',           en: 'Alcohol',         zh: '酒精',     icon: '🍺' },
];

// ── Option group builders ───────────────────────────────────

const opt = (id: string, th: string, en: string, zh: string, delta = 0): SeedOption =>
  ({ id, th, en, zh, delta });

/** Required single-choice group. Used for sizes and cooking methods. */
const pick = (
  id: string, th: string, en: string, zh: string, options: SeedOption[],
): SeedGroup => ({ id, th, en, zh, type: 'single', required: true, max: 1, options });

/** เล็ก / กลาง / ใหญ่ — base price is the small size. */
const sizeSML = (id: string, mid: number, large: number): SeedGroup =>
  pick(`g-${id}-size`, 'ขนาด', 'Size', '份量', [
    opt(`o-${id}-s`, 'เล็ก', 'Small', '小份', 0),
    opt(`o-${id}-m`, 'กลาง', 'Medium', '中份', mid),
    opt(`o-${id}-l`, 'ใหญ่', 'Large', '大份', large),
  ]);

/** ถ้วย / หม้อ — base price is the bowl. */
const sizeBowl = (id: string, pot: number): SeedGroup =>
  pick(`g-${id}-size`, 'ขนาด', 'Size', '份量', [
    opt(`o-${id}-bowl`, 'ถ้วย', 'Bowl', '碗', 0),
    opt(`o-${id}-pot`, 'หม้อ', 'Hot pot', '锅', pot),
  ]);

/**
 * The stir-fry treatments the kitchen offers across crab, prawn, shellfish
 * and squid. Prices are identical across treatments on the printed menu, so
 * every option carries a zero delta.
 */
type Method = [key: string, th: string, en: string, zh: string, delta?: number];

const methods = (id: string, list: Method[]): SeedGroup =>
  pick(`g-${id}-cook`, 'วิธีปรุง', 'Cooking style', '做法',
    list.map(([key, th, en, zh, delta]) => opt(`o-${id}-${key}`, th, en, zh, delta ?? 0)));

const M = {
  springOnion: ['spring', 'ผัดต้นหอม', 'Stir-fried with spring onion', '葱爆'] as Method,
  curryPowder: ['curry', 'ผัดผงกะหรี่', 'Stir-fried with curry powder', '咖喱炒'] as Method,
  chilliPaste: ['nampricpao', 'ผัดน้ำพริกเผา', 'Stir-fried with roasted chilli paste', '辣酱炒'] as Method,
  blackPepper: ['pepper', 'ผัดพริกไทยดำ', 'Stir-fried with black pepper', '黑椒炒'] as Method,
  basil:       ['basil', 'ผัดกะเพรา', 'Stir-fried with holy basil', '打抛炒'] as Method,
  garlic:      ['garlic', 'ทอดกระเทียม', 'Fried with garlic', '蒜香炸'] as Method,
  saltChilli:  ['saltchilli', 'ผัดพริกเกลือ', 'Stir-fried salt and chilli', '椒盐炒'] as Method,
  padCha:      ['padcha', 'ผัดฉ่า', 'Pad Cha, hot herb stir-fry', '香辣炒'] as Method,
  curryPaste:  ['currypaste', 'ผัดพริกแกง', 'Stir-fried with red curry paste', '咖喱酱炒'] as Method,
  sweetBasil:  ['horapha', 'ผัดใบโหระพา', 'Stir-fried with sweet basil', '九层塔炒'] as Method,
  saltedEgg:   ['saltedegg', 'ผัดไข่เค็ม', 'Stir-fried with salted egg', '咸蛋炒'] as Method,
  sunDried:    ['sundried', 'แดดเดียว (ทอด)', 'Sun-dried and fried', '一夜干'] as Method,
  grilled:     ['grilled', 'ย่าง', 'Grilled', '炭烤'] as Method,
};

/** Fish preparations shared by the whole fish menu. */
const fishMethods = (id: string, steamed = true): SeedGroup =>
  pick(`g-${id}-cook`, 'วิธีปรุง', 'Cooking style', '做法', [
    opt(`o-${id}-friednp`, 'ทอดราดน้ำปลา', 'Deep-fried with fish sauce', '炸淋鱼露'),
    opt(`o-${id}-friedgarlic`, 'ทอดกระเทียม', 'Deep-fried with garlic', '蒜香炸'),
    ...(steamed ? [
      opt(`o-${id}-3flavour`, 'สามรส', 'Three-flavour sauce', '三味'),
      opt(`o-${id}-currypaste`, 'ราดพริกแกง', 'Red curry sauce', '咖喱酱'),
      opt(`o-${id}-steamlime`, 'นึ่งมะนาว', 'Steamed with lime', '清蒸柠檬'),
      opt(`o-${id}-steamplum`, 'นึ่งบ๊วย', 'Steamed with pickled plum', '梅子蒸'),
      opt(`o-${id}-steamsoy`, 'นึ่งซีอิ๊ว', 'Steamed with soy sauce', '豉油蒸'),
      opt(`o-${id}-steamrakam`, 'นึ่งระกำ', 'Steamed with rakam fruit', '清蒸酸果'),
    ] : []),
  ]);

/** อบเกลือ / เผา — the two ways the kitchen serves whole prawns. */
const saltOrGrill = (id: string): SeedGroup =>
  pick(`g-${id}-cook`, 'วิธีปรุง', 'Cooking style', '做法', [
    opt(`o-${id}-salt`, 'อบเกลือ', 'Salt-baked', '盐焗'),
    opt(`o-${id}-grill`, 'เผา', 'Charcoal-grilled', '炭烤'),
  ]);

// Allergen shorthands.
const CRUST = 'al-crustacean';
const MOLL = 'al-mollusc';
const FISH = 'al-fish';
const NAMPLA = 'al-fishsauce';
const EGG = 'al-egg';
const DAIRY = 'al-dairy';
const GLUTEN = 'al-gluten';
const SOY = 'al-soy';
const PEANUT = 'al-peanut';
const SESAME = 'al-sesame';
const PORK = 'al-pork';
const BOOZE = 'al-alcohol';

/** The wok, fryer and grill are shared, so cross-contact is the norm here. */
const KITCHEN_CROSS = [CRUST, MOLL, FISH];

// ── Items ───────────────────────────────────────────────────

export const ITEMS: SeedItem[] = [

  // ── ข้าว & เส้น ──────────────────────────────────────────
  {
    id: 'm-rice-seafood', cat: 'c-rice', order: 10,
    th: 'ข้าวผัด / ข้าวราดกะเพรา (ทะเล)', en: 'Fried rice or holy basil rice (seafood)', zh: '海鲜炒饭／打抛饭',
    descTh: 'เลือกโปรตีนและขนาดได้ · ราคาเริ่มต้นขนาดเล็ก',
    descEn: 'Choose your seafood and portion size',
    ingTh: 'ข้าวหอมมะลิ, ไข่, กระเทียม, พริก, ใบกะเพรา, น้ำปลา, ซีอิ๊ว',
    ingEn: 'jasmine rice, egg, garlic, chilli, holy basil, fish sauce, soy sauce',
    ingZh: '茉莉香米、鸡蛋、蒜、辣椒、打抛叶、鱼露、酱油',
    price: 90, spicy: 2,
    allergens: [CRUST, MOLL, EGG, NAMPLA, SOY], may: [FISH, GLUTEN],
    tags: ['ข้าว', 'ทะเล', 'กะเพรา', 'rice', 'seafood', 'ยอดนิยม'],
    groups: [
      pick('g-rice-seafood-protein', 'เลือกโปรตีน', 'Choose seafood', '选择海鲜', [
        opt('o-rs-crab', 'ปู', 'Crab', '蟹肉'),
        opt('o-rs-shrimp', 'กุ้ง', 'Prawn', '虾'),
        opt('o-rs-squid', 'หมึก', 'Squid', '鱿鱼'),
        opt('o-rs-crabshrimp', 'ปู + กุ้ง', 'Crab and prawn', '蟹肉与虾'),
        opt('o-rs-mixed', 'ทะเลรวม', 'Mixed seafood', '海鲜什锦'),
      ]),
      pick('g-rice-seafood-style', 'รูปแบบ', 'Style', '样式', [
        opt('o-rs-fried', 'ข้าวผัด', 'Fried rice', '炒饭'),
        opt('o-rs-krapao', 'ข้าวราดกะเพรา', 'Holy basil over rice', '打抛盖饭'),
        opt('o-rs-kluk', 'ข้าวคลุกกะเพรา', 'Holy basil mixed rice', '打抛拌饭'),
      ]),
      sizeSML('rice-seafood', 110, 190),
    ],
  },
  {
    id: 'm-rice-pork', cat: 'c-rice', order: 20,
    th: 'ข้าวผัด / ข้าวราดกะเพรา (หมู)', en: 'Fried rice or holy basil rice (pork)', zh: '猪肉炒饭／打抛饭',
    ingTh: 'ข้าวหอมมะลิ, หมูสับ, ไข่, กระเทียม, พริก, ใบกะเพรา, น้ำปลา, ซีอิ๊ว',
    ingEn: 'jasmine rice, minced pork, egg, garlic, chilli, holy basil, fish sauce, soy sauce',
    ingZh: '茉莉香米、猪肉末、鸡蛋、蒜、辣椒、打抛叶、鱼露、酱油',
    price: 80, spicy: 2,
    allergens: [PORK, EGG, NAMPLA, SOY], may: KITCHEN_CROSS,
    tags: ['ข้าว', 'หมู', 'กะเพรา', 'rice', 'pork'],
    groups: [
      pick('g-rice-pork-style', 'รูปแบบ', 'Style', '样式', [
        opt('o-rp-fried', 'ข้าวผัด', 'Fried rice', '炒饭'),
        opt('o-rp-krapao', 'ข้าวราดกะเพรา', 'Holy basil over rice', '打抛盖饭'),
        opt('o-rp-kluk', 'ข้าวคลุกกะเพรา', 'Holy basil mixed rice', '打抛拌饭'),
      ]),
      sizeSML('rice-pork', 90, 120),
    ],
  },
  {
    id: 'm-congee-seafood', cat: 'c-rice', order: 30,
    th: 'ข้าวต้มทะเล', en: 'Seafood rice soup', zh: '海鲜粥',
    descTh: 'ข้าวต้มร้อน ๆ เลือกวัตถุดิบได้', descEn: 'Hot rice soup, choose your seafood',
    ingTh: 'ข้าวสวย, ขึ้นฉ่าย, กระเทียมเจียว, ขิง, น้ำปลา, พริกไทย',
    ingEn: 'rice, celery, fried garlic, ginger, fish sauce, white pepper',
    ingZh: '米饭、芹菜、炸蒜、姜、鱼露、白胡椒',
    price: 100,
    allergens: [NAMPLA], may: KITCHEN_CROSS,
    tags: ['ข้าวต้ม', 'ทะเล', 'congee', 'rice soup'],
    groups: [
      pick('g-congee-protein', 'เลือกวัตถุดิบ', 'Choose', '选择', [
        opt('o-cg-shrimp', 'กุ้ง', 'Prawn', '虾'),
        opt('o-cg-squid', 'หมึก', 'Squid', '鱿鱼'),
        opt('o-cg-mixed', 'ทะเลรวม', 'Mixed seafood', '海鲜什锦'),
        opt('o-cg-seabass', 'ปลากระพง', 'Sea bass', '金目鲈'),
        opt('o-cg-grouper', 'ปลาเก๋า', 'Grouper', '石斑鱼'),
      ]),
    ],
  },
  {
    id: 'm-congee-pork', cat: 'c-rice', order: 40,
    th: 'ข้าวต้มหมู', en: 'Pork rice soup', zh: '猪肉粥',
    ingTh: 'ข้าวสวย, หมูสับ, ขึ้นฉ่าย, กระเทียมเจียว, ขิง, น้ำปลา',
    ingEn: 'rice, minced pork, celery, fried garlic, ginger, fish sauce',
    ingZh: '米饭、猪肉末、芹菜、炸蒜、姜、鱼露',
    price: 80,
    allergens: [PORK, NAMPLA], may: KITCHEN_CROSS,
    tags: ['ข้าวต้ม', 'หมู', 'congee'],
  },
  {
    id: 'm-rice-plain', cat: 'c-rice', order: 50,
    th: 'ข้าวสวย', en: 'Steamed jasmine rice', zh: '茉莉香米饭',
    ingTh: 'ข้าวหอมมะลิ', ingEn: 'jasmine rice', ingZh: '茉莉香米',
    price: 30, veg: true, tags: ['ข้าว', 'rice'],
    groups: [
      pick('g-rice-plain-size', 'ขนาด', 'Size', '份量', [
        opt('o-rpl-plate', 'จาน', 'Plate', '一碟', 0),
        opt('o-rpl-pot', 'โถ', 'Rice pot', '一锅', 70),
      ]),
    ],
  },
  {
    id: 'm-glassnoodle-krapao', cat: 'c-rice', order: 60,
    th: 'วุ้นเส้นผัดกะเพราทะเล', en: 'Glass noodles with seafood and holy basil', zh: '打抛海鲜炒粉丝',
    ingTh: 'วุ้นเส้น, ทะเลรวม, ใบกะเพรา, พริก, กระเทียม, ซีอิ๊ว, น้ำปลา',
    ingEn: 'glass noodles, mixed seafood, holy basil, chilli, garlic, soy sauce, fish sauce',
    ingZh: '粉丝、海鲜什锦、打抛叶、辣椒、蒜、酱油、鱼露',
    price: 250, spicy: 3,
    allergens: [CRUST, MOLL, NAMPLA, SOY], may: [FISH],
    tags: ['วุ้นเส้น', 'ทะเล', 'กะเพรา', 'noodles'],
  },

  // ── ไข่ ──────────────────────────────────────────────────
  {
    id: 'm-omelette-plain', cat: 'c-egg', order: 10,
    th: 'ไข่เจียวธรรมดา', en: 'Thai omelette', zh: '泰式煎蛋',
    ingTh: 'ไข่ไก่, น้ำปลา, น้ำมัน', ingEn: 'egg, fish sauce, oil', ingZh: '鸡蛋、鱼露、油',
    price: 80, allergens: [EGG, NAMPLA], may: KITCHEN_CROSS, tags: ['ไข่', 'egg'],
  },
  {
    id: 'm-omelette-pork', cat: 'c-egg', order: 20,
    th: 'ไข่เจียวหมูสับ', en: 'Omelette with minced pork', zh: '猪肉末煎蛋',
    ingTh: 'ไข่ไก่, หมูสับ, น้ำปลา', ingEn: 'egg, minced pork, fish sauce', ingZh: '鸡蛋、猪肉末、鱼露',
    price: 90, allergens: [EGG, PORK, NAMPLA], may: KITCHEN_CROSS, tags: ['ไข่', 'หมู', 'egg'],
  },
  {
    id: 'm-omelette-seafood', cat: 'c-egg', order: 30,
    th: 'ไข่เจียว ปู / กุ้ง / หอยนางรม', en: 'Omelette with crab, prawn or oyster', zh: '蟹肉／虾／生蚝煎蛋',
    ingTh: 'ไข่ไก่, เนื้อปู หรือ กุ้ง หรือ หอยนางรม, น้ำปลา',
    ingEn: 'egg, crab meat or prawn or oyster, fish sauce',
    ingZh: '鸡蛋、蟹肉或虾或生蚝、鱼露',
    price: 130, allergens: [EGG, CRUST, MOLL, NAMPLA], tags: ['ไข่', 'ทะเล', 'egg'],
    groups: [
      pick('g-om-seafood', 'เลือกวัตถุดิบ', 'Choose', '选择', [
        opt('o-oms-crab', 'ปู', 'Crab', '蟹肉'),
        opt('o-oms-shrimp', 'กุ้ง', 'Prawn', '虾'),
        opt('o-oms-oyster', 'หอยนางรม', 'Oyster', '生蚝'),
      ]),
    ],
  },
  {
    id: 'm-steamed-egg-pot', cat: 'c-egg', order: 40,
    th: 'ไข่ตุ๋นหม้อไฟ', en: 'Steamed egg hot pot', zh: '火锅蒸蛋',
    ingTh: 'ไข่ไก่, น้ำซุป, กุ้ง, หมึก, ต้นหอม',
    ingEn: 'egg, stock, prawn, squid, spring onion',
    ingZh: '鸡蛋、高汤、虾、鱿鱼、葱',
    price: 250, allergens: [EGG, CRUST, MOLL, NAMPLA], tags: ['ไข่', 'หม้อไฟ', 'egg'],
  },

  // ── ของทอด ───────────────────────────────────────────────
  { id: 'm-fried-crabroll', cat: 'c-fried', order: 10, th: 'จ้อปู', en: 'Crab spring rolls', zh: '蟹肉卷',
    ingTh: 'เนื้อปู, หมูสับ, ฟองเต้าหู้, แป้งสาลี', ingEn: 'crab meat, minced pork, bean curd sheet, wheat flour',
    ingZh: '蟹肉、猪肉末、腐皮、小麦粉',
    price: 150, allergens: [CRUST, PORK, SOY, GLUTEN, EGG], tags: ['ทอด', 'ปู', 'fried'] },
  { id: 'm-fried-babyoctopus', cat: 'c-fried', order: 20, th: 'หมึกสายทอดซีอิ๊ว', en: 'Baby octopus fried in soy sauce', zh: '豉油炸章鱼',
    ingTh: 'หมึกสาย, ซีอิ๊ว, กระเทียม, พริกไทย', ingEn: 'baby octopus, soy sauce, garlic, pepper', ingZh: '章鱼、酱油、蒜、胡椒',
    price: 200, allergens: [MOLL, SOY, GLUTEN], tags: ['ทอด', 'หมึก', 'fried'] },
  { id: 'm-fried-shrimp', cat: 'c-fried', order: 30, th: 'กุ้งชุบแป้งทอด', en: 'Battered fried prawns', zh: '炸虾',
    ingTh: 'กุ้ง, แป้งสาลี, ไข่, เกล็ดขนมปัง', ingEn: 'prawn, wheat flour, egg, breadcrumb', ingZh: '虾、小麦粉、鸡蛋、面包糠',
    price: 220, allergens: [CRUST, GLUTEN, EGG], tags: ['ทอด', 'กุ้ง', 'fried'] },
  { id: 'm-fried-squid', cat: 'c-fried', order: 40, th: 'หมึกชุบแป้งทอด', en: 'Battered fried squid', zh: '炸鱿鱼',
    ingTh: 'หมึก, แป้งสาลี, ไข่, เกล็ดขนมปัง', ingEn: 'squid, wheat flour, egg, breadcrumb', ingZh: '鱿鱼、小麦粉、鸡蛋、面包糠',
    price: 230, allergens: [MOLL, GLUTEN, EGG], tags: ['ทอด', 'หมึก', 'fried'] },
  { id: 'm-fried-mix', cat: 'c-fried', order: 50, th: 'กุ้ง + หมึก ชุบแป้งทอด', en: 'Battered prawn and squid', zh: '炸虾与鱿鱼',
    ingTh: 'กุ้ง, หมึก, แป้งสาลี, ไข่', ingEn: 'prawn, squid, wheat flour, egg', ingZh: '虾、鱿鱼、小麦粉、鸡蛋',
    price: 230, allergens: [CRUST, MOLL, GLUTEN, EGG], tags: ['ทอด', 'fried'] },
  { id: 'm-fries', cat: 'c-fried', order: 60, th: 'เฟรนช์ฟรายส์', en: 'French fries', zh: '薯条',
    ingTh: 'มันฝรั่ง, เกลือ', ingEn: 'potato, salt', ingZh: '马铃薯、盐',
    price: 100, veg: true, may: [...KITCHEN_CROSS, GLUTEN], tags: ['ทอด', 'เด็ก', 'fries', 'kids'] },
  { id: 'm-nuggets', cat: 'c-fried', order: 70, th: 'นักเก็ต', en: 'Chicken nuggets', zh: '鸡块',
    ingTh: 'ไก่, แป้งสาลี, เกล็ดขนมปัง', ingEn: 'chicken, wheat flour, breadcrumb', ingZh: '鸡肉、小麦粉、面包糠',
    price: 100, allergens: [GLUTEN, EGG], may: KITCHEN_CROSS, tags: ['ทอด', 'เด็ก', 'kids'] },
  { id: 'm-fried-pork-np', cat: 'c-fried', order: 80, th: 'หมูทอดน้ำปลา', en: 'Pork fried in fish sauce', zh: '鱼露炸猪肉',
    ingTh: 'หมู, น้ำปลา, กระเทียม', ingEn: 'pork, fish sauce, garlic', ingZh: '猪肉、鱼露、蒜',
    price: 170, allergens: [PORK, NAMPLA], may: KITCHEN_CROSS, tags: ['ทอด', 'หมู'] },
  { id: 'm-fried-porkbelly-np', cat: 'c-fried', order: 90, th: 'หมูสามชั้นทอดน้ำปลา', en: 'Pork belly fried in fish sauce', zh: '鱼露炸五花肉',
    ingTh: 'หมูสามชั้น, น้ำปลา, กระเทียม', ingEn: 'pork belly, fish sauce, garlic', ingZh: '五花肉、鱼露、蒜',
    price: 170, allergens: [PORK, NAMPLA], may: KITCHEN_CROSS, tags: ['ทอด', 'หมู'] },

  // ── ปู ───────────────────────────────────────────────────
  {
    id: 'm-crab-steamed', cat: 'c-crab', order: 10,
    th: 'ปูม้านึ่ง', en: 'Steamed blue swimming crab', zh: '清蒸梭子蟹',
    descTh: 'ชั่งน้ำหนักก่อนปรุง พนักงานจะแจ้งราคาให้ทราบก่อน',
    descEn: 'Sold by weight — staff will confirm the price before cooking',
    descZh: '按重量计价，烹饪前由工作人员确认价格',
    ingTh: 'ปูม้าสด, น้ำจิ้มซีฟู้ด', ingEn: 'fresh blue swimming crab, seafood dipping sauce', ingZh: '鲜梭子蟹、海鲜蘸酱',
    price: 0, onRequest: true,
    allergens: [CRUST], may: [MOLL, FISH],
    tags: ['ปู', 'ปูม้า', 'นึ่ง', 'ถามราคา', 'crab', 'market price'],
    groups: [pick('g-crabsteamed-serve', 'การเสิร์ฟ', 'Serving style', '上桌方式', [
      opt('o-crabsteamed-cracked', 'เคาะเปลือก', 'Shell cracked open', '敲壳'),
      opt('o-crabsteamed-picked', 'แกะเนื้อมาให้', 'Meat picked from the shell', '拆好蟹肉'),
    ])],
  },
  {
    id: 'm-bluecrab-stirfry', cat: 'c-crab', order: 20,
    th: 'ปูม้าผัด', en: 'Blue swimming crab, stir-fried', zh: '炒梭子蟹',
    descTh: 'ราคาขึ้นกับขนาดปู 350-400 บาท', descEn: 'Price varies with crab size, 350-400 THB',
    ingTh: 'ปูม้า, กระเทียม, พริก, ต้นหอม, ซีอิ๊ว, น้ำปลา',
    ingEn: 'blue swimming crab, garlic, chilli, spring onion, soy sauce, fish sauce',
    ingZh: '梭子蟹、蒜、辣椒、葱、酱油、鱼露',
    price: 350, spicy: 2,
    allergens: [CRUST, NAMPLA, SOY], may: [MOLL, FISH, EGG],
    tags: ['ปูม้า', 'ผัด', 'crab'],
    groups: [methods('bluecrab', [M.springOnion, M.curryPowder, M.chilliPaste, M.blackPepper])],
  },
  {
    id: 'm-crabmeat-stirfry', cat: 'c-crab', order: 30,
    th: 'เนื้อปูก้อนผัด', en: 'Lump crab meat, stir-fried', zh: '炒蟹肉',
    ingTh: 'เนื้อปูก้อน, กระเทียม, พริก, ต้นหอม, ไข่, ซีอิ๊ว',
    ingEn: 'lump crab meat, garlic, chilli, spring onion, egg, soy sauce',
    ingZh: '蟹肉、蒜、辣椒、葱、鸡蛋、酱油',
    price: 350, spicy: 2,
    allergens: [CRUST, EGG, NAMPLA, SOY], may: [MOLL, FISH],
    tags: ['ปู', 'เนื้อปู', 'crab'],
    groups: [methods('crabmeat', [M.springOnion, M.curryPowder, M.chilliPaste, M.basil, M.blackPepper])],
  },
  {
    id: 'm-softshell-crab', cat: 'c-crab', order: 40,
    th: 'ปูนิ่ม', en: 'Soft-shell crab', zh: '软壳蟹',
    ingTh: 'ปูนิ่ม, แป้ง, กระเทียม, พริก, ต้นหอม',
    ingEn: 'soft-shell crab, flour, garlic, chilli, spring onion',
    ingZh: '软壳蟹、面粉、蒜、辣椒、葱',
    price: 300, spicy: 2,
    allergens: [CRUST, GLUTEN, NAMPLA, SOY], may: [MOLL, FISH, EGG],
    tags: ['ปูนิ่ม', 'soft shell crab'],
    groups: [methods('softshell', [
      M.springOnion, M.curryPowder, M.chilliPaste, M.basil, M.garlic, M.saltChilli, M.blackPepper,
    ])],
  },

  // ── กุ้ง ─────────────────────────────────────────────────
  {
    id: 'm-riverprawn', cat: 'c-shrimp', order: 10,
    th: 'กุ้งแม่น้ำ', en: 'River prawn', zh: '大头虾',
    descTh: 'จานละครึ่งกิโล หรือสั่งเป็นกิโล กรุณาแจ้งล่วงหน้า · ชั่งน้ำหนักก่อนปรุง',
    descEn: 'Half a kilo per plate, or by the kilo with advance notice. Sold by weight.',
    descZh: '每盘半公斤，或按公斤预订。按重量计价。',
    ingTh: 'กุ้งแม่น้ำสด, เกลือ, น้ำจิ้มซีฟู้ด', ingEn: 'fresh river prawn, salt, seafood sauce', ingZh: '鲜大头虾、盐、海鲜酱',
    price: 0, onRequest: true,
    allergens: [CRUST], may: [MOLL, FISH],
    tags: ['กุ้ง', 'กุ้งแม่น้ำ', 'ถามราคา', 'river prawn', 'market price'],
    groups: [saltOrGrill('riverprawn')],
  },
  {
    id: 'm-tigerprawn', cat: 'c-shrimp', order: 20,
    th: 'กุ้งลายเสือ', en: 'Tiger prawn', zh: '虎虾',
    descTh: 'จานละครึ่งกิโล หรือสั่งเป็นกิโล · ชั่งน้ำหนักก่อนปรุง',
    descEn: 'Half a kilo per plate, or by the kilo. Sold by weight.',
    descZh: '每盘半公斤，或按公斤订购。按重量计价。',
    price: 0, onRequest: true,
    ingTh: 'กุ้งลายเสือสด, เกลือ', ingEn: 'fresh tiger prawn, salt', ingZh: '鲜虎虾、盐',
    allergens: [CRUST], may: [MOLL, FISH],
    tags: ['กุ้ง', 'ถามราคา', 'tiger prawn', 'market price'],
    groups: [saltOrGrill('tigerprawn')],
  },
  {
    id: 'm-whiteprawn', cat: 'c-shrimp', order: 30,
    th: 'กุ้งแช่บ๊วย', en: 'White prawn', zh: '白虾',
    descTh: 'จานละครึ่งกิโล หรือสั่งเป็นกิโล · ชั่งน้ำหนักก่อนปรุง',
    descEn: 'Half a kilo per plate, or by the kilo. Sold by weight.',
    descZh: '每盘半公斤，或按公斤订购。按重量计价。',
    price: 0, onRequest: true,
    ingTh: 'กุ้งขาวสด, เกลือ', ingEn: 'fresh white prawn, salt', ingZh: '鲜白虾、盐',
    allergens: [CRUST], may: [MOLL, FISH],
    tags: ['กุ้ง', 'ถามราคา', 'market price'],
    groups: [saltOrGrill('whiteprawn')],
  },
  { id: 'm-prawn-salad', cat: 'c-shrimp', order: 40, th: 'สลัดกุ้ง', en: 'Prawn salad', zh: '虾沙拉',
    ingTh: 'กุ้ง, ผักสลัด, มะเขือเทศ, น้ำสลัด, ไข่ต้ม', ingEn: 'prawn, salad leaves, tomato, dressing, boiled egg',
    ingZh: '虾、生菜、番茄、沙拉酱、水煮蛋',
    price: 250, allergens: [CRUST, EGG, DAIRY], may: [MOLL, GLUTEN], tags: ['กุ้ง', 'สลัด', 'salad'] },
  { id: 'm-prawn-cake', cat: 'c-shrimp', order: 50, th: 'ทอดมันกุ้ง', en: 'Prawn cakes', zh: '炸虾饼',
    ingTh: 'กุ้งสับ, แป้ง, เกล็ดขนมปัง, ซอสบ๊วย', ingEn: 'minced prawn, flour, breadcrumb, plum sauce',
    ingZh: '虾泥、面粉、面包糠、梅子酱',
    price: 200, allergens: [CRUST, GLUTEN, EGG], tags: ['กุ้ง', 'ทอด', 'fried'] },
  { id: 'm-prawn-cheese', cat: 'c-shrimp', order: 60, th: 'กุ้งอบชีส', en: 'Baked prawns with cheese', zh: '芝士焗虾',
    ingTh: 'กุ้ง, ชีส, เนย, กระเทียม', ingEn: 'prawn, cheese, butter, garlic', ingZh: '虾、芝士、黄油、蒜',
    price: 300, allergens: [CRUST, DAIRY], may: [GLUTEN], tags: ['กุ้ง', 'ชีส', 'cheese'] },
  { id: 'm-prawn-glassnoodle', cat: 'c-shrimp', order: 70, th: 'กุ้งอบวุ้นเส้น', en: 'Prawns baked with glass noodles', zh: '粉丝焗虾',
    ingTh: 'กุ้ง, วุ้นเส้น, ขิง, ซีอิ๊ว, พริกไทย, เบคอน', ingEn: 'prawn, glass noodles, ginger, soy sauce, pepper, bacon',
    ingZh: '虾、粉丝、姜、酱油、胡椒、培根',
    price: 250, allergens: [CRUST, SOY, PORK], may: [GLUTEN], tags: ['กุ้ง', 'วุ้นเส้น'] },
  { id: 'm-prawn-3flavour', cat: 'c-shrimp', order: 80, th: 'กุ้งสามรส', en: 'Three-flavour prawns', zh: '三味虾',
    ingTh: 'กุ้ง, พริก, กระเทียม, น้ำมะขาม, น้ำตาลปี๊บ, น้ำปลา',
    ingEn: 'prawn, chilli, garlic, tamarind, palm sugar, fish sauce', ingZh: '虾、辣椒、蒜、罗望子、棕榈糖、鱼露',
    price: 300, spicy: 2, allergens: [CRUST, NAMPLA], may: [GLUTEN], tags: ['กุ้ง', 'สามรส'] },
  { id: 'm-prawn-woonsen-usi', cat: 'c-shrimp', order: 90, th: 'กุ้งอู๋ซี่', en: 'Prawns in Chinese-style sauce', zh: '虾（潮式）',
    ingTh: 'กุ้ง, กระเทียม, ซีอิ๊ว, พริกไทย, น้ำมันงา', ingEn: 'prawn, garlic, soy sauce, pepper, sesame oil',
    ingZh: '虾、蒜、酱油、胡椒、香油',
    price: 300, allergens: [CRUST, SOY, SESAME], may: [GLUTEN], tags: ['กุ้ง'] },
  { id: 'm-prawn-strawmushroom', cat: 'c-shrimp', order: 100, th: 'กุ้งผัดเห็ดฟาง', en: 'Prawns with straw mushrooms', zh: '草菇炒虾',
    ingTh: 'กุ้ง, เห็ดฟาง, น้ำมันหอย, ซีอิ๊ว', ingEn: 'prawn, straw mushroom, oyster sauce, soy sauce',
    ingZh: '虾、草菇、蚝油、酱油',
    price: 300, allergens: [CRUST, MOLL, SOY], may: [GLUTEN], tags: ['กุ้ง', 'เห็ด'] },
  { id: 'm-prawn-tamarind', cat: 'c-shrimp', order: 110, th: 'กุ้งซอสมะขาม', en: 'Prawns in tamarind sauce', zh: '罗望子酱虾',
    ingTh: 'กุ้ง, น้ำมะขาม, หอมเจียว, น้ำตาลปี๊บ, น้ำปลา',
    ingEn: 'prawn, tamarind, fried shallot, palm sugar, fish sauce', ingZh: '虾、罗望子、炸红葱、棕榈糖、鱼露',
    price: 300, allergens: [CRUST, NAMPLA], may: [GLUTEN], tags: ['กุ้ง', 'มะขาม'] },
  {
    id: 'm-prawn-stirfry', cat: 'c-shrimp', order: 120,
    th: 'กุ้งผัด', en: 'Stir-fried prawns', zh: '炒虾',
    ingTh: 'กุ้ง, กระเทียม, พริก, ต้นหอม, ซีอิ๊ว, น้ำปลา',
    ingEn: 'prawn, garlic, chilli, spring onion, soy sauce, fish sauce',
    ingZh: '虾、蒜、辣椒、葱、酱油、鱼露',
    price: 250, spicy: 2,
    allergens: [CRUST, NAMPLA, SOY], may: [MOLL, FISH, GLUTEN],
    tags: ['กุ้ง', 'ผัด', 'prawn'],
    groups: [methods('prawnstir', [
      M.springOnion, M.curryPowder, M.chilliPaste, M.blackPepper, M.curryPaste, M.padCha, M.saltChilli,
    ])],
  },
  { id: 'm-prawn-fishsauce-raw', cat: 'c-shrimp', order: 130, th: 'กุ้งแช่น้ำปลา', en: 'Raw prawns in fish sauce', zh: '鱼露生腌虾',
    descTh: 'กุ้งสดแช่น้ำปลา เสิร์ฟดิบ', descEn: 'Raw prawns cured in fish sauce', descZh: '生腌，未经烹煮',
    ingTh: 'กุ้งสด, น้ำปลา, กระเทียม, พริกขี้หนู, มะนาว',
    ingEn: 'raw prawn, fish sauce, garlic, bird chilli, lime', ingZh: '生虾、鱼露、蒜、小米辣、青柠',
    price: 230, spicy: 4, allergens: [CRUST, NAMPLA], tags: ['กุ้ง', 'ดิบ', 'เผ็ด', 'raw'] },

  // ── กุ้งกระดาน ───────────────────────────────────────────
  { id: 'm-mantis-steamed', cat: 'c-mantis', order: 10, th: 'กุ้งกระดานนึ่ง', en: 'Steamed mantis shrimp', zh: '清蒸皮皮虾',
    ingTh: 'กุ้งกระดาน, น้ำจิ้มซีฟู้ด', ingEn: 'mantis shrimp, seafood sauce', ingZh: '皮皮虾、海鲜酱',
    price: 350, allergens: [CRUST], may: [MOLL, FISH], tags: ['กุ้งกระดาน', 'นึ่ง', 'mantis'] },
  { id: 'm-mantis-grilled', cat: 'c-mantis', order: 20, th: 'กุ้งกระดานเผา', en: 'Grilled mantis shrimp', zh: '炭烤皮皮虾',
    ingTh: 'กุ้งกระดาน, น้ำจิ้มซีฟู้ด', ingEn: 'mantis shrimp, seafood sauce', ingZh: '皮皮虾、海鲜酱',
    price: 350, allergens: [CRUST], may: [MOLL, FISH], tags: ['กุ้งกระดาน', 'เผา', 'mantis'] },
  {
    id: 'm-mantis-stirfry', cat: 'c-mantis', order: 30,
    th: 'กุ้งกระดานผัด', en: 'Stir-fried mantis shrimp', zh: '炒皮皮虾',
    ingTh: 'กุ้งกระดาน, กระเทียม, พริก, ต้นหอม', ingEn: 'mantis shrimp, garlic, chilli, spring onion',
    ingZh: '皮皮虾、蒜、辣椒、葱',
    price: 390, spicy: 2, allergens: [CRUST, NAMPLA, SOY], may: [MOLL, FISH, GLUTEN],
    tags: ['กุ้งกระดาน', 'ผัด', 'mantis'],
    groups: [methods('mantis', [M.garlic, M.saltChilli, M.chilliPaste, M.springOnion])],
  },

  // ── หอย ──────────────────────────────────────────────────
  {
    id: 'm-babolonia', cat: 'c-shell', order: 10,
    th: 'หอยหวาน', en: 'Babylon snails', zh: '香螺',
    ingTh: 'หอยหวาน, เนย, กระเทียม', ingEn: 'babylon snail, butter, garlic', ingZh: '香螺、黄油、蒜',
    price: 350, allergens: [MOLL, DAIRY], may: [CRUST, FISH], tags: ['หอย', 'shellfish'],
    groups: [pick('g-babolonia-cook', 'วิธีปรุง', 'Cooking style', '做法', [
      opt('o-bab-butter', 'อบเนย', 'Baked in butter', '黄油焗'),
      opt('o-bab-grill', 'เผา', 'Charcoal-grilled', '炭烤'),
    ])],
  },
  { id: 'm-oyster-songkreung', cat: 'c-shell', order: 20, th: 'หอยนางรมทรงเครื่อง', en: 'Fresh oysters with condiments', zh: '生蚝配料',
    descTh: 'หอยนางรมสด เสิร์ฟพร้อมกระเทียมเจียว หอมเจียว ใบชะพลู',
    descEn: 'Raw oysters served with fried garlic, shallots and betel leaf',
    ingTh: 'หอยนางรมสด, กระเทียมเจียว, หอมเจียว, ใบชะพลู, น้ำจิ้มซีฟู้ด',
    ingEn: 'raw oyster, fried garlic, fried shallot, betel leaf, seafood sauce',
    ingZh: '生蚝、炸蒜、炸红葱、假蒟叶、海鲜酱',
    price: 200, allergens: [MOLL, NAMPLA], may: [CRUST, FISH], tags: ['หอยนางรม', 'ดิบ', 'oyster', 'raw'] },
  { id: 'm-oyster-grilled', cat: 'c-shell', order: 30, th: 'หอยนางรมย่าง', en: 'Grilled oysters', zh: '炭烤生蚝',
    ingTh: 'หอยนางรม, กระเทียม, พริก', ingEn: 'oyster, garlic, chilli', ingZh: '生蚝、蒜、辣椒',
    price: 200, allergens: [MOLL, NAMPLA], may: [CRUST, FISH], tags: ['หอยนางรม', 'ย่าง', 'oyster'] },
  { id: 'm-oyster-yam-lemongrass', cat: 'c-shell', order: 40, th: 'ยำหอยนางรมตะไคร้', en: 'Oyster salad with lemongrass', zh: '香茅拌生蚝',
    ingTh: 'หอยนางรม, ตะไคร้, หอมแดง, พริก, มะนาว, น้ำปลา',
    ingEn: 'oyster, lemongrass, shallot, chilli, lime, fish sauce', ingZh: '生蚝、香茅、红葱、辣椒、青柠、鱼露',
    price: 200, spicy: 3, allergens: [MOLL, NAMPLA], may: [CRUST, FISH], tags: ['ยำ', 'หอยนางรม', 'เผ็ด'] },
  { id: 'm-cockle-grilled', cat: 'c-shell', order: 50, th: 'หอยแครงลวก / ย่าง', en: 'Blanched or grilled cockles', zh: '烫／烤血蛤',
    ingTh: 'หอยแครง, น้ำจิ้มซีฟู้ด', ingEn: 'cockle, seafood sauce', ingZh: '血蛤、海鲜酱',
    price: 200, allergens: [MOLL, NAMPLA], may: [CRUST, FISH], tags: ['หอยแครง', 'cockle'],
    groups: [pick('g-cockle-cook', 'วิธีปรุง', 'Cooking style', '做法', [
      opt('o-cockle-blanch', 'ลวก', 'Blanched', '白灼'),
      opt('o-cockle-grill', 'ย่าง', 'Grilled', '炭烤'),
    ])] },
  { id: 'm-mussel', cat: 'c-shell', order: 60, th: 'หอยแมลงภู่ อบ / เผา', en: 'Green mussels, baked or grilled', zh: '焗／烤青口',
    ingTh: 'หอยแมลงภู่, ใบโหระพา, ตะไคร้, น้ำจิ้มซีฟู้ด',
    ingEn: 'green mussel, sweet basil, lemongrass, seafood sauce', ingZh: '青口、九层塔、香茅、海鲜酱',
    price: 170, allergens: [MOLL, NAMPLA], may: [CRUST, FISH], tags: ['หอยแมลงภู่', 'mussel'],
    groups: [pick('g-mussel-cook', 'วิธีปรุง', 'Cooking style', '做法', [
      opt('o-mussel-bake', 'อบ', 'Baked', '焗'),
      opt('o-mussel-grill', 'เผา', 'Grilled', '炭烤'),
    ])] },
  { id: 'm-scallop-cheese', cat: 'c-shell', order: 70, th: 'หอยเชลล์อบชีส', en: 'Scallops baked with cheese', zh: '芝士焗扇贝',
    ingTh: 'หอยเชลล์, ชีส, เนย, กระเทียม', ingEn: 'scallop, cheese, butter, garlic', ingZh: '扇贝、芝士、黄油、蒜',
    price: 200, allergens: [MOLL, DAIRY], may: [CRUST, FISH, GLUTEN], tags: ['หอยเชลล์', 'ชีส', 'scallop'] },
  {
    id: 'm-scallop', cat: 'c-shell', order: 80,
    th: 'หอยเชลล์', en: 'Scallops', zh: '扇贝',
    ingTh: 'หอยเชลล์, กระเทียม, พริก, ใบโหระพา, ซีอิ๊ว',
    ingEn: 'scallop, garlic, chilli, sweet basil, soy sauce', ingZh: '扇贝、蒜、辣椒、九层塔、酱油',
    price: 200, spicy: 2, allergens: [MOLL, NAMPLA, SOY], may: [CRUST, FISH, DAIRY, GLUTEN],
    tags: ['หอยเชลล์', 'scallop'],
    groups: [methods('scallop', [
      ['butter', 'อบเนย', 'Baked in butter', '黄油焗'],
      ['grill', 'เผา', 'Charcoal-grilled', '炭烤'],
      M.padCha, M.garlic, M.sweetBasil, M.blackPepper, M.chilliPaste,
    ])],
  },
  {
    id: 'm-razorclam', cat: 'c-shell', order: 90,
    th: 'หอยหลอด', en: 'Razor clams', zh: '蛏子',
    ingTh: 'หอยหลอด, กระเทียม, พริก, ใบกะเพรา, ใบโหระพา',
    ingEn: 'razor clam, garlic, chilli, holy basil, sweet basil', ingZh: '蛏子、蒜、辣椒、打抛叶、九层塔',
    price: 200, spicy: 3, allergens: [MOLL, NAMPLA, SOY], may: [CRUST, FISH],
    tags: ['หอยหลอด', 'razor clam'],
    groups: [methods('razorclam', [M.padCha, M.basil, M.sweetBasil, M.chilliPaste, M.blackPepper])],
  },
  {
    id: 'm-siabclam', cat: 'c-shell', order: 100,
    th: 'หอยเสียบ', en: 'Wedge clams', zh: '楔形蛤',
    ingTh: 'หอยเสียบ, กระเทียม, พริก, ใบกะเพรา, ใบโหระพา',
    ingEn: 'wedge clam, garlic, chilli, holy basil, sweet basil', ingZh: '楔形蛤、蒜、辣椒、打抛叶、九层塔',
    price: 200, spicy: 3, allergens: [MOLL, NAMPLA, SOY], may: [CRUST, FISH],
    tags: ['หอยเสียบ', 'clam'],
    groups: [methods('siabclam', [M.padCha, M.basil, M.sweetBasil, M.blackPepper, M.chilliPaste])],
  },

  // ── หมึก ─────────────────────────────────────────────────
  { id: 'm-squidegg-3flavour', cat: 'c-squid', order: 10, th: 'หมึกไข่สามรส', en: 'Three-flavour egg squid', zh: '三味蛋鱿鱼',
    ingTh: 'หมึกไข่, พริก, กระเทียม, น้ำมะขาม, น้ำตาลปี๊บ',
    ingEn: 'egg squid, chilli, garlic, tamarind, palm sugar', ingZh: '蛋鱿鱼、辣椒、蒜、罗望子、棕榈糖',
    price: 300, spicy: 2, allergens: [MOLL, NAMPLA], may: [CRUST, FISH, GLUTEN], tags: ['หมึก', 'สามรส', 'squid'] },
  { id: 'm-squidegg-steamlime', cat: 'c-squid', order: 20, th: 'หมึกไข่นึ่งมะนาว', en: 'Egg squid steamed with lime', zh: '柠檬蒸蛋鱿鱼',
    ingTh: 'หมึกไข่, มะนาว, กระเทียม, พริก, น้ำปลา',
    ingEn: 'egg squid, lime, garlic, chilli, fish sauce', ingZh: '蛋鱿鱼、青柠、蒜、辣椒、鱼露',
    price: 300, spicy: 3, allergens: [MOLL, NAMPLA], may: [CRUST, FISH], tags: ['หมึก', 'นึ่ง', 'squid'] },
  {
    id: 'm-squid', cat: 'c-squid', order: 30,
    th: 'หมึก / หมึกไข่', en: 'Squid or egg squid', zh: '鱿鱼／蛋鱿鱼',
    ingTh: 'หมึกสด, กระเทียม, พริก, ใบกะเพรา, ซีอิ๊ว, น้ำปลา',
    ingEn: 'fresh squid, garlic, chilli, holy basil, soy sauce, fish sauce',
    ingZh: '鲜鱿鱼、蒜、辣椒、打抛叶、酱油、鱼露',
    price: 250, spicy: 2, allergens: [MOLL, NAMPLA, SOY], may: [CRUST, FISH, EGG, GLUTEN],
    tags: ['หมึก', 'squid'],
    groups: [
      pick('g-squid-type', 'เลือกชนิด', 'Choose', '选择', [
        opt('o-sq-plain', 'หมึกกล้วย', 'Plain squid', '普通鱿鱼'),
        opt('o-sq-egg', 'หมึกไข่', 'Egg squid', '蛋鱿鱼'),
      ]),
      methods('squid', [
        M.garlic, M.sunDried, M.grilled, M.saltedEgg, M.chilliPaste,
        M.padCha, M.curryPowder, M.basil, M.curryPaste,
      ]),
    ],
  },
  {
    id: 'm-cuttlefish', cat: 'c-squid', order: 40,
    th: 'หมึกหอม / หมึกกระดอง', en: 'Cuttlefish', zh: '墨鱼',
    ingTh: 'หมึกกระดอง, กระเทียม, พริก, ใบกะเพรา, ซีอิ๊ว',
    ingEn: 'cuttlefish, garlic, chilli, holy basil, soy sauce', ingZh: '墨鱼、蒜、辣椒、打抛叶、酱油',
    price: 250, spicy: 2, allergens: [MOLL, NAMPLA, SOY], may: [CRUST, FISH, EGG, GLUTEN],
    tags: ['หมึก', 'หมึกกระดอง', 'cuttlefish'],
    groups: [methods('cuttlefish', [
      M.grilled, M.garlic, M.sunDried, M.saltedEgg, M.chilliPaste, M.padCha, M.basil, M.curryPaste,
    ])],
  },

  // ── ปลา ──────────────────────────────────────────────────
  {
    id: 'm-seabass', cat: 'c-fish', order: 10,
    th: 'ปลากระพง', en: 'Sea bass', zh: '金目鲈',
    descTh: 'ปลาทั้งตัว · ราคาขึ้นกับขนาด 400-450 บาท',
    descEn: 'Whole fish. Price varies with size, 400-450 THB',
    ingTh: 'ปลากระพงสด, กระเทียม, พริก, มะนาว, น้ำปลา, ซีอิ๊ว',
    ingEn: 'fresh sea bass, garlic, chilli, lime, fish sauce, soy sauce',
    ingZh: '鲜金目鲈、蒜、辣椒、青柠、鱼露、酱油',
    price: 400, spicy: 2, allergens: [FISH, NAMPLA, SOY], may: [CRUST, MOLL, GLUTEN],
    tags: ['ปลา', 'ปลากระพง', 'sea bass', 'fish'],
    groups: [fishMethods('seabass')],
  },
  {
    id: 'm-pomfret', cat: 'c-fish', order: 20,
    th: 'ปลาจาระเม็ดขาว', en: 'White pomfret', zh: '白鲳',
    descTh: 'ราคาขึ้นกับขนาด 400 / 450 / 500 / 550 บาท',
    descEn: 'Price by size: 400 / 450 / 500 / 550 THB',
    ingTh: 'ปลาจาระเม็ดขาว, กระเทียม, พริก, มะนาว, น้ำปลา',
    ingEn: 'white pomfret, garlic, chilli, lime, fish sauce', ingZh: '白鲳、蒜、辣椒、青柠、鱼露',
    price: 400, spicy: 2, allergens: [FISH, NAMPLA, SOY], may: [CRUST, MOLL, GLUTEN],
    tags: ['ปลา', 'จาระเม็ด', 'pomfret', 'fish'],
    groups: [
      fishMethods('pomfret'),
      pick('g-pomfret-size', 'ขนาด', 'Size', '份量', [
        opt('o-pomf-1', 'ขนาด 1', 'Size 1', '规格一', 0),
        opt('o-pomf-2', 'ขนาด 2', 'Size 2', '规格二', 50),
        opt('o-pomf-3', 'ขนาด 3', 'Size 3', '规格三', 100),
        opt('o-pomf-4', 'ขนาด 4', 'Size 4', '规格四', 150),
      ]),
    ],
  },
  {
    id: 'm-queenfish', cat: 'c-fish', order: 30,
    th: 'ปลาสำลี', en: 'Queenfish', zh: '鲹鱼',
    descTh: 'ราคาโลละ 500 บาท · ชั่งน้ำหนักก่อนปรุง',
    descEn: '500 THB per kilo — weighed before cooking',
    descZh: '每公斤 500 泰铢，烹饪前称重',
    ingTh: 'ปลาสำลีสด, กระเทียม, พริก, มะนาว, น้ำปลา',
    ingEn: 'queenfish, garlic, chilli, lime, fish sauce', ingZh: '鲹鱼、蒜、辣椒、青柠、鱼露',
    price: 0, onRequest: true, spicy: 2,
    allergens: [FISH, NAMPLA, SOY], may: [CRUST, MOLL, GLUTEN],
    tags: ['ปลา', 'ถามราคา', 'queenfish', 'market price'],
    groups: [fishMethods('queenfish')],
  },
  {
    id: 'm-grouper', cat: 'c-fish', order: 40,
    th: 'ปลาเก๋า', en: 'Grouper', zh: '石斑鱼',
    descTh: 'ราคาโลละ 450 บาท · ชั่งน้ำหนักก่อนปรุง',
    descEn: '450 THB per kilo — weighed before cooking',
    descZh: '每公斤 450 泰铢，烹饪前称重',
    ingTh: 'ปลาเก๋าสด, กระเทียม, พริก, มะนาว, น้ำปลา',
    ingEn: 'grouper, garlic, chilli, lime, fish sauce', ingZh: '石斑鱼、蒜、辣椒、青柠、鱼露',
    price: 0, onRequest: true, spicy: 2,
    allergens: [FISH, NAMPLA, SOY], may: [CRUST, MOLL, GLUTEN],
    tags: ['ปลา', 'ปลาเก๋า', 'ถามราคา', 'grouper', 'market price'],
    groups: [fishMethods('grouper')],
  },
  {
    id: 'm-sole', cat: 'c-fish', order: 50,
    th: 'ปลาลิ้นหมา', en: 'Sole', zh: '龙脷鱼',
    ingTh: 'ปลาลิ้นหมา, กระเทียม, น้ำปลา', ingEn: 'sole, garlic, fish sauce', ingZh: '龙脷鱼、蒜、鱼露',
    price: 300, allergens: [FISH, NAMPLA], may: [CRUST, MOLL, GLUTEN],
    tags: ['ปลา', 'sole', 'fish'],
    groups: [fishMethods('sole', false)],
  },
  {
    id: 'm-mullet', cat: 'c-fish', order: 60,
    th: 'ปลากระบอก', en: 'Mullet', zh: '乌鱼',
    ingTh: 'ปลากระบอก, กระเทียม, น้ำปลา', ingEn: 'mullet, garlic, fish sauce', ingZh: '乌鱼、蒜、鱼露',
    price: 300, allergens: [FISH, NAMPLA], may: [CRUST, MOLL, GLUTEN],
    tags: ['ปลา', 'ปลากระบอก', 'mullet'],
    groups: [fishMethods('mullet', false)],
  },
  {
    id: 'm-sandwhiting', cat: 'c-fish', order: 70,
    th: 'ปลาเห็ดโคน', en: 'Sand whiting', zh: '沙钻鱼',
    ingTh: 'ปลาเห็ดโคน, กระเทียม, น้ำปลา', ingEn: 'sand whiting, garlic, fish sauce', ingZh: '沙钻鱼、蒜、鱼露',
    price: 230, allergens: [FISH, NAMPLA], may: [CRUST, MOLL, GLUTEN],
    tags: ['ปลา', 'ปลาเห็ดโคน', 'sand whiting'],
    groups: [fishMethods('sandwhiting', false)],
  },
  {
    id: 'm-mackerel', cat: 'c-fish', order: 80,
    th: 'ปลาทู', en: 'Short mackerel', zh: '鲭鱼',
    ingTh: 'ปลาทู, กระเทียม, น้ำปลา, พริกแกง',
    ingEn: 'short mackerel, garlic, fish sauce, curry paste', ingZh: '鲭鱼、蒜、鱼露、咖喱酱',
    price: 200, spicy: 1, allergens: [FISH, NAMPLA], may: [CRUST, MOLL, GLUTEN],
    tags: ['ปลา', 'ปลาทู', 'mackerel'],
    groups: [pick('g-mackerel-cook', 'วิธีปรุง', 'Cooking style', '做法', [
      opt('o-mack-friednp', 'ทอดราดน้ำปลา', 'Deep-fried with fish sauce', '炸淋鱼露', 0),
      opt('o-mack-garlic', 'ทอดกระเทียม', 'Deep-fried with garlic', '蒜香炸', 0),
      opt('o-mack-grill', 'ย่าง', 'Grilled', '炭烤', 0),
      opt('o-mack-currypaste', 'ราดพริกแกง', 'Red curry sauce', '咖喱酱', 50),
      opt('o-mack-usi', 'อู๋ซี่', 'Chinese-style', '潮式', 50),
    ])],
  },
  {
    id: 'm-kingmackerel-dried', cat: 'c-fish', order: 90,
    th: 'ปลาอินทรีย์แดดเดียว', en: 'Sun-dried king mackerel', zh: '一夜干马鲛鱼',
    descTh: 'ราคาขึ้นกับขนาด 180-330 บาท', descEn: 'Price by size, 180-330 THB',
    ingTh: 'ปลาอินทรีย์แดดเดียว, น้ำจิ้มซีฟู้ด', ingEn: 'sun-dried king mackerel, seafood sauce',
    ingZh: '一夜干马鲛鱼、海鲜酱',
    price: 180, allergens: [FISH, NAMPLA], may: [CRUST, MOLL, GLUTEN],
    tags: ['ปลา', 'แดดเดียว', 'ปลาอินทรีย์', 'king mackerel'],
    groups: [pick('g-kingmack-size', 'ขนาด', 'Size', '份量', [
      opt('o-km-1', 'ขนาด 1', 'Size 1', '规格一', 0),
      opt('o-km-2', 'ขนาด 2', 'Size 2', '规格二', 20),
      opt('o-km-3', 'ขนาด 3', 'Size 3', '规格三', 50),
      opt('o-km-4', 'ขนาด 4', 'Size 4', '规格四', 70),
      opt('o-km-5', 'ขนาด 5', 'Size 5', '规格五', 150),
    ])],
  },
  { id: 'm-kingmackerel-songkreung', cat: 'c-fish', order: 100, th: 'ปลาอินทรีย์ทรงเครื่อง', en: 'King mackerel with condiments', zh: '马鲛鱼配料',
    ingTh: 'ปลาอินทรีย์, ขิง, หอมแดง, พริก, น้ำปลา',
    ingEn: 'king mackerel, ginger, shallot, chilli, fish sauce', ingZh: '马鲛鱼、姜、红葱、辣椒、鱼露',
    price: 180, spicy: 2, allergens: [FISH, NAMPLA], may: [CRUST, MOLL], tags: ['ปลา', 'ปลาอินทรีย์'] },
  { id: 'm-fishcake-ngob', cat: 'c-fish', order: 110, th: 'งบ / ห่อหมก / ทอดมันปลา', en: 'Fish in banana leaf or fish cakes', zh: '香蕉叶烤鱼／鱼饼',
    ingTh: 'เนื้อปลา, พริกแกง, ไข่, กะทิ, ใบมะกรูด, ใบยอ',
    ingEn: 'fish, curry paste, egg, coconut milk, kaffir lime leaf, noni leaf',
    ingZh: '鱼肉、咖喱酱、鸡蛋、椰浆、青柠叶',
    price: 150, spicy: 2, allergens: [FISH, EGG, NAMPLA], may: [CRUST, MOLL, GLUTEN],
    tags: ['ปลา', 'ห่อหมก', 'ทอดมัน'],
    groups: [pick('g-ngob-style', 'เลือกแบบ', 'Choose', '选择', [
      opt('o-ngob-ngob', 'งบปลา', 'Grilled in banana leaf', '香蕉叶烤'),
      opt('o-ngob-hormok', 'ห่อหมกปลา', 'Steamed curry custard', '咖喱蒸'),
      opt('o-ngob-todman', 'ทอดมันปลา', 'Fried fish cakes', '炸鱼饼'),
    ])] },

  // ── ของสด ────────────────────────────────────────────────
  // Raw seafood sold by weight for guests who want to grill at the villa
  // themselves. Everything here is price-on-request: the kitchen weighs it
  // and staff enter the real price on the order line.
  { id: 'm-fresh-riverprawn', cat: 'c-fresh', order: 10, th: 'กุ้งแม่น้ำสด', en: 'River prawn, fresh', zh: '鲜大头虾',
    descTh: 'ของสดยังไม่ปรุง · ชั่งน้ำหนักก่อน พนักงานแจ้งราคาก่อนจัดส่ง',
    descEn: 'Raw, not cooked. Weighed first — staff confirm the price before delivery.',
    descZh: '生鲜未烹调，先称重，工作人员送达前确认价格。',
    price: 0, onRequest: true, allergens: [CRUST], may: [MOLL, FISH],
    tags: ['ของสด', 'กุ้ง', 'ถามราคา', 'fresh', 'raw', 'market price'] },
  { id: 'm-fresh-tigerprawn', cat: 'c-fresh', order: 20, th: 'กุ้งลายเสือสด', en: 'Tiger prawn, fresh', zh: '鲜虎虾',
    descTh: 'ของสดยังไม่ปรุง · ชั่งน้ำหนักก่อน พนักงานแจ้งราคาก่อนจัดส่ง',
    descEn: 'Raw, not cooked. Weighed first — staff confirm the price before delivery.',
    descZh: '生鲜未烹调，先称重，工作人员送达前确认价格。',
    price: 0, onRequest: true, allergens: [CRUST], may: [MOLL, FISH],
    tags: ['ของสด', 'กุ้ง', 'ถามราคา', 'fresh', 'raw', 'market price'] },
  { id: 'm-fresh-whiteprawn', cat: 'c-fresh', order: 30, th: 'กุ้งขาวสด', en: 'White prawn, fresh', zh: '鲜白虾',
    descTh: 'ของสดยังไม่ปรุง · ชั่งน้ำหนักก่อน พนักงานแจ้งราคาก่อนจัดส่ง',
    descEn: 'Raw, not cooked. Weighed first — staff confirm the price before delivery.',
    descZh: '生鲜未烹调，先称重，工作人员送达前确认价格。',
    price: 0, onRequest: true, allergens: [CRUST], may: [MOLL, FISH],
    tags: ['ของสด', 'กุ้ง', 'ถามราคา', 'fresh', 'raw', 'market price'] },
  { id: 'm-fresh-bluecrab', cat: 'c-fresh', order: 40, th: 'ปูม้าสด', en: 'Blue swimming crab, fresh', zh: '鲜梭子蟹',
    descTh: 'ของสดยังไม่ปรุง · ชั่งน้ำหนักก่อน พนักงานแจ้งราคาก่อนจัดส่ง',
    descEn: 'Raw, not cooked. Weighed first — staff confirm the price before delivery.',
    descZh: '生鲜未烹调，先称重，工作人员送达前确认价格。',
    price: 0, onRequest: true, allergens: [CRUST], may: [MOLL, FISH],
    tags: ['ของสด', 'ปู', 'ปูม้า', 'ถามราคา', 'fresh', 'raw', 'market price'] },
  { id: 'm-fresh-mantis', cat: 'c-fresh', order: 50, th: 'กุ้งกระดานสด', en: 'Mantis shrimp, fresh', zh: '鲜皮皮虾',
    descTh: 'ของสดยังไม่ปรุง · ชั่งน้ำหนักก่อน พนักงานแจ้งราคาก่อนจัดส่ง',
    descEn: 'Raw, not cooked. Weighed first — staff confirm the price before delivery.',
    descZh: '生鲜未烹调，先称重，工作人员送达前确认价格。',
    price: 0, onRequest: true, allergens: [CRUST], may: [MOLL, FISH],
    tags: ['ของสด', 'กุ้งกระดาน', 'ถามราคา', 'fresh', 'raw', 'market price'] },
  { id: 'm-fresh-squid', cat: 'c-fresh', order: 60, th: 'หมึกสด', en: 'Squid, fresh', zh: '鲜鱿鱼',
    descTh: 'ของสดยังไม่ปรุง · ชั่งน้ำหนักก่อน พนักงานแจ้งราคาก่อนจัดส่ง',
    descEn: 'Raw, not cooked. Weighed first — staff confirm the price before delivery.',
    descZh: '生鲜未烹调，先称重，工作人员送达前确认价格。',
    price: 0, onRequest: true, allergens: [MOLL], may: [CRUST, FISH],
    tags: ['ของสด', 'หมึก', 'ถามราคา', 'fresh', 'raw', 'market price'] },
  { id: 'm-fresh-cockle', cat: 'c-fresh', order: 70, th: 'หอยแครงสด', en: 'Blood cockle, fresh', zh: '鲜血蛤',
    descTh: 'ของสดยังไม่ปรุง · ชั่งน้ำหนักก่อน พนักงานแจ้งราคาก่อนจัดส่ง',
    descEn: 'Raw, not cooked. Weighed first — staff confirm the price before delivery.',
    descZh: '生鲜未烹调，先称重，工作人员送达前确认价格。',
    price: 0, onRequest: true, allergens: [MOLL], may: [CRUST, FISH],
    tags: ['ของสด', 'หอย', 'ถามราคา', 'fresh', 'raw', 'market price'] },
  { id: 'm-fresh-mussel', cat: 'c-fresh', order: 80, th: 'หอยแมลงภู่สด', en: 'Green mussel, fresh', zh: '鲜青口贝',
    descTh: 'ของสดยังไม่ปรุง · ชั่งน้ำหนักก่อน พนักงานแจ้งราคาก่อนจัดส่ง',
    descEn: 'Raw, not cooked. Weighed first — staff confirm the price before delivery.',
    descZh: '生鲜未烹调，先称重，工作人员送达前确认价格。',
    price: 0, onRequest: true, allergens: [MOLL], may: [CRUST, FISH],
    tags: ['ของสด', 'หอย', 'ถามราคา', 'fresh', 'raw', 'market price'] },
  { id: 'm-fresh-seabass', cat: 'c-fresh', order: 90, th: 'ปลากะพงสด', en: 'Sea bass, fresh', zh: '鲜金目鲈',
    descTh: 'ของสดยังไม่ปรุง · ชั่งน้ำหนักก่อน พนักงานแจ้งราคาก่อนจัดส่ง',
    descEn: 'Raw, not cooked. Weighed first — staff confirm the price before delivery.',
    descZh: '生鲜未烹调，先称重，工作人员送达前确认价格。',
    price: 0, onRequest: true, allergens: [FISH], may: [CRUST, MOLL],
    tags: ['ของสด', 'ปลา', 'ถามราคา', 'fresh', 'raw', 'market price'] },

  // ── ผัดฉ่า ───────────────────────────────────────────────
  {
    id: 'm-padcha-fish', cat: 'c-padcha', order: 10,
    th: 'ปลาผัดฉ่า / ผัดพริกแกง', en: 'Fish Pad Cha or red curry stir-fry', zh: '香辣炒鱼／咖喱酱炒鱼',
    descTh: 'ราคาขึ้นกับชนิดปลาที่เลือก', descEn: 'Price depends on the fish you choose',
    ingTh: 'เนื้อปลา, พริกแกง, กระชาย, ใบกะเพรา, พริกไทยอ่อน, น้ำปลา',
    ingEn: 'fish, red curry paste, fingerroot, holy basil, green peppercorn, fish sauce',
    ingZh: '鱼肉、咖喱酱、沙姜、打抛叶、青胡椒、鱼露',
    price: 190, spicy: 4, allergens: [FISH, NAMPLA, CRUST], may: [MOLL, GLUTEN],
    tags: ['ผัดฉ่า', 'เผ็ด', 'ปลา', 'pad cha', 'spicy'],
    groups: [
      pick('g-padcha-fish-type', 'เลือกปลา', 'Choose fish', '选择鱼类', [
        opt('o-pcf-shark', 'ปลาฉลาม', 'Shark', '鲨鱼', 0),
        opt('o-pcf-ray', 'ปลากระเบน', 'Stingray', '魔鬼鱼', 0),
        opt('o-pcf-catfish', 'ปลาดุกทะเล', 'Sea catfish', '海鲶鱼', 30),
        opt('o-pcf-seabass', 'ปลากระพง', 'Sea bass', '金目鲈', 30),
        opt('o-pcf-whiting', 'ปลาเห็ดโคน', 'Sand whiting', '沙钻鱼', 30),
        opt('o-pcf-grouper', 'ปลาเก๋า', 'Grouper', '石斑鱼', 60),
      ]),
      pick('g-padcha-fish-style', 'รูปแบบ', 'Style', '样式', [
        opt('o-pcf-padcha', 'ผัดฉ่า', 'Pad Cha', '香辣炒'),
        opt('o-pcf-currypaste', 'ผัดพริกแกง', 'Red curry stir-fry', '咖喱酱炒'),
      ]),
    ],
  },
  { id: 'm-padcha-seafood', cat: 'c-padcha', order: 20, th: 'ทะเลผัดฉ่า', en: 'Mixed seafood Pad Cha', zh: '香辣炒海鲜',
    ingTh: 'ทะเลรวม, พริกแกง, กระชาย, ใบกะเพรา, พริกไทยอ่อน',
    ingEn: 'mixed seafood, red curry paste, fingerroot, holy basil, green peppercorn',
    ingZh: '海鲜什锦、咖喱酱、沙姜、打抛叶、青胡椒',
    price: 220, spicy: 4, allergens: [CRUST, MOLL, FISH, NAMPLA], may: [GLUTEN],
    tags: ['ผัดฉ่า', 'ทะเล', 'เผ็ด', 'pad cha'] },

  // ── ยำ & ส้มตำ ───────────────────────────────────────────
  { id: 'm-somtam-thai', cat: 'c-yam', order: 10, th: 'ส้มตำไทย', en: 'Som Tam Thai', zh: '泰式青木瓜沙拉',
    ingTh: 'มะละกอ, มะเขือเทศ, ถั่วฝักยาว, กุ้งแห้ง, ถั่วลิสง, น้ำปลา, มะนาว, พริก',
    ingEn: 'green papaya, tomato, long bean, dried shrimp, peanuts, fish sauce, lime, chilli',
    ingZh: '青木瓜、番茄、豇豆、虾米、花生、鱼露、青柠、辣椒',
    price: 100, spicy: 4, allergens: [CRUST, PEANUT, NAMPLA],
    tags: ['ส้มตำ', 'เผ็ด', 'som tam', 'spicy'],
    groups: [pick('g-somtam-style', 'เลือกแบบ', 'Choose', '选择', [
      opt('o-st-thai', 'ส้มตำไทย', 'Som Tam Thai', '泰式'),
      opt('o-st-crab', 'ส้มตำไทย + ปู', 'With salted crab', '加咸蟹'),
      opt('o-st-saltedegg', 'ส้มตำไทยไข่เค็ม', 'With salted egg', '加咸蛋'),
      opt('o-st-hoidong', 'ส้มตำหอยดอง', 'With pickled clams', '加腌蛤'),
      opt('o-st-plara', 'ส้มตำปลาร้า', 'With fermented fish', '加鱼酱'),
      opt('o-st-crabplara', 'ส้มตำปู + ปลาร้า', 'Salted crab and fermented fish', '咸蟹与鱼酱'),
    ])] },
  { id: 'm-somtam-bluecrab', cat: 'c-yam', order: 20, th: 'ส้มตำปูม้า', en: 'Som Tam with blue crab', zh: '梭子蟹木瓜沙拉',
    ingTh: 'มะละกอ, ปูม้า, มะเขือเทศ, ถั่วฝักยาว, น้ำปลา, มะนาว, พริก',
    ingEn: 'green papaya, blue swimming crab, tomato, long bean, fish sauce, lime, chilli',
    ingZh: '青木瓜、梭子蟹、番茄、豇豆、鱼露、青柠、辣椒',
    price: 190, spicy: 4, allergens: [CRUST, NAMPLA], may: [PEANUT],
    tags: ['ส้มตำ', 'ปูม้า', 'เผ็ด', 'som tam'] },
  { id: 'm-somtam-horseshoe', cat: 'c-yam', order: 30, th: 'ส้มตำไข่แมงดา', en: 'Som Tam with horseshoe crab roe', zh: '鲎卵木瓜沙拉',
    ingTh: 'มะละกอ, ไข่แมงดา, น้ำปลา, มะนาว, พริก',
    ingEn: 'green papaya, horseshoe crab roe, fish sauce, lime, chilli',
    ingZh: '青木瓜、鲎卵、鱼露、青柠、辣椒',
    price: 250, spicy: 4, allergens: [CRUST, NAMPLA], may: [PEANUT],
    tags: ['ส้มตำ', 'ไข่แมงดา', 'เผ็ด'],
    groups: [pick('g-somtam-hs', 'เลือกแบบ', 'Choose', '选择', [
      opt('o-sthc-plain', 'ไข่แมงดา', 'Horseshoe crab roe', '鲎卵', 0),
      opt('o-sthc-crab', 'ไข่แมงดา + ปูม้า', 'With blue crab', '加梭子蟹', 140),
    ])] },
  { id: 'm-yam-horseshoe', cat: 'c-yam', order: 40, th: 'ยำไข่แมงดา', en: 'Horseshoe crab roe salad', zh: '凉拌鲎卵',
    ingTh: 'ไข่แมงดา, หอมแดง, ตะไคร้, พริก, มะนาว, น้ำปลา',
    ingEn: 'horseshoe crab roe, shallot, lemongrass, chilli, lime, fish sauce',
    ingZh: '鲎卵、红葱、香茅、辣椒、青柠、鱼露',
    price: 250, spicy: 4, allergens: [CRUST, NAMPLA], tags: ['ยำ', 'เผ็ด'] },
  { id: 'm-yam-seafood', cat: 'c-yam', order: 50, th: 'ยำทะเล', en: 'Spicy seafood salad', zh: '凉拌海鲜',
    ingTh: 'กุ้ง, หมึก, หอย, หอมแดง, ขึ้นฉ่าย, พริก, มะนาว, น้ำปลา',
    ingEn: 'prawn, squid, shellfish, shallot, celery, chilli, lime, fish sauce',
    ingZh: '虾、鱿鱼、贝类、红葱、芹菜、辣椒、青柠、鱼露',
    price: 220, spicy: 4, allergens: [CRUST, MOLL, NAMPLA], may: [FISH],
    tags: ['ยำ', 'ทะเล', 'เผ็ด', 'spicy salad'] },
  { id: 'm-yam-glassnoodle', cat: 'c-yam', order: 60, th: 'ยำวุ้นเส้น', en: 'Spicy glass noodle salad', zh: '凉拌粉丝',
    ingTh: 'วุ้นเส้น, กุ้ง, หมูสับ, ขึ้นฉ่าย, พริก, มะนาว, น้ำปลา',
    ingEn: 'glass noodles, prawn, minced pork, celery, chilli, lime, fish sauce',
    ingZh: '粉丝、虾、猪肉末、芹菜、辣椒、青柠、鱼露',
    price: 220, spicy: 4, allergens: [CRUST, PORK, NAMPLA], may: [MOLL],
    tags: ['ยำ', 'วุ้นเส้น', 'เผ็ด'] },
  { id: 'm-yam-cockle', cat: 'c-yam', order: 70, th: 'ยำหอยแครง', en: 'Spicy cockle salad', zh: '凉拌血蛤',
    ingTh: 'หอยแครง, ตะไคร้, หอมแดง, พริก, มะนาว, น้ำปลา',
    ingEn: 'cockle, lemongrass, shallot, chilli, lime, fish sauce',
    ingZh: '血蛤、香茅、红葱、辣椒、青柠、鱼露',
    price: 200, spicy: 4, allergens: [MOLL, NAMPLA], tags: ['ยำ', 'หอยแครง', 'เผ็ด'] },
  { id: 'm-yam-oyster-full', cat: 'c-yam', order: 80, th: 'ยำหอยนางรมทรงเครื่อง', en: 'Oyster salad with condiments', zh: '什锦凉拌生蚝',
    ingTh: 'หอยนางรม, หอมแดง, ตะไคร้, ขึ้นฉ่าย, พริก, มะนาว, น้ำปลา',
    ingEn: 'oyster, shallot, lemongrass, celery, chilli, lime, fish sauce',
    ingZh: '生蚝、红葱、香茅、芹菜、辣椒、青柠、鱼露',
    price: 200, spicy: 4, allergens: [MOLL, NAMPLA], tags: ['ยำ', 'หอยนางรม', 'เผ็ด'] },
  { id: 'm-yam-bluecrab', cat: 'c-yam', order: 90, th: 'ยำปูม้า', en: 'Spicy blue crab salad', zh: '凉拌梭子蟹',
    ingTh: 'ปูม้า, หอมแดง, ขึ้นฉ่าย, พริก, มะนาว, น้ำปลา',
    ingEn: 'blue swimming crab, shallot, celery, chilli, lime, fish sauce',
    ingZh: '梭子蟹、红葱、芹菜、辣椒、青柠、鱼露',
    price: 250, spicy: 4, allergens: [CRUST, NAMPLA], tags: ['ยำ', 'ปูม้า', 'เผ็ด'] },

  // ── ต้มยำ & ต้มส้ม ───────────────────────────────────────
  {
    id: 'm-tomyum-prawn', cat: 'c-tomyum', order: 10,
    th: 'ต้มยำกุ้ง', en: 'Tom Yum Goong', zh: '冬阴功汤',
    ingTh: 'กุ้ง, ตะไคร้, ใบมะกรูด, ข่า, พริก, เห็ด, น้ำปลา, มะนาว',
    ingEn: 'prawn, lemongrass, kaffir lime leaf, galangal, chilli, mushroom, fish sauce, lime',
    ingZh: '虾、香茅、青柠叶、南姜、辣椒、蘑菇、鱼露、青柠',
    price: 200, spicy: 4, allergens: [CRUST, NAMPLA], may: [MOLL, FISH, DAIRY],
    tags: ['ต้มยำ', 'กุ้ง', 'เผ็ด', 'ซิกเนเจอร์', 'tom yum', 'signature'],
    groups: [
      pick('g-tomyum-prawn-broth', 'น้ำซุป', 'Broth', '汤底', [
        opt('o-typ-clear', 'น้ำใส', 'Clear', '清汤', 0),
        opt('o-typ-creamy', 'น้ำข้น', 'Creamy', '浓汤', 0),
      ]),
      sizeBowl('tomyum-prawn', 50),
    ],
  },
  {
    id: 'm-tomyum-seafood', cat: 'c-tomyum', order: 20,
    th: 'ต้มยำทะเล', en: 'Tom Yum with mixed seafood', zh: '海鲜冬阴汤',
    ingTh: 'ทะเลรวม, ตะไคร้, ใบมะกรูด, ข่า, พริก, เห็ด, น้ำปลา, มะนาว',
    ingEn: 'mixed seafood, lemongrass, kaffir lime leaf, galangal, chilli, mushroom, fish sauce, lime',
    ingZh: '海鲜什锦、香茅、青柠叶、南姜、辣椒、蘑菇、鱼露、青柠',
    price: 200, spicy: 4, allergens: [CRUST, MOLL, FISH, NAMPLA], may: [DAIRY],
    tags: ['ต้มยำ', 'ทะเล', 'เผ็ด', 'tom yum'],
    groups: [
      pick('g-tomyum-sf-broth', 'น้ำซุป', 'Broth', '汤底', [
        opt('o-tys-clear', 'น้ำใส', 'Clear', '清汤', 0),
        opt('o-tys-creamy', 'น้ำข้น', 'Creamy', '浓汤', 0),
      ]),
      sizeBowl('tomyum-seafood', 50),
    ],
  },
  {
    id: 'm-tomyum-squid', cat: 'c-tomyum', order: 30,
    th: 'ต้มยำหมึก', en: 'Tom Yum with squid', zh: '鱿鱼冬阴汤',
    ingTh: 'หมึก, ตะไคร้, ใบมะกรูด, ข่า, พริก, น้ำปลา, มะนาว',
    ingEn: 'squid, lemongrass, kaffir lime leaf, galangal, chilli, fish sauce, lime',
    ingZh: '鱿鱼、香茅、青柠叶、南姜、辣椒、鱼露、青柠',
    price: 200, spicy: 4, allergens: [MOLL, NAMPLA], may: [CRUST, FISH, DAIRY],
    tags: ['ต้มยำ', 'หมึก', 'เผ็ด'],
    groups: [
      pick('g-tomyum-squid-broth', 'น้ำซุป', 'Broth', '汤底', [
        opt('o-tyq-clear', 'น้ำใส', 'Clear', '清汤', 0),
        opt('o-tyq-creamy', 'น้ำข้น', 'Creamy', '浓汤', 0),
      ]),
      sizeBowl('tomyum-squid', 50),
    ],
  },
  {
    id: 'm-tomyum-fish', cat: 'c-tomyum', order: 40,
    th: 'ต้มยำ / ต้มส้มปลา', en: 'Tom Yum or Tom Som with fish', zh: '冬阴鱼汤／酸汤鱼',
    descTh: 'ราคาขึ้นกับชนิดปลาที่เลือก', descEn: 'Price depends on the fish',
    ingTh: 'เนื้อปลา, ตะไคร้, ใบมะกรูด, ข่า, พริก, ระกำ, น้ำปลา, มะนาว',
    ingEn: 'fish, lemongrass, kaffir lime leaf, galangal, chilli, rakam fruit, fish sauce, lime',
    ingZh: '鱼肉、香茅、青柠叶、南姜、辣椒、酸果、鱼露、青柠',
    price: 200, spicy: 4, allergens: [FISH, NAMPLA], may: [CRUST, MOLL, DAIRY],
    tags: ['ต้มยำ', 'ต้มส้ม', 'ปลา', 'เผ็ด'],
    groups: [
      pick('g-tomyum-fish-type', 'เลือกปลา', 'Choose fish', '选择鱼类', [
        opt('o-tyf-seabass', 'ปลากระพง', 'Sea bass', '金目鲈', 0),
        opt('o-tyf-mackerel', 'ปลาทู', 'Short mackerel', '鲭鱼', 0),
        opt('o-tyf-shark', 'ปลาฉลาม', 'Shark', '鲨鱼', 50),
        opt('o-tyf-ray', 'ปลากระเบน', 'Stingray', '魔鬼鱼', 50),
        opt('o-tyf-grouper', 'ปลาเก๋า', 'Grouper', '石斑鱼', 30),
      ]),
      pick('g-tomyum-fish-broth', 'น้ำซุป', 'Broth', '汤底', [
        opt('o-tyf-clear', 'ต้มยำน้ำใส', 'Clear Tom Yum', '清冬阴', 0),
        opt('o-tyf-creamy', 'ต้มยำน้ำข้น', 'Creamy Tom Yum', '浓冬阴', 0),
        opt('o-tyf-som', 'ต้มส้มระกำ', 'Tom Som with rakam', '酸汤', 0),
      ]),
      sizeBowl('tomyum-fish', 60),
    ],
  },

  // ── แกง ──────────────────────────────────────────────────
  {
    id: 'm-kaengsom', cat: 'c-curry', order: 10,
    th: 'แกงส้ม', en: 'Sour orange curry', zh: '酸咖喱',
    descTh: 'เลือกเนื้อและผักได้', descEn: 'Choose your protein and vegetable',
    ingTh: 'พริกแกงส้ม, น้ำมะขาม, กะปิ, น้ำปลา, ผักตามเลือก',
    ingEn: 'sour curry paste, tamarind, shrimp paste, fish sauce, chosen vegetable',
    ingZh: '酸咖喱酱、罗望子、虾酱、鱼露、时蔬',
    price: 200, spicy: 4, allergens: [CRUST, NAMPLA, FISH],
    tags: ['แกงส้ม', 'เผ็ด', 'sour curry'],
    groups: [
      pick('g-kaengsom-protein', 'เลือกเนื้อ', 'Choose protein', '选择主料', [
        opt('o-ks-prawn', 'กุ้ง', 'Prawn', '虾', 0),
        opt('o-ks-seabass', 'ปลากระพง', 'Sea bass', '金目鲈', 0),
        opt('o-ks-mullet', 'ปลากระบอก', 'Mullet', '乌鱼', 0),
        opt('o-ks-grouper', 'ปลาเก๋า', 'Grouper', '石斑鱼', 50),
        opt('o-ks-roe', 'ไข่ปลาริวกิว', 'Ryukyu fish roe', '鱼卵', 200),
        opt('o-ks-roefish', 'ไข่ปลา + เนื้อปลา', 'Fish roe and fish', '鱼卵与鱼肉', 300),
      ]),
      pick('g-kaengsom-veg', 'เลือกผัก', 'Choose vegetable', '选择时蔬', [
        opt('o-ksv-mixed', 'ผักรวม', 'Mixed vegetables', '什锦时蔬'),
        opt('o-ksv-bamboo', 'หน่อไม้', 'Bamboo shoot', '竹笋'),
        opt('o-ksv-coconut', 'ยอดมะพร้าว', 'Coconut heart', '椰芯'),
        opt('o-ksv-kaffir', 'ใบมะกรูด', 'Kaffir lime leaf', '青柠叶'),
      ]),
      sizeBowl('kaengsom', 50),
    ],
  },
  {
    id: 'm-kaengpa', cat: 'c-curry', order: 20,
    th: 'แกงป่าปลา', en: 'Jungle curry with fish', zh: '丛林咖喱鱼',
    descTh: 'แกงไม่ใส่กะทิ เผ็ดจัด', descEn: 'Coconut-free curry, very spicy', descZh: '不加椰浆，非常辣',
    ingTh: 'เนื้อปลา, พริกแกงป่า, กระชาย, พริกไทยอ่อน, ใบมะกรูด, มะเขือ, น้ำปลา',
    ingEn: 'fish, jungle curry paste, fingerroot, green peppercorn, kaffir lime leaf, aubergine, fish sauce',
    ingZh: '鱼肉、丛林咖喱酱、沙姜、青胡椒、青柠叶、茄子、鱼露',
    price: 250, spicy: 5, allergens: [FISH, NAMPLA, CRUST], may: [MOLL],
    tags: ['แกงป่า', 'เผ็ดมาก', 'jungle curry'],
    groups: [pick('g-kaengpa-fish', 'เลือกปลา', 'Choose fish', '选择鱼类', [
      opt('o-kp-whiting', 'ปลาเห็ดโคน', 'Sand whiting', '沙钻鱼'),
      opt('o-kp-catfish', 'ปลาดุกทะเล', 'Sea catfish', '海鲶鱼'),
    ])],
  },

  // ── ต้มจืด ───────────────────────────────────────────────
  {
    id: 'm-soup-tofu-pork', cat: 'c-soup', order: 10,
    th: 'แกงจืดเต้าหู้สาหร่าย หมูสับ', en: 'Clear soup, tofu, seaweed and minced pork', zh: '豆腐紫菜猪肉清汤',
    ingTh: 'เต้าหู้, สาหร่าย, หมูสับ, ต้นหอม, ซีอิ๊ว',
    ingEn: 'tofu, seaweed, minced pork, spring onion, soy sauce', ingZh: '豆腐、紫菜、猪肉末、葱、酱油',
    price: 150, allergens: [SOY, PORK, EGG], may: KITCHEN_CROSS,
    tags: ['แกงจืด', 'ไม่เผ็ด', 'เด็ก', 'clear soup', 'kids'],
    groups: [sizeBowl('soup-tofu-pork', 50)],
  },
  {
    id: 'm-soup-tofu-seafood', cat: 'c-soup', order: 20,
    th: 'แกงจืดเต้าหู้สาหร่ายทะเล', en: 'Clear soup, tofu, seaweed and seafood', zh: '豆腐紫菜海鲜清汤',
    ingTh: 'เต้าหู้, สาหร่าย, กุ้ง, หมึก, ต้นหอม, ซีอิ๊ว',
    ingEn: 'tofu, seaweed, prawn, squid, spring onion, soy sauce', ingZh: '豆腐、紫菜、虾、鱿鱼、葱、酱油',
    price: 200, allergens: [SOY, CRUST, MOLL], may: [FISH, EGG],
    tags: ['แกงจืด', 'ไม่เผ็ด', 'ทะเล', 'clear soup'],
    groups: [sizeBowl('soup-tofu-seafood', 50)],
  },

  // ── ผัดผัก ───────────────────────────────────────────────
  { id: 'm-morningglory', cat: 'c-veg', order: 10, th: 'ผัดผักบุ้งไฟแดง', en: 'Stir-fried morning glory', zh: '炒空心菜',
    ingTh: 'ผักบุ้ง, กระเทียม, พริก, เต้าเจี้ยว, น้ำปลา',
    ingEn: 'morning glory, garlic, chilli, fermented soybean, fish sauce',
    ingZh: '空心菜、蒜、辣椒、豆酱、鱼露',
    price: 100, spicy: 2, allergens: [SOY, NAMPLA, CRUST], may: KITCHEN_CROSS,
    tags: ['ผัก', 'ผักบุ้ง', 'vegetable'] },
  { id: 'm-cabbage-fishsauce', cat: 'c-veg', order: 20, th: 'กะหล่ำปลีน้ำปลา', en: 'Cabbage stir-fried in fish sauce', zh: '鱼露炒卷心菜',
    ingTh: 'กะหล่ำปลี, กระเทียม, น้ำปลา', ingEn: 'cabbage, garlic, fish sauce', ingZh: '卷心菜、蒜、鱼露',
    price: 120, allergens: [NAMPLA], may: KITCHEN_CROSS, tags: ['ผัก', 'vegetable'] },
  { id: 'm-kale-oyster', cat: 'c-veg', order: 30, th: 'คะน้าน้ำมันหอย', en: 'Chinese kale in oyster sauce', zh: '蚝油芥兰',
    ingTh: 'คะน้า, น้ำมันหอย, กระเทียม, ซีอิ๊ว', ingEn: 'Chinese kale, oyster sauce, garlic, soy sauce',
    ingZh: '芥兰、蚝油、蒜、酱油',
    price: 120, allergens: [MOLL, SOY], may: [...KITCHEN_CROSS, GLUTEN], tags: ['ผัก', 'คะน้า', 'vegetable'] },
  { id: 'm-kale-saltedfish', cat: 'c-veg', order: 40, th: 'คะน้าปลาเค็ม', en: 'Chinese kale with salted fish', zh: '咸鱼芥兰',
    ingTh: 'คะน้า, ปลาเค็ม, กระเทียม, พริก', ingEn: 'Chinese kale, salted fish, garlic, chilli',
    ingZh: '芥兰、咸鱼、蒜、辣椒',
    price: 160, spicy: 1, allergens: [FISH, NAMPLA, SOY], may: [CRUST, MOLL], tags: ['ผัก', 'คะน้า'] },
  { id: 'm-mixedveg', cat: 'c-veg', order: 50, th: 'ผัดผักรวม', en: 'Stir-fried mixed vegetables', zh: '炒什锦时蔬',
    ingTh: 'ผักรวม, น้ำมันหอย, กระเทียม, ซีอิ๊ว', ingEn: 'mixed vegetables, oyster sauce, garlic, soy sauce',
    ingZh: '什锦时蔬、蚝油、蒜、酱油',
    price: 120, allergens: [MOLL, SOY], may: [...KITCHEN_CROSS, GLUTEN], tags: ['ผัก', 'vegetable'] },
  { id: 'm-mixedveg-seafood', cat: 'c-veg', order: 60, th: 'ผัดผักรวม กุ้ง / ทะเล', en: 'Mixed vegetables with prawn or seafood', zh: '海鲜炒时蔬',
    ingTh: 'ผักรวม, กุ้งหรือทะเลรวม, น้ำมันหอย, กระเทียม',
    ingEn: 'mixed vegetables, prawn or mixed seafood, oyster sauce, garlic',
    ingZh: '什锦时蔬、虾或海鲜、蚝油、蒜',
    price: 230, allergens: [CRUST, MOLL, SOY], may: [FISH, GLUTEN], tags: ['ผัก', 'ทะเล'],
    groups: [pick('g-mixedveg-protein', 'เลือกวัตถุดิบ', 'Choose', '选择', [
      opt('o-mvp-prawn', 'กุ้ง', 'Prawn', '虾'),
      opt('o-mvp-seafood', 'ทะเลรวม', 'Mixed seafood', '海鲜什锦'),
    ])] },
  { id: 'm-strawmushroom-seafood', cat: 'c-veg', order: 70, th: 'ผัดเห็ดฟาง กุ้ง / ทะเล', en: 'Straw mushrooms with prawn or seafood', zh: '海鲜炒草菇',
    ingTh: 'เห็ดฟาง, กุ้งหรือทะเลรวม, น้ำมันหอย, กระเทียม',
    ingEn: 'straw mushroom, prawn or mixed seafood, oyster sauce, garlic',
    ingZh: '草菇、虾或海鲜、蚝油、蒜',
    price: 230, allergens: [CRUST, MOLL, SOY], may: [FISH, GLUTEN], tags: ['เห็ด', 'ทะเล'],
    groups: [pick('g-strawmush-protein', 'เลือกวัตถุดิบ', 'Choose', '选择', [
      opt('o-smp-prawn', 'กุ้ง', 'Prawn', '虾'),
      opt('o-smp-seafood', 'ทะเลรวม', 'Mixed seafood', '海鲜什锦'),
    ])] },

  // ── ออส่วน ───────────────────────────────────────────────
  { id: 'm-orsuan-oyster', cat: 'c-orsuan', order: 10, th: 'ออส่วนหอย', en: 'Oyster omelette', zh: '蚝烙',
    ingTh: 'หอยนางรม, แป้ง, ไข่, ถั่วงอก, ซอสพริก',
    ingEn: 'oyster, flour, egg, bean sprout, chilli sauce', ingZh: '生蚝、面粉、鸡蛋、豆芽、辣椒酱',
    price: 250, allergens: [MOLL, EGG, GLUTEN], may: [CRUST, FISH], tags: ['ออส่วน', 'oyster omelette'] },
  { id: 'm-orsuan-crab', cat: 'c-orsuan', order: 20, th: 'ออส่วนปู', en: 'Crab omelette', zh: '蟹肉烙',
    ingTh: 'เนื้อปู, แป้ง, ไข่, ถั่วงอก, ซอสพริก',
    ingEn: 'crab meat, flour, egg, bean sprout, chilli sauce', ingZh: '蟹肉、面粉、鸡蛋、豆芽、辣椒酱',
    price: 350, allergens: [CRUST, EGG, GLUTEN], may: [MOLL, FISH], tags: ['ออส่วน', 'ปู'] },
  { id: 'm-orsuan-mix', cat: 'c-orsuan', order: 30, th: 'ออส่วนปู + หอย', en: 'Crab and oyster omelette', zh: '蟹肉生蚝烙',
    ingTh: 'เนื้อปู, หอยนางรม, แป้ง, ไข่, ถั่วงอก',
    ingEn: 'crab meat, oyster, flour, egg, bean sprout', ingZh: '蟹肉、生蚝、面粉、鸡蛋、豆芽',
    price: 390, allergens: [CRUST, MOLL, EGG, GLUTEN], may: [FISH], tags: ['ออส่วน'] },

  // ── ดองน้ำปลา ────────────────────────────────────────────
  { id: 'm-crabroe-fishsauce', cat: 'c-dong', order: 10, th: 'ปูทะเลไข่ดองน้ำปลา', en: 'Sea crab roe cured in fish sauce', zh: '鱼露腌蟹膏',
    descTh: 'เสิร์ฟดิบ · ราคาตามขนาด', descEn: 'Served raw. Price by size.', descZh: '生食，按规格计价',
    ingTh: 'ปูทะเลไข่, น้ำปลา, กระเทียม, พริก, มะนาว',
    ingEn: 'roe crab, fish sauce, garlic, chilli, lime', ingZh: '蟹膏、鱼露、蒜、辣椒、青柠',
    price: 350, spicy: 3, allergens: [CRUST, NAMPLA],
    tags: ['ดองน้ำปลา', 'ดิบ', 'ปู', 'raw'],
    groups: [pick('g-crabroe-size', 'ขนาด', 'Size', '规格', [
      opt('o-cr-1', 'ขนาด 1', 'Size 1', '规格一', 0),
      opt('o-cr-2', 'ขนาด 2', 'Size 2', '规格二', 50),
      opt('o-cr-3', 'ขนาด 3', 'Size 3', '规格三', 100),
      opt('o-cr-4', 'ขนาด 4', 'Size 4', '规格四', 150),
    ])] },
  { id: 'm-bluecrabroe-fishsauce', cat: 'c-dong', order: 20, th: 'ปูม้าไข่ดองน้ำปลา', en: 'Blue crab roe cured in fish sauce', zh: '鱼露腌梭子蟹膏',
    descTh: 'เสิร์ฟดิบ', descEn: 'Served raw', descZh: '生食',
    ingTh: 'ปูม้าไข่, น้ำปลา, กระเทียม, พริก, มะนาว',
    ingEn: 'blue crab roe, fish sauce, garlic, chilli, lime', ingZh: '梭子蟹膏、鱼露、蒜、辣椒、青柠',
    price: 300, spicy: 3, allergens: [CRUST, NAMPLA], tags: ['ดองน้ำปลา', 'ดิบ', 'ปูม้า', 'raw'] },

  // ── หมูหัน ───────────────────────────────────────────────
  {
    id: 'm-roastpig', cat: 'c-porkroast', order: 10,
    th: 'หมูหัน', en: 'Roast suckling pig', zh: '烤乳猪',
    descTh: 'หนังกรอบ หอมอร่อย เนื้อนุ่ม ไม่มัน · ย่างเตาถ่าน หมักเครื่องเทศสูตรพิเศษ · กรุณาสั่งล่วงหน้า · รอประมาณ 2 ชั่วโมงหลังยืนยันออเดอร์',
    descEn: 'Crisp skin, tender meat, charcoal-roasted with a house spice marinade. Please order in advance — allow about 2 hours after the order is confirmed.',
    descZh: '皮脆肉嫩，炭火烤制，特调香料腌制。请提前预订，确认订单后约需 2 小时。',
    ingTh: 'หมูหันทั้งตัว, เครื่องเทศหมัก, น้ำจิ้ม',
    ingEn: 'whole suckling pig, spice marinade, dipping sauce', ingZh: '整只乳猪、香料腌料、蘸酱',
    price: 2500, leadHours: 6, allergens: [PORK, SOY], may: [GLUTEN, SESAME],
    tags: ['หมูหัน', 'ปาร์ตี้', 'สั่งล่วงหน้า', 'roast pig', 'party'],
    groups: [
      pick('g-roastpig-size', 'ขนาด', 'Size', '份量', [
        opt('o-rp-3-5', 'สำหรับ 3-5 คน', 'For 3-5 people', '3-5 人份', 0),
        opt('o-rp-10', 'สำหรับ 10 คน', 'For 10 people', '10 人份', 1000),
        opt('o-rp-15', 'สำหรับ 15 คน', 'For 15 people', '15 人份', 2000),
        opt('o-rp-20-30', 'สำหรับ 20-30 คน', 'For 20-30 people', '20-30 人份', 3500),
      ]),
      // The kitchen will come and grill on site: 500 THB per pig, six hours' notice.
      pick('g-roastpig-grill', 'บริการเสริม', 'Add-on service', '增值服务', [
        opt('o-rp-nogrill', 'ไม่ต้องมาย่างให้', 'No on-site grilling', '不需要现场烤制', 0),
        opt('o-rp-grill', 'ให้ร้านมาย่างให้ (สั่งล่วงหน้า 6 ชม.)', 'Staff grill on site, six hours ahead', '店家上门烤制（需提前 6 小时）', 500),
      ]),
    ],
  },
  { id: 'm-dipping-sauce', cat: 'c-porkroast', order: 20,
    th: 'น้ำจิ้มเพิ่ม (เซต 20 ถ้วย)', en: 'Extra dipping sauce, set of 20 cups', zh: '加购蘸酱（20 杯）',
    descTh: 'เซตหมูหันมีน้ำจิ้มให้อยู่แล้ว สั่งเพิ่มเมื่อต้องการมากกว่าที่ให้มา',
    descEn: 'The roast suckling pig set already comes with dipping sauce — add this only if you want more.',
    descZh: '烤乳猪套餐已附蘸酱，需要更多时再加购。',
    ingTh: 'พริก, กระเทียม, มะนาว, น้ำปลา, น้ำตาล',
    ingEn: 'chilli, garlic, lime, fish sauce, sugar', ingZh: '辣椒、蒜、青柠、鱼露、糖',
    price: 100, spicy: 2, allergens: [NAMPLA], may: KITCHEN_CROSS,
    tags: ['น้ำจิ้ม', 'หมูหัน', 'dipping sauce'] },

  // ── อาหารเช้า ────────────────────────────────────────────
  {
    id: 'm-bf-congee-set', cat: 'c-breakfast', order: 10,
    th: 'ข้าวต้มทรงเครื่อง (สำหรับ 16 ท่าน)', en: 'Rice soup set for 16', zh: '什锦粥（16 人份）',
    descTh: 'สั่งล่วงหน้าไม่เกิน 17:00 น. ของวันก่อนจัดส่ง · ขั้นต่ำ 16 ท่าน · ส่งถึงไม่เกิน 08:30 น. · ชำระเงินก่อนเพื่อยืนยันออเดอร์ · ต้องการจำนวนอื่น ติดต่อแอดมินโดยตรง',
    descEn: 'Order by 17:00 the day before. Minimum 16 guests. Delivered by 08:30. Payment upfront confirms the order; for other quantities, contact the admin directly.',
    descZh: '需于前一天 17:00 前预订，最少 16 位，08:30 前送达。需先付款以确认订单；如需其他数量，请直接联系管理员。',
    ingTh: 'ข้าวสวย, ขึ้นฉ่าย, กระเทียมเจียว, ขิง, น้ำปลา',
    ingEn: 'rice, celery, fried garlic, ginger, fish sauce', ingZh: '米饭、芹菜、炸蒜、姜、鱼露',
    price: 1000, allergens: [NAMPLA], may: KITCHEN_CROSS,
    tags: ['อาหารเช้า', 'สั่งล่วงหน้า', 'breakfast', 'set'],
    groups: [
      pick('g-bf-congee-protein', 'เลือกเนื้อ', 'Choose protein', '选择主料', [
        opt('o-bfc-pork', 'หมู', 'Pork', '猪肉', 0),
        opt('o-bfc-prawn', 'กุ้ง', 'Prawn', '虾', 200),
        opt('o-bfc-seafood', 'ทะเล', 'Seafood', '海鲜', 200),
      ]),
      pick('g-bf-congee-extra', 'เพิ่มไส้กรอก + ไข่ดาว', 'Add sausage and fried egg', '加香肠与煎蛋', [
        opt('o-bfe-no', 'ไม่เพิ่ม', 'No', '不加', 0),
        opt('o-bfe-yes', 'เพิ่ม', 'Yes', '加', 400),
      ]),
    ],
  },
  {
    id: 'm-bf-abf', cat: 'c-breakfast', order: 20,
    th: 'ชุด ABF', en: 'American breakfast set', zh: '美式早餐套餐',
    descTh: 'ไส้กรอก + ไข่ดาว + แฮม + กาแฟ + โอวัลติน · ราคาต่อ 1 ชุด · ขั้นต่ำ 5 ชุด · ชำระเงินก่อนเพื่อยืนยันออเดอร์ · ต้องการจำนวนอื่น ติดต่อแอดมินโดยตรง',
    descEn: 'Sausage, fried egg, ham, coffee and Ovaltine. Price per set, minimum 5 sets. Payment upfront confirms the order; for other quantities, contact the admin directly.',
    descZh: '香肠、煎蛋、火腿、咖啡与阿华田。每套价格，最少 5 套。需先付款以确认订单；如需其他数量，请直接联系管理员。',
    ingTh: 'ไส้กรอก, ไข่ไก่, แฮม, ขนมปัง, กาแฟ, โอวัลติน, นม',
    ingEn: 'sausage, egg, ham, bread, coffee, Ovaltine, milk',
    ingZh: '香肠、鸡蛋、火腿、面包、咖啡、阿华田、牛奶',
    price: 259, minQty: 5, allergens: [PORK, EGG, DAIRY, GLUTEN, SOY],
    tags: ['อาหารเช้า', 'ABF', 'breakfast', 'set'],
  },

  // ── เครื่องดื่ม ──────────────────────────────────────────
  { id: 'm-water-pack', cat: 'c-drink', order: 10, orderUntil: '17:00', th: 'น้ำเปล่า (แพ็ค 12 ขวด)', en: 'Drinking water, pack of 12', zh: '瓶装水（12 瓶装）',
    ingTh: 'น้ำดื่ม', ingEn: 'drinking water', ingZh: '饮用水',
    price: 65, veg: true, tags: ['น้ำ', 'water'] },
  { id: 'm-coke', cat: 'c-drink', order: 20, orderUntil: '17:00', th: 'โค้ก 1.5 ลิตร', en: 'Coca-Cola 1.5L', zh: '可口可乐 1.5 升',
    price: 45, veg: true, tags: ['น้ำอัดลม', 'coke', 'soft drink'],
    groups: [pick('g-coke-qty', 'จำนวน', 'Quantity', '数量', [
      opt('o-coke-1', '1 ขวด', 'Single bottle', '单瓶', 0),
      opt('o-coke-12', 'แพ็ค 12 ขวด', 'Pack of 12', '12 瓶装', 405),
    ])] },
  { id: 'm-pepsi', cat: 'c-drink', order: 30, orderUntil: '17:00', th: 'เป๊ปซี่ 1.5 ลิตร', en: 'Pepsi 1.5L', zh: '百事可乐 1.5 升',
    price: 45, veg: true, tags: ['น้ำอัดลม', 'pepsi', 'soft drink'],
    groups: [pick('g-pepsi-qty', 'จำนวน', 'Quantity', '数量', [
      opt('o-pepsi-1', '1 ขวด', 'Single bottle', '单瓶', 0),
      opt('o-pepsi-12', 'แพ็ค 12 ขวด', 'Pack of 12', '12 瓶装', 405),
    ])] },
  { id: 'm-soda', cat: 'c-drink', order: 40, orderUntil: '17:00', th: 'โซดา', en: 'Soda water', zh: '苏打水',
    price: 15, veg: true, tags: ['โซดา', 'soda'],
    groups: [pick('g-soda-qty', 'จำนวน', 'Quantity', '数量', [
      opt('o-soda-1', '1 ขวด', 'Single bottle', '单瓶', 0),
      opt('o-soda-tray', 'ถาด', 'Tray', '一托', 245),
    ])] },

  // ── เบียร์ & เหล้า ───────────────────────────────────────
  { id: 'm-beer-singha', cat: 'c-beer', order: 10, orderUntil: '17:00', th: 'เบียร์สิงห์', en: 'Singha beer', zh: '胜狮啤酒',
    descTh: 'จำหน่ายเฉพาะผู้มีอายุ 20 ปีขึ้นไป', descEn: 'Sold to persons aged 20 and over only',
    descZh: '仅售予 20 岁及以上人士',
    ingTh: 'เบียร์ (มอลต์, ข้าวบาร์เลย์)', ingEn: 'beer (malt, barley)', ingZh: '啤酒（麦芽、大麦）',
    price: 80, alcohol: true, allergens: [BOOZE, GLUTEN], tags: ['เบียร์', 'beer', 'แอลกอฮอล์'],
    groups: [pick('g-singha-qty', 'จำนวน', 'Quantity', '数量', [
      opt('o-singha-1', '1 ขวด', 'Single bottle', '单瓶', 0),
      opt('o-singha-case', 'ลัง', 'Case', '一箱', 780),
    ])] },
  { id: 'm-beer-leo', cat: 'c-beer', order: 20, orderUntil: '17:00', th: 'เบียร์ลีโอ', en: 'Leo beer', zh: 'Leo 啤酒',
    descTh: 'จำหน่ายเฉพาะผู้มีอายุ 20 ปีขึ้นไป', descEn: 'Sold to persons aged 20 and over only',
    ingTh: 'เบียร์ (มอลต์, ข้าวบาร์เลย์)', ingEn: 'beer (malt, barley)', ingZh: '啤酒（麦芽、大麦）',
    price: 75, alcohol: true, allergens: [BOOZE, GLUTEN], tags: ['เบียร์', 'beer', 'แอลกอฮอล์'],
    groups: [pick('g-leo-qty', 'จำนวน', 'Quantity', '数量', [
      opt('o-leo-1', '1 ขวด', 'Single bottle', '单瓶', 0),
      opt('o-leo-case', 'ลัง', 'Case', '一箱', 725),
    ])] },
  { id: 'm-beer-chang', cat: 'c-beer', order: 30, orderUntil: '17:00', th: 'เบียร์ช้าง', en: 'Chang beer', zh: '象牌啤酒',
    descTh: 'จำหน่ายเฉพาะผู้มีอายุ 20 ปีขึ้นไป', descEn: 'Sold to persons aged 20 and over only',
    ingTh: 'เบียร์ (มอลต์, ข้าวบาร์เลย์)', ingEn: 'beer (malt, barley)', ingZh: '啤酒（麦芽、大麦）',
    price: 70, alcohol: true, allergens: [BOOZE, GLUTEN], tags: ['เบียร์', 'beer', 'แอลกอฮอล์'],
    groups: [pick('g-chang-qty', 'จำนวน', 'Quantity', '数量', [
      opt('o-chang-1', '1 ขวด', 'Single bottle', '单瓶', 0),
      opt('o-chang-case', 'ลัง', 'Case', '一箱', 710),
    ])] },
  { id: 'm-spy', cat: 'c-beer', order: 40, orderUntil: '17:00', th: 'SPY Red / Purple', en: 'SPY wine cooler', zh: 'SPY 气泡酒',
    descTh: 'จำหน่ายเฉพาะผู้มีอายุ 20 ปีขึ้นไป', descEn: 'Sold to persons aged 20 and over only',
    price: 40, alcohol: true, allergens: [BOOZE], tags: ['SPY', 'แอลกอฮอล์', 'alcohol'],
    groups: [pick('g-spy-flavour', 'เลือกรส', 'Choose', '选择', [
      opt('o-spy-red', 'Red', 'Red', '红'),
      opt('o-spy-purple', 'Purple', 'Purple', '紫'),
    ])] },
  { id: 'm-regency', cat: 'c-beer', order: 50, orderUntil: '17:00', th: 'รีเจนซี่ (แบน)', en: 'Regency brandy, flat bottle', zh: 'Regency 白兰地（扁瓶）',
    descTh: 'จำหน่ายเฉพาะผู้มีอายุ 20 ปีขึ้นไป', descEn: 'Sold to persons aged 20 and over only',
    price: 420, alcohol: true, allergens: [BOOZE], tags: ['เหล้า', 'แอลกอฮอล์', 'spirits'] },

  // ── น้ำแข็ง & ถ่าน ───────────────────────────────────────
  { id: 'm-ice', cat: 'c-supply', order: 10, orderUntil: '17:00', th: 'น้ำแข็ง (กระสอบ)', en: 'Ice, per sack', zh: '冰块（一袋）',
    descTh: 'กรุณาสั่งก่อน 17:00 น.', descEn: 'Please order before 17:00', descZh: '请于 17:00 前订购',
    price: 100, veg: true, tags: ['น้ำแข็ง', 'ice'] },
  { id: 'm-charcoal', cat: 'c-supply', order: 20, orderUntil: '17:00', th: 'ถ่านปิ้งย่าง (ถุง)', en: 'Barbecue charcoal, per bag', zh: '烧烤木炭（一袋）',
    descTh: 'กรุณาสั่งก่อน 17:00 น.', descEn: 'Please order before 17:00', descZh: '请于 17:00 前订购',
    price: 40, veg: true, tags: ['ถ่าน', 'บาร์บีคิว', 'charcoal', 'bbq'] },
];

/** Sanity check run by the seed script before it writes anything. */
export function validate(): string[] {
  const problems: string[] = [];
  const catIds = new Set(CATEGORIES.map((c) => c.id));
  const allergenIds = new Set(ALLERGENS.map((a) => a.id));
  const itemIds = new Set<string>();
  const groupIds = new Set<string>();
  const optionIds = new Set<string>();

  for (const item of ITEMS) {
    if (itemIds.has(item.id)) problems.push(`duplicate item id: ${item.id}`);
    itemIds.add(item.id);

    if (!catIds.has(item.cat)) problems.push(`${item.id}: unknown category ${item.cat}`);

    for (const a of [...(item.allergens ?? []), ...(item.may ?? [])]) {
      if (!allergenIds.has(a)) problems.push(`${item.id}: unknown allergen ${a}`);
    }

    if (item.onRequest && item.price !== 0) {
      problems.push(`${item.id}: onRequest items must have price 0`);
    }
    if (!item.onRequest && item.price <= 0) {
      problems.push(`${item.id}: price must be greater than 0`);
    }

    for (const group of item.groups ?? []) {
      if (groupIds.has(group.id)) problems.push(`duplicate group id: ${group.id}`);
      groupIds.add(group.id);
      if (group.options.length === 0) problems.push(`${group.id}: group has no options`);
      for (const o of group.options) {
        if (optionIds.has(o.id)) problems.push(`duplicate option id: ${o.id}`);
        optionIds.add(o.id);
      }
    }
  }
  return problems;
}
