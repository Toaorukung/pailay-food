'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { DEFAULT_GUEST_FIELDS, type GuestExtraAnswer, type GuestField, type Locale } from '@/lib/types';
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
 * Onboarding step that asks guest details configured by the restaurant.
 *
 * Defaults to guest name and phone number, but restaurant managers can
 * reword, reorder, make optional, add extra questions, or delete any of them
 * in /admin/guest-fields.
 */
export function WelcomeFlow({
  step,
  onStepChange,
  onDetailsSaved,
  sessionId,
  guestName: initialName = '',
  guestPhone: initialPhone = '',
  fields,
  guestExtra: initialExtra = [],
  onSaved,
  stepNumber = 1,
  totalSteps = 1,
}: {
  step: WelcomeStep | null;
  onStepChange: (step: WelcomeStep | null) => void;
  /** Details are stored — move on to the next step. */
  onDetailsSaved: () => void;
  sessionId: string;
  guestName?: string;
  guestPhone?: string;
  /** The questions configured in /admin/guest-fields. */
  fields?: GuestField[];
  /** Answers already on the session, so reopening the step is not a retype. */
  guestExtra?: GuestExtraAnswer[];
  onSaved: () => Promise<unknown>;
  stepNumber?: number;
  totalSteps?: number;
}) {
  const { t, locale } = useI18n();

  // If fields prop is undefined, use default questions (Name & Phone)
  const safeFields = useMemo(() => {
    const list = fields !== undefined ? fields : DEFAULT_GUEST_FIELDS;
    return list.filter((f) => f.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [fields]);

  const safeExtra = Array.isArray(initialExtra) ? initialExtra : [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize values when the dialog opens
  useEffect(() => {
    if (step === 'details') {
      const initialMap: Record<string, string> = {};
      if (initialName) initialMap['gf-name'] = initialName;
      if (initialPhone) initialMap['gf-phone'] = initialPhone;
      for (const item of safeExtra) {
        if (item?.fieldId) {
          initialMap[item.fieldId] = item.value;
        }
      }
      setValues(initialMap);
      setError(null);
    }
  }, [step, initialName, initialPhone, safeExtra]);

  async function saveDetails() {
    // 1. Validation
    for (const field of safeFields) {
      const val = (values[field.id] ?? '').trim();
      if (field.required && !val) {
        const label = field.label?.[locale] || field.label?.th || t('guest.fieldRequired', { label: '' });
        return setError(t('guest.fieldRequired', { label }));
      }
      if ((field.type === 'tel' || field.id === 'gf-phone') && val) {
        if (!PHONE_ALLOWED.test(val) || val.replace(/\D/g, '').length < MIN_PHONE_DIGITS) {
          return setError(t('guest.phoneInvalid'));
        }
      }
    }

    setBusy(true);
    setError(null);

    // 2. Resolve guestName and guestPhone from the dynamic fields
    const nameField =
      safeFields.find((f) => f.id === 'gf-name') ||
      safeFields.find((f) => f.type === 'text');
    const resolvedName = nameField
      ? (values[nameField.id] ?? '').trim()
      : initialName.trim();

    const phoneField =
      safeFields.find((f) => f.id === 'gf-phone') ||
      safeFields.find((f) => f.type === 'tel');
    const resolvedPhone = phoneField
      ? (values[phoneField.id] ?? '').trim()
      : initialPhone.trim();

    const guestExtraData = Object.fromEntries(
      safeFields.map((f) => [f.id, (values[f.id] ?? '').trim()]),
    );

    const res = await guestApi.saveGuest(sessionId, {
      guestName: resolvedName,
      guestPhone: resolvedPhone,
      guestExtra: guestExtraData,
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
        {safeFields.map((field, idx) => (
          <DynamicField
            key={field.id}
            field={field}
            locale={locale}
            value={values[field.id] ?? ''}
            onChange={(v) => setValues((prev) => ({ ...prev, [field.id]: v }))}
            autoFocus={idx === 0}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                idx === safeFields.length - 1 &&
                field.type !== 'textarea'
              ) {
                saveDetails();
              }
            }}
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

function DynamicField({
  field,
  locale,
  value,
  onChange,
  autoFocus,
  onKeyDown,
}: {
  field: GuestField;
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const label = (
    <span>
      {field.label?.[locale] || field.label?.th || ''}
      {field.required && <span className="ml-1 text-[var(--danger)]">*</span>}
    </span>
  );

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
          autoFocus={autoFocus}
        />
      </Field>
    );
  }

  const isPhone = field.type === 'tel' || field.id === 'gf-phone';
  const isName = field.id === 'gf-name';

  return (
    <Field label={label}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={isPhone ? 40 : isName ? 80 : EXTRA_MAX_LENGTH}
        type={isPhone ? 'tel' : field.type === 'number' ? 'number' : 'text'}
        inputMode={
          isPhone
            ? 'tel'
            : field.type === 'number'
            ? 'numeric'
            : undefined
        }
        autoComplete={isName ? 'name' : isPhone ? 'tel' : undefined}
        placeholder={
          isName
            ? t('guest.namePlaceholder')
            : isPhone
            ? t('guest.phonePlaceholder')
            : undefined
        }
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
      />
    </Field>
  );
}
