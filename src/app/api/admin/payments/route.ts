import { requireAdmin } from '@/lib/admin/auth';
import { attachSlipAsAdmin, clearSlip, getPayment } from '@/lib/payments';
import { processUpload, UploadError, MAX_UPLOAD_BYTES } from '@/lib/images';
import { putImage } from '@/lib/storage';
import { paymentIdSchema, parseBody } from '@/lib/validation';
import { audit } from '@/lib/audit';
import { clientIp } from '@/lib/ratelimit';
import { handler, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
// sharp needs the Node runtime; it does not run on the edge.
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Recording payment.
 *
 * Guests no longer pay through the app — they transfer to the villa or settle
 * at reception — so this is where the money is written down: an admin uploads
 * the transfer slip against the order, which is what makes it count as
 * revenue. Nothing here gates the kitchen; that was decided at confirm time.
 *
 * The uploaded file is sniffed and re-encoded before it is stored, exactly as
 * a guest upload was. An admin account is not a reason to keep bytes nobody
 * has inspected, and the re-encode is what strips EXIF and anything riding
 * along behind the image data.
 */
export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'STAFF');
  if (!auth.ok) return auth.response;

  const action = new URL(req.url).searchParams.get('action');

  // ── Remove a slip filed against the wrong order ───────────
  if (action === 'clear') {
    const body = await parseBody(req, paymentIdSchema);
    if (!body.ok) return fail(body.error);

    const payment = await clearSlip(body.data.paymentId, auth.admin.name);
    if (!payment) return fail('ไม่พบรายการชำระเงิน', 404);

    await audit(
      auth.admin,
      'payment.clearSlip',
      payment.id,
      { amount: payment.amount, orderId: payment.orderId },
      clientIp(req),
    );
    return ok({ payment });
  }

  // ── Upload the slip ──────────────────────────────────────
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

  const paymentId = String(form.get('paymentId') ?? '');
  if (!paymentId) return fail('ต้องระบุรายการชำระเงิน', 400);

  const payment = await getPayment(paymentId);
  if (!payment) return fail('ไม่พบรายการชำระเงิน', 404);

  const file = form.get('slip');
  if (!(file instanceof File)) return fail('กรุณาเลือกไฟล์สลิป', 400);
  if (file.size === 0) return fail('ไฟล์ว่าง', 400);
  if (file.size > MAX_UPLOAD_BYTES) return fail('ไฟล์ใหญ่เกิน 5MB', 413);

  let processed;
  try {
    processed = await processUpload(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof UploadError) return fail(err.message, 400);
    console.error('[payments] slip processing failed', err);
    return fail('ไม่สามารถประมวลผลรูปภาพนี้ได้ กรุณาลองรูปอื่น', 400);
  }

  // Stored privately. Staff read it back through the authenticated proxy at
  // /api/admin/slip/<paymentId>; the blob address never reaches a browser.
  const stored = await putImage(
    'slips',
    processed.data,
    processed.contentType,
    processed.extension,
  );

  const updated = await attachSlipAsAdmin(paymentId, stored.url, auth.admin.name);
  if (!updated) return fail('บันทึกสลิปไม่สำเร็จ', 500);

  await audit(
    auth.admin,
    'payment.slipUploaded',
    updated.id,
    { amount: updated.amount, orderId: updated.orderId, villa: updated.villa },
    clientIp(req),
  );

  return ok({ payment: updated });
});
