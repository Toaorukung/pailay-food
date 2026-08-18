import { Skeleton } from '@/components/ui';

/**
 * Shown the instant an admin link is clicked.
 *
 * Every admin page is `force-dynamic`, so Next.js cannot prefetch its HTML —
 * without this boundary a click sits on the old screen for the whole server
 * round trip and the app feels stuck. With it, the sidebar stays put, this
 * skeleton appears immediately, and the real content swaps in when it lands.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="กำลังโหลด">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[var(--radius-card)]" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-[var(--radius-card)]" />
        <Skeleton className="h-64 rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}
