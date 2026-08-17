import { cookies } from 'next/headers';
import { QrCode, Lock } from 'lucide-react';
import { pageSessionState } from '@/lib/session';
import { getCatalog } from '@/lib/menu-cache';
import { buildSnapshot } from '@/lib/snapshot';
import { I18nProvider, parseLocale, LOCALE_COOKIE } from '@/i18n/provider';
import { translate } from '@/i18n/dict';
import { GuestApp } from '@/components/guest/GuestApp';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The ordering page.
 *
 * Three outcomes: the session does not exist, the visitor is not the device
 * that scanned the QR, or we render the app. A CLOSED session still renders
 * the app — read-only — so the guest keeps their receipt after paying.
 */
export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);

  const { session, isOwner } = await pageSessionState(sessionId);

  if (!session) {
    return (
      <Notice
        locale={locale}
        icon={<QrCode className="size-8" />}
        titleKey="session.invalidTitle"
        bodyKey="session.invalidBody"
      />
    );
  }

  if (!isOwner) {
    // The link was forwarded, or opened in a browser that never scanned the
    // sticker. Reading someone else's bill is not allowed either.
    return (
      <Notice
        locale={locale}
        icon={<Lock className="size-8" />}
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
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] muted">
          {icon}
        </div>
        <h1 className="text-xl font-semibold">{translate(locale, titleKey)}</h1>
        <p className="text-sm muted">{translate(locale, bodyKey)}</p>
      </div>
    </main>
  );
}
