'use client';

import {
  ChefHat,
  CheckCircle2,
  ClipboardCheck,
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
import type { MenuCatalog, OrderStatus } from '@/lib/types';
import type { SessionSnapshot } from '@/lib/snapshot';

const STATUS_TONE: Record<
  OrderStatus,
  'neutral' | 'warning' | 'success' | 'danger' | 'brand'
> = {
  PENDING_CONFIRM: 'warning',
  NEW: 'neutral',
  COOKING: 'warning',
  SERVED: 'success',
  CANCELLED: 'danger',
  // Retired states, still reachable on an order placed under the old flow.
  AWAITING_PRICING: 'brand',
  UNPAID: 'danger',
  AWAITING_PAYMENT: 'warning',
};

const STATUS_ICON: Record<OrderStatus, typeof ChefHat> = {
  PENDING_CONFIRM: Hourglass,
  NEW: ClipboardCheck,
  COOKING: ChefHat,
  SERVED: CheckCircle2,
  CANCELLED: XCircle,
  AWAITING_PRICING: Scale,
  UNPAID: ReceiptText,
  AWAITING_PAYMENT: Hourglass,
};

/**
 * Every order the villa has placed, newest first.
 *
 * The working screen of the flow. An order lands here as "waiting for staff to
 * confirm" and moves through the kitchen in the same card, so the guest never
 * loses sight of what they asked for. There is no payment here at all — money
 * is settled with staff directly, and this screen says so rather than offering
 * a button that would go nowhere.
 */
export function OrdersView({
  catalog,
  snapshot,
  canOrder,
  onBrowse,
}: {
  catalog: MenuCatalog;
  snapshot: SessionSnapshot;
  canOrder: boolean;
  onBrowse: () => void;
}) {
  const { t, L, locale } = useI18n();
  const currency = catalog.settings.currency;

  const orders = [...snapshot.orders].reverse();

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
          const Icon = STATUS_ICON[order.status];

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
                  {order.items.some((i) => i.priceOnRequest && !i.pricedAt)
                    ? '—'
                    : formatMoney(order.total, currency)}
                </span>
              </footer>

              {order.status === 'PENDING_CONFIRM' && (
                <p className="flex items-start gap-2 rounded-xl bg-[var(--warning-soft)] p-2.5 text-xs font-medium text-[var(--warning)]">
                  <Hourglass className="mt-0.5 size-3.5 shrink-0" />
                  {t('order.pendingHint')}
                </p>
              )}

              {order.status === 'NEW' && (
                <p className="flex items-start gap-2 rounded-xl bg-[var(--success-soft)] p-2.5 text-xs font-medium text-[var(--success)]">
                  <ClipboardCheck className="mt-0.5 size-3.5 shrink-0" />
                  {t('order.confirmedHint')}
                </p>
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
    </div>
  );
}
