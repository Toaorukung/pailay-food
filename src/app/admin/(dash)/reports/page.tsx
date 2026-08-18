'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, BarChart3 } from 'lucide-react';
import { adminFetch } from '@/components/admin/adminApi';
import { Button, Card, Field, Input, Skeleton, EmptyState } from '@/components/ui';
import { formatMoney } from '@/lib/money';

interface ReportData {
  summary: {
    from: string;
    to: string;
    orders: number;
    revenue: number;
    serviceCharge: number;
    vat: number;
    itemsSold: number;
    averageOrder: number;
  };
  byDay: { day: string; orders: number; revenue: number }[];
  byItem: { name: string; qty: number; revenue: number }[];
  byCategory: { name: string; qty: number; revenue: number }[];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(daysAgo(0));
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<ReportData>(
      `/api/admin/reports?from=${from}&to=${to}`,
    );
    setLoading(false);
    if (res.ok) {
      setData(res.data);
      setError(null);
    } else setError(res.error);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const peakRevenue = Math.max(1, ...(data?.byDay.map((d) => d.revenue) ?? [1]));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">รายงานยอดขาย</h1>
          <p className="text-sm muted">อ่านจาก Google Sheet โดยตรง</p>
        </div>
        <a
          href={`/api/admin/reports?from=${from}&to=${to}&format=csv`}
          download
        >
          <Button variant="secondary">
            <Download className="size-4" />
            ดาวน์โหลด CSV
          </Button>
        </a>
      </header>

      <Card className="flex flex-wrap items-end gap-3">
        <Field label="ตั้งแต่">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="ถึง">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button onClick={load} loading={loading}>
          แสดงรายงาน
        </Button>
      </Card>

      {error && (
        <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {loading && !data ? (
        <Skeleton className="h-40" />
      ) : !data || data.summary.orders === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-10" />}
          title="ไม่มีข้อมูลในช่วงที่เลือก"
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="ยอดขายรวม" value={formatMoney(data.summary.revenue)} />
            <Metric label="จำนวนออเดอร์" value={String(data.summary.orders)} />
            <Metric label="จานที่ขายได้" value={String(data.summary.itemsSold)} />
            <Metric
              label="เฉลี่ยต่อออเดอร์"
              value={formatMoney(data.summary.averageOrder)}
            />
          </div>

          <Card className="space-y-3">
            <h2 className="font-semibold">ยอดขายรายวัน</h2>
            <ul className="space-y-1.5">
              {data.byDay.map((d) => (
                <li key={d.day} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 tabular muted">{d.day}</span>
                  <span className="h-5 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                    <span
                      className="block h-full rounded-full bg-brand-500"
                      style={{ width: `${(d.revenue / peakRevenue) * 100}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right tabular">
                    {formatMoney(d.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-2">
              <h2 className="font-semibold">เมนูขายดี</h2>
              <Table
                rows={data.byItem.slice(0, 20).map((i) => [
                  i.name,
                  String(i.qty),
                  formatMoney(i.revenue),
                ])}
                headers={['เมนู', 'จำนวน', 'ยอดขาย']}
              />
            </Card>
            <Card className="space-y-2">
              <h2 className="font-semibold">ยอดขายตามหมวดหมู่</h2>
              <Table
                rows={data.byCategory.map((c) => [
                  c.name,
                  String(c.qty),
                  formatMoney(c.revenue),
                ])}
                headers={['หมวดหมู่', 'จำนวน', 'ยอดขาย']}
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs muted">{label}</p>
      <p className="text-2xl font-semibold tabular">{value}</p>
    </Card>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] text-left muted">
            {headers.map((h, i) => (
              <th key={h} className={`py-1.5 font-medium ${i > 0 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--line)] last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`py-1.5 ${j > 0 ? 'text-right tabular' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
