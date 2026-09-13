import { requireAdmin } from '@/lib/admin/auth';
import {
  clearMultiplePayments,
  settleMultiplePaymentsAsAdmin,
} from '@/lib/payments';
import { processUpload, UploadError, MAX_UPLOAD_BYTES } from '@/lib/images';
import { putImage } from '@/lib/storage';
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
 * Guests settle at reception or transfer — staff record payments here:
 * 1. Cash: recorded directly without slip (`action=cash`).
 * 2. Transfer: recorded with transfer slip uploaded (`action=slip` or POST).
 * Supports single payment or consolidated bills with multiple payment IDs.
 */
export const POST = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'STAFF');
  if (!auth.ok) return auth.response;

  const action = new URL(req.url).searchParams.get('action');

  // ── Remove a slip or undo payment ─────────────────────────
  if (action === 'clear') {
    const raw = (await req.json().catch(() => ({}))) as {
      paymentId?: string;
      paymentIds?: string[];
    };
    const paymentIds: string[] = [];
    if (Array.isArray(raw.paymentIds)) {
      paymentIds.push(...raw.paymentIds.map(String).filter(Boolean));
    }
    if (raw.paymentId && !paymentIds.includes(raw.paymentId)) {
      paymentIds.push(raw.paymentId);
    }
    if (paymentIds.length === 0) return fail('ต้องระบุรายการชำระเงิน', 400);

    const cleared = await clearMultiplePayments(paymentIds, auth.admin.name);
    if (cleared.length === 0) return fail('ไม่พบรายการชำระเงิน', 404);

    for (const p of cleared) {
      await audit(
        auth.admin,
        'payment.clearSlip',
        p.id,
        { amount: p.amount, orderId: p.orderId },
        clientIp(req),
      );
    }
    return ok({ payment: cleared[0], payments: cleared });
  }

  // ── Cash Payment (no slip required) ──────────────────────
  if (action === 'cash') {
    const raw = (await req.json().catch(() => ({}))) as {
      paymentId?: string;
      paymentIds?: string[];
    };
    const paymentIds: string[] = [];
    if (Array.isArray(raw.paymentIds)) {
      paymentIds.push(...raw.paymentIds.map(String).filter(Boolean));
    }
    if (raw.paymentId && !paymentIds.includes(raw.paymentId)) {
      paymentIds.push(raw.paymentId);
    }
    if (paymentIds.length === 0) return fail('ต้องระบุรายการชำระเงิน', 400);

    const updated = await settleMultiplePaymentsAsAdmin(
      paymentIds,
      'cash',
      auth.admin.name,
    );
    if (updated.length === 0) return fail('ไม่พบรายการชำระเงิน', 404);

    for (const p of updated) {
      await audit(
        auth.admin,
        'payment.cashSettled',
        p.id,
        { amount: p.amount, orderId: p.orderId, villa: p.villa },
        clientIp(req),
      );
    }

    const sessions = Array.from(
      new Set(updated.map((p) => p.sessionId).filter(Boolean)),
    );
    for (const sId of sessions) {
      await audit(
        auth.admin,
        'session.close',
        sId,
        {
          reason: 'Auto-closed on cash payment',
          villa: updated[0]?.villa,
        },
        clientIp(req),
      );
    }

    return ok({ payment: updated[0], payments: updated, sessionClosed: true });
  }

  // ── Upload the slip (Transfer / PromptPay) ────────────────
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

  const paymentIds: string[] = [];
  const rawIds = form.get('paymentIds');
  if (rawIds && typeof rawIds === 'string') {
    try {
      const parsed = JSON.parse(rawIds);
      if (Array.isArray(parsed)) {
        paymentIds.push(...parsed.map(String).filter(Boolean));
      } else {
        paymentIds.push(...rawIds.split(',').map((s) => s.trim()).filter(Boolean));
      }
    } catch {
      paymentIds.push(...rawIds.split(',').map((s) => s.trim()).filter(Boolean));
    }
  }
  const singleId = String(form.get('paymentId') ?? '');
  if (singleId && !paymentIds.includes(singleId)) {
    paymentIds.push(singleId);
  }
  if (paymentIds.length === 0) return fail('ต้องระบุรายการชำระเงิน', 400);

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

  const updated = await settleMultiplePaymentsAsAdmin(
    paymentIds,
    'promptpay',
    auth.admin.name,
    stored.url,
  );
  if (updated.length === 0) return fail('บันทึกสลิปไม่สำเร็จ', 500);

  for (const p of updated) {
    await audit(
      auth.admin,
      'payment.slipUploaded',
      p.id,
      { amount: p.amount, orderId: p.orderId, villa: p.villa },
      clientIp(req),
    );
  }

  const sessions = Array.from(
    new Set(updated.map((p) => p.sessionId).filter(Boolean)),
  );
  for (const sId of sessions) {
    await audit(
      auth.admin,
      'session.close',
      sId,
      {
        reason: 'Auto-closed on slip upload',
        paymentIds: updated.map((p) => p.id),
        villa: updated[0]?.villa,
      },
      clientIp(req),
    );
  }

  return ok({ payment: updated[0], payments: updated, sessionClosed: true });
});
