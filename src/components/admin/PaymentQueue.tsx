'use client';

import { useState } from 'react';
import { Check, X, Wallet, ExternalLink, Info } from 'lucide-react';
import { useLive, adminFetch } from './adminApi';
import { Badge, Button, Card, Dialog, EmptyState, Skeleton, Textarea } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { Payment } from '@/lib/types';

/**
 * Slip verification.
 *
 * Verification is a human comparing two numbers, so the interface exists to
 * make a mismatch obvious: the expected amount is set in large type directly
 * beside the slip image, along with the villa and the time the guest uploaded.
 * The approving member of staff is recorded on the payment and in the audit
 * log, because "who approved this" is the first question asked when a total
 * does not reconcile at the end of the night.
 */
export function PaymentQueue() {
  const { data, loading, refresh } = useLive();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Payment | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const payments = data?.payments ?? [];

  async function approve(payment: Payment) {
    setBusy(payment.id);
    setError(null);
    const res = await adminFetch('/api/admin/payments?action=approve', {
      method: 'POST',
      body: JSON.stringify({ paymentId: payment.id }),
    });
    setBusy(null);
    if (!res.ok) setError(res.error);
    await refresh();
  }

  async function reject() {
    if (!rejecting) return;
    setBusy(rejecting.id);
    setError(null);
    const res = await adminFetch('/api/admin/payments?action=reject', {
      method: 'POST',
      body: JSON.stringify({ paymentId: rejecting.id, reason: reason.trim() }),
    });
    setBusy(null);
    setRejecting(null);
    setReason('');
    if (!res.ok) setError(res.error);
    await refresh();
  }

  if (loading && !data) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">ตรวจสลิป</h1>
        <p className="flex items-start gap-2 text-xs muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          เทียบยอดในสลิปกับยอดที่ระบบแจ้งให้ตรงกันทุกบาท และตรวจวันเวลาโอน —
          ยอดถูกฝังไว้ใน QR ตั้งแต่ต้น หากตัวเลขไม่ตรงแปลว่าไม่ใช่การโอนของบิลนี้
        </p>
      </header>

      {error && (
        <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {payments.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-10" />}
          title="ไม่มีสลิปรอตรวจสอบ"
          body="เมื่อแขกอัปโหลดสลิป รายการจะขึ้นที่นี่ภายในไม่กี่วินาที"
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {payments.map((payment) => (
            <Card key={payment.id} className="space-y-3">
              <header className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{payment.villa || payment.tableLabel}</p>
                  <p className="text-xs muted tabular">
                    {payment.id} · อัปโหลด{' '}
                    {payment.slipUploadedAt
                      ? new Date(payment.slipUploadedAt).toLocaleString('th-TH', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </p>
                </div>
                <Badge tone="warning">รอตรวจสอบ</Badge>
              </header>

              <div className="rounded-xl bg-[var(--surface-sunken)] p-3 text-center">
                <p className="text-xs muted">ยอดที่ต้องได้รับ</p>
                <p className="text-3xl font-bold tabular">
                  {formatMoney(payment.amount)}
                </p>
                <p className="text-xs muted">
                  {payment.orderId}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setZoom(`/api/admin/slip/${payment.id}`)}
                className="group relative block w-full overflow-hidden rounded-xl border border-[var(--line)]"
              >
                {/* Served through an authenticated proxy — the blob URL never
                    reaches the browser. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/admin/slip/${payment.id}`}
                  alt={`สลิป ${payment.id}`}
                  className="max-h-80 w-full bg-white object-contain"
                />
                <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <ExternalLink className="size-3" />
                  ดูเต็มจอ
                </span>
              </button>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  full
                  disabled={busy === payment.id}
                  onClick={() => {
                    setRejecting(payment);
                    setReason('');
                  }}
                >
                  <X className="size-4" />
                  ปฏิเสธ
                </Button>
                <Button
                  variant="success"
                  full
                  loading={busy === payment.id}
                  onClick={() => {
                    if (
                      confirm(
                        `ยืนยันรับเงิน ${formatMoney(payment.amount)} จาก ${payment.villa || payment.tableLabel}?\n\nการยืนยันจะปิดเซสชันของแขกทันที และลิงก์เดิมจะสั่งอาหารต่อไม่ได้`,
                      )
                    ) {
                      approve(payment);
                    }
                  }}
                >
                  <Check className="size-4" />
                  ยืนยันรับเงิน
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(rejecting)}
        onOpenChange={(open) => !open && setRejecting(null)}
        title="ปฏิเสธสลิป"
        description="แขกจะเห็นเหตุผลนี้และอัปโหลดสลิปใหม่ได้"
        footer={
          <>
            <Button variant="secondary" full onClick={() => setRejecting(null)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              full
              disabled={reason.trim().length === 0}
              onClick={reject}
            >
              ปฏิเสธ
            </Button>
          </>
        }
      >
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder="เช่น ยอดในสลิปไม่ตรงกับยอดบิล / สลิปไม่ชัด"
        />
      </Dialog>

      <Dialog
        open={Boolean(zoom)}
        onOpenChange={(open) => !open && setZoom(null)}
        title="สลิปการโอน"
      >
        {zoom && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={zoom} alt="สลิป" className="w-full rounded-xl bg-white" />
        )}
      </Dialog>
    </div>
  );
}
