import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ReceiptText, Lock } from 'lucide-react';
import { pageSessionState } from '@/lib/session';
import { getTables } from '@/lib/tables';
import { getCatalog } from '@/lib/menu-cache';
import { buildSnapshot } from '@/lib/snapshot';
import { I18nProvider } from '@/i18n/provider';
import { parseLocale, LOCALE_COOKIE } from '@/i18n/locale';
import { translate } from '@/i18n/dict';
import { GuestApp } from '@/components/guest/GuestApp';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The ordering screen: `/<villa>/<sessionId>`.
 *
 * Sessions are minted on /order, once the guest has read the conditions and
 * said which villa they are in, and this is where they land afterwards.
 *
 * The villa segment is not decoration. A session is only served under the slug
 * of the villa it belongs to, so `/villa-2/<a-villa-1-session>` is a 404 rather
 * than one villa's bill displayed under another villa's name.
 *
 * A CLOSED session still renders — read-only — so the guest keeps the record
 * of everything they ordered after staff end the stay.
 */
export default async function VillaPage({
  params,
}: {
  params: Promise<{ villa: string; code: string }>;
}) {
  const { villa, code } = await params;
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);

  const tables = await getTables().catch(() => []);
  const table = tables.find((t) => t.slug === villa);

  // Unknown villa: nothing here is worth distinguishing for a stranger.
  if (!table) notFound();

  const { session, isOwner } = await pageSessionState(code);

  if (!session) {
    return (
      <Notice
        locale={locale}
        icon={<ReceiptText className="size-7" />}
        titleKey="session.invalidTitle"
        bodyKey="session.invalidBody"
      />
    );
  }

  // The session exists but belongs to a different villa. Treating this as
  // "not found" rather than redirecting is deliberate: a link that quietly
  // moves you to another villa's bill is worse than a link that fails.
  if (session.tableId !== table.id) notFound();

  if (!isOwner) {
    return (
      <Notice
        locale={locale}
        icon={<Lock className="size-7" />}
        titleKey="session.notYoursTitle"
        bodyKey="session.notYoursBody"
      />
    );
  }

  const [catalog, snapshot] = await Promise.all([
    getCatalog(),
    buildSnapshot(session),
  ]);

  return (
    <I18nProvider initialLocale={locale}>
      <GuestApp catalog={catalog} initialSnapshot={snapshot} />
    </I18nProvider>
  );
}

function Notice({
  locale,
  icon,
  titleKey,
  bodyKey,
}: {
  locale: Locale;
  icon: React.ReactNode;
  titleKey: Parameters<typeof translate>[1];
  bodyKey: Parameters<typeof translate>[1];
}) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="card w-full max-w-sm space-y-4 p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] muted">
          {icon}
        </div>
        <h1 className="text-lg font-bold">{translate(locale, titleKey)}</h1>
        <p className="text-sm muted">{translate(locale, bodyKey)}</p>
      </div>
    </main>
  );
}
