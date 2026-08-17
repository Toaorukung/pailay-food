'use client';

import { useRef, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Hourglass,
  ReceiptText,
  Scale,
  Upload,
  XCircle,
} from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Button, Dialog, EmptyState, Spinner } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { MenuCatalog } from '@/lib/types';
import type { SessionSnapshot } from '@/lib/snapshot';
import { guestApi, compressImage } from './api';
import { ServiceNotice } from './ServiceNotice';

interface Checkout {
  qr: { dataUrl: string; payload: string } | null;
  promptPayId: string;
  promptPayName: string;
  paymentNote: { th: string; en: string; zh: string };
}

export function BillView({
  catalog,
  snapshot,
  onChanged,
  onBrowse,
}: {
  catalog: MenuCatalog;
  snapshot: SessionSnapshot;
  onChanged: () => Promise<unknown>;
  onBrowse: () => void;
}) {
  const { t, L } = useI18n();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const currency = catalog.settings.currency;
  const payment = snapshot.payment;
  const sessionId = snapshot.session.id;

  async function startCheckout() {
    setConfirmOpen(false);
    setBusy(true);
    setError(null);
    const res = await guestApi.checkout(sessionId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCheckout({
      qr: res.data.qr,
      promptPayId: res.data.promptPayId,
      promptPayName: res.data.promptPayName,
      paymentNote: res.data.paymentNote,
    });
    await onChanged();
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    // Shrink on-device first: a raw 8MB camera photo over villa wifi is a
    // minute of uploading and a likely timeout.
    const blob = await compressImage(file);
    const res = await guestApi.uploadSlip(sessionId, blob);
    setUploading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await onChanged();
  }

  // ── Terminal states ───────────────────────────────────────

  if (payment?.status === 'APPROVED') {
    return (
      <div className="space-y-4">
        <div className="card space-y-3 p-6 text-center">
          <CheckCircle2 className="mx-auto size-14 text-[var(--success)]" />
          <h1 className="text-lg font-semibold">{t('bill.approvedTitle')}</h1>
          <p className="text-2xl font-bold tabular">
            {formatMoney(payment.amount, currency)}
          </p>
        </div>
        <Receipt snapshot={snapshot} catalog={catalog} />
      </div>
    );
  }

  if (payment?.status === 'PENDING_REVIEW') {
    return (
      <div className="space-y-4">
        <div className="card space-y-3 p-6 text-center">
          <Hourglass className="mx-auto size-12 animate-pulse text-[var(--warning)]" />
          <h1 className="text-lg font-semibold">{t('bill.waitingTitle')}</h1>
          <p className="text-sm muted">{t('bill.waitingBody')}</p>
          <p className="text-2xl font-bold tabular">
            {formatMoney(payment.amount, currency)}
          </p>
          <div className="flex items-center justify-center gap-2 text-xs muted">
            <Spinner className="size-3.5" />
            {t('common.loading')}
          </div>
        </div>
        <Receipt snapshot={snapshot} catalog={catalog} />
      </div>
    );
  }

  if (snapshot.orders.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptText className="size-10" />}
        title={t('order.none')}
        action={
          snapshot.session.status === 'OPEN' ? (
            <Button variant="secondary" onClick={onBrowse}>
              {t('nav.menu')}
            </Button>
          ) : undefined
        }
      />
    );
  }

  const awaitingSlip = payment?.status === 'PENDING' || checkout !== null;
  const awaitingPricing = snapshot.awaitingPricing;
  const noticeConfigured =
    catalog.settings.serviceNoticeEnabled &&
    Boolean(
      catalog.settings.serviceNoticeImage || L(catalog.settings.serviceNotice),
    );

  // The notice comes first, then the "this closes your session" confirmation.
  // Two dialogs rather than one because they ask for different things: one is
  // information the villa needs the guest to have read, the other is consent
  // to end the session.
  function beginCheckout() {
    if (noticeConfigured) setNoticeOpen(true);
    else setConfirmOpen(true);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t('bill.title')}</h1>

      <Receipt snapshot={snapshot} catalog={catalog} />

      {payment?.status === 'REJECTED' && (
        <div className="rounded-2xl border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-4">
          <p className="flex items-center gap-2 font-semibold text-[var(--danger)]">
            <XCircle className="size-5" />
            {t('bill.rejectedTitle')}
          </p>
          {payment.rejectReason && (
            <p className="text-sm text-[var(--danger)]">
              {t('bill.rejectedReason', { reason: payment.rejectReason })}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {awaitingPricing.length > 0 && (
        <div className="rounded-2xl border-l-4 border-brand-500 bg-brand-50 p-4 dark:bg-brand-900">
          <p className="flex items-center gap-2 font-semibold">
            <Scale className="size-5" />
            {t('bill.awaitingTitle')}
          </p>
          <p className="text-sm">
            {t('bill.awaitingBody', {
              names: awaitingPricing.map((i) => i.name).join(', '),
            })}
          </p>
        </div>
      )}

      {!awaitingSlip ? (
        <Button
          full
          size="lg"
          loading={busy}
          disabled={awaitingPricing.length > 0}
          onClick={beginCheckout}
        >
          <CreditCard className="size-5" />
          {t('bill.checkout')}
        </Button>
      ) : (
        <div className="card space-y-4 p-5">
          <div className="text-center">
            <p className="text-sm muted">{t('bill.amountDue')}</p>
            <p className="text-3xl font-bold tabular">
              {formatMoney(payment?.amount ?? snapshot.billTotal, currency)}
            </p>
          </div>

          {checkout?.qr ? (
            <div className="space-y-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={checkout.qr.dataUrl}
                alt="PromptPay QR"
                width={256}
                height={256}
                className="mx-auto size-56 rounded-xl bg-white p-2"
              />
              <p className="text-sm font-medium">{t('bill.scanToPay')}</p>
              <p className="text-xs muted">
                {checkout.promptPayName} · {checkout.promptPayId}
              </p>
              <p className="text-xs muted">{L(checkout.paymentNote)}</p>
            </div>
          ) : (
            <p className="text-center text-sm muted">
              {L(catalog.settings.paymentNote)}
            </p>
          )}

          <div className="space-y-2 border-t border-[var(--border)] pt-4">
            <p className="text-sm font-semibold">{t('bill.uploadSlip')}</p>
            <p className="text-xs muted">{t('bill.uploadHint')}</p>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Clear immediately so picking the same file twice re-fires.
                e.target.value = '';
                if (file) upload(file);
              }}
            />
            <Button
              full
              size="lg"
              variant="success"
              loading={uploading}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="size-5" />
              {uploading ? t('bill.uploading') : t('bill.uploadSlip')}
            </Button>
          </div>
        </div>
      )}

      <ServiceNotice
        open={noticeOpen}
        onOpenChange={setNoticeOpen}
        catalog={catalog}
        onAccept={() => {
          setNoticeOpen(false);
          setConfirmOpen(true);
        }}
      />

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('bill.confirmTitle')}
        description={t('bill.confirmBody')}
        footer={
          <>
            <Button variant="secondary" full onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button full loading={busy} onClick={startCheckout}>
              {t('common.confirm')}
            </Button>
          </>
        }
      />
    </div>
  );
}

function Receipt({
  snapshot,
  catalog,
}: {
  snapshot: SessionSnapshot;
  catalog: MenuCatalog;
}) {
  const { t, L } = useI18n();
  const currency = catalog.settings.currency;
  const orders = snapshot.orders.filter((o) => o.status !== 'CANCELLED');

  const subtotal = orders.reduce((sum, o) => sum + o.subtotal, 0);
  const service = orders.reduce((sum, o) => sum + o.serviceCharge, 0);
  const vat = orders.reduce((sum, o) => sum + o.vat, 0);

  return (
    <div className="card space-y-2 p-4 text-sm">
      <p className="font-semibold">{t('bill.summary')}</p>
      <ul className="space-y-1 border-t border-[var(--border)] pt-2">
        {orders.flatMap((order) =>
          order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span>
                <span className="tabular">{item.qty}×</span> {L(item.name)}
              </span>
              <span className="shrink-0 tabular">
                {item.priceOnRequest && !item.pricedAt
                  ? t('item.priceOnRequest')
                  : formatMoney(item.lineTotal, currency)}
              </span>
            </li>
          )),
        )}
      </ul>
      <div className="space-y-1 border-t border-[var(--border)] pt-2">
        <div className="flex justify-between">
          <span>{t('cart.subtotal')}</span>
          <span className="tabular">{formatMoney(subtotal, currency)}</span>
        </div>
        {service > 0 && (
          <div className="flex justify-between muted">
            <span>
              {t('cart.service', { percent: catalog.settings.serviceChargePercent })}
            </span>
            <span className="tabular">{formatMoney(service, currency)}</span>
          </div>
        )}
        {catalog.settings.vatPercent > 0 && (
          <div className="flex justify-between muted">
            <span>
              {t(catalog.settings.vatIncluded ? 'cart.vatIncluded' : 'cart.vat', {
                percent: catalog.settings.vatPercent,
              })}
            </span>
            <span className="tabular">{formatMoney(vat, currency)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-bold">
          <span>{t('cart.total')}</span>
          <span className="tabular">
            {formatMoney(snapshot.billTotal, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
