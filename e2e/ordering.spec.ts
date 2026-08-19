import { test, expect, request as playwrightRequest } from '@playwright/test';
import { createHmac } from 'node:crypto';

/**
 * The full guest journey, plus the security property the whole design exists
 * to provide: after checkout, the old link cannot order — and not just in the
 * UI, but at the API, against a hand-made request carrying a valid cookie.
 *
 * Requires the seeded demo villa (`npm run seed`) and TABLE_SECRET in the
 * environment so the test can sign its own QR link.
 */

const TABLE_ID = process.env.E2E_TABLE_ID ?? 'v-demo1';
const TABLE_SECRET = process.env.TABLE_SECRET ?? '';

function signedTableUrl(): string {
  const signature = createHmac('sha256', TABLE_SECRET)
    .update(`table:${TABLE_ID}`)
    .digest('base64url')
    .slice(0, 16);
  return `/t/${TABLE_ID}?k=${signature}`;
}

test.skip(
  !TABLE_SECRET,
  'TABLE_SECRET must be set so the test can sign a QR link',
);

test.describe('guest ordering', () => {
  test('scan → search → order with a note → checkout', async ({ page }) => {
    await page.goto(signedTableUrl());

    // The scan must land on a session URL, not the entry URL.
    await expect(page).toHaveURL(/\/s\/[A-Za-z0-9_-]{20,}/);
    const sessionUrl = page.url();

    // The opening flow: the villa's notice, then who the guest is, then what
    // they cannot eat.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // The notice step only exists when the villa has uploaded the artwork.
    const notice = dialog.getByRole('img').first();
    if (await notice.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /ถัดไป|Next/ }).click();
    }

    await page.getByLabel(/ชื่อผู้สั่ง|^Name$/).fill('ผู้ทดสอบ');
    await page.getByLabel(/เบอร์โทรศัพท์|Phone number/).fill('081-234-5678');
    await page.getByRole('button', { name: /ถัดไป|Next/ }).click();

    await page.getByRole('button', { name: /กุ้ง หอย ปู|Shellfish/ }).first().click();
    await page.getByRole('button', { name: /บันทึกและดูเมนู|Save and view/ }).click();
    await expect(dialog).toBeHidden();

    // A dish containing a declared allergen carries the warning.
    await expect(page.getByText(/เมนูนี้มีส่วนผสมที่คุณแจ้งว่าแพ้/).first()).toBeVisible();

    // Search by ingredient, not just by name.
    await page.getByRole('searchbox').fill('ตะไคร้');
    await expect(page.getByText('ต้มยำกุ้ง')).toBeVisible();

    await page.getByRole('searchbox').fill('มะม่วง');
    await page.getByText('ข้าวเหนียวมะม่วง').click();

    // Note field is capped at 500 characters.
    const note = page.getByLabel(/หมายเหตุถึงครัว|Note for the kitchen/);
    await note.fill('x'.repeat(600));
    await expect(note).toHaveValue('x'.repeat(500));
    await note.fill('ไม่หวานมาก');

    await page.getByRole('button', { name: /เพิ่มลงตะกร้า/ }).click();

    // Cart
    await page.getByRole('button', { name: /ตะกร้า|Cart/ }).click();
    await expect(page.getByText('ไม่หวานมาก')).toBeVisible();

    await page.getByRole('button', { name: /ส่งออเดอร์ไปที่ครัว/ }).click();
    await page.getByRole('button', { name: /^ยืนยัน$/ }).click();

    await expect(page.getByText(/O-[A-Z0-9]{6}/)).toBeVisible({ timeout: 15_000 });

    // Checkout locks the session and produces a PromptPay QR.
    await page.getByRole('button', { name: /เช็คบิล|Bill/ }).click();
    await page.getByRole('button', { name: /เช็คบิลและชำระเงิน/ }).click();
    await page.getByRole('button', { name: /^ยืนยัน$/ }).click();

    await expect(page.getByAltText('PromptPay QR')).toBeVisible({ timeout: 15_000 });

    expect(sessionUrl).toBe(page.url().split('#')[0]);
  });

  test('a closed session is refused by the API, not just the UI', async ({
    page,
    baseURL,
  }) => {
    await page.goto(signedTableUrl());
    await expect(page).toHaveURL(/\/s\//);
    const sessionId = page.url().split('/s/')[1];

    // Take the guest's own cookies — this is the strongest version of the
    // attack: a legitimate device replaying its own session after checkout.
    const cookies = await page.context().cookies();
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

    const api = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { cookie: cookieHeader },
    });

    // While open, ordering is permitted (an empty cart is a 400, not a 403 —
    // the distinction is the point).
    const whileOpen = await api.post(`/api/s/${sessionId}/order`, {
      data: { idempotencyKey: 'e2e-open-attempt-0001' },
    });
    expect(whileOpen.status()).not.toBe(403);

    // Close it the way a paid bill would.
    const closed = await api.post('/api/admin/sessions', {
      data: { sessionId, reason: 'e2e' },
    });
    // Skip rather than fail if the run has no admin cookie: the assertion
    // below is only meaningful once the session is genuinely closed.
    test.skip(closed.status() === 401, 'needs an admin session to close');

    const afterClose = await api.post(`/api/s/${sessionId}/order`, {
      data: { idempotencyKey: 'e2e-closed-attempt-001' },
    });
    expect(afterClose.status()).toBe(403);
    expect((await afterClose.json()).code).toBe('CLOSED');

    const cartAfterClose = await api.post(`/api/s/${sessionId}/cart`, {
      data: { menuId: 'm-padthai', qty: 1, optionIds: [], note: '', allergenAck: false },
    });
    expect(cartAfterClose.status()).toBe(403);

    // Reading the receipt still works.
    const state = await api.get(`/api/s/${sessionId}/state`);
    expect(state.status()).toBe(200);

    await api.dispose();
  });

  test('an unsigned QR link is rejected', async ({ page }) => {
    await page.goto(`/t/${TABLE_ID}`);
    await expect(page).toHaveURL(/\/invalid/);
  });

  test('a forwarded session link cannot order', async ({ browser, page }) => {
    await page.goto(signedTableUrl());
    const sessionUrl = page.url();

    // Fresh context = a friend who was sent the link but never scanned.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(sessionUrl);

    await expect(
      otherPage.getByText(/กรุณาสแกน QR ในวิลล่า/),
    ).toBeVisible();

    await other.close();
  });
});

test.describe('note length is enforced server-side', () => {
  test('a 501-character note is rejected by the API', async ({ page, baseURL }) => {
    await page.goto(signedTableUrl());
    const sessionId = page.url().split('/s/')[1];
    const cookieHeader = (await page.context().cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

    const api = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { cookie: cookieHeader },
    });

    const res = await api.post(`/api/s/${sessionId}/cart`, {
      data: {
        menuId: 'm-mangosticky',
        qty: 1,
        optionIds: [],
        note: 'x'.repeat(501),
        allergenAck: false,
      },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('500');

    await api.dispose();
  });
});
