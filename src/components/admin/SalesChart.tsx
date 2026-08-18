'use client';

import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { Card, Skeleton } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { adminFetch } from './adminApi';

interface DayPoint {
  day: string;
  revenue: number;
  orders: number;
}

/**
 * Seven-day sales, drawn from the Orders tab.
 *
 * Hand-drawn SVG rather than a charting library: this is one line and one bar
 * series against a fixed viewBox, and pulling in a chart package would cost
 * more kilobytes than the whole admin bundle to render forty numbers.
 *
 * The axis is labelled and every point carries a `<title>`, so the figures are
 * readable without hovering and reachable by a screen reader — a chart nobody
 * can read the values of is decoration.
 */
export function SalesChart() {
  const [days, setDays] = useState<DayPoint[] | null>(null);

  useEffect(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    adminFetch<{ byDay: DayPoint[] }>(
      `/api/admin/reports?from=${iso(from)}&to=${iso(to)}`,
    ).then((res) => {
      if (!res.ok) {
        setDays([]);
        return;
      }
      // The report only returns days that had sales; the chart needs all seven
      // so the shape of a quiet Tuesday is visible rather than invisible.
      const byDay = new Map(res.data.byDay.map((d) => [d.day, d]));
      const filled: DayPoint[] = [];
      for (let i = 6; i >= 0; i--) {
        const key = iso(new Date(to.getTime() - i * 86_400_000));
        filled.push(byDay.get(key) ?? { day: key, revenue: 0, orders: 0 });
      }
      setDays(filled);
    });
  }, []);

  if (!days) return <Skeleton className="h-64 rounded-[var(--radius-card)]" />;

  const peak = Math.max(...days.map((d) => d.revenue), 1);
  const total = days.reduce((n, d) => n + d.revenue, 0);
  const orders = days.reduce((n, d) => n + d.orders, 0);

  // Fixed viewBox, percentage width: the drawing scales to any column.
  const W = 460;
  const H = 150;
  const padL = 8;
  const padR = 8;
  const step = (W - padL - padR) / Math.max(1, days.length - 1);
  const y = (v: number) => H - 18 - (v / peak) * (H - 40);
  const x = (i: number) => padL + i * step;

  const line = days.map((d, i) => `${x(i)} ${y(d.revenue)}`).join(' L ');
  const area = `M ${line} L ${x(days.length - 1)} ${H - 18} L ${x(0)} ${H - 18} Z`;

  const label = (iso: string) =>
    new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

  return (
    <Card className="space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            <TrendingUp className="size-4 text-[var(--brand)]" />
            ยอดขาย 7 วันย้อนหลัง
          </h2>
          <p className="text-xs muted">{orders} ออเดอร์ที่ชำระแล้ว</p>
        </div>
        <p className="text-right">
          <span className="block text-xl font-bold tabular">
            {formatMoney(total)}
          </span>
          <span className="text-xs muted">รวมทั้งสัปดาห์</span>
        </p>
      </header>

      {total === 0 ? (
        <p className="py-10 text-center text-sm muted">
          ยังไม่มียอดขายในช่วง 7 วันนี้
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="img"
          aria-label={`กราฟยอดขาย 7 วัน รวม ${formatMoney(total)} สูงสุด ${formatMoney(peak)}`}
        >
          <defs>
            <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={padL}
              x2={W - padR}
              y1={y(peak * f)}
              y2={y(peak * f)}
              stroke="var(--line)"
              strokeWidth="1"
            />
          ))}

          <path d={area} fill="url(#sales-fill)" />
          <path
            d={`M ${line}`}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {days.map((d, i) => (
            <g key={d.day}>
              <circle
                cx={x(i)}
                cy={y(d.revenue)}
                r={i === days.length - 1 ? 5 : 3.5}
                fill={i === days.length - 1 ? 'var(--brand)' : 'var(--surface)'}
                stroke="var(--brand)"
                strokeWidth="2.2"
              >
                <title>{`${label(d.day)} · ${formatMoney(d.revenue)} · ${d.orders} ออเดอร์`}</title>
              </circle>
              <text
                x={x(i)}
                y={H - 4}
                textAnchor="middle"
                fontSize="9.5"
                fill="var(--text-subtle)"
              >
                {label(d.day)}
              </text>
            </g>
          ))}
        </svg>
      )}
    </Card>
  );
}
