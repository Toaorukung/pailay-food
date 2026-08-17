'use client';

import { Info, Phone } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Button, Dialog } from '@/components/ui';
import type { MenuCatalog } from '@/lib/types';

/**
 * The villa's ordering and service rules, shown once immediately before
 * checkout.
 *
 * Both halves matter. The image is the villa's own artwork and the version
 * guests recognise from the printed sheet in the room, but it is a picture of
 * Thai text: it cannot be translated, a screen reader cannot read it, and it
 * is unreadable on a phone without pinching. So the same rules are repeated
 * underneath as real text in the guest's own language, one rule per line.
 *
 * Both come from Settings, so the villa can reissue the artwork or reword a
 * rule without a deploy.
 */
export function ServiceNotice({
  open,
  onOpenChange,
  onAccept,
  catalog,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
  catalog: MenuCatalog;
  busy?: boolean;
}) {
  const { t, L } = useI18n();
  const { serviceNoticeImage, contactPhone } = catalog.settings;

  const rules = L(catalog.settings.serviceNotice)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('notice.title')}
      description={t('notice.intro')}
      footer={
        <>
          <Button variant="secondary" full onClick={() => onOpenChange(false)}>
            {t('common.back')}
          </Button>
          <Button full loading={busy} onClick={onAccept}>
            {t('notice.ack')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {serviceNoticeImage && (
          // Tall poster on a small screen: let it scroll rather than shrinking
          // the text to unreadable.
          <div className="max-h-[45svh] overflow-y-auto rounded-xl border border-[var(--border)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={serviceNoticeImage}
              alt={t('notice.imageAlt')}
              className="w-full bg-white"
              loading="lazy"
              decoding="async"
            />
          </div>
        )}

        {rules.length > 0 && (
          <ul className="space-y-2">
            {rules.map((rule, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        )}

        {contactPhone && (
          <a
            href={`tel:${contactPhone.replace(/[^0-9+]/g, '')}`}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--surface-sunken)] p-3 text-sm font-medium"
          >
            <Phone className="size-4" />
            {contactPhone}
          </a>
        )}
      </div>
    </Dialog>
  );
}
