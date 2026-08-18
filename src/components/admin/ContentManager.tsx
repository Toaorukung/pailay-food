'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, ImagePlus, X } from 'lucide-react';
import { adminFetch } from './adminApi';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
  cn,
} from '@/components/ui';

/**
 * One editor for every content tab.
 *
 * The Menu, Categories, Allergens, Tables and option tabs are all flat records
 * with the same lifecycle — list, edit, save, delete — differing only in their
 * fields. Describing those fields as data rather than writing five nearly
 * identical screens keeps the behaviour (validation feedback, optimistic
 * refresh, delete confirmation) genuinely identical instead of merely similar.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'image'
  | 'tags';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  required?: boolean;
  /** Groups the three language variants of one concept under a single header. */
  group?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: string | number | boolean;
  /** Shown as a column in the list view. */
  column?: boolean;
}

export type Row = Record<string, string>;

export interface ContentManagerProps {
  endpoint: string;
  title: string;
  description?: string;
  fields: FieldDef[];
  /** Human label for one record, used in confirmations. */
  labelOf: (row: Row) => string;
  searchOf?: (row: Row) => string;
  /** Extra read-only summary rendered on each list row. */
  summaryOf?: (row: Row) => React.ReactNode;
  emptyHint?: string;
  onChanged?: () => void;
}

export function ContentManager({
  endpoint,
  title,
  description,
  fields,
  labelOf,
  searchOf,
  summaryOf,
  emptyHint,
  onChanged,
}: ContentManagerProps) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await adminFetch<{ rows: Row[] }>(`/api/admin/content/${endpoint}`);
    if (res.ok) {
      setRows(res.data.rows);
      setError(null);
    } else {
      setError(res.error);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      (searchOf?.(row) ?? Object.values(row).join(' ')).toLowerCase().includes(q),
    );
  }, [rows, query, searchOf]);

  async function remove(row: Row) {
    if (!confirm(`ลบ "${labelOf(row)}" ?\n\nการลบนี้ย้อนกลับไม่ได้`)) return;
    const res = await adminFetch(
      `/api/admin/content/${endpoint}?id=${encodeURIComponent(row.id)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
    onChanged?.();
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && <p className="text-sm muted">{description}</p>}
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          เพิ่มใหม่
        </Button>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหา…"
          className="pl-9"
        />
      </div>

      {error && (
        <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {rows === null ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="ยังไม่มีข้อมูล" body={emptyHint} />
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => (
            <li key={row.id}>
              <Card className="flex items-center gap-3 p-3">
                {row.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.image_url}
                    alt=""
                    className="size-14 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{labelOf(row)}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs muted">
                    <span className="tabular">{row.id}</span>
                    {summaryOf?.(row)}
                    {row.is_available === 'FALSE' && (
                      <Badge tone="neutral">หมด</Badge>
                    )}
                    {row.is_active === 'FALSE' && (
                      <Badge tone="neutral">ปิดใช้งาน</Badge>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(row)}
                    aria-label="แก้ไข"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(row)}
                    aria-label="ลบ"
                    className="text-[var(--danger)]"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {(editing || creating) && (
        <RecordDialog
          endpoint={endpoint}
          fields={fields}
          initial={editing ?? {}}
          isNew={creating}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={async () => {
            setEditing(null);
            setCreating(false);
            await load();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────

function RecordDialog({
  endpoint,
  fields,
  initial,
  isNew,
  onClose,
  onSaved,
}: {
  endpoint: string;
  fields: FieldDef[];
  initial: Row;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    hydrate(fields, initial),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, value: unknown) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);

    const payload: Record<string, unknown> = { ...values };
    if (!isNew && initial.id) payload.id = initial.id;
    else delete payload.id;

    const res = await adminFetch(`/api/admin/content/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await onSaved();
  }

  // Language variants of the same concept render as one block rather than nine
  // scattered inputs.
  const groups = useMemo(() => {
    const out: { name: string | null; fields: FieldDef[] }[] = [];
    for (const field of fields) {
      const name = field.group ?? null;
      const last = out[out.length - 1];
      if (last && last.name === name && name !== null) last.fields.push(field);
      else out.push({ name, fields: [field] });
    }
    return out;
  }, [fields]);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={isNew ? 'เพิ่มรายการใหม่' : 'แก้ไขรายการ'}
      description={!isNew ? initial.id : undefined}
      footer={
        <>
          <Button variant="secondary" full onClick={onClose}>
            ยกเลิก
          </Button>
          <Button full loading={busy} onClick={save}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {groups.map((group, i) => (
          <div key={group.name ?? i} className="space-y-2">
            {group.name && (
              <p className="text-sm font-semibold">{group.name}</p>
            )}
            {group.fields.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={values[field.key]}
                onChange={(v) => set(field.key, v)}
              />
            ))}
          </div>
        ))}

        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [uploading, setUploading] = useState(false);

  switch (field.type) {
    case 'boolean':
      return (
        <Checkbox
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          label={field.label}
        />
      );

    case 'number':
      return (
        <Field label={field.label} hint={field.hint}>
          <Input
            type="number"
            inputMode="decimal"
            value={value === null || value === undefined ? '' : String(value)}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            onChange={(e) =>
              // Empty stays null so a nullable coordinate can be cleared,
              // rather than silently becoming 0 — which is a real place in the
              // Gulf of Guinea, not "unset".
              onChange(e.target.value === '' ? null : Number(e.target.value))
            }
          />
        </Field>
      );

    case 'textarea':
      return (
        <Field label={field.label} hint={field.hint}>
          <Textarea
            rows={3}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );

    case 'select':
      return (
        <Field label={field.label} hint={field.hint}>
          <Select
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— เลือก —</option>
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      );

    case 'multiselect': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Field label={field.label} hint={field.hint}>
          <div className="flex flex-wrap gap-1.5">
            {field.options?.map((o) => {
              const active = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onChange(
                      active
                        ? selected.filter((v) => v !== o.value)
                        : [...selected, o.value],
                    )
                  }
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-brand-500 bg-brand-600 text-white'
                      : 'border-[var(--line)]',
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </Field>
      );
    }

    case 'tags': {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Field label={field.label} hint={field.hint ?? 'คั่นด้วยเครื่องหมายจุลภาค'}>
          <Input
            value={list.join(', ')}
            onChange={(e) =>
              onChange(
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        </Field>
      );
    }

    case 'image':
      return (
        <Field label={field.label} hint={field.hint}>
          <div className="flex items-center gap-3">
            {value ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={String(value)}
                  alt=""
                  className="size-20 rounded-xl object-cover"
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
              <div className="flex size-20 items-center justify-center rounded-xl border border-dashed border-[var(--line)] muted">
                <ImagePlus className="size-6" />
              </div>
            )}
            <label className="cursor-pointer text-sm font-medium text-brand-600 hover:underline">
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
                  const res = await adminFetch<{ url: string }>(
                    '/api/admin/upload',
                    { method: 'POST', body: form },
                  );
                  setUploading(false);
                  if (res.ok) onChange(res.data.url);
                  else alert(res.error);
                }}
              />
            </label>
          </div>
        </Field>
      );

    default:
      return (
        <Field label={field.label} hint={field.hint}>
          <Input
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );
  }
}

/** Turns Sheet strings into the typed shape the API schemas expect. */
function hydrate(fields: FieldDef[], row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = row[field.key];
    switch (field.type) {
      case 'boolean':
        out[field.key] =
          raw === undefined || raw === ''
            ? (field.defaultValue ?? false)
            : ['true', '1', 'yes'].includes(raw.toLowerCase());
        break;
      case 'number':
        out[field.key] =
          raw === undefined || raw === ''
            ? (field.defaultValue ?? null)
            : Number(String(raw).replace(/,/g, ''));
        break;
      case 'multiselect':
      case 'tags':
        out[field.key] = raw
          ? raw.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
        break;
      default:
        out[field.key] = raw ?? field.defaultValue ?? '';
    }
  }
  return out;
}
