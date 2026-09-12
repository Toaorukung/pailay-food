import { env } from './env';
import { formatMoney } from './money';
import type { Locale, MenuCatalog, Order } from './types';

/**
 * LINE integration.
 *
 * Guests arrive by tapping a link in the villa's LINE Official Account, which
 * opens the app inside a LIFF browser. Two halves:
 *
 *   in  — the LIFF SDK hands the page an id token, we verify it against LINE
 *         and get back the account's user id. Verification happens here, on
 *         the server, and never trusts a user id the page claims to have: the
 *         browser could send anyone's, and the reward for guessing right is
 *         someone else's order confirmations.
 *   out — once staff confirm a ticket, we push the confirmation to that user
 *         id through the Messaging API.
 *
 * Both are optional. With no credentials configured the app behaves exactly as
 * it does for a guest who opened the link in Safari: ordering works, nothing
 * is pushed. That keeps local development and the demo deployment runnable.
 */

const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
const PUSH_URL = 'https://api.line.me/v2/bot/message/push';

/** A push must never hold up the staff member who pressed Confirm. */
const TIMEOUT_MS = 6000;

import { kv, K } from './kv';
import { loadSettingsMap } from './sheets/repo';

export function cleanLineToken(token: string): string {
  if (!token) return '';
  return token
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

export async function getBotInfo(explicitToken?: string): Promise<
  { ok: true; bot: { displayName: string; basicId: string } } | { ok: false; status: number; error: string }
> {
  const token = explicitToken ? cleanLineToken(explicitToken) : await getLineChannelToken();
  if (!token) return { ok: false, status: 400, error: 'ไม่มี Token' };

  try {
    const res = await fetch('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, status: res.status, error: errText };
    }
    const data = (await res.json()) as { displayName: string; basicId: string };
    return { ok: true, bot: { displayName: data.displayName, basicId: data.basicId } };
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function verifyTokenWithLine(
  token: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('https://api.line.me/v2/oauth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    const text = await res.text();
    return { ok: res.ok, message: text };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchOAuthToken(
  channelId: string,
  channelSecret: string,
): Promise<string | null> {
  try {
    const res = await fetch('https://api.line.me/v2/oauth/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: channelId.trim(),
        client_secret: channelSecret.trim(),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token || null;
  } catch {
    return null;
  }
}

export async function getLineChannelToken(): Promise<string> {
  try {
    const cached = await kv().get<string>(K.lineToken);
    if (cached) return cleanLineToken(cached);
  } catch {}

  try {
    const channelId = await kv().get<string>(K.lineChannelId);
    const channelSecret = await kv().get<string>(K.lineChannelSecret);
    if (channelId && channelSecret) {
      const freshToken = await fetchOAuthToken(channelId, channelSecret);
      if (freshToken) {
        await kv().set(K.lineToken, freshToken, { ex: 2500000 }).catch(() => {});
        return freshToken;
      }
    }
  } catch {}

  try {
    const settings = await loadSettingsMap();
    if (settings.line_channel_id?.trim() && settings.line_channel_secret?.trim()) {
      const freshToken = await fetchOAuthToken(
        settings.line_channel_id,
        settings.line_channel_secret,
      );
      if (freshToken) {
        await kv().set(K.lineToken, freshToken, { ex: 2500000 }).catch(() => {});
        return freshToken;
      }
    }

    if (settings.line_channel_token?.trim()) {
      const clean = cleanLineToken(settings.line_channel_token);
      await kv().set(K.lineToken, clean, { ex: 86400 }).catch(() => {});
      return clean;
    }
  } catch {}

  return cleanLineToken(env.lineChannelToken || '');
}

export function lineLoginConfigured(): boolean {
  return Boolean(env.lineLoginChannelId);
}

export async function linePushConfigured(): Promise<boolean> {
  const token = await getLineChannelToken();
  return Boolean(token);
}

export interface LineProfile {
  userId: string;
  displayName: string;
}

/**
 * Exchanges a LIFF id token for the account behind it.
 *
 * `client_id` is what binds the token to us: LINE only returns a payload if
 * the token was minted for this channel, so a token lifted from another LIFF
 * app is rejected rather than accepted as one of our guests.
 *
 * Returns null for anything that does not verify. A guest who cannot be
 * identified still gets to order — they simply do not get a LINE message.
 */
export async function verifyLineIdToken(
  idToken: string,
): Promise<LineProfile | null> {
  const channelId = env.lineLoginChannelId;
  if (!channelId || !idToken) return null;

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error('[line] id token rejected', res.status, await res.text());
      return null;
    }

    const payload = (await res.json()) as { sub?: string; name?: string };
    if (!payload.sub) return null;
    return { userId: payload.sub, displayName: payload.name ?? '' };
  } catch (err) {
    console.error('[line] id token verification failed', err);
    return null;
  }
}

export async function pushTextDetailed(
  userId: string,
  text: string,
  explicitToken?: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = explicitToken ? cleanLineToken(explicitToken) : await getLineChannelToken();
  if (!token) return { ok: false, error: 'ยังไม่ได้ตั้งค่า LINE Channel Access Token ใน Admin Settings' };
  if (!userId) return { ok: false, error: 'ไม่มี LINE User ID ของลูกค้า' };

  try {
    const res = await fetch(PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      // LINE hard-caps a text message at 5000 characters. A villa ordering
      // forty dishes would otherwise get the whole push rejected.
      body: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: text.slice(0, 4900) }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[line] push failed', res.status, errText);
      return { ok: false, error: `LINE API (${res.status}): ${errText}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[line] push failed', err);
    return { ok: false, error: `Network error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function pushText(userId: string, text: string): Promise<boolean> {
  const res = await pushTextDetailed(userId, text);
  return res.ok;
}

const CONFIRMED_HEADING: Record<Locale, string> = {
  th: 'ยืนยันออเดอร์เรียบร้อย',
  en: 'Your order is confirmed',
  zh: '订单已确认',
};

const LABELS: Record<Locale, Record<string, string>> = {
  th: { order: 'ออเดอร์', villa: 'วิลล่า', items: 'รายการ', total: 'รวมทั้งสิ้น', note: 'ทีมงานกำลังเตรียมอาหารให้แล้ว หากต้องการแก้ไขกรุณาติดต่อพนักงาน' },
  en: { order: 'Order', villa: 'Villa', items: 'Items', total: 'Total', note: 'The kitchen has started. Please contact staff if anything needs changing.' },
  zh: { order: '订单', villa: '别墅', items: '菜品', total: '合计', note: '厨房已开始制作。如需修改请联系工作人员。' },
};

/**
 * The message a guest gets when staff confirm their ticket.
 *
 * Written from the order rather than from the cart the guest remembers, so a
 * line staff removed or repriced during the call is what the guest sees — the
 * message doubles as the record of what was actually agreed.
 */
export function confirmationText(
  order: Order,
  settings: MenuCatalog['settings'],
): string {
  const locale = order.locale;
  const label = LABELS[locale] ?? LABELS.th;
  const name = (localized: { th: string; en: string; zh: string }) =>
    localized[locale] || localized.th || localized.en;

  const lines = order.items.map(
    (item) =>
      `• ${item.qty}× ${name(item.name)}` +
      (item.options.length > 0
        ? ` (${item.options.map((o) => name(o.name)).join(', ')})`
        : '') +
      ` — ${formatMoney(item.lineTotal, settings.currency)}`,
  );

  return [
    `✅ ${CONFIRMED_HEADING[locale] ?? CONFIRMED_HEADING.th}`,
    '',
    `${label.order}: ${order.id}`,
    `${label.villa}: ${order.villa || order.tableLabel}`,
    '',
    `${label.items}:`,
    ...lines,
    '',
    `${label.total}: ${formatMoney(order.total, settings.currency)}`,
    '',
    label.note,
  ].join('\n');
}

/**
 * Sends the confirmation for one order. Never throws: a LINE outage must not
 * turn into a failed Confirm button in the middle of service.
 */
export async function pushOrderConfirmed(
  order: Order,
  settings: MenuCatalog['settings'],
): Promise<{ ok: boolean; error?: string }> {
  if (!order.lineUserId) return { ok: false, error: 'ไม่มี LINE UID ในออเดอร์นี้' };
  const hasToken = await linePushConfigured();
  if (!hasToken) return { ok: false, error: 'ยังไม่ได้ตั้งค่า LINE Channel Access Token ใน Admin Settings' };
  return pushTextDetailed(order.lineUserId, confirmationText(order, settings));
}
