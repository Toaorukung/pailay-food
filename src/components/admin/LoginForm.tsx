'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';

/**
 * Both sign-in methods on one screen: Google for owners and managers whose
 * accounts already carry 2FA, and a username/password for kitchen staff who
 * have no company Google account.
 */
export function LoginForm({
  googleEnabled,
  next,
}: {
  googleEnabled: boolean;
  next: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };

    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? 'เข้าสู่ระบบไม่สำเร็จ');
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="card space-y-4 p-6">
      {googleEnabled && (
        <>
          <a
            href="/api/admin/auth/google/start"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] text-[15px] font-medium hover:bg-[var(--surface-sunken)]"
          >
            <GoogleMark />
            เข้าสู่ระบบด้วย Google
          </a>
          <div className="flex items-center gap-3 text-xs muted">
            <span className="h-px flex-1 bg-[var(--border)]" />
            หรือ
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="space-y-3">
        <Field label="ชื่อผู้ใช้ หรือ อีเมล">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
        </Field>
        <Field label="รหัสผ่าน">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        <Button type="submit" full size="lg" loading={busy}>
          <LogIn className="size-4" />
          เข้าสู่ระบบ
        </Button>
      </form>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}
