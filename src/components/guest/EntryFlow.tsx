'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Home, TriangleAlert, ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { LOCALE_LABELS } from '@/i18n/dict';
import { Button, Spinner, cn } from '@/components/ui';
import { ThemeToggle } from '@/components/theme';
import { LOCALES, type Locale, type MenuCatalog } from '@/lib/types';
import { NoticeContent } from './ServiceNotice';
import { useLiffIdToken } from './useLiffIdToken';

export interface EntryVilla {
  slug: string;
  label: string;
  villa: string;
}

type Step = 'notice' | 'villa';

/**
 * The way in, now that nobody scans anything.
 *
 * A guest taps one link in the villa's LINE Official Account and lands here.
 * The order of the two steps is the point: the villa's conditions are shown
 * before anything else, because they change what someone orders — delivery
 * windows, breakfast cut-offs, the minimum spend — and are wasted if they
 * appear after the basket is full. Only then is the guest asked which villa
 * they are in, which is what actually opens a session.
 *
 * Name, phone and allergies follow inside the app itself, on the session that
 * this screen creates.
 *
 * The LIFF id token is collected quietly in the background while the guest
 * reads. If it is not ready by the time they pick a villa — or they opened the
 * link in an ordinary browser — they still get in; they just will not receive
 * a LINE confirmation when staff confirm the order.
 */
export function EntryFlow({
  catalog,
  villas,
  liffId,
  defaultVilla,
}: {
  catalog: MenuCatalog;
  villas: EntryVilla[];
  liffId: string;
  defaultVilla?: string;
}) {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const idToken = useLiffIdToken(liffId);

  const showNotice =
    Boolean(catalog.settings.welcomeImage) ||
    Boolean(catalog.settings.serviceNotice.th.trim());

  const matchedVilla = villas.find((v) => v.slug === defaultVilla);
  const [step, setStep] = useState<Step>(showNotice ? 'notice' : 'villa');
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A double tap on a slow connection would otherwise fire two /api/enter
  // calls and two navigations.
  const entering = useRef(false);

  async function enter(slug: string) {
    if (entering.current) return;
    entering.current = true;
    setOpening(slug);
    setError(null);

    try {
      const res = await fetch('/api/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ villa: slug, idToken: idToken ?? undefined }),
        cache: 'no-store',
      });
      const data = (await res.json()) as { sessionId?: string; error?: string };

      if (!res.ok || !data.sessionId) {
        setError(data.error ?? t('entry.failed'));
        entering.current = false;
        setOpening(null);
        return;
      }

      router.replace(`/${slug}/${data.sessionId}`);
    } catch {
      setError(t('entry.offline'));
      entering.current = false;
      setOpening(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-[30rem] flex-col bg-[var(--surface)] shadow-[var(--shadow-lg)]">
      <header className="brand-gradient sticky top-0 z-30 text-white shadow-[var(--shadow-md)] safe-top">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-bold leading-tight tracking-tight">
              {catalog.settings.shopName}
            </p>
            <p className="truncate text-xs text-white/75">
              {step === 'notice' ? t('notice.title') : t('entry.chooseVilla')}
            </p>
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
      </header>

      <main className="flex-1 space-y-4 px-4 pb-8 pt-4">
        {showNotice && (
          <p className="text-xs font-semibold text-[var(--brand)]">
            {t('welcome.step', { n: step === 'notice' ? 1 : 2, total: 2 })}
          </p>
        )}

        {step === 'notice' ? (
          <>
            <div>
              <h1 className="text-lg font-bold">{t('notice.title')}</h1>
              <p className="text-sm muted">{t('entry.noticeIntro')}</p>
            </div>

            <NoticeContent
              catalog={catalog}
              image={
                catalog.settings.welcomeImage || catalog.settings.serviceNoticeImage
              }
              imageAlt={t('welcome.imageAlt')}
            />

            <Button
              full
              size="lg"
              loading={opening !== null}
              onClick={() => {
                if (matchedVilla) {
                  enter(matchedVilla.slug);
                } else {
                  setStep('villa');
                }
              }}
            >
              {t('notice.ack')}
            </Button>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-lg font-bold">{t('entry.chooseVilla')}</h1>
              <p className="text-sm muted">{t('entry.chooseVillaHint')}</p>
            </div>

            {villas.length === 0 ? (
              <p className="flex gap-2 rounded-xl bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)]">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {t('entry.noVillas')}
              </p>
            ) : (
              <ul className="space-y-2">
                {villas.map((villa) => {
                  const isPreselected = villa.slug === defaultVilla;
                  return (
                    <li key={villa.slug}>
                      <button
                        type="button"
                        onClick={() => enter(villa.slug)}
                        disabled={opening !== null}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-2xl border',
                          isPreselected
                            ? 'border-[var(--brand)] bg-[var(--brand-soft)]/20 shadow-sm'
                            : 'border-[var(--line)] bg-[var(--surface)]',
                          'px-4 py-3.5 text-left transition-colors',
                          'active:scale-[0.99] active:duration-75',
                          'hover:bg-[var(--surface-sunken)] disabled:opacity-60',
                        )}
                      >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-soft-text)]">
                        <Home className="size-4.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {villa.villa || villa.label}
                        </span>
                        {villa.villa && villa.label !== villa.villa && (
                          <span className="block truncate text-xs muted">
                            {villa.label}
                          </span>
                        )}
                      </span>
                      {opening === villa.slug ? (
                        <Spinner className="size-5 shrink-0" />
                      ) : (
                        <ChevronRight className="size-5 shrink-0 muted" />
                      )}
                    </button>
                  </li>
                    );
                  })}
                </ul>
            )}

            {showNotice && (
              <Button variant="secondary" full onClick={() => setStep('notice')}>
                {t('common.back')}
              </Button>
            )}
          </>
        )}

        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
