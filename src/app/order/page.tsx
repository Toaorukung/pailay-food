import { cookies } from 'next/headers';
import { getTables } from '@/lib/tables';
import { getCatalog } from '@/lib/menu-cache';
import { env } from '@/lib/env';
import { I18nProvider } from '@/i18n/provider';
import { parseLocale, LOCALE_COOKIE } from '@/i18n/locale';
import { EntryFlow, type EntryVilla } from '@/components/guest/EntryFlow';

export const dynamic = 'force-dynamic';

/**
 * The one link that goes in the LINE Official Account.
 *
 * It is also the LIFF app's endpoint URL, which is why it is a fixed path with
 * nothing in it: a LIFF endpoint is registered once in the LINE console, and a
 * villa-specific address would mean registering one per villa. The guest tells
 * us which villa they are in on the screen instead.
 */
export default async function OrderEntryPage({
  searchParams,
}: {
  searchParams?: Promise<{ villa?: string }>;
}) {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const params = searchParams ? await searchParams : {};

  const [catalog, tables] = await Promise.all([getCatalog(), getTables().catch(() => [])]);

  const villas: EntryVilla[] = tables
    .filter((t) => t.isActive && t.slug)
    .map((t) => ({ slug: t.slug, label: t.label, villa: t.villa }))
    .sort((a, b) => (a.villa || a.label).localeCompare(b.villa || b.label, 'th'));

  return (
    <I18nProvider initialLocale={locale}>
      <EntryFlow
        catalog={catalog}
        villas={villas}
        liffId={env.liffId}
        defaultVilla={params.villa}
      />
    </I18nProvider>
  );
}
