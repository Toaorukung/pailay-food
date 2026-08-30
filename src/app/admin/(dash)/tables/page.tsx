'use client';

import { Info } from 'lucide-react';
import { ContentManager, type FieldDef } from '@/components/admin/ContentManager';
import { CopyButton } from '@/components/admin/CopyButton';
import { PinCapture } from '@/components/admin/PinCapture';
import { pinUncertaintyM } from '@/lib/geo';
import { Button, Card } from '@/components/ui';

/**
 * The address printed on the sticker. Shown as a path and copied as an
 * absolute URL: `origin` does not exist while the server renders, and reading
 * it at click time keeps the markup identical on both sides of hydration.
 */
function villaPath(row: Record<string, string>): string | null {
  return row.slug ? `/order?villa=${encodeURIComponent(row.slug)}` : null;
}

/**
 * A pin coarser than its own radius is worse than no pin: it reads as
 * configured while flagging every guest who scans. Say so on the row rather
 * than showing a number that looks fine.
 */
function pinNote(row: Record<string, string>) {
  if (!row.lat || !row.lng) {
    return <span className="text-[var(--warning)]">ยังไม่ตั้งพิกัด</span>;
  }
  const radius = Number(row.radius_m) || 300;
  if (pinUncertaintyM(Number(row.lat), Number(row.lng)) > radius) {
    return (
      <span className="text-[var(--warning)]">
        พิกัดหยาบเกินรัศมี — ปักหมุดใหม่ที่วิลล่า
      </span>
    );
  }
  return (
    <span className="tabular">
      {Number(row.lat).toFixed(5)}, {Number(row.lng).toFixed(5)}
    </span>
  );
}

const FIELDS: FieldDef[] = [
  { key: 'label', label: 'ชื่อที่แสดง', type: 'text', hint: 'เช่น Villa 3 — Pool Deck' },
  {
    key: 'slug',
    label: 'ชื่อในลิงก์ (slug)',
    type: 'text',
    hint: 'ส่วนระบุวิลล่า เช่น villa-1 · ใช้ a-z 0-9 และ - เท่านั้น · ห้ามซ้ำกับวิลล่าอื่น',
  },
  { key: 'villa', label: 'ชื่อวิลล่า', type: 'text', hint: 'แสดงบนหัวหน้าจอลูกค้าและตั๋วครัว' },
  {
    key: '_pin',
    label: 'ปักหมุดวิลล่า',
    type: 'text',
    render: ({ values, set }) => <PinCapture values={values} set={set} />,
  },
  {
    key: 'lat',
    label: 'ละติจูด',
    type: 'number',
    step: 0.000001,
    hint: 'หรือเปิด Google Maps ที่วิลล่า คลิกขวาบนหมุด แล้วคัดลอกตัวเลขคู่แรก',
  },
  { key: 'lng', label: 'ลองจิจูด', type: 'number', step: 0.000001 },
  {
    key: 'radius_m',
    label: 'รัศมีที่ยอมรับ (เมตร)',
    type: 'number',
    min: 10,
    defaultValue: 300,
    hint: 'แนะนำ 300 ม. — GPS ในอาคารคลาดเคลื่อนได้มาก ตั้งแคบเกินไปจะเตือนผิดบ่อย',
  },
  { key: 'is_active', label: 'เปิดใช้งาน', type: 'boolean', defaultValue: true },
];

export default function TablesPage() {
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 muted" />
          <p className="muted">
            ลูกค้าเข้าสู่หน้าสั่งอาหารผ่านลิงก์ <code>/order</code> ใน LINE Official Account
            หรือสามารถกด &quot;คัดลอกลิงก์&quot; ในแต่ละวิลล่าเพื่อส่งลิงก์เฉพาะวิลล่าให้ลูกค้าได้โดยตรง
          </p>
        </div>
      </Card>

      <ContentManager
        endpoint="tables"
        title="วิลล่า"
        description="พิกัดใช้สำหรับเตือนเมื่อแขกอยู่นอกพื้นที่ — ไม่ได้บล็อกการสั่ง"
        fields={FIELDS}
        labelOf={(row) => row.label || row.villa || row.id}
        searchOf={(row) => [row.label, row.villa, row.id].join(' ')}
        rowActions={(row) => {
          const path = villaPath(row);
          return path ? (
            <CopyButton
              value={() => `${window.location.origin}${path}`}
              label="คัดลอกลิงก์"
            />
          ) : null;
        }}
        summaryOf={(row) => (
          <>
            {pinNote(row)}
            <span>รัศมี {row.radius_m || 300} ม.</span>
            {villaPath(row) ? (
              <span className="tabular text-[var(--brand)]">{villaPath(row)}</span>
            ) : (
              <span className="text-[var(--warning)]">ยังไม่มีลิงก์ — กดแก้ไขแล้วบันทึก</span>
            )}
          </>
        )}
        emptyHint="เพิ่มวิลล่าแรก แล้วกดพิมพ์ QR ไปติดในห้อง"
      />
    </div>
  );
}
