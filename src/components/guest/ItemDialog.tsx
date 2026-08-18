'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus, TriangleAlert, Leaf, Scale, Phone } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { Badge, Button, Checkbox, Dialog, cn } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { allergenConflicts } from '@/lib/search';
import { NOTE_MAX_LENGTH } from '@/lib/validation';
import type { MenuCatalog, MenuItem } from '@/lib/types';
import { guestApi } from './api';

export function ItemDialog({
  item,
  catalog,
  sessionId,
  profile,
  canOrder,
  open,
  onOpenChange,
  onAdded,
}: {
  item: MenuItem;
  catalog: MenuCatalog;
  sessionId: string;
  profile: string[];
  canOrder: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => Promise<void>;
}) {
  const { t, L } = useI18n();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [ack, setAck] = useState(false);
  const [selection, setSelection] = useState<Record<string, string[]>>(() =>
    // Pre-select the first option of any required single-choice group, so the
    // common case is one tap on "add" rather than a hunt for what is missing.
    Object.fromEntries(
      item.optionGroups
        .filter((g) => g.required && g.type === 'single' && g.options[0])
        .map((g) => [g.id, [g.options[0].id]]),
    ),
  );
  const [ageOk, setAgeOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conflict = allergenConflicts(item, profile);
  const needsAck = conflict.certain.length > 0;
  const minAge = catalog.settings.alcoholMinAge;

  const allergenLabel = (ids: string[]) =>
    ids
      .map((id) => catalog.allergens.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((a) => `${a.icon ?? ''}${L(a.name)}`.trim())
      .join(', ');

  const optionIds = useMemo(
    () => Object.values(selection).flat(),
    [selection],
  );

  const unitPrice = useMemo(() => {
    const delta = item.optionGroups
      .flatMap((g) => g.options)
      .filter((o) => optionIds.includes(o.id))
      .reduce((sum, o) => sum + o.priceDelta, 0);
    return item.priceOnRequest ? 0 : item.price + delta;
  }, [item, optionIds]);

  const missingRequired = item.optionGroups.filter(
    (g) => g.required && (selection[g.id]?.length ?? 0) < Math.max(1, g.minSelect),
  );

  const noteTooLong = note.length > NOTE_MAX_LENGTH;
  const blocked =
    !canOrder ||
    !item.isAvailable ||
    missingRequired.length > 0 ||
    noteTooLong ||
    (needsAck && !ack) ||
    (item.isAlcohol && !ageOk);

  function toggleOption(groupId: string, optionId: string, single: boolean, max: number) {
    setSelection((prev) => {
      const current = prev[groupId] ?? [];
      if (single) return { ...prev, [groupId]: [optionId] };
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      if (current.length >= max) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });
  }

  async function add() {
    if (blocked) {
      if (needsAck && !ack) setError(t('allergy.mustAck'));
      else if (item.isAlcohol && !ageOk) setError(t('alcohol.mustConfirm'));
      return;
    }
    setBusy(true);
    setError(null);

    const res = await guestApi.addToCart(sessionId, {
      menuId: item.id,
      qty,
      optionIds,
      note,
      allergenAck: ack,
      ageConfirmed: ageOk,
    });

    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await onAdded();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={L(item.name)}
      description={L(item.description) || undefined}
    >
      <div className="space-y-4">
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            className="h-44 w-full rounded-xl object-cover"
          />
        )}

        <div className="flex flex-wrap gap-1.5">
          {item.isVegetarian && (
            <Badge tone="success">
              <Leaf className="size-3" /> {t('item.vegetarian')}
            </Badge>
          )}
          {item.spicyLevel > 0 && (
            <Badge tone="warning">
              {'🌶'.repeat(Math.min(3, item.spicyLevel))} {t('item.spicy')}{' '}
              {item.spicyLevel}
            </Badge>
          )}
          {!item.isAvailable && <Badge tone="neutral">{t('item.unavailable')}</Badge>}
          {item.priceOnRequest && (
            <Badge tone="brand">
              <Scale className="size-3" /> {t('item.priceOnRequest')}
            </Badge>
          )}
          {item.isAlcohol && (
            <Badge tone="warning">{t('alcohol.badge', { age: minAge })}</Badge>
          )}
        </div>

        {item.priceOnRequest && (
          <div className="space-y-1 rounded-xl border-l-4 border-[var(--brand)] bg-[var(--brand-soft)] p-3 text-[var(--brand-soft-text)]">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Scale className="size-4" />
              {t('item.priceOnRequest')}
            </p>
            <p className="text-sm">{t('item.priceOnRequestHint')}</p>
            {catalog.settings.contactPhone && (
              <a
                href={`tel:${catalog.settings.contactPhone.replace(/[^0-9+]/g, '')}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-2"
              >
                <Phone className="size-3.5" />
                {t('item.priceOnRequestCall', { phone: catalog.settings.contactPhone })}
              </a>
            )}
          </div>
        )}

        {item.isAlcohol && (
          <div className="space-y-2 rounded-xl border-l-4 border-[var(--warning)] bg-[var(--warning-soft)] p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--warning)]">
              <TriangleAlert className="size-4" />
              {t('alcohol.title')}
            </p>
            <p className="text-sm text-[var(--warning)]">
              {L(catalog.settings.alcoholNotice) || t('alcohol.body', { age: minAge })}
            </p>
            <Checkbox
              checked={ageOk}
              onChange={(e) => {
                setAgeOk(e.target.checked);
                setError(null);
              }}
              label={
                <span className="font-medium text-[var(--warning)]">
                  {t('alcohol.confirm', { age: minAge })}
                </span>
              }
              className="hover:bg-transparent"
            />
          </div>
        )}

        {/*
          Allergy warning sits above the options, not below the fold. If a
          guest has told us they are allergic to shellfish, that has to be the
          first thing they see on a shellfish dish.
        */}
        {needsAck && (
          <div className="space-y-2 rounded-xl border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--danger)]">
              <TriangleAlert className="size-4" />
              {t('allergy.confirmTitle')}
            </p>
            <p className="text-sm text-[var(--danger)]">
              {t('allergy.confirmBody', {
                name: L(item.name),
                allergens: allergenLabel(conflict.certain),
              })}
            </p>
            <Checkbox
              checked={ack}
              onChange={(e) => {
                setAck(e.target.checked);
                setError(null);
              }}
              label={
                <span className="font-medium text-[var(--danger)]">
                  {t('allergy.ack')}
                </span>
              }
              className="hover:bg-transparent"
            />
          </div>
        )}

        {!needsAck && conflict.possible.length > 0 && (
          <p className="rounded-xl border-l-4 border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)]">
            {t('allergy.mayContain')}: {allergenLabel(conflict.possible)}
          </p>
        )}

        {L(item.ingredients) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide muted">
              {t('item.ingredients')}
            </p>
            <p className="text-sm">{L(item.ingredients)}</p>
          </div>
        )}

        {item.allergens.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide muted">
              {t('item.allergens')}
            </p>
            <p className="text-sm">{allergenLabel(item.allergens)}</p>
          </div>
        )}

        {item.optionGroups.map((group) => {
          const single = group.type === 'single';
          const chosen = selection[group.id] ?? [];
          const max = single ? 1 : group.maxSelect;
          return (
            <fieldset key={group.id} className="space-y-1.5">
              <legend className="flex items-center gap-2 text-sm font-semibold">
                {L(group.name)}
                {group.required ? (
                  <Badge tone="danger">{t('item.required')}</Badge>
                ) : !single ? (
                  <span className="text-xs font-normal muted">
                    {t('item.chooseUpTo', { n: max })}
                  </span>
                ) : null}
              </legend>
              <div className="space-y-1">
                {group.options.map((option) => {
                  const active = chosen.includes(option.id);
                  const disabled =
                    !option.isAvailable ||
                    (!single && !active && chosen.length >= max);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleOption(group.id, option.id, single, max)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                        active
                          ? 'border-[var(--brand)] bg-[var(--brand-soft)]'
                          : 'border-[var(--line)]',
                        disabled && 'opacity-40',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center border',
                            single ? 'rounded-full' : 'rounded',
                            active
                              ? 'border-brand-600 bg-brand-600'
                              : 'border-[var(--line)]',
                          )}
                        >
                          {active && <span className="size-1.5 rounded-full bg-white" />}
                        </span>
                        {L(option.name)}
                      </span>
                      {option.priceDelta !== 0 && (
                        <span className="tabular muted">
                          {option.priceDelta > 0 ? '+' : ''}
                          {formatMoney(option.priceDelta, catalog.settings.currency)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        {/* Note: 500 characters, enforced here and again on the server. */}
        <div className="space-y-1.5">
          <label htmlFor="line-note" className="text-sm font-semibold">
            {t('item.note')}
          </label>
          <textarea
            id="line-note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX_LENGTH))}
            maxLength={NOTE_MAX_LENGTH}
            rows={3}
            placeholder={t('item.notePlaceholder')}
            className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-[15px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          />
          <p
            className={cn(
              'text-right text-xs tabular',
              note.length >= NOTE_MAX_LENGTH ? 'text-[var(--warning)]' : 'muted',
            )}
          >
            {t('item.noteCount', { n: note.length, max: NOTE_MAX_LENGTH })}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{t('item.qty')}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="-"
            >
              <Minus className="size-4" />
            </Button>
            <span className="w-10 text-center text-lg font-semibold tabular">
              {qty}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setQty((q) => Math.min(50, q + 1))}
              aria-label="+"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        {missingRequired.length > 0 && (
          <p className="text-sm text-[var(--warning)]">
            {t('item.required')}: {missingRequired.map((g) => L(g.name)).join(', ')}
          </p>
        )}

        <Button
          full
          size="lg"
          loading={busy}
          disabled={blocked}
          onClick={add}
        >
          {!item.isAvailable
            ? t('item.unavailable')
            : item.priceOnRequest
              ? t('item.addOnRequest')
              : t('item.addWithPrice', {
                  price: formatMoney(unitPrice * qty, catalog.settings.currency),
                })}
        </Button>
      </div>
    </Dialog>
  );
}
