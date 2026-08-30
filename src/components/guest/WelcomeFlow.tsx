'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { Button, Dialog, Field, Input } from '@/components/ui';
import { guestApi } from './api';

/**
 * The step this component owns. The allergy question follows it.
 *
 * A single-member union rather than a bare string: the conditions used to be a
 * step here too, and keeping the shape means moving one back is an addition
 * rather than a refactor of every caller.
 */
export type WelcomeStep = 'details';

/** Enough digits to be a number someone can actually ring. */
const MIN_PHONE_DIGITS = 8;
const PHONE_ALLOWED = /^[0-9+\-() ]+$/;

/**
 * Who is ordering, asked the first time a guest reaches the menu.
 *
 * An order arriving at reception without a number is one nobody can chase —
 * and under the current flow that call is the whole point, since staff ring
 * the villa to confirm the ticket before the kitchen starts. So this cannot be
 * dismissed: no close button, no Escape, no click-outside. The only way
 * forward is the button in the footer.
 *
 * The name may already be filled in from the guest's LINE profile. The phone
 * number is what marks the session as introduced, so once saved the flow never
 * returns.
 */
export function WelcomeFlow({
  step,
  onStepChange,
  onDetailsSaved,
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

  // Whatever LINE, staff or an earlier visit already recorded is what the
  // fields should show when the flow opens.
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

  return (
    <Dialog
      open={step !== null}
      // Required onboarding: no close button, no Escape, no click-outside. A
      // guest who dismissed this would skip giving their name and phone, and
      // an order with no number is one reception cannot confirm.
      dismissible={false}
      onOpenChange={(open) => {
        if (!open) onStepChange(null);
      }}
      title={t('guest.title')}
      description={
        <>
          {totalSteps > 1 && (
            <span className="mb-0.5 block text-xs font-semibold text-[var(--brand)]">
              {t('welcome.step', { n: stepNumber, total: totalSteps })}
            </span>
          )}
          {t('guest.intro')}
        </>
      }
      footer={
        <Button full loading={busy} onClick={saveDetails}>
          {t('guest.next')}
        </Button>
      }
    >
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
    </Dialog>
  );
}
