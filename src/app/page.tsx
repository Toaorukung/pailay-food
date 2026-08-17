import { QrCode } from 'lucide-react';

/**
 * The bare root URL is not a way in. Guests always arrive through a villa QR
 * link, and staff go to /admin, so this page exists only to explain that to
 * someone who typed the domain by hand.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="card w-full max-w-sm space-y-4 p-8 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900 dark:text-brand-100">
          <QrCode className="size-8" />
        </div>
        <h1 className="text-xl font-semibold">Pailay Food</h1>
        <p className="text-sm muted">
          กรุณาสแกน QR Code ที่ติดอยู่ในวิลล่าของคุณเพื่อเริ่มสั่งอาหาร
        </p>
        <p className="text-sm muted">
          Please scan the QR code in your villa to start ordering.
        </p>
        <p className="text-sm muted">请扫描别墅内的二维码开始点餐。</p>
      </div>
    </main>
  );
}
