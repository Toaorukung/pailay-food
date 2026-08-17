'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { Button, Dialog, Input, cn } from '@/components/ui';
import type { MenuCatalog } from '@/lib/types';
import { guestApi } from './api';

/**
 * Asked once, at the start of the session, and editable from the header
 * afterwards. Whatever is selected here drives the warnings on the menu, the
 * blocking confirmation before a conflicting dish enters the cart, and the red
 * banner on the kitchen ticket.
 */
export function AllergyDialog({
  open,
  onOpenChange,
  catalog,
  sessionId,
  current,
  guestName: initialName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: MenuCatalog;
  sessionId: string;
  current: string[];
  guestName: string;
  onSaved: () => Promise<unknown>;
}) {
  const { t, L } = useI18n();
  const [selected, setSelected] = useState<string[]>(current);
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when reopened after an edit elsewhere.
  useEffect(() => {
    if (open) {
      setSelected(current);
      setName(initialName);
      setError(null);
    }
  }, [open, current, initialName]);

  const allergens = catalog.allergens.filter((a) => a.isActive);

  async function save(list: string[]) {
    setBusy(true);
    setError(null);
    const res = await guestApi.saveAllergies(sessionId, {
      allergens: list,
      guestName: name.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('allergy.question')}
      description={t('allergy.help')}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {allergens.map((a) => {
            const active = selected.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setSelected((prev) =>
                    prev.includes(a.id)
                      ? prev.filter((id) => id !== a.id)
                      : [...prev, a.id],
                  )
                }
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
                    : 'border-[var(--border)] bg-[var(--surface-raised)]',
                )}
              >
                {a.icon && <span aria-hidden>{a.icon}</span>}
                {L(a.name)}
              </button>
            );
          })}
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('allergy.guestName')}</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="name"
          />
        </label>

        <p className="rounded-xl bg-[var(--surface-sunken)] p-3 text-xs muted">
          {L(catalog.settings.allergyDisclaimer)}
        </p>

        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            variant="secondary"
            full
            disabled={busy}
            onClick={() => save([])}
          >
            {t('allergy.none')}
          </Button>
          <Button full loading={busy} onClick={() => save(selected)}>
            {t('allergy.save')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
