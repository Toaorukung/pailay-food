import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { currentAdmin } from '@/lib/admin/auth';
import { hasRole } from '@/lib/types';
import { getTables } from '@/lib/tables';
import { villaUrl } from '@/lib/villa-link';
import { loadSettingsMap } from '@/lib/sheets/repo';
import { PrintButton } from '@/components/admin/PrintButton';

export const dynamic = 'force-dynamic';

/**
 * Printable QR sheet — one card per villa, sized for A4 at three per row.
 *
 * Deliberately its own page outside the admin shell: printing a page wrapped
 * in a sidebar and a sticky header produces a mess, and print stylesheets that
 * try to undo an app layout are worse than not having the layout.
 */
export default async function QrPrintPage() {
  const admin = await currentAdmin();
  if (!admin) redirect('/admin/login');
  if (!hasRole(admin.role, 'MANAGER')) redirect('/admin');

  const [tables, settings] = await Promise.all([getTables(), loadSettingsMap()]);
  const active = tables.filter((t) => t.isActive);

  const cards = await Promise.all(
    active.map(async (table) => {
      const url = villaUrl(table);
      return {
        table,
        url,
        // Error correction H so a sticker survives a scratch or a splash of
        // pool water and still scans.
        dataUrl: await QRCode.toDataURL(url, {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 640,
        }),
      };
    }),
  );

  return (
    <main className="mx-auto max-w-[210mm] p-6 print:p-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          .qr-card { break-inside: avoid; }
          body { background: #fff; }
        }
      `}</style>

      <header className="no-print mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">QR Code ทุกวิลล่า</h1>
          <p className="text-sm muted">
            {cards.length} วิลล่า · พิมพ์แล้วตัดตามเส้น ติดในห้องที่แขกเห็นง่าย
          </p>
        </div>
        <PrintButton />
      </header>

      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center muted">
          ยังไม่มีวิลล่าที่เปิดใช้งาน
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {cards.map(({ table, dataUrl, url }) => (
            <article
              key={table.id}
              className="qr-card flex flex-col items-center gap-2 rounded-2xl border border-dashed border-black/30 bg-white p-4 text-center text-black"
            >
              <p className="text-sm font-semibold">{settings.shop_name}</p>
              <p className="text-lg font-bold leading-tight">
                {table.villa || table.label}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dataUrl} alt={`QR ${table.label}`} className="w-full" />
              <p className="text-[11px] leading-tight">
                สแกนเพื่อสั่งอาหาร
                <br />
                Scan to order · 扫码点餐
              </p>
              <p className="break-all text-[8px] text-black/50">{url}</p>
            </article>
          ))}
        </div>
      )}

      <p className="no-print mt-6 rounded-xl bg-[var(--warning-soft)] p-3 text-xs text-[var(--warning)]">
        คำเตือน: ลิงก์เหล่านี้เซ็นด้วย TABLE_SECRET — หากเปลี่ยนค่านั้นในภายหลัง
        QR ที่พิมพ์ไปแล้วทั้งหมดจะใช้ไม่ได้ และต้องพิมพ์ใหม่ทุกใบ
      </p>
    </main>
  );
}
