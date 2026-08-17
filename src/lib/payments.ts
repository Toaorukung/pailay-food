import { kv, K } from './kv';
import { paymentId as newPaymentId } from './ids';
import { persist } from './sheets/queue';
import { TABS } from './sheets/schema';
import { closeSession, updateSession } from './session';
import type { GuestSession, Order, Payment } from './types';

/**
 * Payment is PromptPay transfer plus a photo of the slip, verified by a human.
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

async function savePayment(p: Payment): Promise<Payment> {
  await kv().set(K.payment(p.id), p, { ex: PAYMENT_TTL_SECONDS });
  await persist(TABS.Payments, p.id, {
    payment_id: p.id,
    session_id: p.sessionId,
    order_ids: p.orderIds.join(','),
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
 * Opening a bill. The session is locked so the total cannot move after the
 * guest has seen the QR — otherwise they could add a dish post-scan and pay
 * the old, smaller amount.
 */
export async function createPayment(
  session: GuestSession,
  orders: Order[],
  amount: number,
): Promise<Payment> {
  const payment: Payment = {
    id: newPaymentId(),
    sessionId: session.id,
    tableLabel: session.tableLabel,
    villa: session.villa,
    orderIds: orders.map((o) => o.id),
    amount,
    method: 'promptpay',
    status: 'PENDING',
    slipUrl: null,
    slipUploadedAt: null,
    verifiedBy: null,
    verifiedAt: null,
    rejectReason: null,
    createdAt: new Date().toISOString(),
  };

  await savePayment(payment);
  await updateSession(session.id, {
    status: 'LOCKED',
    activePaymentId: payment.id,
  });
  return payment;
}

export async function attachSlip(
  id: string,
  slipUrl: string,
): Promise<Payment | null> {
  const payment = await getPayment(id);
  if (!payment) return null;
  if (payment.status === 'APPROVED') return payment;

  const next: Payment = {
    ...payment,
    slipUrl,
    slipUploadedAt: new Date().toISOString(),
    status: 'PENDING_REVIEW',
    rejectReason: null,
  };
  await savePayment(next);
  await kv()
    .zadd(K.pendingPayments, { score: Date.now(), member: id })
    .catch(() => {});
  return next;
}

export async function approvePayment(
  id: string,
  adminName: string,
): Promise<Payment | null> {
  const payment = await getPayment(id);
  if (!payment) return null;
  if (payment.status === 'APPROVED') return payment;

  const next: Payment = {
    ...payment,
    status: 'APPROVED',
    verifiedBy: adminName,
    verifiedAt: new Date().toISOString(),
    rejectReason: null,
  };
  await savePayment(next);
  await kv().zrem(K.pendingPayments, id).catch(() => {});

  // This is the moment the guest's link dies. Everything after here is a
  // read-only receipt; ordering again requires scanning the villa QR.
  await closeSession(payment.sessionId);
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

  const next: Payment = {
    ...payment,
    status: 'REJECTED',
    verifiedBy: adminName,
    verifiedAt: new Date().toISOString(),
    rejectReason: reason,
  };
  await savePayment(next);
  await kv().zrem(K.pendingPayments, id).catch(() => {});

  // Unlock so the guest can retry or add more food — but deliberately keep
  // `activePaymentId` pointing at the rejected record. Clearing it would drop
  // the payment out of the session snapshot, and the guest would never see the
  // reason their slip was refused.
  await updateSession(payment.sessionId, { status: 'OPEN' });
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
