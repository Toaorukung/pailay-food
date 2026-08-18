'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentManager, type FieldDef } from '@/components/admin/ContentManager';
import { Badge, Skeleton } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { MenuCatalog } from '@/lib/types';

/**
 * Menu editing needs live option lists (categories, allergens) that the other
 * content screens do not, so it loads the catalog first and builds its field
 * descriptors from it.
 */
export default function MenuPage() {
  const [catalog, setCatalog] = useState<MenuCatalog | null>(null);

  const load = async () => {
    const res = await fetch('/api/menu', { cache: 'no-store' });
    if (res.ok) setCatalog((await res.json()) as MenuCatalog);
  };

  useEffect(() => {
    load();
  }, []);

  const fields = useMemo<FieldDef[] | null>(() => {
    if (!catalog) return null;

    const categoryOptions = catalog.categories.map((c) => ({
      value: c.id,
      label: `${c.icon ?? ''} ${c.name.th || c.name.en}`.trim(),
    }));
    const allergenOptions = catalog.allergens.map((a) => ({
      value: a.id,
      label: `${a.icon ?? ''} ${a.name.th || a.name.en}`.trim(),
    }));

    return [
      { key: 'category_id', label: 'หมวดหมู่', type: 'select', options: categoryOptions },

      { key: 'name_th', label: 'ชื่อ (ไทย)', type: 'text', group: 'ชื่อเมนู' },
      { key: 'name_en', label: 'ชื่อ (English)', type: 'text', group: 'ชื่อเมนู' },
      { key: 'name_zh', label: 'ชื่อ (中文)', type: 'text', group: 'ชื่อเมนู' },

      { key: 'desc_th', label: 'คำอธิบาย (ไทย)', type: 'textarea', group: 'คำอธิบาย' },
      { key: 'desc_en', label: 'คำอธิบาย (English)', type: 'textarea', group: 'คำอธิบาย' },
      { key: 'desc_zh', label: 'คำอธิบาย (中文)', type: 'textarea', group: 'คำอธิบาย' },

      {
        key: 'ingredients_th',
        label: 'ส่วนผสม (ไทย)',
        type: 'textarea',
        group: 'ส่วนผสม — ใช้ค้นหาได้',
        hint: 'ลูกค้าค้นหาด้วยส่วนผสมได้ เช่น พิมพ์ "กุ้ง" แล้วเจอทุกเมนูที่มีกุ้ง',
      },
      { key: 'ingredients_en', label: 'ส่วนผสม (English)', type: 'textarea', group: 'ส่วนผสม — ใช้ค้นหาได้' },
      { key: 'ingredients_zh', label: 'ส่วนผสม (中文)', type: 'textarea', group: 'ส่วนผสม — ใช้ค้นหาได้' },

      { key: 'price', label: 'ราคา (บาท)', type: 'number', min: 0, step: 1 },
      { key: 'image_url', label: 'รูปภาพ', type: 'image' },

      {
        key: 'allergens',
        label: 'มีสารก่อภูมิแพ้',
        type: 'multiselect',
        options: allergenOptions,
        hint: 'แขกที่แจ้งว่าแพ้รายการนี้จะเห็นคำเตือนสีแดง และต้องกดยืนยันก่อนสั่ง',
      },
      {
        key: 'may_contain',
        label: 'อาจปนเปื้อน',
        type: 'multiselect',
        options: allergenOptions,
        hint: 'ใช้กับกรณีปนเปื้อนข้ามในครัว — เตือนแบบสีเหลือง ไม่บล็อกการสั่ง',
      },
      { key: 'tags', label: 'แท็ก', type: 'tags', hint: 'ใช้ค้นหา เช่น ทะเล, ยำ, ซิกเนเจอร์' },
      { key: 'spicy_level', label: 'ระดับความเผ็ด (0-5)', type: 'number', min: 0, max: 5, defaultValue: 0 },
      { key: 'is_vegetarian', label: 'มังสวิรัติ', type: 'boolean' },
      {
        key: 'price_on_request',
        label: 'ถามราคา (ชั่งน้ำหนักก่อน)',
        type: 'boolean',
        hint: 'ติ๊กแล้วต้องตั้งราคาเป็น 0 — แขกสั่งได้ แต่พนักงานใส่ราคาจริงในหน้าครัวหลังชั่ง และเช็คบิลไม่ได้จนกว่าจะใส่ครบ',
      },
      {
        key: 'is_alcohol',
        label: 'เครื่องดื่มแอลกอฮอล์',
        type: 'boolean',
        hint: 'แขกต้องยืนยันอายุก่อนเพิ่มลงตะกร้า',
      },
      { key: 'is_available', label: 'พร้อมขาย', type: 'boolean', defaultValue: true },
      { key: 'sort_order', label: 'ลำดับในหมวด', type: 'number', min: 0, defaultValue: 100 },
    ];
  }, [catalog]);

  if (!fields || !catalog) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  const categoryName = (id: string) => {
    const c = catalog.categories.find((x) => x.id === id);
    return c ? c.name.th || c.name.en : '—';
  };

  return (
    <div className="space-y-3">
      <ContentManager
        endpoint="menu"
        title="เมนูอาหาร"
        description={`${catalog.items.length} รายการ · แก้ไขแล้วมีผลกับหน้าลูกค้าทันที`}
        addLabel="เพิ่มเมนู"
        fields={fields}
        onChanged={load}
        labelOf={(row) => row.name_th || row.name_en || row.id}
        searchOf={(row) =>
          [row.name_th, row.name_en, row.name_zh, row.tags, row.ingredients_th].join(' ')
        }
        filters={catalog.categories.map((c) => ({
          value: c.id,
          label: `${c.icon ?? ''} ${c.name.th || c.name.en}`.trim(),
        }))}
        filterOf={(row) => row.category_id}
        columns={[
          {
            key: 'name',
            label: 'เมนู',
            render: (row) => (
              <div className="flex items-center gap-3">
                {row.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.image_url}
                    alt=""
                    className="size-11 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <span className="food-tile flex size-11 shrink-0 items-center justify-center rounded-xl text-lg">
                    <span className="relative">
                      {catalog.categories.find((c) => c.id === row.category_id)?.icon ?? '🍽'}
                    </span>
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {row.name_th || row.name_en || row.id}
                  </span>
                  <span className="block truncate text-xs muted">
                    {row.name_en || row.id}
                  </span>
                </span>
              </div>
            ),
          },
          {
            key: 'category',
            label: 'หมวดหมู่',
            hideBelow: 'lg',
            render: (row) => <span className="muted">{categoryName(row.category_id)}</span>,
          },
          {
            key: 'price',
            label: 'ราคา',
            align: 'right',
            render: (row) =>
              row.price_on_request === 'TRUE' ? (
                <span className="text-xs muted">ตามน้ำหนัก</span>
              ) : (
                <span className="font-bold">{formatMoney(Number(row.price || 0))}</span>
              ),
          },
          {
            key: 'flags',
            label: 'หมายเหตุ',
            hideBelow: 'xl',
            render: (row) => (
              <span className="flex flex-wrap gap-1">
                {row.allergens && (
                  <Badge tone="danger">
                    {row.allergens.split(',').filter(Boolean).length} สารก่อภูมิแพ้
                  </Badge>
                )}
                {row.is_alcohol === 'TRUE' && <Badge tone="warning">แอลกอฮอล์</Badge>}
                {row.is_vegetarian === 'TRUE' && <Badge tone="success">มังสวิรัติ</Badge>}
              </span>
            ),
          },
          {
            key: 'available',
            label: 'พร้อมขาย',
            // Tap to 86 a dish. Availability changes several times a service
            // and is the one field worth editing without opening the form.
            render: (row, api) => {
              const available = row.is_available !== 'FALSE';
              return (
                <button
                  type="button"
                  disabled={api.saving}
                  onClick={() => api.patch({ is_available: !available })}
                  aria-pressed={available}
                  title={available ? 'กดเพื่อทำเครื่องหมายว่าหมด' : 'กดเพื่อเปิดขายอีกครั้ง'}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-none transition-colors disabled:opacity-50 ${
                    available
                      ? 'bg-[var(--success-soft)] text-[var(--success)] hover:brightness-95'
                      : 'bg-[var(--surface-sunken)] muted hover:text-[var(--text)]'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${
                      available ? 'bg-[var(--success)]' : 'bg-[var(--text-subtle)]'
                    }`}
                  />
                  {available ? 'พร้อมขาย' : 'หมดชั่วคราว'}
                </button>
              );
            },
          },
        ]}
        summaryOf={(row) => (
          <>
            <span>{categoryName(row.category_id)}</span>
            <span className="tabular">
              {row.price_on_request === 'TRUE'
                ? 'ตามน้ำหนัก'
                : formatMoney(Number(row.price || 0))}
            </span>
            {row.allergens && <span className="text-[var(--danger)]">มีสารก่อภูมิแพ้</span>}
          </>
        )}
        emptyHint="เพิ่มเมนูแรกของคุณ — อย่าลืมใส่ส่วนผสมเพื่อให้ลูกค้าค้นหาเจอ"
      />

      <p className="text-sm muted">
        ต้องการตัวเลือกย่อย (ระดับเผ็ด / ไซส์ / ท็อปปิ้ง)?{' '}
        <Link href="/admin/menu/options" className="font-medium text-brand-600 hover:underline">
          จัดการตัวเลือกเมนู
        </Link>
      </p>
    </div>
  );
}
