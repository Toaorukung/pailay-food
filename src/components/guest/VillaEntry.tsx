'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, TriangleAlert } from 'lucide-react';
import { Spinner } from '@/components/ui';

/**
 * The moment after a scan.
 *
 * The villa link points at a QR code, not at a session, so something has to
 * exchange one for the other and set the session cookie — which only a Route
 * Handler can do. This component makes that single call and then replaces the
 * URL with the session, so the guest ends up on `/<villa>/<session>` with no
 * entry step left in their history to go back to.
 *
 * Guarded against React's development double-effect and against a stray second
 * render: firing `/api/enter` twice is harmless (it joins the same session),
 * but two navigations are not.
 */
export function VillaEntry({ villa, code }: { villa: string; code: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const res = await fetch('/api/enter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ villa, code }),
          cache: 'no-store',
        });
        const data = (await res.json()) as {
          ok?: boolean;
          sessionId?: string;
          error?: string;
        };

        if (!res.ok || !data.sessionId) {
          setError(data.error ?? 'เปิดหน้าสั่งอาหารไม่สำเร็จ');
          return;
        }

        router.replace(`/${villa}/${data.sessionId}`);
      } catch {
        setError('เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
      }
    })();
  }, [villa, code, router]);

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="card w-full max-w-sm space-y-4 p-8 text-center">
        {error ? (
          <>
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
              <TriangleAlert className="size-7" />
            </div>
            <h1 className="text-lg font-bold">เปิดหน้าสั่งอาหารไม่สำเร็จ</h1>
            <p className="text-sm muted">{error}</p>
            <p className="text-sm muted">
              กรุณาสแกน QR Code ที่ติดอยู่ในวิลล่าอีกครั้ง
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-soft-text)]">
              <QrCode className="size-7" />
            </div>
            <h1 className="text-lg font-bold">กำลังเปิดเมนู…</h1>
            <p className="flex items-center justify-center gap-2 text-sm muted">
              <Spinner className="size-4" />
              Opening the menu · 正在打开菜单
            </p>
          </>
        )}
      </div>
    </main>
  );
}
