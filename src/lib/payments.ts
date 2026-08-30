import { kv, K } from './kv';
import { persist } from './sheets/queue';
import { TABS } from './sheets/schema';
import type { Payment } from './types';

/**
 * One payment per order, recorded after the fact.
 *
 * Guests do not pay through the app. They transfer to the villa or settle at
 * reception, and an admin then uploads the transfer slip against the order on
 * /admin/payments. So a payment record here is a receipt, not a gate: it never
 * decides whether food is cooked, only whether the order counts as money in.
 *
 * The states that matter:
 *   PENDING   raised with the order, waiting for an admin to upload the slip
 *   APPROVED  slip uploaded and attributed to the admin who did it
 *
 * PENDING_REVIEW and REJECTED belonged to the earlier guest-pays-in-app flow.
 * Nothing produces them now; historic rows still read back correctly.
 *
 * Honest limitation: nothing verifies the slip against the bank. The design
 * leans on attribution — the expected amount sits beside the upload button and
 * the uploading admin's name is written onto the record and into the audit log
 * — because "who put this slip here" is the first question asked when the
 * night's takings do not reconcile.
 */

const PAYMENT_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function getPayment(id: string): Promise<Payment | null> {
  return (await kv().get<Payment>(K.payment(id)).catch(() => null)) ?? null;
}

export async function savePayment(p: Payment): Promise<Payment> {
  await kv().set(K.payment(p.id), p, { ex: PAYMENT_TTL_SECONDS });
  await persist(TABS.Payments, p.id, {
    payment_id: p.id,
    session_id: p.sessionId,
    order_ids: p.orderId,
    amount: p.amount,
    method: p.method,
    status: p.status,
    slip_url: p.slipUrl ?? '',
    slip_uploaded_at: p.slipUploadedAt ?? '',
    verified_by: p.verifiedBy ?? '',
    verified_at: p.verifiedAt ?? '',
    reject_reason: p.rejectReason ?? '',
  });
  return p;
}

/**
 * Follows an order whose lines changed — a dish removed on the phone, a
 * quantity corrected, or a market-price line finally weighed.
 *
 * Never moves the figure once a slip is in: the amount on an APPROVED payment
 * is what the slip actually shows, and rewriting it would make the record
 * disagree with the evidence attached to it.
 */
export async function updatePaymentAmount(
  id: string,
  amount: number,
): Promise<Payment | null> {
  const payment = await getPayment(id);
  if (!payment) return null;
  if (payment.status === 'APPROVED') return payment;
  return savePayment({ ...payment, amount });
}

/**
 * Puts a payment into the queue of slips an admin still has to upload.
 *
 * Called when staff confirm the order, not when the guest places it: a ticket
 * nobody has agreed to yet is not money anyone is chasing.
 */
export async function markAwaitingSlip(id: string): Promise<void> {
  await kv()
    .zadd(K.pendingPayments, { score: Date.now(), member: id })
    .catch(() => {});
}

/** Takes a payment out of the queue — the order was cancelled. */
export async function dropFromSlipQueue(id: string): Promise<void> {
  await kv().zrem(K.pendingPayments, id).catch(() => {});
}

/**
 * An admin records the transfer.
 *
 * This is what turns an order into revenue. The slip image itself is stored
 * privately and only ever served back through the authenticated admin proxy —
 * it carries the guest's name and the amount they sent.
 */
export async function attachSlipAsAdmin(
  id: string,
  slipUrl: string,
  adminName: string,
): Promise<Payment | null> {
  const payment = await getPayment(id);
  if (!payment) return null;

  const now = new Date().toISOString();
  const next = await savePayment({
    ...payment,
    slipUrl,
    slipUploadedAt: now,
    status: 'APPROVED',
    verifiedBy: adminName,
    verifiedAt: now,
    rejectReason: null,
  });

  await dropFromSlipQueue(id);

  // Automatically end the guest stay (close session) upon slip upload
  if (payment.sessionId) {
    const { closeSession } = await import('./session');
    await closeSession(payment.sessionId, `Auto-closed on slip upload by ${adminName}`).catch((err) => {
      console.error('[payments] failed to auto close session on slip upload', err);
    });
  }

  return next;
}

/**
 * Undoes an upload — wrong slip, wrong order, wrong bill.
 *
 * The old image is dropped from the record and the payment goes back into the
 * queue. The blob itself is left in storage rather than deleted: an admin who
 * has just realised they filed a slip against the wrong villa is the last
 * person whose mistake should also destroy the evidence.
 */
export async function clearSlip(
  id: string,
  adminName: string,
): Promise<Payment | null> {
  const payment = await getPayment(id);
  if (!payment) return null;

  const next = await savePayment({
    ...payment,
    slipUrl: null,
    slipUploadedAt: null,
    status: 'PENDING',
    verifiedBy: adminName,
    verifiedAt: null,
    rejectReason: null,
  });

  await markAwaitingSlip(id);
  return next;
}

/** Confirmed orders whose slip an admin has not uploaded yet, oldest first. */
export async function pendingSlipPayments(): Promise<Payment[]> {
  const ids = await kv()
    .zrange<string[]>(K.pendingPayments, 0, -1)
    .catch(() => [] as string[]);
  if (!ids || ids.length === 0) return [];
  const rows: (Payment | null)[] = await kv()
    .mget<(Payment | null)[]>(...ids.map((id) => K.payment(id)))
    .catch(() => [] as (Payment | null)[]);
  return rows
    .filter((p): p is Payment => p !== null && p !== undefined)
    .filter((p) => p.status !== 'APPROVED')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Every payment raised for a session, for the guest's own history. */
export async function sessionPayments(ids: string[]): Promise<Payment[]> {
  if (ids.length === 0) return [];
  const rows: (Payment | null)[] = await kv()
    .mget<(Payment | null)[]>(...ids.map((id) => K.payment(id)))
    .catch(() => [] as (Payment | null)[]);
  return rows.filter((p): p is Payment => p !== null && p !== undefined);
}
