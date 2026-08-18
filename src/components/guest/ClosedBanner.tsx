'use client';

import { QrCode } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

/**
 * Shown once staff end the stay. The page still works — it is the villa's
 * record of everything they ordered — it just cannot take new orders. The
 * instruction is deliberately concrete, because "session expired" tells a
 * guest nothing about what to do next.
 */
export function ClosedBanner() {
  const { t } = useI18n();
  return (
    <div className="mb-3 flex gap-3 rounded-2xl border border-[var(--brand)]/25 bg-[var(--brand-soft)] p-4 text-[var(--brand-soft-text)]">
      <QrCode className="mt-0.5 size-5 shrink-0 text-[var(--brand)]" />
      <div className="space-y-0.5">
        <p className="font-semibold">
          {t('session.closedTitle')}
        </p>
        <p className="text-sm">
          {t('session.closedBody')}
        </p>
      </div>
    </div>
  );
}
