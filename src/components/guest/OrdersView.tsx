'use client';

import { ReceiptText, StickyNote, TriangleAlert } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Badge, Button, EmptyState } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { MenuCatalog, OrderStatus } from '@/lib/types';
import type { SessionSnapshot } from '@/lib/snapshot';

const STATUS_TONE: Record<OrderStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  NEW: 'neutral',
  COOKING: 'warning',
  SERVED: 'success',
  CANCELLED: 'danger',
};

export function OrdersView({
  catalog,
  snapshot,
  canOrder,
  onBrowse,
  onBill,
}: {
  catalog: MenuCatalog;
  snapshot: SessionSnapshot;
  canOrder: boolean;
  onBrowse: () => void;
  onBill: () => void;
}) {
  const { t, L, locale } = useI18n();
  const currency = catalog.settings.currency;

  if (snapshot.orders.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptText className="size-10" />}
        title={t('order.none')}
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
      <h1 className="text-lg font-semibold">{t('order.yourOrders')}</h1>

      {snapshot.orders
        .slice()
        .reverse()
        .map((order) => (
          <article key={order.id} className="card space-y-2 p-4">
            <header className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold tabular">{order.id}</p>
                <time className="text-xs muted" dateTime={order.createdAt}>
                  {new Date(order.createdAt).toLocaleTimeString(
                    locale === 'th' ? 'th-TH' : locale === 'zh' ? 'zh-CN' : 'en-GB',
                    { hour: '2-digit', minute: '2-digit' },
                  )}
                </time>
              </div>
              <Badge tone={STATUS_TONE[order.status]}>
                {t(`order.status.${order.status}` as const)}
              </Badge>
            </header>

            <ul className="space-y-1.5 border-t border-[var(--border)] pt-2">
              {order.items.map((item) => (
                <li key={item.id} className="space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <span>
                      <span className="font-medium tabular">{item.qty}×</span>{' '}
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

            <footer className="flex justify-between border-t border-[var(--border)] pt-2 font-semibold">
              <span>{t('cart.total')}</span>
              <span className="tabular">{formatMoney(order.total, currency)}</span>
            </footer>
          </article>
        ))}

      <div className="card flex items-center justify-between p-4">
        <span className="font-semibold">{t('bill.amountDue')}</span>
        <span className="text-lg font-bold tabular">
          {formatMoney(snapshot.billTotal, currency)}
        </span>
      </div>

      <div className="flex gap-2">
        {canOrder && (
          <Button variant="secondary" full onClick={onBrowse}>
            {t('order.orderMore')}
          </Button>
        )}
        <Button full onClick={onBill}>
          {t('nav.bill')}
        </Button>
      </div>
    </div>
  );
}
