import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/admin/auth';
import { googleConfigured } from '@/lib/admin/google';
import { LoginForm } from '@/components/admin/LoginForm';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  google_not_configured: 'ยังไม่ได้ตั้งค่า Google OAuth (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET)',
  google_denied: 'ยกเลิกการเข้าสู่ระบบด้วย Google',
  google_no_code: 'Google ไม่ได้ส่งรหัสยืนยันกลับมา',
  google_state: 'การยืนยันความปลอดภัยไม่ผ่าน กรุณาลองใหม่',
  google_exchange: 'แลกเปลี่ยนรหัสกับ Google ไม่สำเร็จ',
  not_allowed: 'บัญชี Google นี้ไม่มีสิทธิ์เข้าใช้งาน กรุณาติดต่อเจ้าของร้าน',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  // Already signed in — skip the form.
  if (await currentAdmin()) redirect(next && next.startsWith('/admin') ? next : '/admin');

  return (
    <main className="flex min-h-svh items-center justify-center bg-[var(--surface-sunken)] p-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Pailay Admin</h1>
          <p className="text-sm muted">ระบบจัดการร้านอาหาร</p>
        </div>

        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
            {ERRORS[error] ?? 'เข้าสู่ระบบไม่สำเร็จ'}
          </p>
        )}

        <LoginForm
          googleEnabled={googleConfigured()}
          next={next && next.startsWith('/admin') ? next : '/admin'}
        />
      </div>
    </main>
  );
}
