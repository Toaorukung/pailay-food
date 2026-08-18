'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Search, X, TriangleAlert, Leaf, Flame, SlidersHorizontal } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { cn, Badge, Button, EmptyState } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { buildIndex, search, allergenConflicts } from '@/lib/search';
import type { MenuCatalog, MenuItem } from '@/lib/types';
import type { SessionSnapshot } from '@/lib/snapshot';
import { ItemDialog } from './ItemDialog';

export function MenuView({
  catalog,
  snapshot,
  canOrder,
  onChanged,
  onOpenAllergy,
}: {
  catalog: MenuCatalog;
  snapshot: SessionSnapshot;
  canOrder: boolean;
  onChanged: () => Promise<unknown>;
  onOpenAllergy: () => void;
}) {
  const { t, L } = useI18n();
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [vegOnly, setVegOnly] = useState(false);
  const [notSpicy, setNotSpicy] = useState(false);
  const [hideAllergens, setHideAllergens] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<MenuItem | null>(null);

  // Deferring keeps typing responsive on a long menu: the input updates every
  // keystroke while the result list catches up.
  const deferredQuery = useDeferredValue(query);

  const index = useMemo(
    () => buildIndex(catalog.items, catalog.categories),
    [catalog],
  );

  const profile = snapshot.session.allergyProfile;

  const results = useMemo(() => {
    let items = catalog.items;

    if (deferredQuery.trim()) {
      const hits = search(deferredQuery, index);
      const rank = new Map(hits.map((h, i) => [h.id, i]));
      items = items
        .filter((i) => rank.has(i.id))
        .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    } else if (categoryId) {
      items = items.filter((i) => i.categoryId === categoryId);
    }

    if (vegOnly) items = items.filter((i) => i.isVegetarian);
    if (notSpicy) items = items.filter((i) => i.spicyLevel === 0);
    if (hideAllergens && profile.length > 0) {
      items = items.filter(
        (i) => allergenConflicts(i, profile).certain.length === 0,
      );
    }
    return items;
  }, [
    catalog.items,
    deferredQuery,
    index,
    categoryId,
    vegOnly,
    notSpicy,
    hideAllergens,
    profile,
  ]);

  const searching = deferredQuery.trim().length > 0;

  // Without a query the menu reads as a menu: grouped under its headings, in
  // the order the kitchen set. With one, relevance order matters more.
  const grouped = useMemo(() => {
    if (searching) return null;
    return catalog.categories
      .filter((c) => c.isActive)
      .map((category) => ({
        category,
        items: results.filter((i) => i.categoryId === category.id),
      }))
      .filter((g) => g.items.length > 0);
  }, [catalog.categories, results, searching]);

  const activeFilters = [vegOnly, notSpicy, hideAllergens].filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] pl-9 pr-9 text-[15px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('search.clear')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 muted hover:bg-[var(--surface-sunken)]"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          className={cn(
            'relative flex size-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
            filtersOpen || activeFilters
              ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-soft-text)]'
              : 'border-[var(--line)] bg-[var(--surface)]',
          )}
        >
          <SlidersHorizontal className="size-4" />
          {activeFilters > 0 && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      {filtersOpen && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--line)] p-3 animate-rise">
          <FilterChip active={vegOnly} onClick={() => setVegOnly((v) => !v)}>
            <Leaf className="size-3.5" /> {t('filter.vegetarian')}
          </FilterChip>
          <FilterChip active={notSpicy} onClick={() => setNotSpicy((v) => !v)}>
            <Flame className="size-3.5" /> {t('filter.notSpicy')}
          </FilterChip>
          {profile.length > 0 && (
            <FilterChip
              active={hideAllergens}
              onClick={() => setHideAllergens((v) => !v)}
            >
              <TriangleAlert className="size-3.5" /> {t('filter.hideAllergens')}
            </FilterChip>
          )}
          <button
            type="button"
            onClick={onOpenAllergy}
            className="ml-auto text-xs font-medium text-brand-600 underline underline-offset-2"
          >
            {t('allergy.edit')}
          </button>
        </div>
      )}

      {!searching && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
          <CategoryChip
            active={categoryId === null}
            onClick={() => setCategoryId(null)}
          >
            {t('common.all')}
          </CategoryChip>
          {catalog.categories
            .filter((c) => c.isActive)
            .map((c) => (
              <CategoryChip
                key={c.id}
                active={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
              >
                {c.icon && <span aria-hidden>{c.icon}</span>}
                {L(c.name)}
              </CategoryChip>
            ))}
        </div>
      )}

      {searching && (
        <p className="text-xs muted">
          {t('search.results', { n: results.length })}
        </p>
      )}

      {results.length === 0 ? (
        <EmptyState
          icon={<Search className="size-8" />}
          title={t('search.noResults')}
          action={
            query ? (
              <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
                {t('search.clear')}
              </Button>
            ) : undefined
          }
        />
      ) : grouped ? (
        <div className="space-y-6">
          {grouped.map(({ category, items }) => (
            <section key={category.id} className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide muted">
                {category.icon && <span aria-hidden>{category.icon}</span>}
                {L(category.name)}
              </h2>
              <ul className="space-y-2">
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    catalog={catalog}
                    profile={profile}
                    onSelect={() => setSelected(item)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {results.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              catalog={catalog}
              profile={profile}
              onSelect={() => setSelected(item)}
            />
          ))}
        </ul>
      )}

      {selected && (
        <ItemDialog
          item={selected}
          catalog={catalog}
          sessionId={snapshot.session.id}
          profile={profile}
          canOrder={canOrder}
          open
          onOpenChange={(open) => !open && setSelected(null)}
          onAdded={async () => {
            setSelected(null);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function ItemRow({
  item,
  catalog,
  profile,
  onSelect,
}: {
  item: MenuItem;
  catalog: MenuCatalog;
  profile: string[];
  onSelect: () => void;
}) {
  const { t, L } = useI18n();
  const conflict = allergenConflicts(item, profile);
  const flagged = conflict.certain.length > 0;
  const maybe = conflict.possible.length > 0;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex w-full gap-3 rounded-2xl border p-3 text-left transition-colors',
          'bg-[var(--surface)] hover:bg-[var(--surface-sunken)]',
          flagged ? 'border-[var(--danger)]' : 'border-[var(--line)]',
          !item.isAvailable && 'opacity-60',
        )}
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-[4.75rem] shrink-0 rounded-2xl object-cover"
          />
        ) : (
          // No photo: a warm tile with the category glyph, so the row keeps its
          // rhythm instead of collapsing into a wall of text.
          <div className="food-tile flex size-[4.75rem] shrink-0 items-center justify-center rounded-2xl text-[1.75rem]">
            <span className="relative">
              {catalog.categories.find((c) => c.id === item.categoryId)?.icon ?? '🍽'}
            </span>
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold leading-snug">{L(item.name)}</p>
            {/* A market-price dish stored at 0 must never render as "฿0". */}
            <p
              className={cn(
                'shrink-0 font-semibold',
                item.priceOnRequest ? 'text-xs muted' : 'tabular',
              )}
            >
              {item.priceOnRequest
                ? t('item.priceOnRequest')
                : formatMoney(item.price, catalog.settings.currency)}
            </p>
          </div>

          {L(item.description) && (
            <p className="line-clamp-2 text-xs muted">{L(item.description)}</p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {!item.isAvailable && (
              <Badge tone="neutral">{t('item.unavailable')}</Badge>
            )}
            {item.isAlcohol && (
              <Badge tone="warning">
                {t('alcohol.badge', { age: catalog.settings.alcoholMinAge })}
              </Badge>
            )}
            {flagged && (
              <Badge tone="danger">
                <TriangleAlert className="size-3" />
                {t('allergy.warning')}
              </Badge>
            )}
            {!flagged && maybe && (
              <Badge tone="warning">
                <TriangleAlert className="size-3" />
                {t('allergy.mayContain')}
              </Badge>
            )}
            {item.isVegetarian && (
              <Badge tone="success">
                <Leaf className="size-3" />
                {t('item.vegetarian')}
              </Badge>
            )}
            {item.spicyLevel > 0 && (
              <span className="text-xs" aria-label={`${t('item.spicy')} ${item.spicyLevel}`}>
                {'🌶'.repeat(Math.min(3, item.spicyLevel))}
              </span>
            )}
          </div>
        </div>

        {item.isAvailable && (
          <span
            aria-hidden
            className="mt-auto flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-lg font-bold leading-none text-white shadow-[var(--shadow-brand)]"
          >
            +
          </span>
        )}
      </button>
    </li>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5',
        'text-sm font-semibold transition-colors',
        'active:scale-95 active:duration-75',
        active
          ? 'bg-[var(--brand)] text-white shadow-[var(--shadow-brand)]'
          : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--line)]',
      )}
    >
      {children}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-brand-500 bg-brand-600 text-white'
          : 'border-[var(--line)] bg-[var(--surface)]',
      )}
    >
      {children}
    </button>
  );
}
