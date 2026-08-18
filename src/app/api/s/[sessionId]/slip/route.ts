import { requireSession, guardResponse } from '@/lib/session';
import { getPayment, attachSlip } from '@/lib/payments';
import { getOrder } from '@/lib/orders';
import { processUpload, UploadError, MAX_UPLOAD_BYTES } from '@/lib/images';
import { rateLimit } from '@/lib/ratelimit';
import { publicPayment } from '@/lib/snapshot';
import { putImage } from '@/lib/storage';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
// sharp needs the Node runtime; it does not run on the edge.
export const runtime = 'nodejs';
export const maxDuration = 30;

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Payment slip upload.
 *
 * The file is sniffed, re-encoded, and only then stored. The resulting blob
 * URL is never returned to the guest — it is evidence for staff, served back
 * through an authenticated admin proxy.
 */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { sessionId } = await params;
  const guard = await requireSession(req, sessionId);
  if (!guard.ok) return guardResponse(guard);

  const limit = await rateLimit('slip', sessionId);
  if (!limit.ok) {
    return fail('อัปโหลดบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่', 429);
  }

  const orderId = new URL(req.url).searchParams.get('orderId');
  if (!orderId) return fail('ต้องระบุออเดอร์', 400);

  const order = await getOrder(orderId);
  // Scoped to the caller's own session: a guessed order id from another villa
  // must not become a slot to upload into.
  if (!order || order.sessionId !== sessionId) {
    return fail('ไม่พบออเดอร์นี้', 404);
  }
  if (order.status === 'AWAITING_PRICING') {
    return fail('รอพนักงานแจ้งราคาก่อนชำระเงิน', 409);
  }

  const payment = await getPayment(order.paymentId);
  if (!payment) return fail('ไม่พบรายการชำระเงิน', 404);
  if (payment.status === 'APPROVED') {
    return fail('ออเดอร์นี้ชำระเงินเรียบร้อยแล้ว', 409);
  }

  // Reject oversized bodies before reading them into memory.
  const declaredLength = Number(req.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_UPLOAD_BYTES + 100_000) {
    return fail('ไฟล์ใหญ่เกิน 5MB', 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('อ่านไฟล์ไม่สำเร็จ', 400);
  }

  const file = form.get('slip');
  if (!(file instanceof File)) return fail('กรุณาเลือกไฟล์สลิป', 400);
  if (file.size === 0) return fail('ไฟล์ว่าง', 400);
  if (file.size > MAX_UPLOAD_BYTES) return fail('ไฟล์ใหญ่เกิน 5MB', 413);

  let processed;
  try {
    processed = await processUpload(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof UploadError) return fail(err.message, 400);
    console.error('[slip] processing failed', err);
    return fail('ไม่สามารถประมวลผลรูปภาพนี้ได้ กรุณาลองรูปอื่น', 400);
  }

  // The stored location is unguessable and never reaches the guest's browser;
  // staff read it back through an authenticated proxy.
  const stored = await putImage(
    'slips',
    processed.data,
    processed.contentType,
    processed.extension,
  );

  const updated = await attachSlip(payment.id, stored.url);
  if (!updated) return fail('บันทึกสลิปไม่สำเร็จ', 500);

  return ok({ payment: publicPayment(updated) });
});
