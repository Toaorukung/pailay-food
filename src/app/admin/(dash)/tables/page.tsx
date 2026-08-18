'use client';

import Link from 'next/link';
import { Printer, Info } from 'lucide-react';
import { ContentManager, type FieldDef } from '@/components/admin/ContentManager';
import { Button, Card } from '@/components/ui';

const FIELDS: FieldDef[] = [
  { key: 'label', label: 'ชื่อที่แสดง', type: 'text', hint: 'เช่น Villa 3 — Pool Deck' },
  {
    key: 'slug',
    label: 'ชื่อในลิงก์ (slug)',
    type: 'text',
    hint: 'ส่วนแรกของลิงก์ QR เช่น villa-1 · ใช้ a-z 0-9 และ - เท่านั้น · ห้ามซ้ำกับวิลล่าอื่น',
  },
  {
    key: 'qr_code',
    label: 'รหัสในลิงก์',
    type: 'text',
    hint: 'ส่วนที่สองของลิงก์ เว้นว่างได้ ระบบจะสร้างให้เอง — เปลี่ยนแล้ว QR ที่พิมพ์ไปแล้วจะใช้ไม่ได้',
  },
  { key: 'villa', label: 'ชื่อวิลล่า', type: 'text', hint: 'แสดงบนหัวหน้าจอลูกค้าและตั๋วครัว' },
  {
    key: 'lat',
    label: 'ละติจูด',
    type: 'number',
    step: 0.000001,
    hint: 'เปิด Google Maps ที่วิลล่า คลิกขวาบนหมุด แล้วคัดลอกตัวเลขคู่แรก',
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
            ลิงก์ในQR คือ /ชื่อวิลล่า/รหัส · แขกที่สแกนขณะมีเซสชันเปิดอยู่จะเข้าบิลเดียวกัน
            QR เป็นแบบถาวร พิมพ์ครั้งเดียวใช้ได้ตลอด —
            แต่ละครั้งที่สแกนระบบจะสร้างเซสชันใหม่ให้เอง
          </p>
        </div>
        <Link href="/admin/qr-print" target="_blank">
          <Button>
            <Printer className="size-4" />
            พิมพ์ QR ทุกวิลล่า
          </Button>
        </Link>
      </Card>

      <ContentManager
        endpoint="tables"
        title="วิลล่า & QR Code"
        description="พิกัดใช้สำหรับเตือนเมื่อแขกอยู่นอกพื้นที่ — ไม่ได้บล็อกการสั่ง"
        fields={FIELDS}
        labelOf={(row) => row.label || row.villa || row.id}
        searchOf={(row) => [row.label, row.villa, row.id].join(' ')}
        summaryOf={(row) => (
          <>
            {row.lat && row.lng ? (
              <span className="tabular">
                {Number(row.lat).toFixed(5)}, {Number(row.lng).toFixed(5)}
              </span>
            ) : (
              <span className="text-[var(--warning)]">ยังไม่ตั้งพิกัด</span>
            )}
            <span>รัศมี {row.radius_m || 300} ม.</span>
          </>
        )}
        emptyHint="เพิ่มวิลล่าแรก แล้วกดพิมพ์ QR ไปติดในห้อง"
      />
    </div>
  );
}
