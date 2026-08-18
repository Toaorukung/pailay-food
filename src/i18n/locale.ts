import { DEFAULT_LOCALE, type Locale } from '@/lib/types';

/**
 * Locale plumbing shared by both sides of the client boundary.
 *
 * Kept out of provider.tsx deliberately: that file is `'use client'`, and the
 * QR entry route and the session page both need to read the cookie on the
 * server. Importing a client module from server code builds fine in dev and
 * throws at runtime in production.
 */

export const LOCALE_COOKIE = 'pf_locale';

export function parseLocale(raw: string | undefined): Locale {
  return raw === 'en' || raw === 'zh' || raw === 'th' ? raw : DEFAULT_LOCALE;
}
