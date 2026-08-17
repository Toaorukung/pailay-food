'use client';

import { QrCode } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

/**
 * Shown on every tab once the bill is settled. The page still works as a
 * receipt; it just cannot order. The instruction is deliberately concrete —
 * "scan the QR in your villa" — because "session expired" tells a guest
 * nothing about what to do next.
 */
export function ClosedBanner() {
  const { t } = useI18n();
  return (
    <div className="mb-3 flex gap-3 rounded-2xl border border-brand-300 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900">
      <QrCode className="mt-0.5 size-5 shrink-0 text-brand-600 dark:text-brand-100" />
      <div className="space-y-0.5">
        <p className="font-semibold text-brand-800 dark:text-brand-50">
          {t('session.closedTitle')}
        </p>
        <p className="text-sm text-brand-700 dark:text-brand-100">
          {t('session.closedBody')}
        </p>
      </div>
    </div>
  );
}
