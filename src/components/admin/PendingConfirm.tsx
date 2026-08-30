'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeftRight,
  Check,
  ClipboardCheck,
  Hourglass,
  Minus,
  MessageCircle,
  Phone,
  Plus,
  Scale,
  StickyNote,
  Trash2,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useLive, useOrderChime, adminFetch } from './adminApi';
import { MenuItemModal } from './MenuItemModal';
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { MenuCatalog, Order, OrderItem } from '@/lib/types';

/**
 * The confirm queue — the step the whole flow now turns on.
 *
 * A guest sends an order and nothing happens until somebody here looks at it.
 * Staff ring the villa, agree what is actually being cooked, adjust the ticket
 * to match, and confirm. Confirming is the only thing that puts the order on
 * the kitchen board, and it is what sends the guest their confirmation on
 * LINE — so the ticket on this screen has to be right before the button is
 * pressed, because the message quotes it verbatim.
 *
 * The guest's phone number is at the top of every card rather than buried in
 * the session list, because ringing it is the first thing this screen is for.
 */
export function PendingConfirm({ catalog: initialCatalog }: { catalog?: MenuCatalog } = {}) {
  const [catalog, setCatalog] = useState<MenuCatalog | null>(initialCatalog ?? null);
  const { data, loading, refresh, newOrderIds, clearNew } = useLive();
  const [sound, setSound] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuModal, setMenuModal] = useState<{
    mode: 'replace' | 'add';
    order: Order;
    item?: OrderItem;
  } | null>(null);

  useEffect(() => {
    if (!catalog) {
      adminFetch<MenuCatalog>('/api/menu').then((res) => {
        if (res.ok) setCatalog(res.data);
      });
    }
  }, [catalog]);

  const orders = (data?.orders ?? [])
    .filter((o) => o.status === 'PENDING_CONFIRM')
    // Oldest first: a guest who has been waiting twenty minutes is the one to
    // ring next.
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const pendingNew = newOrderIds.filter((id) =>
    orders.some((o) => o.id === id),
  );
  useOrderChime(sound, pendingNew);

  const sessionOf = (order: Order) =>
    data?.openSessions.find((s) => s.id === order.sessionId);

  async function act(order: Order, action: 'confirm' | 'cancel') {
    setBusy(order.id);
    setError(null);
    const res = await adminFetch<{ notified?: boolean }>(
      `/api/admin/orders?action=${action}`,
      { method: 'POST', body: JSON.stringify({ orderId: order.id }) },
    );
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
    } else if (action === 'confirm' && res.data.notified === false) {
      // Not an error — the ticket is confirmed either way — but staff have to
      // know the guest was not told, so they can say so on the phone.
      setError(
        `ยืนยันออเดอร์ ${order.id} แล้ว แต่ส่งข้อความแจ้งทาง LINE ไม่ได้ กรุณาแจ้งลูกค้าทางโทรศัพท์`,
      );
    }
    clearNew();
    await refresh();
  }

  async function setQty(order: Order, item: OrderItem, qty: number) {
    setBusy(order.id);
    setError(null);
    const res = await adminFetch('/api/admin/orders', {
      method: 'PUT',
      body: JSON.stringify({
        orderId: order.id,
        items: [{ itemId: item.id, qty }],
      }),
    });
    setBusy(null);
    if (!res.ok) setError(res.error);
    await refresh();
  }

  async function reprice(order: Order, item: OrderItem, unitPrice: number) {
    setBusy(order.id);
    setError(null);
    const res = await adminFetch('/api/admin/orders', {
      method: 'PATCH',
      body: JSON.stringify({ orderId: order.id, itemId: item.id, unitPrice }),
    });
    setBusy(null);
    if (!res.ok) setError(res.error);
    await refresh();
  }

  async function handleSaveItem(data: {
    menuId: string;
    qty: number;
    optionIds: string[];
    note: string;
  }) {
    if (!menuModal) return;
    setBusy(menuModal.order.id);
    setError(null);

    const action = menuModal.mode === 'replace' ? 'replace-item' : 'add-item';
    const payload =
      menuModal.mode === 'replace'
        ? {
            orderId: menuModal.order.id,
            itemId: menuModal.item!.id,
            menuId: data.menuId,
            qty: data.qty,
            optionIds: data.optionIds,
            note: data.note,
          }
        : {
            orderId: menuModal.order.id,
            menuId: data.menuId,
            qty: data.qty,
            optionIds: data.optionIds,
            note: data.note,
          };

    const res = await adminFetch(`/api/admin/orders?action=${action}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    setBusy(null);
    if (!res.ok) {
      setError(res.error);
    } else {
      setMenuModal(null);
    }
    await refresh();
  }

  if (loading && !data) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">รอคอนเฟิร์ม</h1>
          <p className="text-xs muted">
            โทรหาลูกค้าเพื่อยืนยันรายการก่อน แก้ไขจำนวนหรือใส่ราคาให้ครบ
            แล้วกดยืนยัน — ครัวจะเห็นออเดอร์และระบบจะส่งข้อความยืนยันกลับไปทาง LINE
          </p>
        </div>
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

      {error && (
        <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="size-10" />}
          title="ไม่มีออเดอร์รอคอนเฟิร์ม"
          body="เมื่อลูกค้ากดยืนยันการสั่ง รายการจะขึ้นที่นี่ภายในไม่กี่วินาที และแจ้งเตือนเข้า Lark"
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {orders.map((order) => (
            <PendingCard
              key={order.id}
              order={order}
              session={sessionOf(order)}
              busy={busy === order.id}
              isNew={pendingNew.includes(order.id)}
              onSetQty={(item, qty) => setQty(order, item, qty)}
              onReprice={(item, price) => reprice(order, item, price)}
              onReplaceItem={(item) => setMenuModal({ mode: 'replace', order, item })}
              onAddItem={() => setMenuModal({ mode: 'add', order })}
              onConfirm={() => act(order, 'confirm')}
              onCancel={() => act(order, 'cancel')}
            />
          ))}
        </div>
      )}

      {menuModal && catalog && (
        <MenuItemModal
          open={Boolean(menuModal)}
          onOpenChange={(open) => {
            if (!open) setMenuModal(null);
          }}
          mode={menuModal.mode}
          order={menuModal.order}
          targetItem={menuModal.item}
          catalog={catalog}
          onSave={handleSaveItem}
          busy={busy === menuModal.order.id}
        />
      )}
    </div>
  );
}

type LiveSession = { guestName: string; guestPhone: string };

function PendingCard({
  order,
  session,
  busy,
  isNew,
  onSetQty,
  onReprice,
  onReplaceItem,
  onAddItem,
  onConfirm,
  onCancel,
}: {
  order: Order;
  session: LiveSession | undefined;
  busy: boolean;
  isNew: boolean;
  onSetQty: (item: OrderItem, qty: number) => void;
  onReprice: (item: OrderItem, unitPrice: number) => void;
  onReplaceItem: (item: OrderItem) => void;
  onAddItem: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const unpriced = order.items.filter((i) => i.priceOnRequest && !i.pricedAt);
  const waited = Math.floor((Date.now() - Date.parse(order.createdAt)) / 60000);

  return (
    <Card className={isNew ? 'ring-2 ring-[var(--warning)]' : undefined}>
      <div className="space-y-3">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold">{order.villa || order.tableLabel}</p>
            <p className="text-xs muted tabular">
              {order.id} ·{' '}
              {new Date(order.createdAt).toLocaleTimeString('th-TH', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {waited > 0 && ` · รอมาแล้ว ${waited} นาที`}
            </p>
          </div>
          <Badge tone="warning">
            <Hourglass className="size-3" />
            รอคอนเฟิร์ม
          </Badge>
        </header>

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-sunken)] p-3 text-sm">
          <span className="font-semibold">{session?.guestName || '—'}</span>
          {session?.guestPhone ? (
            <a
              href={`tel:${session.guestPhone.replace(/[^0-9+]/g, '')}`}
              className="flex items-center gap-1.5 font-medium text-[var(--brand)] tabular"
            >
              <Phone className="size-3.5" />
              {session.guestPhone}
            </a>
          ) : (
            <span className="muted">ไม่มีเบอร์โทร</span>
          )}
          <span
            className="ml-auto flex items-center gap-1.5 text-xs muted"
            title={
              order.lineUserId
                ? 'ลูกค้าเข้ามาจาก LINE — ระบบจะส่งข้อความยืนยันกลับให้อัตโนมัติ'
                : 'ลูกค้าไม่ได้เปิดจาก LINE — ต้องแจ้งยืนยันทางโทรศัพท์เอง'
            }
          >
            <MessageCircle className="size-3.5" />
            {order.lineUserId ? 'แจ้งกลับทาง LINE ได้' : 'ไม่มี LINE'}
          </span>
        </div>

        {order.allergyLabels.length > 0 && (
          <p className="flex items-start gap-2 rounded-xl bg-[var(--danger-soft)] p-3 text-sm font-semibold text-[var(--danger)]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            แพ้: {order.allergyLabels.join(', ')}
          </p>
        )}

        <ul className="space-y-2 border-t border-[var(--line)] pt-3">
          {order.items.map((item) => (
            <li key={item.id} className="space-y-1.5">
              <div className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{item.name.th || item.name.en}</p>
                  {item.options.length > 0 && (
                    <p className="text-xs muted">
                      {item.options.map((o) => o.name.th || o.name.en).join(' · ')}
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-semibold tabular">
                  {item.priceOnRequest && !item.pricedAt
                    ? 'ถามราคา'
                    : formatMoney(item.lineTotal)}
                </span>
              </div>

              {item.note && (
                <p className="flex gap-2 rounded-lg bg-[var(--surface-sunken)] p-2 text-xs">
                  <StickyNote className="mt-0.5 size-3.5 shrink-0 muted" />
                  <span className="whitespace-pre-wrap break-words">{item.note}</span>
                </p>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onSetQty(item, item.qty - 1)}
                  aria-label="ลดจำนวน"
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-8 text-center font-semibold tabular">
                  {item.qty}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onSetQty(item, item.qty + 1)}
                  aria-label="เพิ่มจำนวน"
                >
                  <Plus className="size-4" />
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onReplaceItem(item)}
                  className="gap-1 text-xs"
                  title="เปลี่ยนเป็นเมนูอื่น"
                >
                  <ArrowLeftRight className="size-3.5" />
                  เปลี่ยนเมนู
                </Button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        `นำ "${item.name.th || item.name.en}" ออกจากออเดอร์นี้?`,
                      )
                    ) {
                      onSetQty(item, 0);
                    }
                  }}
                  className="rounded-lg p-2 text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-50"
                  aria-label="นำรายการออก"
                >
                  <Trash2 className="size-4" />
                </button>

                {item.priceOnRequest && (
                  <PriceInput
                    item={item}
                    busy={busy}
                    onSubmit={(price) => onReprice(item, price)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="pt-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onAddItem}
            className="gap-1.5 text-xs"
          >
            <Plus className="size-3.5" />
            เพิ่มเมนู
          </Button>
        </div>

        <footer className="space-y-3 border-t border-[var(--line)] pt-3">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">รวมทั้งสิ้น</span>
            <span className="text-xl font-bold tabular">
              {unpriced.length > 0 ? '—' : formatMoney(order.total)}
            </span>
          </div>

          {unpriced.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-[var(--brand-soft)] p-3 text-xs font-medium text-[var(--brand-soft-text)]">
              <Scale className="mt-0.5 size-3.5 shrink-0" />
              ใส่ราคาให้ครบก่อนจึงจะยืนยันได้ ({unpriced.length} รายการ)
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              full
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    `ยกเลิกออเดอร์ ${order.id} ของ ${order.villa || order.tableLabel}?`,
                  )
                ) {
                  onCancel();
                }
              }}
            >
              <X className="size-4" />
              ยกเลิก
            </Button>
            <Button
              variant="success"
              full
              loading={busy}
              disabled={unpriced.length > 0}
              onClick={() => {
                if (
                  confirm(
                    `ยืนยันออเดอร์ ${order.id} ยอด ${formatMoney(order.total)}?\n\nครัวจะเห็นออเดอร์ทันที และระบบจะส่งข้อความยืนยันกลับไปหาลูกค้าทาง LINE`,
                  )
                ) {
                  onConfirm();
                }
              }}
            >
              <Check className="size-4" />
              ยืนยันออเดอร์
            </Button>
          </div>
        </footer>
      </div>
    </Card>
  );
}

/**
 * The weighed price for one market-price line.
 *
 * Uncontrolled until submitted on purpose: the card re-renders every four
 * seconds off the live poll, and a controlled field would fight whoever is
 * mid-way through typing a number.
 */
function PriceInput({
  item,
  busy,
  onSubmit,
}: {
  item: OrderItem;
  busy: boolean;
  onSubmit: (unitPrice: number) => void;
}) {
  const [value, setValue] = useState('');

  function submit() {
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) return;
    onSubmit(price);
    setValue('');
  }

  return (
    <div className="ml-auto flex items-center gap-1.5">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        type="number"
        inputMode="decimal"
        min={0}
        step={1}
        placeholder={item.pricedAt ? String(item.unitPrice) : 'ราคา/หน่วย'}
        className="h-9 w-28"
      />
      <Button size="sm" disabled={busy || value.trim() === ''} onClick={submit}>
        <Scale className="size-4" />
      </Button>
    </div>
  );
}
