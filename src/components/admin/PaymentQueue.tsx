'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  ExternalLink,
  Info,
  Phone,
  ReceiptText,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import { useLive, adminFetch } from './adminApi';
import { Badge, Button, Card, Dialog, EmptyState, Skeleton } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { isConfirmed, type Order, type Payment } from '@/lib/types';

/**
 * Consolidated bill waiting for payment (Cash or Transfer slip).
 * Orders belonging to the same guest session (e.g. "as54a354s") are grouped
 * into one bill so staff can settle all of them together.
 */
interface AwaitingBillGroup {
  key: string;
  sessionId: string;
  villa: string;
  tableLabel: string;
  orders: Order[];
  payments: Payment[];
  totalAmount: number;
  phone: string;
  earliestCreatedAt: string;
  waitedHours: number;
}

interface SettledBillGroup {
  key: string;
  sessionId: string;
  villa: string;
  orders: Order[];
  payments: Payment[];
  totalAmount: number;
  method: string;
  slipUrl: string | null;
  paymentIdForSlip: string | null;
  verifiedBy: string;
  settledAt: string;
}

export function PaymentQueue() {
  const { data, loading, refresh } = useLive();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [cashConfirm, setCashConfirm] = useState<AwaitingBillGroup | null>(null);

  const orders = data?.orders ?? [];
  const payments = data?.payments ?? {};

  // Confirmed and unsettled orders
  const awaitingOrders = useMemo(() => {
    return orders
      .filter((o) => isConfirmed(o.status) && payments[o.id]?.status !== 'APPROVED')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [orders, payments]);

  // Group awaiting orders by sessionId (or order.id if no session)
  const awaitingGroups = useMemo(() => {
    const map = new Map<string, AwaitingBillGroup>();
    for (const order of awaitingOrders) {
      const key = order.sessionId || order.id;
      const payment = payments[order.id];
      const phone =
        data?.openSessions.find((s) => s.id === order.sessionId)?.guestPhone ?? '';

      let group = map.get(key);
      if (!group) {
        group = {
          key,
          sessionId: order.sessionId || '',
          villa: order.villa || order.tableLabel,
          tableLabel: order.tableLabel,
          orders: [],
          payments: [],
          totalAmount: 0,
          phone,
          earliestCreatedAt: order.createdAt,
          waitedHours: 0,
        };
        map.set(key, group);
      }
      group.orders.push(order);
      if (payment) group.payments.push(payment);
      group.totalAmount += order.total;
      if (order.createdAt.localeCompare(group.earliestCreatedAt) < 0) {
        group.earliestCreatedAt = order.createdAt;
      }
      if (!group.phone && phone) {
        group.phone = phone;
      }
    }

    return Array.from(map.values())
      .map((g) => {
        const earliestTime = Date.parse(g.earliestCreatedAt);
        const waitedHours = isNaN(earliestTime)
          ? 0
          : Math.floor((Date.now() - earliestTime) / 3_600_000);
        return { ...g, waitedHours };
      })
      .sort((a, b) => a.earliestCreatedAt.localeCompare(b.earliestCreatedAt));
  }, [awaitingOrders, payments, data?.openSessions]);

  // Settled today
  const today = new Date().toISOString().slice(0, 10);
  const settledOrders = useMemo(() => {
    return orders
      .filter(
        (o) =>
          payments[o.id]?.status === 'APPROVED' && o.createdAt.startsWith(today),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, payments, today]);

  // Group settled orders
  const settledGroups = useMemo(() => {
    const map = new Map<string, SettledBillGroup>();
    for (const order of settledOrders) {
      const payment = payments[order.id];
      if (!payment) continue;

      const key = `${order.sessionId || order.id}_${payment.method || 'promptpay'}_${payment.slipUrl || 'cash'}`;
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          sessionId: order.sessionId || '',
          villa: order.villa || order.tableLabel,
          orders: [],
          payments: [],
          totalAmount: 0,
          method: payment.method || 'promptpay',
          slipUrl: payment.slipUrl,
          paymentIdForSlip: payment.id,
          verifiedBy: payment.verifiedBy || '',
          settledAt: payment.verifiedAt || order.createdAt,
        };
        map.set(key, group);
      }
      group.orders.push(order);
      group.payments.push(payment);
      group.totalAmount += payment.amount;
    }
    return Array.from(map.values());
  }, [settledOrders, payments]);

  // Settle by cash
  async function settleCash(group: AwaitingBillGroup) {
    const paymentIds = group.payments.map((p) => p.id);
    if (paymentIds.length === 0) return;

    setBusy(group.key);
    setError(null);
    setNotice(null);

    const res = await adminFetch<{ payments: Payment[]; sessionClosed?: boolean }>(
      '/api/admin/payments?action=cash',
      {
        method: 'POST',
        body: JSON.stringify({ paymentIds }),
      },
    );
    setBusy(null);
    setCashConfirm(null);

    if (!res.ok) {
      setError(res.error);
    } else {
      const orderCountText =
        group.orders.length > 1 ? ` (${group.orders.length} ออเดอร์)` : '';
      setNotice(
        `บันทึกชำระเงินสด ${formatMoney(group.totalAmount)} ของ ${group.villa}${orderCountText} เรียบร้อยแล้ว`,
      );
      setTimeout(() => setNotice(null), 5000);
    }
    await refresh();
  }

  // Settle by transfer (upload slip)
  async function uploadSlip(group: AwaitingBillGroup, file: File) {
    const paymentIds = group.payments.map((p) => p.id);
    if (paymentIds.length === 0) return;

    setBusy(group.key);
    setError(null);
    setNotice(null);

    const form = new FormData();
    form.append('paymentIds', JSON.stringify(paymentIds));
    form.append('paymentId', paymentIds[0]);
    form.append('slip', file, file.name || 'slip.jpg');

    const res = await adminFetch<{ payment: Payment; sessionClosed?: boolean }>(
      '/api/admin/payments',
      {
        method: 'POST',
        body: form,
      },
    );
    setBusy(null);

    if (!res.ok) {
      setError(res.error);
    } else {
      const orderCountText =
        group.orders.length > 1 ? ` (${group.orders.length} ออเดอร์)` : '';
      setNotice(
        `บันทึกสลิปและจบการเข้าพักของ ${group.villa}${orderCountText} เรียบร้อยแล้ว`,
      );
      setTimeout(() => setNotice(null), 5000);
    }
    await refresh();
  }

  // Clear payment / slip
  async function clearGroup(group: SettledBillGroup) {
    const paymentIds = group.payments.map((p) => p.id);
    if (paymentIds.length === 0) return;

    setBusy(group.key);
    setError(null);

    const res = await adminFetch('/api/admin/payments?action=clear', {
      method: 'POST',
      body: JSON.stringify({ paymentIds }),
    });
    setBusy(null);

    if (!res.ok) {
      setError(res.error);
    } else {
      setNotice(`ยกเลิกรายการชำระเงินของ ${group.villa} แล้ว`);
      setTimeout(() => setNotice(null), 4000);
    }
    await refresh();
  }

  if (loading && !data) return <Skeleton className="h-64" />;

  const outstanding = awaitingOrders.reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">การเงิน & ชำระเงิน</h1>
        <p className="flex items-start gap-2 text-xs muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          ออเดอร์ที่ยืนยันแล้วแต่ยังไม่ได้บันทึกการชำระเงิน
          สามารถเลือกได้ว่าจะชำระเป็นเงินสด หรือโอนจ่าย (อัปโหลดสลิป) —
          ออเดอร์จากรหัสหรือเซสชันเดียวกันจะรวมบิลให้โดยอัตโนมัติ
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

      {awaitingGroups.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-10" />}
          title="ไม่มีออเดอร์ที่รอชำระเงิน"
          body="ออเดอร์ที่พนักงานกดยืนยันแล้วจะขึ้นที่นี่จนกว่าจะบันทึกชำระเงินสดหรืออัปโหลดสลิป"
        />
      ) : (
        <>
          <Card className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">
              ค้างชำระ {awaitingGroups.length} บิล ({awaitingOrders.length} ออเดอร์)
            </span>
            <span className="text-xl font-bold tabular text-[var(--danger)]">
              {formatMoney(outstanding)}
            </span>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            {awaitingGroups.map((group) => (
              <AwaitingBillCard
                key={group.key}
                group={group}
                busy={busy === group.key}
                onCash={() => setCashConfirm(group)}
                onUploadSlip={(file) => uploadSlip(group, file)}
              />
            ))}
          </div>
        </>
      )}

      {settledGroups.length > 0 && (
        <section className="space-y-3">
          <h2 className="eyebrow">
            บันทึกการชำระเงินวันนี้ ({settledGroups.length} บิล / {settledOrders.length} ออเดอร์)
          </h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {settledGroups.map((group) => {
              const isCash = group.method === 'cash';
              return (
                <Card key={group.key} className="space-y-3">
                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold">{group.villa}</p>
                      <p className="text-xs muted tabular truncate">
                        {group.sessionId ? `ID: ${group.sessionId}` : group.orders[0]?.id} ·{' '}
                        {group.orders.length > 1
                          ? `รวม ${group.orders.length} ออเดอร์ · `
                          : ''}
                        บันทึกโดย {group.verifiedBy || '—'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={isCash ? 'neutral' : 'success'}>
                        {isCash ? (
                          <>
                            <Banknote className="size-3" />
                            เงินสด
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="size-3" />
                            โอนจ่าย
                          </>
                        )}
                      </Badge>
                      <span className="font-bold tabular text-sm">
                        {formatMoney(group.totalAmount)}
                      </span>
                    </div>
                  </header>

                  {/* If transfer and has slip */}
                  {!isCash && group.slipUrl && group.paymentIdForSlip && (
                    <button
                      type="button"
                      onClick={() => setZoom(`/api/admin/slip/${group.paymentIdForSlip}`)}
                      className="group relative block w-full overflow-hidden rounded-xl border border-[var(--line)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/admin/slip/${group.paymentIdForSlip}`}
                        alt={`สลิป ${group.villa}`}
                        className="max-h-48 w-full bg-white object-contain"
                      />
                      <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <ExternalLink className="size-3" />
                        ดูสลิปเต็มจอ
                      </span>
                    </button>
                  )}

                  {/* If cash */}
                  {isCash && (
                    <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-sunken)] p-3 text-xs text-muted">
                      <Banknote className="size-4 text-[var(--success)] shrink-0" />
                      <span>
                        ชำระด้วยเงินสดเรียบร้อยแล้ว ยอดรวม{' '}
                        <span className="font-semibold tabular text-[var(--foreground)]">
                          {formatMoney(group.totalAmount)}
                        </span>
                      </span>
                    </div>
                  )}

                  {/* Summary of items in settled bill */}
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)]/40 p-2.5 text-xs">
                    <p className="mb-1 font-medium text-muted">
                      รายการออเดอร์ ({group.orders.length} ออเดอร์):
                    </p>
                    <ul className="space-y-1">
                      {group.orders.map((ord) => (
                        <li key={ord.id} className="flex justify-between gap-2">
                          <span className="truncate tabular">
                            {ord.id}: {ord.items.map((i) => `${i.qty}× ${i.name.th || i.name.en}`).join(', ')}
                          </span>
                          <span className="shrink-0 tabular font-medium">
                            {formatMoney(ord.total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button
                    variant="secondary"
                    full
                    disabled={busy === group.key}
                    onClick={() => {
                      if (
                        confirm(
                          `นำรายการชำระเงินของ ${group.villa} (${group.orders.length} ออเดอร์) ออก?\n\nออเดอร์จะกลับไปอยู่ในรายการรอชำระเงิน และไม่ถูกนับเป็นรายได้จนกว่าจะบันทึกใหม่`,
                        )
                      ) {
                        clearGroup(group);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                    {isCash ? 'ยกเลิกการชำระเงิน / แก้ไข' : 'นำสลิปออก / ชำระใหม่'}
                  </Button>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Slip zoom modal */}
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

      {/* Cash confirmation modal */}
      <Dialog
        open={Boolean(cashConfirm)}
        onOpenChange={(open) => !open && setCashConfirm(null)}
        title="ยืนยันรับชำระเงินสด"
      >
        {cashConfirm && (
          <div className="space-y-4 pt-1">
            <div className="rounded-xl bg-[var(--surface-sunken)] p-4 text-center space-y-1">
              <p className="text-xs text-muted">ยอดเงินสดที่ต้องรับ</p>
              <p className="text-3xl font-bold tabular text-[var(--success)]">
                {formatMoney(cashConfirm.totalAmount)}
              </p>
              <p className="text-xs text-muted pt-1">
                {cashConfirm.villa} · {cashConfirm.sessionId ? `ID: ${cashConfirm.sessionId}` : cashConfirm.key}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--line)] p-3 text-xs space-y-1.5">
              <p className="font-semibold text-[var(--foreground)]">
                รายละเอียดการรวมบิล ({cashConfirm.orders.length} ออเดอร์):
              </p>
              <ul className="divide-y divide-[var(--line)]">
                {cashConfirm.orders.map((ord, idx) => (
                  <li key={ord.id} className="py-1 flex justify-between gap-2">
                    <span className="tabular">
                      #{idx + 1} {ord.id} ({ord.items.reduce((sum, i) => sum + i.qty, 0)} รายการ)
                    </span>
                    <span className="tabular font-medium">{formatMoney(ord.total)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-muted">
              เมื่อกดยืนยัน ระบบจะบันทึกสถานะชำระเงินเป็น "เงินสด" และจบการเข้าพักของวิลล่าให้อัตโนมัติ
            </p>

            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                full
                disabled={Boolean(busy)}
                onClick={() => setCashConfirm(null)}
              >
                ยกเลิก
              </Button>
              <Button
                variant="success"
                full
                loading={busy === cashConfirm.key}
                onClick={() => settleCash(cashConfirm)}
              >
                <Banknote className="size-4" />
                ยืนยันรับเงินสดแล้ว
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/**
 * Single or consolidated awaiting bill card
 */
function AwaitingBillCard({
  group,
  busy,
  onCash,
  onUploadSlip,
}: {
  group: AwaitingBillGroup;
  busy: boolean;
  onCash: () => void;
  onUploadSlip: (file: File) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const isMultiOrder = group.orders.length > 1;

  return (
    <Card className="space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold">{group.villa}</p>
            {isMultiOrder && (
              <Badge tone="brand">
                <ReceiptText className="size-3" />
                รวม {group.orders.length} ครั้ง
              </Badge>
            )}
          </div>
          <p className="text-xs muted tabular truncate">
            {group.sessionId ? `ID: ${group.sessionId}` : group.orders[0]?.id} ·{' '}
            {new Date(group.earliestCreatedAt).toLocaleString('th-TH', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <Badge tone={group.waitedHours >= 12 ? 'danger' : 'warning'}>
          รอชำระเงิน
        </Badge>
      </header>

      {/* Amount Display */}
      <div className="rounded-xl bg-[var(--surface-sunken)] p-3 text-center">
        <p className="text-xs muted">
          ยอดรวมที่ต้องได้รับ {isMultiOrder ? `(รวม ${group.orders.length} ออเดอร์)` : ''}
        </p>
        <p className="text-3xl font-bold tabular">{formatMoney(group.totalAmount)}</p>
        {group.phone && (
          <a
            href={`tel:${group.phone.replace(/[^0-9+]/g, '')}`}
            className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand)] tabular"
          >
            <Phone className="size-3.5" />
            {group.phone}
          </a>
        )}
      </div>

      {/* Orders and items breakdown */}
      <div className="space-y-2">
        {group.orders.map((order, idx) => (
          <div
            key={order.id}
            className={`rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)]/40 p-2.5 space-y-1.5 ${
              isMultiOrder ? '' : 'border-none !bg-transparent !p-0'
            }`}
          >
            {isMultiOrder && (
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--foreground)]">
                <span className="tabular">
                  สั่งครั้งที่ {idx + 1} ({order.id})
                </span>
                <span className="tabular text-xs font-bold text-[var(--brand)]">
                  {formatMoney(order.total)}
                </span>
              </div>
            )}
            <ul className="space-y-1 text-sm">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 text-xs sm:text-sm">
                  <span className="min-w-0 truncate">
                    <span className="tabular font-medium">{item.qty}×</span>{' '}
                    {item.name.th || item.name.en}
                  </span>
                  <span className="shrink-0 tabular muted">
                    {formatMoney(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Hidden file picker for slip */}
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onUploadSlip(file);
        }}
      />

      {/* Action buttons: Cash vs Slip */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          variant="secondary"
          full
          loading={busy}
          onClick={onCash}
          className="flex items-center justify-center gap-1.5"
        >
          <Banknote className="size-4" />
          ชำระเงินสด
        </Button>
        <Button
          variant="success"
          full
          loading={busy}
          onClick={() => fileInput.current?.click()}
          className="flex items-center justify-center gap-1.5"
        >
          <Upload className="size-4" />
          โอนจ่าย (สลิป)
        </Button>
      </div>
    </Card>
  );
}
