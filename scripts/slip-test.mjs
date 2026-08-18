/**
 * Proves the payment-slip path still holds after moving image storage into a
 * private Blob store.
 *
 * A slip is evidence of a bank transfer: it carries the guest's name and the
 * amount. The rules that matter are that staff can always read it, that nobody
 * else can — not anonymously, and not by holding the storage URL — and that
 * approving it is what releases the order to the kitchen.
 *
 *   node scripts/slip-test.mjs <base> <villa-slug> <qr-code> <admin-password>
 */
const BASE = process.argv[2] ?? 'https://pailay-food.vercel.app';
const VILLA = process.argv[3];
const CODE = process.argv[4];
const PASSWORD = process.argv[5] ?? 'pailay-admin';
const USER = process.env.ADMIN_USER ?? 'owner';

if (!VILLA || !CODE) {
  console.error('usage: node scripts/slip-test.mjs <base> <villa-slug> <qr-code> [admin-password]');
  process.exit(1);
}

const jarOf = (res) =>
  (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

const line = (n, msg) => console.log(`── ${n}. ${msg}`);
const ok = (msg) => console.log(`   PASS  ${msg}`);
const bad = (msg) => {
  console.log(`   FAIL  ${msg}`);
  process.exitCode = 1;
};

const post = (path, jar, body) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', cookie: jar ?? '' },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));

// A one-pixel JPEG. Small enough to post, real enough to survive the magic-byte
// sniff and the sharp re-encode that every upload goes through.
const PIXEL = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

// ── open a session ──────────────────────────────────────────
line(1, 'สแกน QR เปิด session');
const entered = await fetch(`${BASE}/api/enter`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ villa: VILLA, code: CODE }),
});
const jar = jarOf(entered);
const { sessionId } = await entered.json();
if (!sessionId) {
  console.error(`   เปิด session ไม่ได้ — HTTP ${entered.status}`);
  process.exit(1);
}
console.log(`   session ${sessionId}`);

// ── order something with a known price ──────────────────────
line(2, 'สั่งอาหารหนึ่งรายการ');
await post(`/api/s/${sessionId}/cart`, jar, { menuId: 'm-water-pack', qty: 1, optionIds: [] });
const placed = await post(`/api/s/${sessionId}/order`, jar, {
  idempotencyKey: `slip-${Date.now()}`,
});
const order = placed.order;
if (!order?.id) {
  console.error(`   สั่งไม่สำเร็จ — HTTP ${placed.status}: ${placed.error ?? ''}`);
  process.exit(1);
}
order.status === 'UNPAID'
  ? ok(`ออเดอร์ ${order.id} สถานะ UNPAID รอชำระ`)
  : bad(`คาดว่า UNPAID แต่ได้ ${order.status}`);

// ── the kitchen must not see it yet ─────────────────────────
line(3, 'ก่อนจ่าย ครัวต้องยังไม่เห็น');
const adminRes = await fetch(`${BASE}/api/admin/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ username: USER, password: PASSWORD }),
});
const adminJar = jarOf(adminRes);
if (!adminJar) {
  console.error(`   แอดมิน login ไม่ผ่าน — HTTP ${adminRes.status}`);
  process.exit(1);
}
// The dashboard feed carries every recent order; the kitchen board is the
// subset in these three statuses. Reaching one of them is what "the kitchen
// can see it" means, so that is what gets asserted.
const KITCHEN = ['NEW', 'COOKING', 'SERVED'];
const orderNow = async () =>
  fetch(`${BASE}/api/admin/live`, { headers: { cookie: adminJar }, cache: 'no-store' })
    .then((r) => r.json())
    .then((b) => ((b.data ?? b).orders ?? []).find((o) => o.id === order.id));
const onBoard = async () => KITCHEN.includes((await orderNow())?.status);
(await onBoard())
  ? bad('ออเดอร์ที่ยังไม่จ่ายโผล่บนจอครัว')
  : ok('ยังไม่ขึ้นจอครัว');

// ── upload the slip ─────────────────────────────────────────
line(4, 'อัปสลิป');
const form = new FormData();
form.append('slip', new Blob([PIXEL], { type: 'image/jpeg' }), 'slip.jpg');
const upload = await fetch(`${BASE}/api/s/${sessionId}/slip?orderId=${order.id}`, {
  method: 'POST',
  headers: { cookie: jar },
  body: form,
});
const uploaded = await upload.json().catch(() => ({}));
const payment = (uploaded.data ?? uploaded).payment;
if (!payment?.id) {
  console.error(`   อัปสลิปไม่สำเร็จ — HTTP ${upload.status}: ${JSON.stringify(uploaded).slice(0, 200)}`);
  process.exit(1);
}
ok(`สลิปเข้าคิวตรวจ (payment ${payment.id})`);

// ── the guest must never be handed the storage address ──────
line(5, 'ลูกค้าต้องไม่ได้ URL ที่เก็บสลิป');
JSON.stringify(uploaded).includes('blob.vercel-storage.com')
  ? bad('URL ของที่เก็บหลุดกลับไปให้ลูกค้า')
  : ok('ไม่มี URL ที่เก็บใน response');

// ── only staff can read it ──────────────────────────────────
line(6, 'อ่านสลิปต้องผ่านการยืนยันตัวตน');
const anon = await fetch(`${BASE}/api/admin/slip/${payment.id}`, { redirect: 'manual' });
[401, 403, 307, 302].includes(anon.status)
  ? ok(`คนนอกอ่านไม่ได้ (HTTP ${anon.status})`)
  : bad(`คนนอกอ่านสลิปได้ — HTTP ${anon.status}`);

const staff = await fetch(`${BASE}/api/admin/slip/${payment.id}`, {
  headers: { cookie: adminJar },
});
const staffType = staff.headers.get('content-type') ?? '';
staff.ok && staffType.startsWith('image/')
  ? ok(`พนักงานอ่านได้ (${staffType}, ${(await staff.arrayBuffer()).byteLength} bytes)`)
  : bad(`พนักงานอ่านสลิปไม่ได้ — HTTP ${staff.status} ${staffType}`);

// ── still not cooking until someone approves ────────────────
line(7, 'สลิปเข้าแล้วแต่ยังไม่อนุมัติ ครัวยังไม่เห็น');
(await onBoard())
  ? bad('ขึ้นจอครัวก่อนอนุมัติสลิป')
  : ok(`ยังไม่ขึ้นจอครัว (สถานะ ${(await orderNow())?.status})`);

// ── approve ─────────────────────────────────────────────────
line(8, 'พนักงานอนุมัติสลิป');
const approved = await post(`/api/admin/payments?action=approve`, adminJar, {
  paymentId: payment.id,
});
approved.status === 200 ? ok('อนุมัติแล้ว') : bad(`อนุมัติไม่สำเร็จ — HTTP ${approved.status}`);

line(9, 'ออเดอร์ต้องขึ้นจอครัว');
const cooking = await orderNow();
KITCHEN.includes(cooking?.status)
  ? ok(`ขึ้นจอครัวแล้ว สถานะ ${cooking.status}`)
  : bad(`ยังไม่ขึ้นจอครัว — สถานะ ${cooking?.status}`);

// ── clean up so the villa is not left with an open bill ─────
line(10, 'ปิด session ที่ใช้ทดสอบ');
const closed = await post('/api/admin/sessions', adminJar, { sessionId });
closed.status === 200 ? ok('ปิดแล้ว') : bad(`ปิดไม่สำเร็จ — HTTP ${closed.status}`);

console.log(process.exitCode ? '\n   มีข้อที่ไม่ผ่าน\n' : '\n   ผ่านทุกข้อ\n');
