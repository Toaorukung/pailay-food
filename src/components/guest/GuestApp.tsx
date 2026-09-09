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
  ChevronRight,
} from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { LOCALE_LABELS } from '@/i18n/dict';
import { cn, Alert } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { ThemeToggle } from '@/components/theme';
import { LOCALES, type MenuCatalog, type Locale } from '@/lib/types';
import type { SessionSnapshot } from '@/lib/snapshot';
import { guestApi } from './api';
import { MenuView } from './MenuView';
import { CartView } from './CartView';
import { OrdersView } from './OrdersView';
import { BillView } from './BillView';
import { AllergyDialog } from './AllergyDialog';
import { WelcomeFlow, type WelcomeStep } from './WelcomeFlow';
import { ClosedBanner } from './ClosedBanner';

type Tab = 'menu' | 'cart' | 'orders' | 'bill';

/**
 * What a guest is walked through the first time they reach the menu: who they
 * are, then what they cannot eat. The villa's conditions and the choice of
 * villa happened earlier, on /order.
 */
type FlowStep = WelcomeStep | 'allergy';

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
  const [flowStep, setFlowStep] = useState<FlowStep | null>(null);

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
  // Poll faster while something is actually moving: a slip being checked, a
  // price being set, or food being cooked.
  const awaitingStaff = snapshot.orders.some(
    (o) =>
      o.status === 'PENDING_CONFIRM' ||
      o.status === 'NEW' ||
      o.status === 'COOKING',
  );

  useEffect(() => {
    // A closed session is a static record; nothing will change again.
    if (isClosed) return;
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
  }, [awaitingStaff, isClosed, refresh]);

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

  // ── First-run flow ────────────────────────────────────────
  // Steps the villa has nothing to show for are dropped rather than rendered
  // empty, so the step counter always matches what the guest actually sees.
  const flowSteps = useMemo<FlowStep[]>(() => {
    // The villa's conditions are no longer one of these. They are the first
    // thing on /order, before the guest has even picked a villa, so repeating
    // them here would be the same poster twice in thirty seconds.
    const steps: FlowStep[] = ['details'];
    if ((catalog?.allergens ?? []).some((a) => a.isActive)) steps.push('allergy');
    return steps;
  }, [catalog?.allergens]);

  // The phone number is what marks a session as introduced: it is the one
  // answer the flow insists on, so a session holding one has been through it.
  const introduced = Boolean(snapshot?.session?.guestPhone);
  const flowStarted = useRef(false);

  useEffect(() => {
    if (flowStarted.current || !canOrder || introduced) return;
    flowStarted.current = true;
    // A beat after the menu paints, so the guest sees what they scanned into
    // rather than a dialog over a blank screen.
    const timer = setTimeout(() => setFlowStep(flowSteps[0] ?? null), 500);
    return () => clearTimeout(timer);
  }, [canOrder, introduced, flowSteps]);

  const inAllergyStep = flowStep === 'allergy';
  const stepNumber = flowStep ? flowSteps.indexOf(flowStep) + 1 : 1;

  const cartCount = snapshot?.cart?.lines?.reduce((n, l) => n + l.qty, 0) ?? 0;
  const activeOrders = (snapshot?.orders ?? []).filter(
    (o) =>
      o.status === 'PENDING_CONFIRM' ||
      o.status === 'NEW' ||
      o.status === 'COOKING',
  ).length;

  const allergenNames = useMemo(() => {
    const byId = new Map((catalog?.allergens ?? []).map((a) => [a.id, a]));
    return (snapshot?.session?.allergyProfile ?? [])
      .map((id) => byId.get(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((a) => a.name[locale] || a.name.th);
  }, [catalog?.allergens, snapshot?.session?.allergyProfile, locale]);

  const tabs: { id: Tab; icon: typeof UtensilsCrossed; label: string; badge?: number }[] = [
    { id: 'menu', icon: UtensilsCrossed, label: t('nav.menu') },
    { id: 'cart', icon: ShoppingBasket, label: t('nav.cart'), badge: cartCount },
    { id: 'orders', icon: ReceiptText, label: t('nav.orders'), badge: activeOrders },
    { id: 'bill', icon: CreditCard, label: t('nav.bill') },
  ];

  return (
    <div className="mx-auto flex min-h-svh max-w-[30rem] flex-col bg-[var(--surface)] shadow-[var(--shadow-lg)] sm:min-h-svh">
      <header className="brand-gradient sticky top-0 z-30 text-white shadow-[var(--shadow-md)] safe-top">
        <div className="mx-auto flex w-full max-w-[30rem] items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-bold leading-tight tracking-tight">
              {catalog.settings.shopName}
            </p>
            <button
              type="button"
              onClick={() => canOrder && setFlowStep('details')}
              className="flex max-w-full items-center gap-1 truncate text-xs text-white/80 transition-opacity hover:opacity-100 text-left"
              title={t('guest.changePhone')}
            >
              <span className="truncate">
                {snapshot.session.guestName
                  ? `${snapshot.session.guestName} · `
                  : ''}
                {snapshot.session.villa
                  ? `${t('session.villa')} ${snapshot.session.villa}`
                  : snapshot.session.tableLabel}
              </span>
            </button>
          </div>

          <ThemeToggle tone="onBrand" />

          <label className="relative">
            <span className="sr-only">{t('lang.label')}</span>
            <Globe className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-white/80" />
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="h-9 appearance-none rounded-lg border border-white/25 bg-white/15 pl-8 pr-2.5 text-sm font-medium text-white backdrop-blur [&>option]:text-[var(--text)]"
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
            className="flex w-full items-center gap-2 bg-[var(--danger)] px-4 py-2 text-left text-xs font-semibold text-white"
          >
            <TriangleAlert className="size-3.5 shrink-0" />
            <span className="truncate">
              {t('allergy.profileSummary', { list: allergenNames.join(', ') })}
            </span>
          </button>
        )}
      </header>

      <main className="mx-auto w-full max-w-[30rem] flex-1 px-4 pb-28 pt-3">
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
            canOrder={canOrder}
            onBrowse={() => setTab('menu')}
          />
        )}
        {tab === 'bill' && (
          <BillView
            catalog={catalog}
            snapshot={snapshot}
            onBrowse={() => setTab('menu')}
          />
        )}
      </main>

      {cartCount > 0 && tab === 'menu' && canOrder && (
        <div className="pointer-events-none fixed bottom-[4.4rem] left-1/2 z-30 w-full max-w-[30rem] -translate-x-1/2 px-4 pb-1">
          <button
            type="button"
            onClick={() => setTab('cart')}
            className={cn(
              'pointer-events-auto mx-auto flex w-full max-w-[30rem] items-center gap-3',
              'rounded-2xl bg-[var(--brand)] px-4 py-3.5 text-white',
              'shadow-[var(--shadow-brand)] transition-transform',
              'active:scale-[0.985] active:duration-75 animate-rise',
            )}
          >
            <ShoppingBasket className="size-5 shrink-0" />
            <span className="rounded-lg bg-white/25 px-2 py-0.5 text-sm font-bold tabular">
              {cartCount}
            </span>
            <span className="text-sm font-semibold">{t('nav.cart')}</span>
            <span className="ml-auto text-base font-bold tabular">
              {formatMoney(snapshot.cartTotals.total, catalog.settings.currency)}
            </span>
            <ChevronRight className="size-5 shrink-0" />
          </button>
        </div>
      )}

      <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-[30rem] -translate-x-1/2 border-t border-[var(--line)] glass safe-bottom">
        <div className="mx-auto flex w-full max-w-[30rem]">
          {tabs.map(({ id, icon: Icon, label, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-1 py-2.5',
                'text-[11px] font-semibold transition-colors',
                'active:scale-95 active:duration-75',
                tab === id ? 'text-[var(--brand)]' : 'text-[var(--text-subtle)]',
              )}
            >
              {tab === id && (
                <span
                  aria-hidden
                  className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-[var(--brand)]"
                />
              )}
              <span className="relative">
                <Icon className="size-[1.35rem]" />
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

      <WelcomeFlow
        step={inAllergyStep ? null : flowStep}
        onStepChange={setFlowStep}
        onDetailsSaved={() =>
          setFlowStep(flowSteps.includes('allergy') ? 'allergy' : null)
        }
        sessionId={sessionId}
        guestName={snapshot?.session?.guestName ?? ''}
        guestPhone={snapshot?.session?.guestPhone ?? ''}
        fields={catalog?.guestFields ?? []}
        guestExtra={snapshot?.session?.guestExtra ?? []}
        onSaved={refresh}
        stepNumber={stepNumber}
        totalSteps={flowSteps.length}
      />

      <AllergyDialog
        open={allergyOpen || inAllergyStep}
        onOpenChange={(open) => {
          setAllergyOpen(open);
          if (!open && inAllergyStep) setFlowStep(null);
        }}
        catalog={catalog}
        sessionId={sessionId}
        current={snapshot?.session?.allergyProfile ?? []}
        guestName={snapshot?.session?.guestName ?? ''}
        guestPhone={snapshot?.session?.guestPhone ?? ''}
        onSaved={refresh}
        showIdentity={!inAllergyStep}
        stepLabel={
          inAllergyStep
            ? t('welcome.step', { n: stepNumber, total: flowSteps.length })
            : undefined
        }
      />
    </div>
  );
}

function formatDistance(metres: number | null): string {
  if (metres === null) return '—';
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
}

export type { Tab };
