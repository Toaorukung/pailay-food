'use client';

import { ContentManager, type FieldDef } from '@/components/admin/ContentManager';

const TYPE_LABEL: Record<string, string> = {
  text: 'ข้อความสั้น',
  textarea: 'ข้อความยาว',
  tel: 'เบอร์โทร',
  number: 'ตัวเลข',
  select: 'ตัวเลือก',
};

const FIELDS: FieldDef[] = [
  {
    key: 'label_th',
    label: 'คำถาม (ไทย)',
    type: 'text',
    required: true,
    group: 'คำถามที่แขกเห็น',
    hint: 'เช่น จำนวนผู้เข้าพัก, เลขห้อง, เวลาเช็คเอาต์',
  },
  { key: 'label_en', label: 'คำถาม (English)', type: 'text', group: 'คำถามที่แขกเห็น' },
  { key: 'label_zh', label: 'คำถาม (中文)', type: 'text', group: 'คำถามที่แขกเห็น' },
  {
    key: 'type',
    label: 'ชนิดช่องกรอก',
    type: 'select',
    defaultValue: 'text',
    options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
  },
  {
    key: 'options_th',
    label: 'ตัวเลือก (ไทย)',
    type: 'text',
    group: 'ตัวเลือก — ใช้เฉพาะชนิด "ตัวเลือก"',
    hint: 'คั่นด้วยจุลภาค เช่น 1-2 ท่าน, 3-4 ท่าน, 5 ท่านขึ้นไป',
  },
  {
    key: 'options_en',
    label: 'ตัวเลือก (English)',
    type: 'text',
    group: 'ตัวเลือก — ใช้เฉพาะชนิด "ตัวเลือก"',
  },
  {
    key: 'options_zh',
    label: 'ตัวเลือก (中文)',
    type: 'text',
    group: 'ตัวเลือก — ใช้เฉพาะชนิด "ตัวเลือก"',
  },
  {
    key: 'required',
    label: 'บังคับกรอก',
    type: 'boolean',
    defaultValue: false,
    hint: 'ถ้าบังคับ แขกจะกดผ่านป๊อปอัพไม่ได้จนกว่าจะตอบ',
  },
  {
    key: 'sort_order',
    label: 'ลำดับ',
    type: 'number',
    defaultValue: 100,
    hint: 'เลขน้อยขึ้นก่อน',
  },
  { key: 'is_active', label: 'เปิดใช้งาน', type: 'boolean', defaultValue: true },
];

/**
 * Questions the villa adds to the opening dialog, beside name and phone.
 *
 * Name and phone are not rows here on purpose: the phone number is what marks
 * a session as introduced and what reception rings to confirm a ticket, so
 * making it deletable would break the confirm flow rather than customise it.
 */
export default function GuestFieldsPage() {
  return (
    <ContentManager
      endpoint="guest-fields"
      title="คำถามตอนแขกเริ่มสั่ง"
      description='คำถามเพิ่มเติมในป๊อปอัพขั้นตอนที่ 1 ต่อจากชื่อและเบอร์โทร — คำตอบจะไปโผล่ในหน้าเซสชันและหน้ารอคอนเฟิร์ม ชื่อและเบอร์โทรเป็นช่องมาตรฐาน ลบไม่ได้'
      fields={FIELDS}
      labelOf={(row) => row.label_th || row.label_en || row.id}
      searchOf={(row) => [row.label_th, row.label_en, row.label_zh].join(' ')}
      summaryOf={(row) =>
        [
          TYPE_LABEL[row.type] ?? row.type,
          row.required === 'TRUE' ? 'บังคับกรอก' : 'ไม่บังคับ',
        ].join(' · ')
      }
      emptyHint="ยังไม่มีคำถามเพิ่มเติม แขกจะถูกถามแค่ชื่อกับเบอร์โทร"
    />
  );
}
