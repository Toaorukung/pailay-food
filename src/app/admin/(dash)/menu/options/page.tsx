'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ContentManager, type FieldDef } from '@/components/admin/ContentManager';
import { adminFetch } from '@/components/admin/adminApi';
import { Skeleton } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { MenuCatalog } from '@/lib/types';

type Row = Record<string, string>;

/**
 * Option groups and their options.
 *
 * Two levels, so two managers: a group belongs to a dish ("Spice level"), and
 * an option belongs to a group ("Mild", "Thai hot", +20฿). Keeping them on one
 * screen means the ids needed to link them are visible while editing.
 */
export default function MenuOptionsPage() {
  const [catalog, setCatalog] = useState<MenuCatalog | null>(null);
  const [groups, setGroups] = useState<Row[]>([]);

  const loadGroups = useCallback(async () => {
    const res = await adminFetch<{ rows: Row[] }>(
      '/api/admin/content/option-groups',
    );
    if (res.ok) setGroups(res.data.rows);
  }, []);

  useEffect(() => {
    fetch('/api/menu', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setCatalog(c as MenuCatalog | null));
    loadGroups();
  }, [loadGroups]);

  const groupFields = useMemo<FieldDef[] | null>(() => {
    if (!catalog) return null;
    return [
      {
        key: 'menu_id',
        label: 'เมนูที่ผูกกับกลุ่มนี้',
        type: 'select',
        options: catalog.items.map((i) => ({
          value: i.id,
          label: i.name.th || i.name.en,
        })),
      },
      { key: 'name_th', label: 'ชื่อกลุ่ม (ไทย)', type: 'text', group: 'ชื่อกลุ่มตัวเลือก' },
      { key: 'name_en', label: 'ชื่อกลุ่ม (English)', type: 'text', group: 'ชื่อกลุ่มตัวเลือก' },
      { key: 'name_zh', label: 'ชื่อกลุ่ม (中文)', type: 'text', group: 'ชื่อกลุ่มตัวเลือก' },
      {
        key: 'type',
        label: 'รูปแบบ',
        type: 'select',
        options: [
          { value: 'single', label: 'เลือกได้ 1 อย่าง (เช่น ระดับเผ็ด)' },
          { value: 'multi', label: 'เลือกได้หลายอย่าง (เช่น ท็อปปิ้ง)' },
        ],
        defaultValue: 'single',
      },
      { key: 'required', label: 'บังคับเลือก', type: 'boolean' },
      { key: 'min_select', label: 'เลือกอย่างน้อย', type: 'number', min: 0, defaultValue: 0 },
      { key: 'max_select', label: 'เลือกได้มากสุด', type: 'number', min: 1, defaultValue: 1 },
      { key: 'sort_order', label: 'ลำดับ', type: 'number', min: 0, defaultValue: 100 },
    ];
  }, [catalog]);

  const optionFields = useMemo<FieldDef[]>(
    () => [
      {
        key: 'group_id',
        label: 'อยู่ในกลุ่ม',
        type: 'select',
        options: groups.map((g) => ({
          value: g.id,
          label: `${g.name_th || g.name_en} (${g.id})`,
        })),
      },
      { key: 'name_th', label: 'ชื่อตัวเลือก (ไทย)', type: 'text', group: 'ชื่อตัวเลือก' },
      { key: 'name_en', label: 'ชื่อตัวเลือก (English)', type: 'text', group: 'ชื่อตัวเลือก' },
      { key: 'name_zh', label: 'ชื่อตัวเลือก (中文)', type: 'text', group: 'ชื่อตัวเลือก' },
      {
        key: 'price_delta',
        label: 'ราคาบวก/ลบ (บาท)',
        type: 'number',
        hint: 'ใส่ 0 ถ้าไม่คิดเพิ่ม — ใส่ค่าติดลบเพื่อลดราคา',
        defaultValue: 0,
      },
      { key: 'is_available', label: 'พร้อมขาย', type: 'boolean', defaultValue: true },
      { key: 'sort_order', label: 'ลำดับ', type: 'number', min: 0, defaultValue: 100 },
    ],
    [groups],
  );

  if (!groupFields || !catalog) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  const menuName = (id: string) =>
    catalog.items.find((i) => i.id === id)?.name.th ?? '—';

  return (
    <div className="space-y-8">
      <Link
        href="/admin/menu"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
      >
        <ArrowLeft className="size-4" />
        กลับไปหน้าเมนู
      </Link>

      <ContentManager
        endpoint="option-groups"
        title="กลุ่มตัวเลือก"
        description="เช่น ระดับความเผ็ด, ขนาด, ท็อปปิ้ง — ผูกกับเมนูทีละรายการ"
        fields={groupFields}
        onChanged={loadGroups}
        labelOf={(row) => row.name_th || row.name_en || row.id}
        searchOf={(row) => [row.name_th, row.name_en, menuName(row.menu_id)].join(' ')}
        summaryOf={(row) => (
          <>
            <span>{menuName(row.menu_id)}</span>
            <span>{row.type === 'multi' ? 'เลือกหลายอย่าง' : 'เลือก 1 อย่าง'}</span>
            {row.required === 'TRUE' && (
              <span className="text-[var(--danger)]">บังคับเลือก</span>
            )}
          </>
        )}
        emptyHint="สร้างกลุ่มแรก แล้วค่อยเพิ่มตัวเลือกย่อยด้านล่าง"
      />

      <ContentManager
        endpoint="options"
        title="ตัวเลือกย่อย"
        fields={optionFields}
        labelOf={(row) => row.name_th || row.name_en || row.id}
        searchOf={(row) => [row.name_th, row.name_en].join(' ')}
        summaryOf={(row) => (
          <>
            <span>{groups.find((g) => g.id === row.group_id)?.name_th ?? '—'}</span>
            {Number(row.price_delta || 0) !== 0 && (
              <span className="tabular">
                {Number(row.price_delta) > 0 ? '+' : ''}
                {formatMoney(Number(row.price_delta))}
              </span>
            )}
          </>
        )}
        emptyHint="ต้องสร้างกลุ่มตัวเลือกก่อน จึงจะเพิ่มตัวเลือกย่อยได้"
      />
    </div>
  );
}
