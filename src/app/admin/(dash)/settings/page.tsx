'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save, Info } from 'lucide-react';
import { adminFetch } from '@/components/admin/adminApi';
import { Button, Card, Field, Input, Skeleton, Textarea } from '@/components/ui';

interface SettingDef {
  key: string;
  label: string;
  hint?: string;
  type?: 'text' | 'number' | 'textarea' | 'boolean';
  section: string;
}

const SETTINGS: SettingDef[] = [
  { key: 'shop_name', label: 'ชื่อร้าน', section: 'ทั่วไป' },
  { key: 'currency', label: 'สกุลเงิน', hint: 'THB', section: 'ทั่วไป' },
  {
    key: 'min_order_amount',
    label: 'ยอดสั่งขั้นต่ำ (บาท)',
    type: 'number',
    hint: 'ใส่ 0 ถ้าไม่กำหนด',
    section: 'ทั่วไป',
  },

  {
    key: 'service_charge_percent',
    label: 'ค่าบริการ (%)',
    type: 'number',
    section: 'ราคาและภาษี',
  },
  {
    key: 'vat_percent',
    label: 'ภาษีมูลค่าเพิ่ม (%)',
    type: 'number',
    section: 'ราคาและภาษี',
  },
  {
    key: 'vat_included',
    label: 'ราคาที่ตั้งไว้รวม VAT แล้ว',
    type: 'boolean',
    hint: 'ร้านส่วนใหญ่ในไทยตั้งราคารวม VAT — ถ้าติ๊กไว้ ระบบจะถอด VAT ออกมาแสดงเฉย ๆ ไม่บวกเพิ่ม',
    section: 'ราคาและภาษี',
  },

  {
    key: 'promptpay_name',
    label: 'ชื่อบัญชีผู้รับเงิน',
    hint: 'แสดงใต้ QR ให้แขกตรวจสอบก่อนโอน',
    section: 'การชำระเงิน',
  },
  { key: 'payment_note_th', label: 'ข้อความหน้าชำระเงิน (ไทย)', type: 'textarea', section: 'การชำระเงิน' },
  { key: 'payment_note_en', label: 'ข้อความหน้าชำระเงิน (English)', type: 'textarea', section: 'การชำระเงิน' },
  { key: 'payment_note_zh', label: 'ข้อความหน้าชำระเงิน (中文)', type: 'textarea', section: 'การชำระเงิน' },

  {
    key: 'allergy_disclaimer_th',
    label: 'ข้อความปฏิเสธความรับผิดเรื่องภูมิแพ้ (ไทย)',
    type: 'textarea',
    section: 'ข้อความแพ้อาหาร',
  },
  { key: 'allergy_disclaimer_en', label: 'Allergy disclaimer (English)', type: 'textarea', section: 'ข้อความแพ้อาหาร' },
  { key: 'allergy_disclaimer_zh', label: '过敏声明 (中文)', type: 'textarea', section: 'ข้อความแพ้อาหาร' },
];

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetch<{ settings: Record<string, string> }>(
      '/api/admin/settings',
    );
    if (res.ok) setValues(res.data.settings);
    else setError(res.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!values) return;
    setBusy(true);
    setError(null);
    setMessage(null);

    const entries = SETTINGS.map((s) => ({
      key: s.key,
      value: String(values[s.key] ?? ''),
    }));

    const res = await adminFetch('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ entries }),
    });

    setBusy(false);
    if (!res.ok) setError(res.error);
    else setMessage('บันทึกแล้ว — หน้าลูกค้าจะเห็นค่าใหม่ทันที');
  }

  if (!values) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  const sections = [...new Set(SETTINGS.map((s) => s.section))];

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">ตั้งค่าร้าน</h1>
        <p className="flex items-start gap-2 text-sm muted">
          <Info className="mt-0.5 size-4 shrink-0" />
          ค่าเหล่านี้เก็บอยู่ในแท็บ Settings ของ Google Sheet — แก้จากที่นี่หรือแก้ในชีตโดยตรงก็ได้
        </p>
      </header>

      {/* Column flow rather than a grid: sections have wildly different
          heights, and a grid would leave a ragged hole under every short one. */}
      <div className="[column-fill:balance] gap-5 lg:columns-2 2xl:columns-3">
        {sections.map((section) => (
        <Card key={section} className="mb-5 inline-block w-full space-y-3 break-inside-avoid align-top">
          <h2 className="font-bold">{section}</h2>
          {SETTINGS.filter((s) => s.section === section).map((setting) => (
            <SettingInput
              key={setting.key}
              def={setting}
              value={values[setting.key] ?? ''}
              onChange={(v) => setValues({ ...values, [setting.key]: v })}
            />
          ))}
        </Card>
        ))}
      </div>

      {error && (
        <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-xl bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">
          {message}
        </p>
      )}

      <Button size="lg" loading={busy} onClick={save}>
        <Save className="size-4" />
        บันทึกการตั้งค่า
      </Button>
    </div>
  );
}

function SettingInput({
  def,
  value,
  onChange,
}: {
  def: SettingDef;
  value: string;
  onChange: (value: string) => void;
}) {
  if (def.type === 'boolean') {
    const checked = ['true', '1', 'yes'].includes(value.toLowerCase());
    return (
      <label className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-[var(--surface-sunken)]">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked ? 'TRUE' : 'FALSE')}
          className="mt-1 size-5 accent-[var(--color-brand-600)]"
        />
        <span>
          <span className="block text-sm font-medium">{def.label}</span>
          {def.hint && <span className="block text-xs muted">{def.hint}</span>}
        </span>
      </label>
    );
  }

  if (def.type === 'textarea') {
    return (
      <Field label={def.label} hint={def.hint}>
        <Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      </Field>
    );
  }

  return (
    <Field label={def.label} hint={def.hint}>
      <Input
        type={def.type === 'number' ? 'number' : 'text'}
        inputMode={def.type === 'number' ? 'decimal' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
