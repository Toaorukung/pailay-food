'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import type { GuestExtraAnswer, GuestField, Locale } from '@/lib/types';
import { guestApi } from './api';

export type WelcomeStep = 'details';

/** Enough digits to be a phone number someone can actually ring. */
const MIN_PHONE_DIGITS = 8;
const PHONE_ALLOWED = /^[0-9+\-() ]+$/;

/** Matches the server's per-answer cap in allergyProfileSchema. */
const EXTRA_MAX_LENGTH = 500;

function optionsFor(field: GuestField, locale: Locale): string[] {
  const own = field.options?.[locale];
  if (Array.isArray(own) && own.length > 0) return own;
  const th = field.options?.th;
  if (Array.isArray(th) && th.length > 0) return th;
  return [];
}

/**
 * Guest Login & Verification Flow.
 *
 * Verifies guest identity using their booking phone number against the
 * resort's master Google Sheet (บันทึกการจอง).
 *
 * It checks:
 * 1. That a booking with this phone number exists.
 * 2. That today's date is within the stay period (Check-in to Check-out).
 *
 * Once verified, the guest's name is automatically fetched from the booking sheet
 * so the guest never has to type it manually.
 */
export function WelcomeFlow({
  step,
  onStepChange,
  onDetailsSaved,
  sessionId,
  guestName: initialName = '',
  guestPhone: initialPhone = '',
  fields = [],
  guestExtra: initialExtra = [],
  onSaved,
  stepNumber = 1,
  totalSteps = 1,
}: {
  step: WelcomeStep | null;
  onStepChange: (step: WelcomeStep | null) => void;
  /** Phone verified and stay active — move on to the allergy question. */
  onDetailsSaved: () => void;
  sessionId: string;
  guestName?: string;
  guestPhone?: string;
  /** The villa's extra questions, already filtered to the active ones. */
  fields?: GuestField[];
  /** Answers already on the session, so reopening the step is not a retype. */
  guestExtra?: GuestExtraAnswer[];
  onSaved: () => Promise<unknown>;
  stepNumber?: number;
  totalSteps?: number;
}) {
  const safeFields = Array.isArray(fields) ? fields : [];
  const safeExtra = Array.isArray(initialExtra) ? initialExtra : [];
  const { t, locale } = useI18n();
  const [phone, setPhone] = useState(initialPhone || '');
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step === 'details') {
      setPhone(initialPhone || '');
      setExtra(
        Object.fromEntries(
          safeExtra.map((a) => [a?.fieldId ?? '', a?.value ?? '']),
        ),
      );
      setError(null);
    }
  }, [step, initialPhone, safeExtra]);

  async function loginAndVerify() {
    const trimmedPhone = phone.trim();

    if (!trimmedPhone) return setError(t('guest.phoneRequired'));
    if (
      !PHONE_ALLOWED.test(trimmedPhone) ||
      trimmedPhone.replace(/\D/g, '').length < MIN_PHONE_DIGITS
    ) {
      return setError(t('guest.phoneInvalid'));
    }

    const missing = safeFields.find(
      (f) => f.required && !(extra[f.id] ?? '').trim(),
    );
    if (missing) {
      return setError(
        t('guest.fieldRequired', {
          label: missing.label?.[locale] || missing.label?.th || '',
        }),
      );
    }

    setBusy(true);
    setError(null);

    // 1. Verify phone and stay dates with the booking sheet
    const res = await guestApi.verifyBooking(sessionId, {
      phone: trimmedPhone,
    });

    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }

    // 2. Save any extra villa questions if present
    if (safeFields.length > 0) {
      await guestApi.saveGuest(sessionId, {
        guestName: res.data.guestName,
        guestPhone: res.data.guestPhone,
        guestExtra: Object.fromEntries(
          safeFields.map((f) => [f.id, (extra[f.id] ?? '').trim()]),
        ),
      });
    }

    setBusy(false);
    await onSaved();
    onDetailsSaved();
  }

  return (
    <Dialog
      open={step !== null}
      dismissible={false}
      onOpenChange={(open) => {
        if (!open) onStepChange(null);
      }}
      title={t('guest.loginTitle')}
      description={
        <>
          {totalSteps > 1 && (
            <span className="mb-0.5 block text-xs font-semibold text-[var(--brand)]">
              {t('welcome.step', { n: stepNumber, total: totalSteps })}
            </span>
          )}
          {t('guest.loginIntro')}
        </>
      }
      footer={
        <Button full loading={busy} onClick={loginAndVerify}>
          {busy ? t('guest.verifying') : t('guest.loginBtn')}
        </Button>
      }
    >
      <div className="space-y-3">
        {initialName && initialPhone && (
          <div className="rounded-xl border border-[var(--brand)]/25 bg-[var(--brand-soft)]/20 p-3 text-xs text-[var(--text)]">
            <span className="font-semibold text-[var(--brand)]">
              {t('guest.loggedInAs', { name: initialName })}
            </span>
            <span className="block text-[var(--text-muted)]">
              {t('guest.phone')}: {initialPhone}
            </span>
          </div>
        )}

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
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && safeFields.length === 0) loginAndVerify();
            }}
          />
        </Field>

        {safeFields.map((field) => (
          <ExtraField
            key={field.id}
            field={field}
            locale={locale}
            value={extra[field.id] ?? ''}
            onChange={(v) => setExtra((prev) => ({ ...prev, [field.id]: v }))}
          />
        ))}

        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)] leading-relaxed">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function ExtraField({
  field,
  locale,
  value,
  onChange,
}: {
  field: GuestField;
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const label = field.label[locale] || field.label.th;

  if (field.type === 'select') {
    return (
      <Field label={label}>
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('guest.selectPlaceholder')}</option>
          {optionsFor(field, locale).map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.type === 'textarea') {
    return (
      <Field label={label}>
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={EXTRA_MAX_LENGTH}
        />
      </Field>
    );
  }

  return (
    <Field label={label}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={EXTRA_MAX_LENGTH}
        type={field.type === 'number' ? 'number' : field.type === 'tel' ? 'tel' : 'text'}
        inputMode={
          field.type === 'number' ? 'numeric' : field.type === 'tel' ? 'tel' : undefined
        }
      />
    </Field>
  );
}
