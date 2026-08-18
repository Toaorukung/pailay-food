import { requireSession, guardResponse } from '@/lib/session';
import { getOrder } from '@/lib/orders';
import { getPayment } from '@/lib/payments';
import { getCatalog } from '@/lib/menu-cache';
import { promptPayQr, maskPromptPayId } from '@/lib/promptpay';
import { publicPayment } from '@/lib/snapshot';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Returns the PromptPay QR for one order.
 *
 * Separate from order creation because the two do not always happen together:
 * an order containing a dish sold by weight has no amount until staff have
 * priced it, and the guest comes back for the QR afterwards. It is also what
 * a re-upload after a rejected slip calls.
 */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId);
  if (!guard.ok) return guardResponse(guard);

  const url = new URL(req.url);
  const orderId = url.searchParams.get('orderId');
  if (!orderId) return fail('ต้องระบุออเดอร์', 400);

  const order = await getOrder(orderId);
  // Scoping to the caller's own session stops a guessed order id from another
  // villa returning that villa's amount.
  if (!order || order.sessionId !== sessionId) {
    return fail('ไม่พบออเดอร์นี้', 404);
  }

  if (order.status === 'AWAITING_PRICING') {
    return fail('รอพนักงานชั่งน้ำหนักและแจ้งราคาก่อน', 409, {
      code: 'AWAITING_PRICING',
    });
  }
  if (order.status !== 'UNPAID' && order.status !== 'AWAITING_PAYMENT') {
    return fail('ออเดอร์นี้ชำระเงินเรียบร้อยแล้ว', 409, { code: 'ALREADY_PAID' });
  }

  const payment = await getPayment(order.paymentId);
  if (!payment) return fail('ไม่พบรายการชำระเงิน', 404);
  if (!(payment.amount > 0)) return fail('ยอดชำระไม่ถูกต้อง', 400);

  const catalog = await getCatalog();

  let qr;
  try {
    qr = await promptPayQr(payment.amount);
  } catch (err) {
    console.error('[pay] PromptPay QR failed', err);
    return fail('ระบบชำระเงินยังไม่พร้อมใช้งาน กรุณาแจ้งพนักงาน', 503);
  }

  return ok({
    order,
    payment: publicPayment(payment),
    qr: { dataUrl: qr.dataUrl, payload: qr.payload },
    promptPayId: maskPromptPayId(),
    promptPayName: catalog.settings.promptPayName,
    paymentNote: catalog.settings.paymentNote,
  });
});
