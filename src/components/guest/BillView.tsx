'use client';

import { ReceiptText, CheckCircle2, CircleDollarSign, Info } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Button, Card, EmptyState } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { MenuCatalog } from '@/lib/types';
import type { SessionSnapshot } from '@/lib/snapshot';
import { ClosedBanner } from './ClosedBanner';

/**
 * The villa's running bill for the whole stay.
 *
 * Never asks for money — that is settled with staff directly, and an admin
 * records the transfer afterwards. This is the record: every order placed,
 * what each one cost, and which ones the villa has already paid for. It is
 * also what the guest is left with once staff end the session.
 */
export function BillView({
  catalog,
  snapshot,
  onBrowse,
}: {
  catalog: MenuCatalog;
  snapshot: SessionSnapshot;
  onBrowse: () => void;
}) {
  const { t, L, locale } = useI18n();
  const currency = catalog.settings.currency;
  const closed = snapshot.session.status === 'CLOSED';

  const orders = snapshot.orders.filter((o) => o.status !== 'CANCELLED');
  const dateLocale =
    locale === 'th' ? 'th-TH' : locale === 'zh' ? 'zh-CN' : 'en-GB';

  if (orders.length === 0) {
    return (
      <div className="space-y-3">
        {closed && <ClosedBanner />}
        <EmptyState
          icon={<ReceiptText className="size-7" />}
          title={t('orders.empty')}
          body={t('orders.emptyHint')}
          action={
            !closed ? (
              <Button variant="secondary" onClick={onBrowse}>
                {t('nav.menu')}
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {closed && <ClosedBanner />}

      <h1 className="text-lg font-bold">{t('bill.historyTitle')}</h1>

      <div className="grid grid-cols-2 gap-3">
        <Card className="space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs muted">
            <CheckCircle2 className="size-3.5 text-[var(--success)]" />
            {t('bill.paidTotal')}
          </p>
          <p className="text-xl font-bold tabular">
            {formatMoney(snapshot.paidTotal, currency)}
          </p>
        </Card>
        <Card className="space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs muted">
            <CircleDollarSign className="size-3.5 text-[var(--danger)]" />
            {t('bill.outstanding')}
          </p>
          <p
            className={`text-xl font-bold tabular ${
              snapshot.outstandingTotal > 0 ? 'text-[var(--danger)]' : ''
            }`}
          >
            {formatMoney(snapshot.outstandingTotal, currency)}
          </p>
        </Card>
      </div>

      <Card className="space-y-3">
        <p className="eyebrow">{t('bill.summary')}</p>

        <ul className="space-y-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className="space-y-1 border-b border-[var(--line)] pb-3 last:border-0 last:pb-0"
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold tabular">{order.id}</span>
                <span className="text-xs muted">
                  {new Date(order.createdAt).toLocaleString(dateLocale, {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <ul className="space-y-0.5">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 text-sm">
                    <span>
                      <span className="tabular">{item.qty}×</span> {L(item.name)}
                    </span>
                    <span className="shrink-0 tabular muted">
                      {item.priceOnRequest && !item.pricedAt
                        ? '—'
                        : formatMoney(item.lineTotal, currency)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex justify-between gap-3 pt-0.5 text-sm font-semibold">
                <span
                  className={
                    // Settled is a fact about the payment, not about the order:
                    // the guest pays off the app and staff record it after.
                    snapshot.payments[order.id]?.status === 'APPROVED'
                      ? 'text-[var(--success)]'
                      : 'muted'
                  }
                >
                  {t(`order.status.${order.status}` as const)}
                </span>
                <span className="tabular">
                  {order.items.some((i) => i.priceOnRequest && !i.pricedAt)
                    ? '—'
                    : formatMoney(order.total, currency)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {!closed && (
        <>
          <p className="flex gap-2 rounded-xl bg-[var(--surface-sunken)] p-3 text-xs muted">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {t('bill.stillOpen')}
          </p>
          <Button variant="secondary" full onClick={onBrowse}>
            {t('orders.orderAgain')}
          </Button>
        </>
      )}
    </div>
  );
}
