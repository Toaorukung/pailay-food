import { requireSession, guardResponse, getSession, unlockSession } from '@/lib/session';
import { sessionOrders, billableTotal, unpricedItems } from '@/lib/orders';
import { createPayment, getPayment } from '@/lib/payments';
import { promptPayQr, maskPromptPayId } from '@/lib/promptpay';
import { getCatalog } from '@/lib/menu-cache';
import { publicPayment } from '@/lib/snapshot';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Opens the bill: freezes the session, totals the orders, and returns a
 * PromptPay QR with the exact amount baked into the payload.
 *
 * Freezing matters. If the guest could keep ordering after the QR appeared,
 * they would pay the amount they were shown rather than the amount they owe,
 * and nobody would notice until the slip was reviewed.
 */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId, { allowLocked: true });
  if (!guard.ok) return guardResponse(guard);

  const catalog = await getCatalog();

  // Already checking out — return the same payment rather than opening a
  // second bill for the same food.
  if (guard.session.activePaymentId) {
    const existing = await getPayment(guard.session.activePaymentId);
    if (existing && existing.status !== 'REJECTED') {
      const qr = await promptPayQr(existing.amount).catch(() => null);
      return ok({
        payment: publicPayment(existing),
        qr: qr ? { dataUrl: qr.dataUrl, payload: qr.payload } : null,
        promptPayId: maskPromptPayId(),
        promptPayName: catalog.settings.promptPayName,
        paymentNote: catalog.settings.paymentNote,
      });
    }
  }

  const orders = await sessionOrders(sessionId);
  const payable = orders.filter((o) => o.status !== 'CANCELLED');
  if (payable.length === 0) {
    return fail('ยังไม่มีรายการที่ต้องชำระ', 400);
  }

  // Market-price dishes are billed at zero until the kitchen weighs them and
  // staff enter the figure. Opening a bill now would take payment for a total
  // that is knowably wrong, so checkout waits.
  const unpriced = unpricedItems(payable);
  if (unpriced.length > 0) {
    return fail(
      'มีรายการที่ต้องชั่งน้ำหนักก่อนแจ้งราคา กรุณารอพนักงานสักครู่',
      409,
      { code: 'AWAITING_PRICING', items: unpriced },
    );
  }

  const amount = billableTotal(orders);
  if (!(amount > 0)) return fail('ยอดชำระไม่ถูกต้อง', 400);

  let qr;
  try {
    qr = await promptPayQr(amount);
  } catch (err) {
    console.error('[checkout] PromptPay QR failed', err);
    // Do not strand the guest on a locked session with no way to pay.
    if (guard.session.status === 'LOCKED') await unlockSession(sessionId);
    return fail('ระบบชำระเงินยังไม่พร้อมใช้งาน กรุณาแจ้งพนักงาน', 503);
  }

  const fresh = (await getSession(sessionId)) ?? guard.session;
  const payment = await createPayment(fresh, payable, amount);

  return ok({
    payment: publicPayment(payment),
    qr: { dataUrl: qr.dataUrl, payload: qr.payload },
    promptPayId: maskPromptPayId(),
    promptPayName: catalog.settings.promptPayName,
    paymentNote: catalog.settings.paymentNote,
  });
});
