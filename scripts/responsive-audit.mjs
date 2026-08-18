/**
 * Finds admin pages that scroll sideways on a phone.
 *
 * Horizontal overflow is the failure that makes a page feel broken rather than
 * merely cramped: the layout is unusable and no amount of pinching fixes it.
 * This loads every admin page at a phone and a tablet width and reports the
 * widest offending elements, so a fix targets the actual node rather than a
 * guess.
 *
 *   node scripts/responsive-audit.mjs [base] [admin-password]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://pailay-food.vercel.app';
const PASSWORD = process.argv[3] ?? 'pailay-admin';
const USER = process.env.ADMIN_USER ?? 'owner';
const SHOTS = process.env.SHOT_DIR ?? '';

const PAGES = [
  ['/admin', 'ภาพรวม'],
  ['/admin/orders', 'ครัว / ออเดอร์'],
  ['/admin/payments', 'ตรวจสลิป'],
  ['/admin/sessions', 'เซสชัน'],
  ['/admin/menu', 'เมนู'],
  ['/admin/menu/options', 'ตัวเลือกเมนู'],
  ['/admin/categories', 'หมวดหมู่'],
  ['/admin/allergens', 'สารก่อภูมิแพ้'],
  ['/admin/tables', 'วิลล่า & QR'],
  ['/admin/reports', 'รายงาน'],
  ['/admin/settings', 'ตั้งค่า'],
  ['/admin/audit', 'ประวัติการแก้ไข'],
];

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
];

if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'th-TH' });

// Sign in through the API rather than the form. The context shares its
// cookie jar with every page, and driving the form would race hydration —
// a click landing before React attaches submits a plain GET.
const auth = await context.request.post(`${BASE}/api/admin/auth/login`, {
  data: { username: USER, password: PASSWORD },
});
if (!auth.ok()) {
  console.error(`  แอดมิน login ไม่ผ่าน — HTTP ${auth.status()}`);
  process.exit(1);
}

let problems = 0;

for (const size of SIZES) {
  console.log(`\n━━ ${size.name} ${size.width}px ━━`);
  const page = await context.newPage();
  await page.setViewportSize({ width: size.width, height: size.height });

  for (const [path, label] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45_000 });
    // Client data arrives after hydration; give the tables a beat to fill.
    await page.waitForTimeout(900);

    const report = await page.evaluate((viewport) => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth - viewport;

      // An element only counts when its own box sticks out past the viewport
      // AND no ancestor is scrolling it deliberately — a wide table inside an
      // `overflow-x: auto` card is correct, not a bug.
      const scrolledByAncestor = (node) => {
        for (let el = node.parentElement; el; el = el.parentElement) {
          const style = getComputedStyle(el);
          if (/(auto|scroll|hidden)/.test(style.overflowX)) return true;
        }
        return false;
      };

      const culprits = [];
      for (const el of document.querySelectorAll('body *')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.right <= viewport + 1) continue;
        if (scrolledByAncestor(el)) continue;
        culprits.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 70),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          text: (el.textContent ?? '').trim().slice(0, 40),
        });
      }

      // Report only the outermost offenders; children inherit the problem.
      const outermost = culprits.filter(
        (c, i) => !culprits.some((o, j) => j !== i && o.right >= c.right && o.width > c.width),
      );
      return { overflow, culprits: outermost.slice(0, 4) };
    }, size.width);

    if (report.overflow > 1) {
      problems++;
      console.log(`  ล้น ${String(report.overflow).padStart(4)}px  ${path}  (${label})`);
      for (const c of report.culprits) {
        console.log(`        <${c.tag}> w=${c.width} right=${c.right}  ${c.cls}`);
        if (c.text) console.log(`           "${c.text}"`);
      }
    } else {
      console.log(`  ok            ${path}`);
    }

    if (SHOTS) {
      await page.screenshot({
        path: `${SHOTS}/${size.name}${path.replace(/\//g, '-')}.png`,
        fullPage: true,
      });
    }
  }
  await page.close();
}

await browser.close();
console.log(problems ? `\n  ${problems} หน้าที่ล้นแนวนอน\n` : '\n  ไม่มีหน้าไหนล้นแนวนอน\n');
process.exitCode = problems ? 1 : 0;
