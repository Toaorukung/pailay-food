'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Save, Info, ImagePlus, X, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { adminFetch } from '@/components/admin/adminApi';
import { Button, Card, Field, Input, Skeleton, Textarea } from '@/components/ui';

interface SettingDef {
  key: string;
  label: string;
  hint?: string;
  type?: 'text' | 'number' | 'textarea' | 'boolean' | 'image';
  rows?: number;
  section: string;
}

// Named rather than repeated as literals: a mistyped section string would
// silently drop the field off the page instead of failing to build.
const S_GENERAL = 'ทั่วไป';
const S_LINE = 'LINE Official Account & บรอดแคสต์';
const S_HOURS = 'เวลารับออเดอร์';
const S_PRICING = 'ราคาและภาษี';
const S_PAYMENT = 'การชำระเงิน';
const S_ENTRY_1 = 'หน้าแรก — ขั้นตอนที่ 1: ประกาศก่อนสั่ง';
const S_ENTRY_2 = 'หน้าแรก — ขั้นตอนที่ 2: เลือกบ้านพัก';
const S_APP_1 = 'ป๊อปอัพในแอป — ขั้นตอนที่ 1: ชื่อและเบอร์โทร';
const S_APP_2 = 'ป๊อปอัพในแอป — ขั้นตอนที่ 2: แจ้งภูมิแพ้';

function CrossLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="font-semibold text-brand-600 underline">
      {children}
    </a>
  );
}

/**
 * Sections in the order the owner meets them, so the two onboarding flows read
 * top to bottom exactly as a guest walks through them: the entry screen first
 * (conditions, then which villa), then the dialogs that open once inside the
 * app (name and phone, then allergies).
 *
 * A section carrying only a `note` and no fields is deliberate. Those steps are
 * driven by other tabs or by the app's own translations, and saying so here is
 * what stops someone hunting this page for a setting that was never going to be
 * on it.
 */
const SECTIONS: { title: string; note?: ReactNode; ownerOnly?: boolean }[] = [
  { title: S_GENERAL },
  {
    title: S_LINE,
    ownerOnly: true,
    note: 'ตั้งค่า Channel Access Token จาก LINE Developers Console เพื่อให้ระบบส่งข้อความยืนยันคำสั่งซื้อไปยัง LINE ของลูกค้าโดยอัตโนมัติ (เฉพาะ OWNER เท่านั้น)',
  },
  { title: S_HOURS },
  { title: S_PRICING },
  { title: S_PAYMENT },
  {
    title: S_ENTRY_1,
    note: 'จอแรกที่แขกเห็นหลังกดลิงก์จาก LINE — ปิดสวิตช์แล้วแขกจะข้ามไปหน้าเลือกบ้านพักทันที กฎการสั่งพิมพ์บรรทัดละ 1 ข้อ ระบบจะแสดงเป็นรายการให้เอง',
  },
  {
    title: S_ENTRY_2,
    note: (
      <>
        ไม่มีค่าให้ตั้งที่นี่ — รายชื่อบ้านพักมาจากแท็บ Tables เพิ่มหรือปิดบ้านพักได้ที่{' '}
        <CrossLink href="/admin/tables">จัดการบ้านพัก</CrossLink>
      </>
    ),
  },
  {
    title: S_APP_1,
    note: (
      <>
        ชื่อและเบอร์โทรเป็นช่องมาตรฐานของระบบ — หากต้องการเพิ่มคำถามอื่นๆ ให้แขกตอบในป๊อปอัพนี้ สามารถเพิ่มหรือแก้ไขได้ที่{' '}
        <CrossLink href="/admin/guest-fields">คำถามตอนเริ่มสั่ง</CrossLink>
      </>
    ),
  },
  {
    title: S_APP_2,
    note: (
      <>
        ข้ามให้อัตโนมัติถ้าไม่มีสารก่อภูมิแพ้ที่เปิดใช้งานอยู่ — แก้รายการได้ที่{' '}
        <CrossLink href="/admin/allergens">จัดการภูมิแพ้</CrossLink>
      </>
    ),
  },
];

const SETTINGS: SettingDef[] = [
  { key: 'shop_name', label: 'ชื่อร้าน', section: S_GENERAL },
  { key: 'currency', label: 'สกุลเงิน', hint: 'THB', section: S_GENERAL },
  {
    key: 'min_order_amount',
    label: 'ยอดสั่งขั้นต่ำ (บาท)',
    type: 'number',
    hint: 'ใส่ 0 ถ้าไม่กำหนด',
    section: S_GENERAL,
  },

  {
    key: 'line_channel_id',
    label: 'Messaging API Channel ID',
    hint: 'ดูจาก LINE Developers > บัญชีบอท > Basic settings > Channel ID',
    section: S_LINE,
  },
  {
    key: 'line_channel_secret',
    label: 'Messaging API Channel Secret',
    hint: 'ดูจาก LINE Developers > บัญชีบอท > Basic settings > Channel secret',
    section: S_LINE,
  },
  {
    key: 'line_channel_token',
    label: 'Channel Access Token (หรือให้ระบบขอให้อัตโนมัติ)',
    hint: 'ระบบจะใช้ Channel ID + Secret ด้านบนขอ Token อัตโนมัติ หรือจะวาง Token เองก็ได้',
    type: 'textarea',
    rows: 3,
    section: S_LINE,
  },

  {
    key: 'order_open',
    label: 'เริ่มรับออเดอร์ (HH:MM)',
    hint: 'เว้นว่าง = รับตลอด เช่น 10:00',
    section: S_HOURS,
  },
  {
    key: 'order_cutoff',
    label: 'ปิดรับออเดอร์ (HH:MM)',
    hint: 'ออเดอร์สุดท้ายของวัน เว้นว่าง = ไม่จำกัด เช่น 21:00 — เลยเวลานี้กดยืนยันสั่งไม่ได้',
    section: S_HOURS,
  },

  {
    key: 'service_charge_percent',
    label: 'ค่าบริการ (%)',
    type: 'number',
    section: S_PRICING,
  },
  {
    key: 'vat_percent',
    label: 'ภาษีมูลค่าเพิ่ม (%)',
    type: 'number',
    section: S_PRICING,
  },
  {
    key: 'vat_included',
    label: 'ราคาที่ตั้งไว้รวม VAT แล้ว',
    type: 'boolean',
    hint: 'ร้านส่วนใหญ่ในไทยตั้งราคารวม VAT — ถ้าติ๊กไว้ ระบบจะถอด VAT ออกมาแสดงเฉย ๆ ไม่บวกเพิ่ม',
    section: S_PRICING,
  },

  {
    key: 'promptpay_name',
    label: 'ชื่อบัญชีผู้รับเงิน',
    hint: 'แสดงใต้ QR ให้แขกตรวจสอบก่อนโอน',
    section: S_PAYMENT,
  },
  { key: 'payment_note_th', label: 'ข้อความหน้าชำระเงิน (ไทย)', type: 'textarea', section: S_PAYMENT },
  { key: 'payment_note_en', label: 'ข้อความหน้าชำระเงิน (English)', type: 'textarea', section: S_PAYMENT },
  { key: 'payment_note_zh', label: 'ข้อความหน้าชำระเงิน (中文)', type: 'textarea', section: S_PAYMENT },

  {
    key: 'welcome_enabled',
    label: 'เปิดหน้าประกาศก่อนเลือกบ้านพัก',
    type: 'boolean',
    hint: 'ปิด = แขกเข้าหน้าเลือกบ้านพักทันที',
    section: S_ENTRY_1,
  },
  {
    key: 'welcome_image',
    label: 'รูปประกาศ',
    type: 'image',
    hint: 'ภาพประกาศของที่พัก เว้นว่าง = ใช้รูปสำรองด้านล่าง',
    section: S_ENTRY_1,
  },
  {
    key: 'service_notice_image',
    label: 'รูปประกาศสำรอง',
    type: 'image',
    hint: 'ใช้เมื่อยังไม่ได้ตั้งรูปด้านบน',
    section: S_ENTRY_1,
  },
  {
    key: 'service_notice_th',
    label: 'กฎการสั่งและบริการ (ไทย)',
    type: 'textarea',
    rows: 8,
    hint: 'พิมพ์บรรทัดละ 1 ข้อ — รูปแปลภาษาไม่ได้ ข้อความชุดนี้คือตัวที่แขกต่างชาติและโปรแกรมอ่านหน้าจออ่านได้จริง',
    section: S_ENTRY_1,
  },
  {
    key: 'service_notice_en',
    label: 'Ordering & service rules (English)',
    type: 'textarea',
    rows: 8,
    section: S_ENTRY_1,
  },
  {
    key: 'service_notice_zh',
    label: '点餐与服务须知 (中文)',
    type: 'textarea',
    rows: 8,
    section: S_ENTRY_1,
  },
  {
    key: 'contact_phone',
    label: 'เบอร์โทรติดต่อ',
    hint: 'แสดงเป็นปุ่มกดโทรใต้ประกาศ และในเมนูที่ต้องสอบถามราคา',
    section: S_ENTRY_1,
  },

  {
    key: 'allergy_disclaimer_th',
    label: 'ข้อความปฏิเสธความรับผิดเรื่องภูมิแพ้ (ไทย)',
    type: 'textarea',
    section: S_APP_2,
  },
  { key: 'allergy_disclaimer_en', label: 'Allergy disclaimer (English)', type: 'textarea', section: S_APP_2 },
  { key: 'allergy_disclaimer_zh', label: '过敏声明 (中文)', type: 'textarea', section: S_APP_2 },
];

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetch<{ settings: Record<string, string>; isOwner?: boolean }>(
      '/api/admin/settings',
    );
    if (res.ok) {
      setValues(res.data.settings);
      setIsOwner(Boolean(res.data.isOwner));
    } else {
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!values) return;
    setBusy(true);
    setError(null);
    setMessage(null);

    const targetSettings = isOwner ? SETTINGS : SETTINGS.filter((s) => s.section !== S_LINE);
    const entries = targetSettings.map((s) => ({
      key: s.key,
      value: String(values[s.key] ?? ''),
    }));

    const res = await adminFetch('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ entries }),
    });

    setBusy(false);
    if (!res.ok) setError(res.error);
    else setMessage('บันทึกการตั้งค่าเรียบร้อยแล้ว — หน้าลูกค้าและการส่ง LINE จะอัปเดตทันที');
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
        {SECTIONS.filter((s) => !s.ownerOnly || isOwner).map(({ title, note }) => (
          <Card key={title} className="mb-5 inline-block w-full space-y-3 break-inside-avoid align-top">
            <h2 className="font-bold">{title}</h2>
            {note && <p className="text-xs leading-relaxed muted">{note}</p>}
            {SETTINGS.filter((s) => s.section === title).map((setting) => (
              <SettingInput
                key={setting.key}
                def={setting}
                value={values[setting.key] ?? ''}
                onChange={(v) => setValues({ ...values, [setting.key]: v })}
              />
            ))}
            {title === S_LINE && isOwner && (
              <LineTestWidget
                channelId={values['line_channel_id'] ?? ''}
                channelSecret={values['line_channel_secret'] ?? ''}
                token={values['line_channel_token'] ?? ''}
              />
            )}
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

  if (def.type === 'image') {
    return <ImageSetting def={def} value={value} onChange={onChange} />;
  }

  if (def.type === 'textarea') {
    return (
      <Field label={def.label} hint={def.hint}>
        <Textarea
          rows={def.rows ?? 3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
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

/**
 * Upload or paste, because both happen: most owners pick a file, but the
 * artwork that ships with the app lives at a fixed path (`/notice/welcome.jpg`)
 * and typing it back is the only way to return to it after clearing the field.
 */
function ImageSetting({
  def,
  value,
  onChange,
}: {
  def: SettingDef;
  value: string;
  onChange: (value: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  return (
    <Field label={def.label} hint={def.hint}>
      <div className="flex items-start gap-3">
        {value ? (
          <div className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              className="size-20 rounded-xl border border-[var(--line)] bg-white object-contain"
            />
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute -right-2 -top-2 rounded-full bg-[var(--danger)] p-1 text-white"
              aria-label="ลบรูป"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--line)] muted">
            <ImagePlus className="size-6" />
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <label className="block cursor-pointer text-sm font-medium text-brand-600 hover:underline">
            {uploading ? 'กำลังอัปโหลด…' : 'เลือกรูป'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setUploading(true);
                const form = new FormData();
                form.append('image', file);
                const res = await adminFetch<{ url: string }>('/api/admin/upload', {
                  method: 'POST',
                  body: form,
                });
                setUploading(false);
                if (res.ok) onChange(res.data.url);
                else alert(res.error);
              }}
            />
          </label>

          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="/notice/welcome.jpg"
          />
        </div>
      </div>
    </Field>
  );
}

function LineTestWidget({
  channelId,
  channelSecret,
  token,
}: {
  channelId?: string;
  channelSecret?: string;
  token?: string;
}) {
  const [targetId, setTargetId] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    adminFetch<{ sampleUserId: string }>('/api/admin/line/test').then((res) => {
      if (res.ok && res.data.sampleUserId) {
        setTargetId(res.data.sampleUserId);
      }
    });
  }, []);

  async function handleTest() {
    if (!targetId.trim()) {
      setTestResult({ ok: false, msg: 'กรุณาระบุ LINE User ID ของผู้รับการทดสอบ' });
      return;
    }
    setTesting(true);
    setTestResult(null);

    const res = await adminFetch<{ success: boolean; message: string }>('/api/admin/line/test', {
      method: 'POST',
      body: JSON.stringify({
        channelId: channelId?.trim(),
        channelSecret: channelSecret?.trim(),
        token: token?.trim(),
        targetUserId: targetId.trim(),
        message: '🔔 ทดสอบการแจ้งเตือนจาก Pailay Food: เชื่อมต่อ LINE Messaging API สำเร็จแล้ว!',
      }),
    });

    setTesting(false);
    if (res.ok) {
      setTestResult({
        ok: true,
        msg: res.data.message || 'ส่งข้อความทดสอบสำเร็จ! ตรวจสอบในแชท LINE ได้เลย',
      });
    } else {
      setTestResult({ ok: false, msg: res.error || 'ส่งไม่สำเร็จ' });
    }
  }

  const hasCredentials = Boolean(
    token?.trim() || (channelId?.trim() && channelSecret?.trim()),
  );

  return (
    <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Send className="size-4 text-brand-600" />
        ทดสอบส่งข้อความเข้า LINE
      </div>
      <Field
        label="LINE User ID ทดสอบ"
        hint="ระบบดึง UID จากออเดอร์ล่าสุดของลูกค้าให้อัตโนมัติ (หรือใส่ UID บัญชี LINE ของคุณเอง)"
      >
        <Input
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          placeholder="U..."
          className="font-mono text-xs"
        />
      </Field>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={testing}
        disabled={!hasCredentials}
        onClick={handleTest}
      >
        <Send className="size-3.5" />
        ทดสอบส่งข้อความ
      </Button>
      {!hasCredentials && (
        <p className="text-xs text-amber-600">
          กรุณากรอก Channel ID + Secret หรือ Channel Access Token ด้านบนก่อนกดทดสอบ
        </p>
      )}
      {testResult && (
        <div
          className={`flex items-start gap-2 rounded-lg p-2.5 text-xs ${
            testResult.ok
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 mt-0.5" />
          ) : (
            <AlertCircle className="size-4 shrink-0 text-rose-600 mt-0.5" />
          )}
          <div className="min-w-0 flex-1 break-words leading-relaxed whitespace-pre-wrap">
            {testResult.msg}
          </div>
        </div>
      )}
    </div>
  );
}

