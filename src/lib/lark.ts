import { createHmac } from 'node:crypto';
import { env } from './env';
import { formatMoney } from './money';
import type { GuestSession, MenuCatalog, Order } from './types';

/**
 * Lark notification for a freshly placed order.
 *
 * A guest confirming their cart no longer pays for anything, so nothing on the
 * guest's screen tells staff to look. This is what does: a card into the
 * villa's Lark group the moment an order lands, so somebody opens
 * /admin/pending and rings the guest.
 *
 * Delivered through a Lark custom bot webhook — a URL the group owner creates
 * in Lark and pastes into LARK_WEBHOOK_URL. If the bot was created with
 * signature verification switched on, its secret goes in LARK_WEBHOOK_SECRET
 * and every request carries a timestamp and an HMAC of it.
 *
 * Every function here swallows its own failures. A notification that does not
 * arrive is a member of staff looking at the screen a minute later; a
 * notification that throws would be a guest's order rejected.
 */

const TIMEOUT_MS = 6000;

export function larkConfigured(): boolean {
  return Boolean(env.larkWebhookUrl);
}

/**
 * Lark's custom-bot signature: HMAC-SHA256 where `${timestamp}\n${secret}` is
 * the *key* and the message body is empty. That is genuinely how it is
 * specified — it is not the usual "sign the payload" scheme, and writing it
 * the intuitive way produces a signature Lark silently rejects.
 */
function sign(timestamp: number, secret: string): string {
  return createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64');
}

async function post(body: Record<string, unknown>): Promise<boolean> {
  const url = env.larkWebhookUrl;
  if (!url) return false;

  const secret = env.larkWebhookSecret;
  const payload: Record<string, unknown> = { ...body };

  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    payload.timestamp = String(timestamp);
    payload.sign = sign(timestamp, secret);
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });

    // Lark answers 200 with a non-zero `code` for a bad signature or a revoked
    // bot, so the status alone does not mean the message arrived.
    const result = (await res.json().catch(() => ({}))) as { code?: number; msg?: string };
    if (!res.ok || (result.code !== undefined && result.code !== 0)) {
      console.error('[lark] webhook rejected', res.status, result.code, result.msg);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[lark] webhook failed', err);
    return false;
  }
}

function itemLines(order: Order): string {
  return order.items
    .map((item) => {
      const options =
        item.options.length > 0
          ? ` _(${item.options.map((o) => o.name.th || o.name.en).join(', ')})_`
          : '';
      const note = item.note ? `\n   ✏️ ${item.note}` : '';
      const price = item.priceOnRequest && !item.pricedAt ? 'ถามราคา' : formatMoney(item.lineTotal);
      return `**${item.qty}×** ${item.name.th || item.name.en}${options} — ${price}${note}`;
    })
    .join('\n');
}

/**
 * "A guest just ordered." Sent when the order is created, before any member of
 * staff has seen it.
 *
 * The guest's phone number is in the card on purpose: the next action is
 * someone ringing the villa to confirm, and making them go and look it up in
 * the admin app is how a ticket sits untouched for twenty minutes.
 */
export async function notifyNewOrder(
  order: Order,
  session: GuestSession,
  settings: MenuCatalog['settings'],
): Promise<boolean> {
  if (!larkConfigured()) return false;

  const appUrl = env.appUrl;
  const allergies =
    order.allergyLabels.length > 0
      ? `\n\n⚠️ **แพ้อาหาร:** ${order.allergyLabels.join(', ')}`
      : '';
  const unpriced = order.items.some((i) => i.priceOnRequest && !i.pricedAt)
    ? '\n\n⚖️ มีรายการที่ต้องชั่งน้ำหนักและใส่ราคาก่อนยืนยัน'
    : '';

  return post({
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: 'orange',
        title: {
          tag: 'plain_text',
          content: `🍽️ ออเดอร์ใหม่รอคอนเฟิร์ม · ${order.villa || order.tableLabel}`,
        },
      },
      elements: [
        {
          tag: 'div',
          fields: [
            { is_short: true, text: { tag: 'lark_md', content: `**ออเดอร์**\n${order.id}` } },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**เวลา**\n${new Date(order.createdAt).toLocaleString('th-TH', {
                  timeZone: 'Asia/Bangkok',
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}`,
              },
            },
            {
              is_short: true,
              text: { tag: 'lark_md', content: `**ผู้สั่ง**\n${session.guestName || '—'}` },
            },
            {
              is_short: true,
              text: { tag: 'lark_md', content: `**เบอร์โทร**\n${session.guestPhone || '—'}` },
            },
          ],
        },
        { tag: 'hr' },
        { tag: 'div', text: { tag: 'lark_md', content: itemLines(order) } },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**รวมทั้งสิ้น ${formatMoney(order.total, settings.currency)}**${allergies}${unpriced}`,
          },
        },
        ...(appUrl
          ? [
              {
                tag: 'action',
                actions: [
                  {
                    tag: 'button',
                    text: { tag: 'plain_text', content: 'เปิดหน้ารอคอนเฟิร์ม' },
                    type: 'primary',
                    url: `${appUrl}/admin/pending`,
                  },
                ],
              },
            ]
          : []),
      ],
    },
  });
}
