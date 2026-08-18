import Link from 'next/link';
import { QrCode, ChefHat, ExternalLink, TriangleAlert } from 'lucide-react';
import { getTables } from '@/lib/tables';
import { villaUrl } from '@/lib/villa-link';
import { serviceStatus } from '@/lib/demo';

export const dynamic = 'force-dynamic';

/**
 * The bare root URL is not how guests arrive — they scan a sticker in the
 * villa. In a fully configured deployment this page says so and nothing more.
 *
 * When services are missing the app is being run to try it out, and "please
 * scan a QR code" is a dead end on a laptop. So the same page also lists the
 * villa entry links, which is exactly what the printed codes encode.
 */
export default async function HomePage() {
  const status = serviceStatus();
  const showEntryLinks = !status.sheets || process.env.NODE_ENV !== 'production';

  const tables = showEntryLinks
    ? (await getTables().catch(() => [])).filter((t) => t.isActive)
    : [];

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 p-6">
      <div className="card space-y-4 p-8 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-soft-text)]">
          <QrCode className="size-8" />
        </div>
        <h1 className="text-xl font-semibold">ไปเล วิลล่า</h1>
        <p className="text-sm muted">
          กรุณาสแกน QR Code ที่ติดอยู่ในวิลล่าของคุณเพื่อเริ่มสั่งอาหาร
        </p>
        <p className="text-sm muted">
          Please scan the QR code in your villa to start ordering.
        </p>
        <p className="text-sm muted">请扫描别墅内的二维码开始点餐。</p>
      </div>

      {showEntryLinks && (
        <div className="card space-y-3 p-5">
          <div>
            <p className="font-semibold">เปิดหน้าสั่งอาหาร (สำหรับทดลองใช้)</p>
            <p className="text-xs muted">
              ลิงก์เหล่านี้คือสิ่งเดียวกับที่อยู่ใน QR Code ของแต่ละวิลล่า
            </p>
          </div>

          <ul className="grid gap-2 sm:grid-cols-2">
            {tables.map((table) => (
              <li key={table.id}>
                <a
                  href={villaUrl(table)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  {table.label}
                  <ExternalLink className="size-3.5 shrink-0 muted" />
                </a>
              </li>
            ))}
          </ul>

          <Link
            href="/admin"
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <ChefHat className="size-4" />
            เข้าหน้าจัดการร้าน
          </Link>

          {!status.durable && (
            <p className="flex gap-2 rounded-xl bg-[var(--warning-soft)] p-3 text-xs text-[var(--warning)]">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                ยังไม่ได้ตั้งค่าฐานข้อมูล — ออเดอร์เก็บในหน่วยความจำของเซิร์ฟเวอร์
                และจะหายเมื่อรีสตาร์ต ใช้ทดลองได้ แต่ยังไม่ควรใช้รับลูกค้าจริง
              </span>
            </p>
          )}
        </div>
      )}
    </main>
  );
}
