import { requireAdmin } from '@/lib/admin/auth';
import { approvePayment, rejectPayment, getPayment } from '@/lib/payments';
import { rejectPaymentSchema, parseBody } from '@/lib/validation';
import { audit } from '@/lib/audit';
import { clientIp } from '@/lib/ratelimit';
import { handler, fail, ok } from '@/lib/api';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const approveSchema = z.object({ paymentId: z.string().min(1).max(64) });

/**
 * Approving a payment is the single most consequential action in the admin
 * app: it takes money as settled and permanently closes the guest's session.
 * Restricted to MANAGER and above, and always attributed in the audit log.
 */
export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'STAFF');
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  if (action === 'approve') {
    const body = await parseBody(req, approveSchema);
    if (!body.ok) return fail(body.error);

    const existing = await getPayment(body.data.paymentId);
    if (!existing) return fail('ไม่พบรายการชำระเงิน', 404);
    if (existing.status === 'APPROVED') return ok({ payment: existing });
    if (existing.status !== 'PENDING_REVIEW') {
      return fail('รายการนี้ยังไม่มีสลิปให้ตรวจสอบ', 409);
    }

    const payment = await approvePayment(body.data.paymentId, auth.admin.name);
    if (!payment) return fail('ยืนยันการชำระเงินไม่สำเร็จ', 500);

    await audit(
      auth.admin,
      'payment.approve',
      payment.id,
      { amount: payment.amount, sessionId: payment.sessionId },
      clientIp(req),
    );
    return ok({ payment });
  }

  if (action === 'reject') {
    const body = await parseBody(req, rejectPaymentSchema);
    if (!body.ok) return fail(body.error);

    const payment = await rejectPayment(
      body.data.paymentId,
      auth.admin.name,
      body.data.reason,
    );
    if (!payment) return fail('ไม่พบรายการชำระเงิน', 404);

    await audit(
      auth.admin,
      'payment.reject',
      payment.id,
      { reason: body.data.reason },
      clientIp(req),
    );
    return ok({ payment });
  }

  return fail('ไม่รู้จักคำสั่งนี้', 400);
});
