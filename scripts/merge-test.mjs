/**
 * Proves the session-merge rule holds under the conditions that would lose an
 * order: a second phone scanning the same sticker, several phones scanning at
 * the same instant, and a session id used under the wrong villa.
 */
const BASE = process.argv[2] ?? 'https://pailay-food.vercel.app';
const VILLA = process.argv[3] ?? 'villa-5';
const CODE = process.argv[4];

if (!CODE) {
  console.error('usage: node _merge-test.mjs <base> <villa-slug> <qr-code>');
  process.exit(1);
}

const jarOf = (res) =>
  (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

async function enter() {
  const res = await fetch(`${BASE}/api/enter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ villa: VILLA, code: CODE }),
  });
  const body = await res.json();
  return { status: res.status, jar: jarOf(res), ...body };
}

const post = (path, jar, body) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', cookie: jar },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

const get = (path, jar) =>
  fetch(`${BASE}${path}`, { headers: { cookie: jar }, cache: 'no-store' }).then(
    async (r) => ({ status: r.status, ...(await r.json()) }),
  );

const line = (n, msg) => console.log(`── ${n}. ${msg}`);
const ok = (msg) => console.log(`   PASS  ${msg}`);
const bad = (msg) => {
  console.log(`   FAIL  ${msg}`);
  process.exitCode = 1;
};

// 1 — first phone
line(1, 'โทรศัพท์เครื่องแรกสแกน');
const a = await enter();
if (!a.sessionId) {
  console.error(`   ไม่ได้ session — HTTP ${a.status}: ${a.error ?? ''}`);
  process.exit(1);
}
console.log(`   session ${a.sessionId}`);

// 2 — second phone, same sticker
line(2, 'เครื่องที่สองสแกน QR เดียวกัน');
const b = await enter();
b.sessionId === a.sessionId
  ? ok(`ได้ session เดียวกัน (${b.sessionId}) — บิลรวมกัน`)
  : bad(`ได้คนละ session: ${a.sessionId} vs ${b.sessionId}`);

// 3 — five simultaneous scans
line(3, 'ห้าเครื่องสแกนพร้อมกัน');
const burst = await Promise.all(Array.from({ length: 5 }, enter));
const ids = new Set(burst.map((r) => r.sessionId));
ids.size === 1 && burst[0].sessionId === a.sessionId
  ? ok(`ทุกเครื่องได้ ${[...ids][0]} — ไม่มี session ซ้อน`)
  : bad(`เกิด ${ids.size} session: ${[...ids].join(', ')}`);

// 4 — both phones order; both orders must land on the one bill
line(4, 'ทั้งสองเครื่องสั่งอาหารคนละรายการ');
await post(`/api/s/${a.sessionId}/cart`, a.jar, {
  menuId: 'm-rice-plain', qty: 1, optionIds: ['o-rpl-plate'],
});
const o1 = await post(`/api/s/${a.sessionId}/order`, a.jar, {
  idempotencyKey: `merge-a-${Date.now()}`,
});
await post(`/api/s/${b.sessionId}/cart`, b.jar, {
  menuId: 'm-water-pack', qty: 2, optionIds: [],
});
const o2 = await post(`/api/s/${b.sessionId}/order`, b.jar, {
  idempotencyKey: `merge-b-${Date.now()}`,
});
console.log(`   เครื่อง A -> ${o1.order?.id}   เครื่อง B -> ${o2.order?.id}`);

const state = await get(`/api/s/${a.sessionId}/state`, a.jar);
const bothPresent =
  state.orders?.some((o) => o.id === o1.order?.id) &&
  state.orders?.some((o) => o.id === o2.order?.id);
bothPresent
  ? ok(`บิลเดียวมี ${state.orders.length} ออเดอร์ ครบทั้งสองเครื่อง`)
  : bad('ออเดอร์บางรายการไม่อยู่ในบิลเดียวกัน');

// 5 — a session id under the wrong villa
line(5, 'ใช้ session ของวิลล่านี้กับ slug ของวิลล่าอื่น');
const otherVilla = VILLA === 'villa-1' ? 'villa-2' : 'villa-1';
const wrong = await fetch(`${BASE}/${otherVilla}/${a.sessionId}`, {
  headers: { cookie: a.jar },
  redirect: 'manual',
});
wrong.status === 404
  ? ok(`คืน 404 ที่ /${otherVilla}/<session> — ไม่เปิดบิลข้ามวิลล่า`)
  : bad(`คืน HTTP ${wrong.status} แทนที่จะเป็น 404`);

// 6 — right villa, wrong code
line(6, 'slug ถูก แต่รหัสผิด');
const badCode = await fetch(`${BASE}/api/enter`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ villa: VILLA, code: 'not-the-real-code' }),
});
badCode.status === 404
  ? ok('ปฏิเสธ — เดาชื่อวิลล่าอย่างเดียวเปิดบิลไม่ได้')
  : bad(`คืน HTTP ${badCode.status}`);

// 7 — the ordering URL renders for its owner
line(7, 'เปิดหน้าสั่งอาหารด้วย URL /villa/session');
const page = await fetch(`${BASE}/${VILLA}/${a.sessionId}`, {
  headers: { cookie: a.jar },
});
page.status === 200 ? ok('HTTP 200') : bad(`HTTP ${page.status}`);

// 8 — a stranger holding the link but no cookie
line(8, 'คนที่ได้ลิงก์ต่อแต่ไม่ได้สแกนเอง');
const stranger = await fetch(`${BASE}/api/s/${a.sessionId}/order`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ idempotencyKey: 'stranger-xyz-1' }),
});
stranger.status === 403
  ? ok('สั่งไม่ได้ (403)')
  : bad(`คืน HTTP ${stranger.status} แทนที่จะเป็น 403`);

console.log(
  process.exitCode ? '\n   มีข้อที่ไม่ผ่าน\n' : '\n   ผ่านทุกข้อ\n',
);
