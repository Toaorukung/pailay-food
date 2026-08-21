'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { Button, Dialog, Field, Input } from '@/components/ui';
import type { MenuCatalog } from '@/lib/types';
import { guestApi } from './api';
import { NoticeContent } from './ServiceNotice';

/** The steps this component owns. The allergy question follows them. */
export type WelcomeStep = 'notice' | 'details';

/** Enough digits to be a number someone can actually ring. */
const MIN_PHONE_DIGITS = 8;
const PHONE_ALLOWED = /^[0-9+\-() ]+$/;

/**
 * What a guest sees before the menu, the first time they open the app.
 *
 * The villa's notice comes first because it sets expectations that change what
 * someone orders — delivery windows, breakfast cut-offs, the minimum for free
 * delivery — and it is wasted if it appears after the basket is full. Name and
 * phone come next: an order arriving at reception without a number is one
 * nobody can chase. The allergy question is the step after these two, and is
 * asked by AllergyDialog so the same screen serves the header's edit link.
 *
 * These two steps cannot be dismissed — no close button, no Escape, no
 * click-outside — so a guest cannot reach the menu without leaving a name and
 * phone. The only way forward is the button in the footer. The phone number is
 * what marks the session as introduced, so once saved the flow never returns.
 */
export function WelcomeFlow({
  step,
  onStepChange,
  onDetailsSaved,
  catalog,
  sessionId,
  guestName: initialName,
  guestPhone: initialPhone,
  onSaved,
  stepNumber,
  totalSteps,
}: {
  step: WelcomeStep | null;
  onStepChange: (step: WelcomeStep | null) => void;
  /** Name and phone are stored — move on to the allergy question. */
  onDetailsSaved: () => void;
  catalog: MenuCatalog;
  sessionId: string;
  guestName: string;
  guestPhone: string;
  onSaved: () => Promise<unknown>;
  stepNumber: number;
  totalSteps: number;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whatever staff or an earlier visit already recorded is what the fields
  // should show when the flow opens.
  useEffect(() => {
    if (step === 'details') {
      setName(initialName);
      setPhone(initialPhone);
      setError(null);
    }
  }, [step, initialName, initialPhone]);

  async function saveDetails() {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) return setError(t('guest.nameRequired'));
    if (!trimmedPhone) return setError(t('guest.phoneRequired'));
    if (
      !PHONE_ALLOWED.test(trimmedPhone) ||
      trimmedPhone.replace(/\D/g, '').length < MIN_PHONE_DIGITS
    ) {
      return setError(t('guest.phoneInvalid'));
    }

    setBusy(true);
    setError(null);
    const res = await guestApi.saveGuest(sessionId, {
      guestName: trimmedName,
      guestPhone: trimmedPhone,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await onSaved();
    onDetailsSaved();
  }

  const isNotice = step === 'notice';

  return (
    <Dialog
      open={step !== null}
      // Required onboarding: no close button, no Escape, no click-outside. A
      // guest who dismissed this would skip giving their name and phone, and an
      // order with no number is one reception cannot chase.
      dismissible={false}
      onOpenChange={(open) => {
        if (!open) onStepChange(null);
      }}
      title={isNotice ? t('welcome.title') : t('guest.title')}
      description={
        <>
          {totalSteps > 1 && (
            <span className="mb-0.5 block text-xs font-semibold text-[var(--brand)]">
              {t('welcome.step', { n: stepNumber, total: totalSteps })}
            </span>
          )}
          {isNotice ? t('welcome.intro') : t('guest.intro')}
        </>
      }
      footer={
        isNotice ? (
          <Button full onClick={() => onStepChange('details')}>
            {t('welcome.next')}
          </Button>
        ) : (
          <Button full loading={busy} onClick={saveDetails}>
            {t('guest.next')}
          </Button>
        )
      }
    >
      {isNotice ? (
        <NoticeContent
          catalog={catalog}
          image={catalog.settings.welcomeImage}
          imageAlt={t('welcome.imageAlt')}
        />
      ) : (
        <div className="space-y-3">
          <Field label={t('guest.name')}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('guest.namePlaceholder')}
              maxLength={80}
              autoComplete="name"
              enterKeyHint="next"
            />
          </Field>

          <Field label={t('guest.phone')}>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('guest.phonePlaceholder')}
              maxLength={40}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="done"
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveDetails();
              }}
            />
          </Field>

          {error && (
            <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
