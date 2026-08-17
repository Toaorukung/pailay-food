import { QrCode, AlertTriangle } from 'lucide-react';

const REASONS: Record<string, { th: string; en: string; zh: string }> = {
  table: {
    th: 'วิลล่านี้ยังไม่เปิดใช้งานระบบสั่งอาหาร กรุณาติดต่อพนักงาน',
    en: 'Ordering is not enabled for this villa yet. Please contact staff.',
    zh: '此别墅尚未开通点餐服务，请联系工作人员。',
  },
  busy: {
    th: 'มีการเข้าใช้งานถี่เกินไป กรุณารอสักครู่แล้วสแกนใหม่',
    en: 'Too many attempts. Please wait a moment and scan again.',
    zh: '尝试过于频繁，请稍候再扫描。',
  },
};

export default async function InvalidPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = reason ? REASONS[reason] : undefined;

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="card w-full max-w-sm space-y-4 p-8 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[var(--warning-soft)] text-[var(--warning)]">
          {message ? (
            <AlertTriangle className="size-8" />
          ) : (
            <QrCode className="size-8" />
          )}
        </div>
        <h1 className="text-xl font-semibold">
          ลิงก์ไม่ถูกต้อง / Invalid link / 链接无效
        </h1>
        <div className="space-y-2 text-sm muted">
          <p>{message?.th ?? 'กรุณาสแกน QR Code ที่ติดอยู่ในวิลล่าของคุณ'}</p>
          <p>
            {message?.en ?? 'Please scan the QR code displayed in your villa.'}
          </p>
          <p>{message?.zh ?? '请扫描您别墅内张贴的二维码。'}</p>
        </div>
      </div>
    </main>
  );
}
