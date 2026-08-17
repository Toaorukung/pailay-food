'use client';

import { ContentManager, type FieldDef } from '@/components/admin/ContentManager';

const FIELDS: FieldDef[] = [
  { key: 'name_th', label: 'ชื่อ (ไทย)', type: 'text', group: 'ชื่อสารก่อภูมิแพ้' },
  { key: 'name_en', label: 'ชื่อ (English)', type: 'text', group: 'ชื่อสารก่อภูมิแพ้' },
  { key: 'name_zh', label: 'ชื่อ (中文)', type: 'text', group: 'ชื่อสารก่อภูมิแพ้' },
  { key: 'icon', label: 'ไอคอน (อีโมจิ)', type: 'text', hint: 'เช่น 🦐 🥜 🥛 🌾' },
  { key: 'is_active', label: 'เปิดใช้งาน', type: 'boolean', defaultValue: true },
];

export default function AllergensPage() {
  return (
    <ContentManager
      endpoint="allergens"
      title="สารก่อภูมิแพ้"
      description="รายการนี้คือตัวเลือกที่แขกเลือกตอนเริ่มสั่งอาหาร และเป็นตัวที่ระบบใช้เตือนก่อนเพิ่มเมนูลงตะกร้า"
      fields={FIELDS}
      labelOf={(row) => `${row.icon ?? ''} ${row.name_th || row.name_en}`.trim()}
      searchOf={(row) => [row.name_th, row.name_en, row.name_zh].join(' ')}
      emptyHint="เพิ่มรายการมาตรฐานก่อน เช่น กุ้ง/หอย ถั่วลิสง นม ไข่ กลูเตน ถั่วเหลือง"
    />
  );
}
