'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Hourglass,
  Scale,
  Upload,
  XCircle,
} from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Button, Dialog, Spinner } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { MenuCatalog, Order } from '@/lib/types';
import type { PublicPayment } from '@/lib/snapshot';
import { guestApi, compressImage, type PaymentContext } from './api';

/**
 * Pays for one order.
 *
 * The whole flow now settles per order rather than per stay, so this is opened
 * from an order card and closes when the slip is in. It shows exactly one of
 * four states, because a guest looking at a payment screen has exactly one
 * question — "what do I do next".
 */
export function PaymentSheet({
  open,
  onOpenChange,
  order,
  payment,
  catalog,
  sessionId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  payment: PublicPayment | undefined;
  catalog: MenuCatalog;
  sessionId: string;
  onChanged: () => Promise<unknown>;
}) {
  const { t, L } = useI18n();
  const [context, setContext] = useState<PaymentContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const currency = catalog.settings.currency;
  const status = payment?.status ?? 'PENDING';
  const needsQr =
    open && (order.status === 'UNPAID' || status === 'REJECTED');

  // The QR encodes the exact amount, so it is fetched when the sheet opens
  // rather than cached — a repriced order must not show yesterday's figure.
  useEffect(() => {
    if (!needsQr) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    guestApi.payFor(sessionId, order.id).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) setContext(res.data);
      else setError(res.error);
    });

    return () => {
      cancelled = true;
    };
  }, [needsQr, sessionId, order.id, order.total]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    // Shrink on-device first: a raw 8MB camera photo over villa wifi is a
    // minute of uploading and a likely timeout.
    const blob = await compressImage(file);
    const res = await guestApi.uploadSlip(sessionId, order.id, blob);
    setUploading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await onChanged();
  }

  const amount = payment?.amount ?? order.total;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('pay.title')}
      description={t('pay.forOrder', { id: order.id })}
    >
      <div className="space-y-4">
        {/* ── Waiting for the scale ───────────────────────── */}
        {order.status === 'AWAITING_PRICING' && (
          <div className="space-y-2 rounded-xl border-l-4 border-[var(--brand)] bg-[var(--brand-soft)] p-4 text-[var(--brand-soft-text)]">
            <p className="flex items-center gap-2 font-semibold">
              <Scale className="size-4" />
              {t('order.status.AWAITING_PRICING')}
            </p>
            <p className="text-sm">{t('pay.waitingPrice')}</p>
          </div>
        )}

        {/* ── Slip in, staff checking ─────────────────────── */}
        {status === 'PENDING_REVIEW' && (
          <div className="space-y-2 rounded-2xl bg-[var(--warning-soft)] p-5 text-center text-[var(--warning)]">
            <Hourglass className="mx-auto size-10 animate-pulse" />
            <p className="font-semibold">{t('pay.waitingReview')}</p>
            <p className="text-2xl font-bold tabular">
              {formatMoney(amount, currency)}
            </p>
            <p className="flex items-center justify-center gap-2 text-xs">
              <Spinner className="size-3.5" />
              {t('pay.kitchenNote')}
            </p>
          </div>
        )}

        {/* ── Done ───────────────────────────────────────── */}
        {status === 'APPROVED' && (
          <div className="space-y-2 rounded-2xl bg-[var(--success-soft)] p-5 text-center text-[var(--success)]">
            <CheckCircle2 className="mx-auto size-11" />
            <p className="font-semibold">{t('pay.approved')}</p>
            <p className="text-2xl font-bold tabular">
              {formatMoney(amount, currency)}
            </p>
          </div>
        )}

        {status === 'REJECTED' && (
          <div className="rounded-xl border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-[var(--danger)]">
            <p className="flex items-center gap-2 font-semibold">
              <XCircle className="size-4" />
              {t('pay.rejected')}
            </p>
            {payment?.rejectReason && (
              <p className="text-sm">
                {t('bill.rejectedReason', { reason: payment.rejectReason })}
              </p>
            )}
          </div>
        )}

        {/* ── Pay ────────────────────────────────────────── */}
        {needsQr && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[var(--surface-sunken)] p-4 text-center">
              <p className="text-xs muted">{t('pay.amount')}</p>
              <p className="text-3xl font-bold tabular">
                {formatMoney(amount, currency)}
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : context?.qr ? (
              <div className="space-y-1.5 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={context.qr.dataUrl}
                  alt="PromptPay QR"
                  width={224}
                  height={224}
                  className="mx-auto size-56 rounded-2xl bg-white p-2 shadow-[var(--shadow-sm)]"
                />
                <p className="text-sm font-medium">{t('bill.scanToPay')}</p>
                <p className="text-xs muted">
                  {context.promptPayName} · {context.promptPayId}
                </p>
                <p className="text-xs muted">{L(context.paymentNote)}</p>
              </div>
            ) : null}

            <div className="space-y-2 border-t border-[var(--line)] pt-4">
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
                {uploading
                  ? t('bill.uploading')
                  : status === 'REJECTED'
                    ? t('pay.uploadAgain')
                    : t('bill.uploadSlip')}
              </Button>
              <p className="text-center text-xs muted">{t('pay.kitchenNote')}</p>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
