'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { translate, type StringKey } from './dict';
import { LOCALE_COOKIE } from './locale';
import { DEFAULT_LOCALE, type Locale, type Localized } from '@/lib/types';

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  /** Picks the right language out of a Sheet-sourced localized field. */
  L: (value: Localized | undefined) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    // A plain cookie, so the next server render already knows the choice —
    // no round trip, no flash of the wrong language.
    document.cookie = `pf_locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      L: (v) => (v ? v[locale] || v.th || v.en || v.zh || '' : ''),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Rendering outside the provider is a wiring bug, not a runtime condition
    // to paper over — a silent English fallback would hide it until a guest saw it.
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return ctx;
}

// Re-exported for client components that already import them from here.
export { LOCALE_COOKIE, parseLocale } from './locale';
