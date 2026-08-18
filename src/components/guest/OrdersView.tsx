'use client';

import { useState } from 'react';
import {
  ChefHat,
  CheckCircle2,
  CreditCard,
  Hourglass,
  ReceiptText,
  Scale,
  StickyNote,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { MenuCatalog, Order, OrderStatus } from '@/lib/types';
import type { SessionSnapshot } from '@/lib/snapshot';
import { PaymentSheet } from './PaymentSheet';

const STATUS_TONE: Record<
  OrderStatus,
  'neutral' | 'warning' | 'success' | 'danger' | 'brand'
> = {
  AWAITING_PRICING: 'brand',
  UNPAID: 'danger',
  AWAITING_PAYMENT: 'warning',
  NEW: 'neutral',
  COOKING: 'warning',
  SERVED: 'success',
  CANCELLED: 'danger',
};

const STATUS_ICON: Record<OrderStatus, typeof ChefHat> = {
  AWAITING_PRICING: Scale,
  UNPAID: CreditCard,
  AWAITING_PAYMENT: Hourglass,
  NEW: ReceiptText,
  COOKING: ChefHat,
  SERVED: CheckCircle2,
  CANCELLED: XCircle,
};

/**
 * Every order the villa has placed, newest first.
 *
 * This is the working screen of the flow: an order sits here until it is paid,
 * then moves through the kitchen in the same card. The guest never loses sight
 * of what they ordered, and an unpaid order carries its own pay button rather
 * than sending everyone to a separate checkout at the end of the night.
 */
export function OrdersView({
  catalog,
  snapshot,
  canOrder,
  onBrowse,
  onChanged,
}: {
  catalog: MenuCatalog;
  snapshot: SessionSnapshot;
  canOrder: boolean;
  onBrowse: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const { t, L, locale } = useI18n();
  const [payingId, setPayingId] = useState<string | null>(null);
  const currency = catalog.settings.currency;

  const orders = [...snapshot.orders].reverse();
  const paying: Order | null = orders.find((o) => o.id === payingId) ?? null;

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptText className="size-7" />}
        title={t('orders.empty')}
        body={t('orders.emptyHint')}
        action={
          canOrder ? (
            <Button variant="secondary" onClick={onBrowse}>
              {t('nav.menu')}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold">{t('order.yourOrders')}</h1>
        <span className="text-xs muted">
          {t('orders.count', { n: orders.length })}
        </span>
      </div>

      <div className="space-y-3 stagger">
        {orders.map((order) => {
          const payment = snapshot.payments[order.id];
          const Icon = STATUS_ICON[order.status];
          // A rejected slip hands the order back to the guest, so the pay
          // button has to come back with it.
          const needsPayment =
            order.status === 'UNPAID' || payment?.status === 'REJECTED';

          return (
            <Card key={order.id} className="space-y-3">
              <header className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold tabular">{order.id}</p>
                  <time className="text-xs muted" dateTime={order.createdAt}>
                    {new Date(order.createdAt).toLocaleTimeString(
                      locale === 'th' ? 'th-TH' : locale === 'zh' ? 'zh-CN' : 'en-GB',
                      { hour: '2-digit', minute: '2-digit' },
                    )}
                  </time>
                </div>
                <Badge tone={STATUS_TONE[order.status]}>
                  <Icon className="size-3" />
                  {t(`order.status.${order.status}` as const)}
                </Badge>
              </header>

              <ul className="space-y-1.5 border-t border-[var(--line)] pt-2.5">
                {order.items.map((item) => (
                  <li key={item.id} className="space-y-1 text-sm">
                    <div className="flex justify-between gap-3">
                      <span>
                        <span className="font-semibold tabular">{item.qty}×</span>{' '}
                        {L(item.name)}
                      </span>
                      <span className="shrink-0 tabular">
                        {item.priceOnRequest && !item.pricedAt
                          ? t('item.priceOnRequest')
                          : formatMoney(item.lineTotal, currency)}
                      </span>
                    </div>
                    {item.options.length > 0 && (
                      <p className="pl-6 text-xs muted">
                        {item.options.map((o) => L(o.name)).join(' · ')}
                      </p>
                    )}
                    {item.note && (
                      <p className="ml-6 flex gap-1.5 rounded-lg bg-[var(--surface-sunken)] p-2 text-xs">
                        <StickyNote className="mt-0.5 size-3 shrink-0 muted" />
                        <span className="whitespace-pre-wrap break-words">
                          {item.note}
                        </span>
                      </p>
                    )}
                    {item.allergenAck && (
                      <p className="ml-6 flex items-center gap-1 text-xs text-[var(--danger)]">
                        <TriangleAlert className="size-3" />
                        {t('allergy.ack')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              <footer className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-2.5">
                <span className="font-semibold">{t('cart.total')}</span>
                <span className="text-lg font-bold tabular">
                  {order.status === 'AWAITING_PRICING'
                    ? '—'
                    : formatMoney(order.total, currency)}
                </span>
              </footer>

              {needsPayment && canOrder && (
                <Button full size="lg" onClick={() => setPayingId(order.id)}>
                  <CreditCard className="size-5" />
                  {t('pay.now')} · {formatMoney(order.total, currency)}
                </Button>
              )}

              {order.status === 'AWAITING_PAYMENT' &&
                payment?.status === 'PENDING_REVIEW' && (
                  <p className="flex items-center justify-center gap-2 rounded-xl bg-[var(--warning-soft)] p-2.5 text-xs font-semibold text-[var(--warning)]">
                    <Hourglass className="size-3.5" />
                    {t('pay.waitingReview')}
                  </p>
                )}

              {order.status === 'AWAITING_PRICING' && (
                <button
                  type="button"
                  onClick={() => setPayingId(order.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-soft)] p-2.5 text-left text-xs font-medium text-[var(--brand-soft-text)]"
                >
                  <Scale className="size-3.5 shrink-0" />
                  {t('pay.waitingPrice')}
                </button>
              )}
            </Card>
          );
        })}
      </div>

      {canOrder && (
        <Button variant="secondary" full onClick={onBrowse}>
          {t('orders.orderAgain')}
        </Button>
      )}

      {paying && (
        <PaymentSheet
          open
          onOpenChange={(next) => !next && setPayingId(null)}
          order={paying}
          payment={snapshot.payments[paying.id]}
          catalog={catalog}
          sessionId={snapshot.session.id}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
