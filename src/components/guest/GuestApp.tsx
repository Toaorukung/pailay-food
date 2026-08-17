'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UtensilsCrossed,
  ShoppingBasket,
  ReceiptText,
  CreditCard,
  MapPin,
  TriangleAlert,
  Globe,
} from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { LOCALE_LABELS } from '@/i18n/dict';
import { cn, Alert } from '@/components/ui';
import { LOCALES, type MenuCatalog, type Locale } from '@/lib/types';
import type { SessionSnapshot } from '@/lib/snapshot';
import { guestApi } from './api';
import { MenuView } from './MenuView';
import { CartView } from './CartView';
import { OrdersView } from './OrdersView';
import { BillView } from './BillView';
import { AllergyDialog } from './AllergyDialog';
import { ClosedBanner } from './ClosedBanner';

type Tab = 'menu' | 'cart' | 'orders' | 'bill';

const POLL_IDLE_MS = 20_000;
const POLL_ACTIVE_MS = 5_000;

export function GuestApp({
  catalog: initialCatalog,
  initialSnapshot,
}: {
  catalog: MenuCatalog;
  initialSnapshot: SessionSnapshot;
}) {
  const { t, locale, setLocale } = useI18n();
  const [catalog, setCatalog] = useState(initialCatalog);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [tab, setTab] = useState<Tab>('menu');
  const [allergyOpen, setAllergyOpen] = useState(false);
  const [askedAllergies, setAskedAllergies] = useState(
    initialSnapshot.session.allergyProfile.length > 0,
  );

  const sessionId = snapshot.session.id;
  const canOrder = snapshot.session.status === 'OPEN';
  const isClosed = snapshot.session.status === 'CLOSED';

  const refresh = useCallback(async () => {
    const res = await guestApi.state(sessionId);
    if (res.ok) setSnapshot(res.data);
    return res;
  }, [sessionId]);

  // ── Menu freshness ────────────────────────────────────────
  // The snapshot carries the catalog version the server currently serves. If
  // an admin marks a dish sold out mid-meal, this pulls the new catalog rather
  // than letting the guest order something the kitchen no longer has.
  useEffect(() => {
    if (snapshot.menuVersion === catalog.version) return;
    let cancelled = false;
    guestApi.menu().then((res) => {
      if (!cancelled && res.ok) setCatalog(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [snapshot.menuVersion, catalog.version]);

  // ── Polling ───────────────────────────────────────────────
  const awaitingStaff =
    snapshot.payment?.status === 'PENDING_REVIEW' ||
    snapshot.orders.some((o) => o.status === 'NEW' || o.status === 'COOKING');

  useEffect(() => {
    if (isClosed && snapshot.payment?.status === 'APPROVED') return;
    const interval = awaitingStaff ? POLL_ACTIVE_MS : POLL_IDLE_MS;

    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      // Polling a backgrounded tab wastes the guest's battery and our function
      // invocations for information nobody is looking at.
      if (document.visibilityState === 'visible') await refresh();
      timer = setTimeout(tick, interval);
    };
    timer = setTimeout(tick, interval);

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [awaitingStaff, isClosed, refresh, snapshot.payment?.status]);

  // ── Geofence ──────────────────────────────────────────────
  const geoAsked = useRef(false);
  useEffect(() => {
    if (geoAsked.current || !canOrder) return;
    if (snapshot.session.geoStatus !== 'UNKNOWN') return;
    geoAsked.current = true;

    if (!('geolocation' in navigator)) {
      guestApi.denyGeo(sessionId).then(refresh);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        guestApi
          .reportGeo(sessionId, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 0,
          })
          .then(refresh);
      },
      () => {
        // Denied, unavailable or timed out — all the same to us. Recorded so
        // staff can see it; never a blocker.
        guestApi.denyGeo(sessionId).then(refresh);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300_000 },
    );
  }, [canOrder, refresh, sessionId, snapshot.session.geoStatus]);

  // ── First-run allergy prompt ──────────────────────────────
  useEffect(() => {
    if (askedAllergies || !canOrder) return;
    if (catalog.allergens.filter((a) => a.isActive).length === 0) return;
    const timer = setTimeout(() => setAllergyOpen(true), 500);
    return () => clearTimeout(timer);
  }, [askedAllergies, canOrder, catalog.allergens]);

  const cartCount = snapshot.cart.lines.reduce((n, l) => n + l.qty, 0);
  const activeOrders = snapshot.orders.filter(
    (o) => o.status === 'NEW' || o.status === 'COOKING',
  ).length;

  const allergenNames = useMemo(() => {
    const byId = new Map(catalog.allergens.map((a) => [a.id, a]));
    return snapshot.session.allergyProfile
      .map((id) => byId.get(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((a) => a.name[locale] || a.name.th);
  }, [catalog.allergens, snapshot.session.allergyProfile, locale]);

  const tabs: { id: Tab; icon: typeof UtensilsCrossed; label: string; badge?: number }[] = [
    { id: 'menu', icon: UtensilsCrossed, label: t('nav.menu') },
    { id: 'cart', icon: ShoppingBasket, label: t('nav.cart'), badge: cartCount },
    { id: 'orders', icon: ReceiptText, label: t('nav.orders'), badge: activeOrders },
    { id: 'bill', icon: CreditCard, label: t('nav.bill') },
  ];

  return (
    <div className="flex min-h-svh flex-col bg-[var(--surface)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface-raised)]/95 backdrop-blur safe-top">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight">
              {catalog.settings.shopName}
            </p>
            <p className="truncate text-xs muted">
              {snapshot.session.villa
                ? `${t('session.villa')} ${snapshot.session.villa}`
                : snapshot.session.tableLabel}
            </p>
          </div>

          <label className="relative">
            <span className="sr-only">{t('lang.label')}</span>
            <Globe className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 muted" />
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="h-9 appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] pl-7 pr-2 text-sm"
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {allergenNames.length > 0 && (
          <button
            type="button"
            onClick={() => canOrder && setAllergyOpen(true)}
            className="flex w-full items-center gap-2 border-t border-[var(--border)] bg-[var(--danger-soft)] px-4 py-1.5 text-left text-xs text-[var(--danger)]"
          >
            <TriangleAlert className="size-3.5 shrink-0" />
            <span className="truncate">
              {t('allergy.profileSummary', { list: allergenNames.join(', ') })}
            </span>
          </button>
        )}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-3">
        {isClosed && <ClosedBanner />}

        {snapshot.session.geoStatus === 'OUTSIDE' && (
          <Alert tone="warning" className="mb-3">
            <span className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              {t('geo.outside', {
                distance: formatDistance(snapshot.session.distanceM),
              })}
            </span>
          </Alert>
        )}

        {tab === 'menu' && (
          <MenuView
            catalog={catalog}
            snapshot={snapshot}
            canOrder={canOrder}
            onChanged={refresh}
            onOpenAllergy={() => setAllergyOpen(true)}
          />
        )}
        {tab === 'cart' && (
          <CartView
            catalog={catalog}
            snapshot={snapshot}
            canOrder={canOrder}
            onChanged={refresh}
            onOrdered={() => setTab('orders')}
            onBrowse={() => setTab('menu')}
          />
        )}
        {tab === 'orders' && (
          <OrdersView
            catalog={catalog}
            snapshot={snapshot}
            onBrowse={() => setTab('menu')}
            onBill={() => setTab('bill')}
            canOrder={canOrder}
          />
        )}
        {tab === 'bill' && (
          <BillView
            catalog={catalog}
            snapshot={snapshot}
            onChanged={refresh}
            onBrowse={() => setTab('menu')}
          />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface-raised)]/95 backdrop-blur safe-bottom">
        <div className="mx-auto flex w-full max-w-3xl">
          {tabs.map(({ id, icon: Icon, label, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                tab === id ? 'text-brand-600' : 'muted',
              )}
            >
              <span className="relative">
                <Icon className="size-5" />
                {Boolean(badge) && (
                  <span className="absolute -right-2.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold leading-4 text-white">
                    {badge}
                  </span>
                )}
              </span>
              {label}
            </button>
          ))}
        </div>
      </nav>

      <AllergyDialog
        open={allergyOpen}
        onOpenChange={(open) => {
          setAllergyOpen(open);
          if (!open) setAskedAllergies(true);
        }}
        catalog={catalog}
        sessionId={sessionId}
        current={snapshot.session.allergyProfile}
        guestName={snapshot.session.guestName}
        onSaved={refresh}
      />
    </div>
  );
}

function formatDistance(metres: number | null): string {
  if (metres === null) return '—';
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
}

export type { Tab };
