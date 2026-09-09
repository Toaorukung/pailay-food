'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Home, TriangleAlert, ChevronRight, Phone } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { LOCALE_LABELS } from '@/i18n/dict';
import { Button, Spinner, Input, Field, cn } from '@/components/ui';
import { ThemeToggle } from '@/components/theme';
import { LOCALES, type Locale, type MenuCatalog } from '@/lib/types';
import { NoticeContent } from './ServiceNotice';
import { useLiffIdToken } from './useLiffIdToken';

export interface EntryVilla {
  slug: string;
  label: string;
  villa: string;
}

type Step = 'notice' | 'villa' | 'login';

/**
 * The way in, now that nobody scans anything.
 *
 * A guest taps one link in the villa's LINE Official Account and lands here.
 * The order of the steps:
 * 1. Conditions/notice (if enabled) are shown before anything else.
 * 2. Villa selection (if not already preselected by link).
 * 3. Guest login using their booking phone number.
 *
 * Sessions are ONLY created after successful verification against the
 * resort's master Google Sheet (บันทึกการจอง).
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

  // welcomeEnabled is the villa's answer; the content check is what keeps an
  // empty step from being rendered by a villa that switched it on and has not
  // filled anything in yet. The fallback artwork counts, since that is what the
  // notice below actually falls back to.
  const showNotice =
    Boolean(catalog?.settings?.welcomeEnabled) &&
    (Boolean(catalog?.settings?.welcomeImage) ||
      Boolean(catalog?.settings?.serviceNoticeImage) ||
      Boolean(catalog?.settings?.serviceNotice?.th?.trim()));

  const matchedVilla = villas.find((v) => v.slug === defaultVilla);
  const [selectedVilla, setSelectedVilla] = useState<EntryVilla | null>(matchedVilla ?? null);
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<Step>(
    showNotice ? 'notice' : matchedVilla ? 'login' : 'villa',
  );
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A double tap on a slow connection would otherwise fire two /api/enter
  // calls and two navigations.
  const entering = useRef(false);

  useEffect(() => {
    if (step === 'login' && !selectedVilla) {
      setStep('villa');
    }
  }, [step, selectedVilla]);

  async function enter(slug: string, guestPhone: string) {
    if (entering.current) return;
    const digits = guestPhone.replace(/\D/g, '');
    if (digits.length < 8) {
      setError(t('guest.phoneInvalid'));
      return;
    }
    entering.current = true;
    setOpening(slug);
    setError(null);

    try {
      const res = await fetch('/api/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          villa: slug,
          phone: guestPhone.trim(),
          idToken: idToken ?? undefined,
        }),
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
              {step === 'notice'
                ? t('notice.title')
                : step === 'login'
                ? t('guest.loginTitle')
                : t('entry.chooseVilla')}
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
            {t('welcome.step', {
              n: step === 'notice' ? 1 : step === 'villa' ? 2 : matchedVilla ? 2 : 3,
              total: matchedVilla ? 2 : 3,
            })}
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
                  setSelectedVilla(matchedVilla);
                  setStep('login');
                } else {
                  setStep('villa');
                }
              }}
            >
              {t('notice.ack')}
            </Button>
          </>
        ) : step === 'villa' ? (
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
                  const isPreselected =
                    villa.slug === defaultVilla || villa.slug === selectedVilla?.slug;
                  return (
                    <li key={villa.slug}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedVilla(villa);
                          setError(null);
                          setStep('login');
                        }}
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
                        <ChevronRight className="size-5 shrink-0 muted" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {showNotice && (
              <Button
                variant="secondary"
                full
                onClick={() => {
                  setError(null);
                  setStep('notice');
                }}
              >
                {t('common.back')}
              </Button>
            )}
          </>
        ) : (
          /* step === 'login' */
          selectedVilla && (
            <div className="space-y-4">
              <div>
                <h1 className="text-lg font-bold">{t('guest.loginTitle')}</h1>
                <p className="text-sm muted">{t('guest.loginIntro')}</p>
              </div>

              {/* Selected Villa Badge */}
              <div className="flex items-center justify-between rounded-2xl border border-[var(--brand)] bg-[var(--brand-soft)]/20 p-3.5 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-soft-text)]">
                    <Home className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--brand-soft-text)]">
                      {t('entry.selectedVilla')}
                    </p>
                    <p className="truncate font-bold text-[var(--text)]">
                      {selectedVilla.villa || selectedVilla.label}
                    </p>
                    {selectedVilla.villa &&
                      selectedVilla.label !== selectedVilla.villa && (
                        <p className="truncate text-xs muted">
                          {selectedVilla.label}
                        </p>
                      )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep('villa');
                  }}
                  disabled={opening !== null}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]/40 transition-colors"
                >
                  {t('entry.changeVilla')}
                </button>
              </div>

              {/* Phone Login Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  enter(selectedVilla.slug, phone);
                }}
                className="space-y-4"
              >
                <Field
                  label={t('guest.phone')}
                  hint={t('guest.phoneRequired')}
                >
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[var(--text-subtle)]" />
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      autoFocus
                      required
                      disabled={opening !== null}
                      placeholder={t('guest.phonePlaceholder')}
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (error) setError(null);
                      }}
                      className="pl-10 text-base font-medium tracking-wide"
                    />
                  </div>
                </Field>

                {error && (
                  <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  full
                  size="lg"
                  loading={opening !== null}
                  disabled={phone.replace(/\D/g, '').length < 8}
                >
                  {t('entry.loginBtn')}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  full
                  disabled={opening !== null}
                  onClick={() => {
                    setError(null);
                    setStep('villa');
                  }}
                >
                  {t('entry.changeVilla')}
                </Button>
              </form>
            </div>
          )
        )}

        {step !== 'login' && error && (
          <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
