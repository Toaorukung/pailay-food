'use client';

import { ContentManager, type FieldDef } from '@/components/admin/ContentManager';

const FIELDS: FieldDef[] = [
  { key: 'name_th', label: 'ชื่อ (ไทย)', type: 'text', group: 'ชื่อหมวดหมู่', required: true },
  { key: 'name_en', label: 'ชื่อ (English)', type: 'text', group: 'ชื่อหมวดหมู่' },
  { key: 'name_zh', label: 'ชื่อ (中文)', type: 'text', group: 'ชื่อหมวดหมู่' },
  {
    key: 'icon',
    label: 'ไอคอน (อีโมจิ)',
    type: 'text',
    hint: 'เช่น 🍜 🥗 🍹 — แสดงคู่กับชื่อหมวดในหน้าลูกค้า',
  },
  {
    key: 'sort_order',
    label: 'ลำดับการแสดง',
    type: 'number',
    hint: 'เลขน้อยแสดงก่อน',
    defaultValue: 100,
    min: 0,
  },
  { key: 'is_active', label: 'เปิดใช้งาน', type: 'boolean', defaultValue: true },
];

export default function CategoriesPage() {
  return (
    <ContentManager
      endpoint="categories"
      title="หมวดหมู่อาหาร"
      description="จัดกลุ่มเมนูให้ลูกค้าหาง่าย — ลำดับที่ตั้งไว้คือลำดับที่แสดงในหน้าเมนู"
      fields={FIELDS}
      labelOf={(row) => `${row.icon ?? ''} ${row.name_th || row.name_en}`.trim()}
      searchOf={(row) => [row.name_th, row.name_en, row.name_zh].join(' ')}
      summaryOf={(row) => <span>ลำดับ {row.sort_order || '—'}</span>}
      emptyHint="เพิ่มหมวดหมู่แรก เช่น อาหารจานเดียว เครื่องดื่ม ของหวาน"
    />
  );
}
