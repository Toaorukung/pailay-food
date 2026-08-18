'use client';

import { useState } from 'react';
import {
  TriangleAlert,
  StickyNote,
  Volume2,
  VolumeX,
  MapPinOff,
  Check,
  Flame,
  Scale,
  X,
} from 'lucide-react';
import { useLive, useOrderChime, adminFetch } from './adminApi';
import { Badge, Button, Card, Input, Skeleton, cn } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { Order, OrderItem, OrderStatus } from '@/lib/types';
import { isPaid } from '@/lib/types';

const COLUMNS: { status: OrderStatus; label: string; tone: string }[] = [
  { status: 'NEW', label: 'ใหม่', tone: 'border-[var(--danger)]' },
  { status: 'COOKING', label: 'กำลังปรุง', tone: 'border-[var(--warning)]' },
  { status: 'SERVED', label: 'เสิร์ฟแล้ว', tone: 'border-[var(--success)]' },
];

export function KitchenDisplay() {
  const { data, loading, refresh, newOrderIds, clearNew } = useLive();
  const [sound, setSound] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);


  const orders = data?.orders ?? [];
  // Staff have to weigh these before the guest can pay, so they sit above the
  // board rather than inside it — nobody should start cooking them yet.
  const awaitingPricing = orders.filter((o) => o.status === 'AWAITING_PRICING');

  // Unpaid orders never reach the board, so chiming for them would ring at the
  // wrong moment — only a newly paid ticket is news to the kitchen.
  const payableNew = newOrderIds.filter((id) =>
    orders.some((o) => o.id === id && o.status === 'NEW'),
  );
  useOrderChime(sound, payableNew);

  async function reprice(orderId: string, itemId: string, unitPrice: number) {
    await adminFetch('/api/admin/orders', {
      method: 'PATCH',
      body: JSON.stringify({ orderId, itemId, unitPrice }),
    });
    await refresh();
  }

  async function move(order: Order, status: OrderStatus) {
    setBusy(order.id);
    await adminFetch('/api/admin/orders', {
      method: 'POST',
      body: JSON.stringify({ orderId: order.id, status }),
    });
    setBusy(null);
    clearNew();
    await refresh();
  }

  if (loading && !data) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">ครัว / ออเดอร์</h1>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSound((s) => !s)}
          aria-pressed={sound}
        >
          {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          {sound ? 'เสียงเตือนเปิด' : 'เสียงเตือนปิด'}
        </Button>
      </header>

      {awaitingPricing.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-[var(--brand)] bg-[var(--brand-soft)] p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--brand-soft-text)]">
            <Scale className="size-4" />
            รอชั่งน้ำหนักและแจ้งราคา ({awaitingPricing.length})
          </h2>
          <p className="text-xs text-[var(--brand-soft-text)]">
            แขกยังชำระเงินไม่ได้จนกว่าจะใส่ราคาครบ และครัวจะยังไม่เห็นออเดอร์นี้
          </p>
          <div className="grid gap-3 lg:grid-cols-3">
            {awaitingPricing.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                tone="border-[var(--brand)]"
                isNew={false}
                busy={busy === order.id}
                onReprice={reprice}
              />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const columnOrders = orders
            .filter((o) => isPaid(o.status) && o.status === column.status)
            // Oldest first in the working columns: the kitchen serves a queue,
            // not a stack. Served orders read better newest-first.
            .sort((a, b) =>
              column.status === 'SERVED'
                ? b.createdAt.localeCompare(a.createdAt)
                : a.createdAt.localeCompare(b.createdAt),
            );

          return (
            <section key={column.status} className="space-y-3">
              <h2 className="flex items-center justify-between text-sm font-semibold uppercase tracking-wide muted">
                {column.label}
                <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 tabular">
                  {columnOrders.length}
                </span>
              </h2>

              {columnOrders.length === 0 && (
                <p className="rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-sm muted">
                  ว่าง
                </p>
              )}

              {columnOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  tone={column.tone}
                  isNew={newOrderIds.includes(order.id)}
                  busy={busy === order.id}
                  onReprice={reprice}
                  onAdvance={
                    column.status === 'NEW'
                      ? () => move(order, 'COOKING')
                      : column.status === 'COOKING'
                        ? () => move(order, 'SERVED')
                        : undefined
                  }
                  onCancel={
                    column.status !== 'SERVED'
                      ? () => move(order, 'CANCELLED')
                      : undefined
                  }
                />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  tone,
  isNew,
  busy,
  onReprice,
  onAdvance,
  onCancel,
}: {
  order: Order;
  tone: string;
  isNew: boolean;
  busy: boolean;
  onReprice: (orderId: string, itemId: string, unitPrice: number) => Promise<void>;
  onAdvance?: () => void;
  onCancel?: () => void;
}) {
  const waitedMinutes = Math.floor(
    (Date.now() - Date.parse(order.createdAt)) / 60_000,
  );

  return (
    <Card
      className={cn(
        'space-y-3 border-l-4 p-4',
        tone,
        isNew && 'animate-rise ring-2 ring-brand-500',
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold leading-tight">
            {order.villa || order.tableLabel}
          </p>
          <p className="text-xs muted tabular">
            {order.id} ·{' '}
            {new Date(order.createdAt).toLocaleTimeString('th-TH', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <Badge tone={waitedMinutes > 25 ? 'danger' : waitedMinutes > 12 ? 'warning' : 'neutral'}>
          {waitedMinutes} นาที
        </Badge>
      </header>

      {/*
        The allergy banner is the whole point of collecting the profile. It is
        first, loud, and repeated per line where the guest acknowledged a
        conflict — a cook scanning tickets under pressure should not have to
        look for it.
      */}
      {order.allergyLabels.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-sm font-bold text-[var(--danger)]">
          <TriangleAlert className="size-4 shrink-0" />
          แพ้: {order.allergyLabels.join(', ')}
        </p>
      )}

      {order.geoStatus === 'OUTSIDE' && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--warning)]">
          <MapPinOff className="size-3.5" />
          สั่งจากนอกพื้นที่ที่พัก
        </p>
      )}

      <ul className="space-y-2 border-t border-[var(--line)] pt-2">
        {order.items.map((item) => (
          <li key={item.id} className="text-sm">
            <div className="flex justify-between gap-3">
              <span className="font-medium">
                <span className="tabular text-base">{item.qty}×</span>{' '}
                {item.name.th || item.name.en}
              </span>
              <span className="shrink-0 tabular muted">
                {item.priceOnRequest && !item.pricedAt
                  ? '—'
                  : formatMoney(item.lineTotal)}
              </span>
            </div>
            {item.options.length > 0 && (
              <p className="pl-6 text-xs muted">
                {item.options.map((o) => o.name.th || o.name.en).join(' · ')}
              </p>
            )}
            {item.note && (
              <p className="ml-6 mt-1 flex gap-1.5 rounded-lg bg-[var(--warning-soft)] p-2 text-xs font-medium text-[var(--warning)]">
                <StickyNote className="mt-0.5 size-3 shrink-0" />
                <span className="whitespace-pre-wrap break-words">{item.note}</span>
              </p>
            )}
            {item.priceOnRequest && (
              <PriceEntry
                item={item}
                onSave={(unitPrice) => onReprice(order.id, item.id, unitPrice)}
              />
            )}
            {item.allergenAck && (
              <p className="ml-6 mt-1 flex items-center gap-1 text-xs font-semibold text-[var(--danger)]">
                <TriangleAlert className="size-3" />
                แขกยืนยันรับทราบว่าแพ้แต่ยังสั่ง
              </p>
            )}
          </li>
        ))}
      </ul>

      <footer className="flex items-center gap-2 border-t border-[var(--line)] pt-3">
        {onAdvance && (
          <Button full loading={busy} onClick={onAdvance}>
            {order.status === 'NEW' ? (
              <>
                <Flame className="size-4" /> เริ่มปรุง
              </>
            ) : (
              <>
                <Check className="size-4" /> เสิร์ฟแล้ว
              </>
            )}
          </Button>
        )}
        {onCancel && (
          <Button
            variant="secondary"
            size="md"
            disabled={busy}
            onClick={() => {
              if (confirm(`ยกเลิกออเดอร์ ${order.id}?`)) onCancel();
            }}
            aria-label="ยกเลิก"
          >
            <X className="size-4" />
          </Button>
        )}
      </footer>
    </Card>
  );
}

/**
 * Weighed-price entry, inline on the kitchen ticket.
 *
 * It lives here rather than on a separate admin screen because this is the
 * moment the information exists: the cook has the fish on the scale and the
 * ticket in front of them. The guest cannot check out until every one of these
 * is filled in, so a forgotten line is visible rather than silently free.
 */
function PriceEntry({
  item,
  onSave,
}: {
  item: OrderItem;
  onSave: (unitPrice: number) => Promise<void>;
}) {
  const [value, setValue] = useState(
    item.pricedAt ? String(item.unitPrice) : '',
  );
  const [saving, setSaving] = useState(false);

  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    await onSave(parsed);
    setSaving(false);
  }

  return (
    <div
      className={cn(
        'ml-6 mt-1.5 space-y-1.5 rounded-lg p-2',
        item.pricedAt ? 'bg-[var(--success-soft)]' : 'bg-[var(--brand-soft)]',
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <Scale className="size-3" />
        {item.pricedAt
          ? `ราคาต่อหน่วย ${formatMoney(item.unitPrice)} · โดย ${item.pricedBy ?? '—'}`
          : 'ชั่งน้ำหนักแล้วใส่ราคาต่อหน่วย'}
      </p>
      <div className="flex gap-1.5">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="ราคา/หน่วย"
          className="h-9 text-sm"
          aria-label={`ราคาต่อหน่วยของ ${item.name.th || item.name.en}`}
        />
        <Button size="sm" loading={saving} disabled={!valid} onClick={submit}>
          บันทึก
        </Button>
      </div>
      {valid && item.qty > 1 && (
        <p className="text-xs muted">
          × {item.qty} = {formatMoney(parsed * item.qty)}
        </p>
      )}
    </div>
  );
}
