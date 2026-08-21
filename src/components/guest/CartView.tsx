'use client';

import { useState } from 'react';
import { Minus, Plus, ShoppingBasket, Trash2, StickyNote } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Button, EmptyState, Dialog } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { itemTimeState, minQtyOf } from '@/lib/availability';
import type { MenuCatalog } from '@/lib/types';
import type { SessionSnapshot } from '@/lib/snapshot';
import { guestApi } from './api';
import { windowText, itemTimeText } from './availabilityText';

export function CartView({
  catalog,
  snapshot,
  canOrder,
  onChanged,
  onOrdered,
  onBrowse,
}: {
  catalog: MenuCatalog;
  snapshot: SessionSnapshot;
  canOrder: boolean;
  onChanged: () => Promise<unknown>;
  onOrdered: () => void;
  onBrowse: () => void;
}) {
  const { t, L } = useI18n();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { cart, cartTotals } = snapshot;
  const currency = catalog.settings.currency;

  async function changeQty(key: string, qty: number) {
    setBusyKey(key);
    setError(null);
    const res = await guestApi.setQty(snapshot.session.id, key, qty);
    setBusyKey(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await onChanged();
  }

  async function submit() {
    setConfirmOpen(false);
    setSending(true);
    setError(null);
    setNotice(null);

    // A fresh key per attempt, held for the whole retry: a double tap or a
    // flaky connection replays the same key and gets the same order back
    // instead of ordering the food twice.
    const idempotencyKey = crypto.randomUUID();
    const res = await guestApi.placeOrder(snapshot.session.id, idempotencyKey);
    setSending(false);

    if (!res.ok) {
      setError(res.error);
      await onChanged();
      return;
    }
    if (res.data.removed?.length) {
      setNotice(
        t('cart.removed', {
          names: res.data.removed.map((r) => r.name).join(', '),
        }),
      );
    }
    await onChanged();
    onOrdered();
  }

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBasket className="size-10" />}
        title={t('cart.empty')}
        body={t('cart.emptyHint')}
        action={
          <Button variant="secondary" onClick={onBrowse}>
            {t('nav.menu')}
          </Button>
        }
      />
    );
  }

  const belowMinimum =
    catalog.settings.minOrderAmount > 0 &&
    cartTotals.subtotal < catalog.settings.minOrderAmount;

  // Time and quantity rules, mirrored from the server so the guest is not sent
  // to the payment step only to be refused. The villa-wide window is one
  // message; each offending line adds its own.
  const windowMsg = windowText(snapshot.orderWindow, t);
  const lineIssues: string[] = [];
  for (const line of cart.lines) {
    const item = catalog.items.find((i) => i.id === line.menuId);
    if (!item) continue;
    const state = itemTimeState(item, catalog.settings, snapshot.nowMinutes);
    if (!state.orderable) {
      lineIssues.push(`${L(line.name)} — ${itemTimeText(state, t)}`);
    }
    const min = minQtyOf(item);
    if (item.minQty > 0 && line.qty < min) {
      lineIssues.push(`${L(line.name)} — ${t('avail.minQty', { n: min })}`);
    }
  }
  const orderBlocked =
    belowMinimum || Boolean(windowMsg) || lineIssues.length > 0;

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">{t('cart.title')}</h1>

      <ul className="space-y-2">
        {cart.lines.map((line) => (
          <li key={line.key} className="card space-y-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium leading-snug">{L(line.name)}</p>
                {line.options.length > 0 && (
                  <p className="text-xs muted">
                    {line.options.map((o) => L(o.name)).join(' · ')}
                  </p>
                )}
              </div>
              <p className="shrink-0 font-semibold tabular">
                {line.priceOnRequest && line.unitPrice <= 0
                  ? t('item.priceOnRequest')
                  : formatMoney(line.unitPrice * line.qty, currency)}
              </p>
            </div>

            {line.note && (
              <p className="flex gap-2 rounded-lg bg-[var(--surface-sunken)] p-2 text-xs">
                <StickyNote className="mt-0.5 size-3.5 shrink-0 muted" />
                {/* Guest text, escaped by React on render. */}
                <span className="whitespace-pre-wrap break-words">{line.note}</span>
              </p>
            )}

            {canOrder && (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => changeQty(line.key, 0)}
                  disabled={busyKey === line.key}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                </button>
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyKey === line.key}
                    onClick={() => changeQty(line.key, line.qty - 1)}
                    aria-label="-"
                  >
                    <Minus className="size-4" />
                  </Button>
                  <span className="w-9 text-center font-semibold tabular">
                    {line.qty}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyKey === line.key}
                    onClick={() => changeQty(line.key, line.qty + 1)}
                    aria-label="+"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="card space-y-1.5 p-4 text-sm">
        <Row label={t('cart.subtotal')} value={formatMoney(cartTotals.subtotal, currency)} />
        {catalog.settings.serviceChargePercent > 0 && (
          <Row
            label={t('cart.service', { percent: catalog.settings.serviceChargePercent })}
            value={formatMoney(cartTotals.serviceCharge, currency)}
          />
        )}
        {catalog.settings.vatPercent > 0 && (
          <Row
            label={t(
              catalog.settings.vatIncluded ? 'cart.vatIncluded' : 'cart.vat',
              { percent: catalog.settings.vatPercent },
            )}
            value={formatMoney(cartTotals.vat, currency)}
            muted
          />
        )}
        <div className="mt-2 flex items-center justify-between border-t border-[var(--line)] pt-2 text-base font-semibold">
          <span>{t('cart.total')}</span>
          <span className="tabular">{formatMoney(cartTotals.total, currency)}</span>
        </div>
      </div>

      {notice && (
        <p className="rounded-xl bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)]">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      {belowMinimum && (
        <p className="text-sm text-[var(--warning)]">
          {t('cart.minOrder', {
            amount: formatMoney(catalog.settings.minOrderAmount, currency),
          })}
        </p>
      )}

      {windowMsg && (
        <p className="rounded-xl bg-[var(--warning-soft)] p-3 text-sm font-medium text-[var(--warning)]">
          {windowMsg}
        </p>
      )}

      {lineIssues.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)]">
          {lineIssues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      {canOrder && (
        <Button
          full
          size="lg"
          loading={sending}
          disabled={orderBlocked}
          onClick={() => setConfirmOpen(true)}
        >
          {sending ? t('cart.sending') : t('cart.confirmOrder')}
        </Button>
      )}

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('cart.confirmOrder')}
        description={t('cart.confirmBody')}
        footer={
          <>
            <Button variant="secondary" full onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button full onClick={submit} loading={sending}>
              {t('common.confirm')}
            </Button>
          </>
        }
      />
    </div>
  );
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${muted ? 'muted' : ''}`}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
