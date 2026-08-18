import { kv, K } from './kv';
import { persist } from './sheets/queue';
import { TABS } from './sheets/schema';
import { markAwaitingPayment, markOrderPaid, markOrderUnpaid } from './orders';
import type { Payment } from './types';

/**
 * One payment per order, settled before the kitchen starts.
 *
 * Honest limitation: a doctored slip gets through if staff approve carelessly.
 * The design leans on making a mismatch obvious rather than on detection — the
 * expected amount is embedded in the QR, shown beside the slip at review time,
 * and the approving admin's name is recorded on the record. Swapping in an
 * automated verification API later touches only `attachSlip` and the admin
 * approve route.
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
 * Follows a repriced order. A payment raised against an order containing
 * something sold by weight starts at whatever the priced lines came to; once
 * the scale has spoken, the amount has to match or the guest transfers the
 * wrong figure and the slip fails review for no good reason.
 */
export async function updatePaymentAmount(
  id: string,
  amount: number,
): Promise<Payment | null> {
  const payment = await getPayment(id);
  if (!payment) return null;
  // Never move the goalposts after the guest has paid.
  if (payment.status === 'APPROVED' || payment.status === 'PENDING_REVIEW') {
    return payment;
  }
  return savePayment({ ...payment, amount });
}

export async function attachSlip(
  id: string,
  slipUrl: string,
): Promise<Payment | null> {
  const payment = await getPayment(id);
  if (!payment) return null;
  if (payment.status === 'APPROVED') return payment;

  const next = await savePayment({
    ...payment,
    slipUrl,
    slipUploadedAt: new Date().toISOString(),
    status: 'PENDING_REVIEW',
    rejectReason: null,
  });

  await kv()
    .zadd(K.pendingPayments, { score: Date.now(), member: id })
    .catch(() => {});
  await markAwaitingPayment(payment.orderId);
  return next;
}

/**
 * Staff confirm the money arrived.
 *
 * This is the gate the whole flow turns on: the order becomes visible to the
 * kitchen here and nowhere else. The session is deliberately left open — the
 * villa carries on ordering, and only /admin/sessions ends it.
 */
export async function approvePayment(
  id: string,
  adminName: string,
): Promise<Payment | null> {
  const payment = await getPayment(id);
  if (!payment) return null;
  if (payment.status === 'APPROVED') return payment;

  const next = await savePayment({
    ...payment,
    status: 'APPROVED',
    verifiedBy: adminName,
    verifiedAt: new Date().toISOString(),
    rejectReason: null,
  });

  await kv().zrem(K.pendingPayments, id).catch(() => {});
  await markOrderPaid(payment.orderId);
  return next;
}

export async function rejectPayment(
  id: string,
  adminName: string,
  reason: string,
): Promise<Payment | null> {
  const payment = await getPayment(id);
  if (!payment) return null;
  if (payment.status === 'APPROVED') return payment;

  const next = await savePayment({
    ...payment,
    status: 'REJECTED',
    verifiedBy: adminName,
    verifiedAt: new Date().toISOString(),
    rejectReason: reason,
  });

  await kv().zrem(K.pendingPayments, id).catch(() => {});
  // Hand the order back so the guest can transfer again and re-upload.
  await markOrderUnpaid(payment.orderId);
  return next;
}

export async function pendingPayments(): Promise<Payment[]> {
  const ids = await kv()
    .zrange<string[]>(K.pendingPayments, 0, -1)
    .catch(() => [] as string[]);
  if (!ids || ids.length === 0) return [];
  const rows: (Payment | null)[] = await kv()
    .mget<(Payment | null)[]>(...ids.map((id) => K.payment(id)))
    .catch(() => [] as (Payment | null)[]);
  return rows
    .filter((p): p is Payment => p !== null && p !== undefined)
    .filter((p) => p.status === 'PENDING_REVIEW')
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
