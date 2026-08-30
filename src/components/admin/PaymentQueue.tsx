'use client';

import { useRef, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Info,
  Phone,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import { useLive, adminFetch } from './adminApi';
import { Badge, Button, Card, Dialog, EmptyState, Skeleton } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { isConfirmed, type Order, type Payment } from '@/lib/types';

/**
 * Orders waiting for their transfer slip.
 *
 * Guests do not pay through the app any more — they transfer to the villa or
 * settle at reception — so this screen is not a review queue. It is the list
 * of confirmed orders nobody has recorded the money for yet, and the job on
 * each row is to attach the slip.
 *
 * Uploading is what makes an order count as revenue, and the uploading admin's
 * name goes onto the payment and into the audit log. Nothing here affects the
 * kitchen: that was settled when the order was confirmed, so a slip arriving
 * an hour later never holds up food.
 */
export function PaymentQueue() {
  const { data, loading, refresh } = useLive();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const orders = data?.orders ?? [];
  const payments = data?.payments ?? {};

  // Confirmed and unsettled, oldest first — the bill that has been outstanding
  // longest is the one to chase.
  const awaiting = orders
    .filter((o) => isConfirmed(o.status) && payments[o.id]?.status !== 'APPROVED')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Settled today, so an admin can check what they filed and undo a mistake.
  const today = new Date().toISOString().slice(0, 10);
  const settled = orders
    .filter(
      (o) =>
        payments[o.id]?.status === 'APPROVED' && o.createdAt.startsWith(today),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function upload(payment: Payment, file: File) {
    setBusy(payment.id);
    setError(null);
    setNotice(null);

    const form = new FormData();
    form.append('paymentId', payment.id);
    form.append('slip', file, file.name || 'slip.jpg');

    const res = await adminFetch<{ payment: Payment; sessionClosed?: boolean }>('/api/admin/payments', {
      method: 'POST',
      body: form,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
    } else {
      setNotice(`บันทึกสลิปและจบการเข้าพักของ ${payment.villa || payment.tableLabel} เรียบร้อยแล้ว`);
      setTimeout(() => setNotice(null), 5000);
    }
    await refresh();
  }

  async function clearSlip(payment: Payment) {
    setBusy(payment.id);
    setError(null);
    const res = await adminFetch('/api/admin/payments?action=clear', {
      method: 'POST',
      body: JSON.stringify({ paymentId: payment.id }),
    });
    setBusy(null);
    if (!res.ok) setError(res.error);
    await refresh();
  }

  if (loading && !data) return <Skeleton className="h-64" />;

  const outstanding = awaiting.reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">อัปโหลดสลิปชำระเงิน</h1>
        <p className="flex items-start gap-2 text-xs muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          ออเดอร์ที่ยืนยันแล้วแต่ยังไม่ได้บันทึกการชำระเงิน
          เมื่อได้รับสลิปโอนจากลูกค้าให้อัปโหลดที่การ์ดของออเดอร์นั้น —
          ระบบจะบันทึกรายได้และจบการเข้าพักของวิลล่าให้อัตโนมัติ
        </p>
      </header>

      {notice && (
        <p className="rounded-xl bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">
          {notice}
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {awaiting.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-10" />}
          title="ไม่มีออเดอร์ที่รออัปโหลดสลิป"
          body="ออเดอร์ที่พนักงานกดยืนยันแล้วจะขึ้นที่นี่จนกว่าจะอัปโหลดสลิปการโอน"
        />
      ) : (
        <>
          <Card className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">
              ค้างชำระ {awaiting.length} ออเดอร์
            </span>
            <span className="text-xl font-bold tabular text-[var(--danger)]">
              {formatMoney(outstanding)}
            </span>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            {awaiting.map((order) => {
              const payment = payments[order.id];
              if (!payment) return null;
              return (
                <AwaitingCard
                  key={order.id}
                  order={order}
                  payment={payment}
                  phone={
                    data?.openSessions.find((s) => s.id === order.sessionId)
                      ?.guestPhone ?? ''
                  }
                  busy={busy === payment.id}
                  onUpload={(file) => upload(payment, file)}
                />
              );
            })}
          </div>
        </>
      )}

      {settled.length > 0 && (
        <section className="space-y-3">
          <h2 className="eyebrow">บันทึกการชำระเงินวันนี้ ({settled.length})</h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {settled.map((order) => {
              const payment = payments[order.id];
              if (!payment) return null;
              return (
                <Card key={order.id} className="space-y-3">
                  <header className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">
                        {order.villa || order.tableLabel}
                      </p>
                      <p className="text-xs muted tabular">
                        {order.id} · บันทึกโดย {payment.verifiedBy || '—'}
                      </p>
                    </div>
                    <Badge tone="success">
                      <CheckCircle2 className="size-3" />
                      {formatMoney(payment.amount)}
                    </Badge>
                  </header>

                  <button
                    type="button"
                    onClick={() => setZoom(`/api/admin/slip/${payment.id}`)}
                    className="group relative block w-full overflow-hidden rounded-xl border border-[var(--line)]"
                  >
                    {/* Served through an authenticated proxy — the blob URL
                        never reaches the browser. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/admin/slip/${payment.id}`}
                      alt={`สลิป ${order.id}`}
                      className="max-h-56 w-full bg-white object-contain"
                    />
                    <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <ExternalLink className="size-3" />
                      ดูเต็มจอ
                    </span>
                  </button>

                  <Button
                    variant="secondary"
                    full
                    disabled={busy === payment.id}
                    onClick={() => {
                      if (
                        confirm(
                          `นำสลิปของออเดอร์ ${order.id} ออก?\n\nออเดอร์จะกลับไปอยู่ในรายการรออัปโหลดสลิป และไม่ถูกนับเป็นรายได้จนกว่าจะอัปโหลดใหม่`,
                        )
                      ) {
                        clearSlip(payment);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                    นำสลิปออก / อัปโหลดใหม่
                  </Button>
                </Card>
              );
            })}
          </div>
        </section>
      )}

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

function AwaitingCard({
  order,
  payment,
  phone,
  busy,
  onUpload,
}: {
  order: Order;
  payment: Payment;
  phone: string;
  busy: boolean;
  onUpload: (file: File) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const waitedHours = Math.floor(
    (Date.now() - Date.parse(order.confirmedAt ?? order.createdAt)) / 3_600_000,
  );

  return (
    <Card className="space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold">{order.villa || order.tableLabel}</p>
          <p className="text-xs muted tabular">
            {order.id} ·{' '}
            {new Date(order.createdAt).toLocaleString('th-TH', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <Badge tone={waitedHours >= 12 ? 'danger' : 'warning'}>รอสลิป</Badge>
      </header>

      <div className="rounded-xl bg-[var(--surface-sunken)] p-3 text-center">
        <p className="text-xs muted">ยอดที่ต้องได้รับ</p>
        <p className="text-3xl font-bold tabular">{formatMoney(payment.amount)}</p>
        {phone && (
          <a
            href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
            className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand)] tabular"
          >
            <Phone className="size-3.5" />
            {phone}
          </a>
        )}
      </div>

      <ul className="space-y-1 text-sm">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              <span className="tabular">{item.qty}×</span>{' '}
              {item.name.th || item.name.en}
            </span>
            <span className="shrink-0 tabular muted">
              {formatMoney(item.lineTotal)}
            </span>
          </li>
        ))}
      </ul>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared immediately so picking the same file twice re-fires.
          e.target.value = '';
          if (file) onUpload(file);
        }}
      />
      <Button
        full
        variant="success"
        loading={busy}
        onClick={() => fileInput.current?.click()}
      >
        <Upload className="size-4" />
        อัปโหลดสลิป
      </Button>
    </Card>
  );
}
