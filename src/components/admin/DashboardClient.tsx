'use client';

import Link from 'next/link';
import {
  Banknote,
  ChefHat,
  ReceiptText,
  Users,
  TriangleAlert,
  CloudUpload,
  MapPinOff,
} from 'lucide-react';
import { useLive } from './adminApi';
import { Badge, Card, Skeleton } from '@/components/ui';
import { formatMoney } from '@/lib/money';

export function DashboardClient() {
  const { data, error, loading } = useLive();

  if (loading && !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <p className="rounded-xl bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">
        {error}
      </p>
    );
  }
  if (!data) return null;

  const { stats, sync, openSessions, orders, payments } = data;
  const flaggedSessions = openSessions.filter(
    (s) => s.geoStatus === 'OUTSIDE',
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">ภาพรวมวันนี้</h1>
        <span className="text-xs muted">
          อัปเดตล่าสุด{' '}
          {new Date(data.serverTime).toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      </header>

      {/*
        The sync alert sits above everything. If Sheets writes are failing the
        app keeps serving food perfectly well, which is exactly why nobody
        would notice without this.
      */}
      {sync.dead > 0 && (
        <div className="flex items-start gap-3 rounded-xl border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">
              บันทึกลง Google Sheet ล้มเหลว {sync.dead} รายการ
            </p>
            <p>
              ระบบยังรับออเดอร์ได้ตามปกติ แต่ข้อมูลบางส่วนยังไม่ถูกบันทึกลงชีต —
              ตรวจสอบแท็บ SyncDeadLetter และสิทธิ์การเข้าถึงของ Service Account
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={<Banknote className="size-5" />}
          label="ยอดขายวันนี้"
          value={formatMoney(stats.revenueToday)}
        />
        <Stat
          icon={<ReceiptText className="size-5" />}
          label="ออเดอร์วันนี้"
          value={String(stats.ordersToday)}
        />
        <Stat
          icon={<ChefHat className="size-5" />}
          label="กำลังดำเนินการ"
          value={String(stats.activeOrders)}
          href="/admin/orders"
          tone={stats.activeOrders > 0 ? 'warning' : 'neutral'}
        />
        <Stat
          icon={<Banknote className="size-5" />}
          label="สลิปรอตรวจ"
          value={String(stats.pendingPayments)}
          href="/admin/payments"
          tone={stats.pendingPayments > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users className="size-4" />
            เซสชันที่เปิดอยู่ ({openSessions.length})
          </h2>
          {openSessions.length === 0 ? (
            <p className="text-sm muted">ยังไม่มีแขกเปิดเซสชัน</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {openSessions.slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {s.villa || s.tableLabel}
                    </p>
                    <p className="text-xs muted">
                      เปิด{' '}
                      {new Date(s.openedAt).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {s.guestName ? ` · ${s.guestName}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {s.allergyProfile.length > 0 && (
                      <Badge tone="danger">
                        <TriangleAlert className="size-3" />
                        แพ้ {s.allergyProfile.length}
                      </Badge>
                    )}
                    {s.geoStatus === 'OUTSIDE' && (
                      <Badge tone="warning">
                        <MapPinOff className="size-3" />
                        นอกพื้นที่
                      </Badge>
                    )}
                    {s.status === 'LOCKED' && <Badge tone="brand">รอชำระ</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/sessions"
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            ดูทั้งหมด
          </Link>
        </Card>

        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <ChefHat className="size-4" />
            ออเดอร์ล่าสุด
          </h2>
          {orders.length === 0 ? (
            <p className="text-sm muted">ยังไม่มีออเดอร์</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {orders.slice(0, 8).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {o.id} · {o.villa || o.tableLabel}
                    </p>
                    <p className="text-xs muted">
                      {o.items.reduce((n, i) => n + i.qty, 0)} รายการ ·{' '}
                      {new Date(o.createdAt).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular">
                    {formatMoney(o.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/orders"
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            เปิดหน้าครัว
          </Link>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {flaggedSessions.length > 0 && (
          <Card className="space-y-2">
            <h2 className="flex items-center gap-2 font-semibold text-[var(--warning)]">
              <MapPinOff className="size-4" />
              เซสชันนอกพื้นที่ ({flaggedSessions.length})
            </h2>
            <p className="text-xs muted">
              GPS ในอาคารคลาดเคลื่อนได้หลักร้อยเมตร รายการนี้เป็นข้อมูลประกอบ
              ไม่ได้แปลว่าผิดปกติเสมอไป
            </p>
            <ul className="text-sm">
              {flaggedSessions.map((s) => (
                <li key={s.id} className="flex justify-between py-1">
                  <span>{s.villa || s.tableLabel}</span>
                  <span className="tabular muted">
                    {s.distanceM !== null ? `${s.distanceM} m` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="space-y-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <CloudUpload className="size-4" />
            สถานะการซิงก์ Google Sheet
          </h2>
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-2xl font-semibold tabular">{sync.pending}</p>
              <p className="muted">รอเขียน</p>
            </div>
            <div>
              <p
                className={`text-2xl font-semibold tabular ${
                  sync.dead > 0 ? 'text-[var(--danger)]' : ''
                }`}
              >
                {sync.dead}
              </p>
              <p className="muted">ล้มเหลว</p>
            </div>
          </div>
          <p className="text-xs muted">
            ออเดอร์ถูกบันทึกลง Redis ทันทีและทยอยเขียนลงชีตเป็นชุด — ตัวเลข
            &ldquo;รอเขียน&rdquo; ไม่เป็นศูนย์ในช่วงพีคถือเป็นเรื่องปกติ
          </p>
        </Card>
      </div>

      {payments.length > 0 && (
        <Card className="space-y-2">
          <h2 className="font-semibold text-[var(--danger)]">
            สลิปรอตรวจสอบ ({payments.length})
          </h2>
          <Link
            href="/admin/payments"
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            ไปที่คิวตรวจสลิป
          </Link>
        </Card>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  href,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  tone?: 'neutral' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-[var(--danger)]'
      : tone === 'warning'
        ? 'text-[var(--warning)]'
        : '';

  const body = (
    <Card className="flex items-center gap-3">
      <span className={`rounded-xl bg-[var(--surface-sunken)] p-2.5 ${toneClass}`}>
        {icon}
      </span>
      <span>
        <span className="block text-xs muted">{label}</span>
        <span className={`block text-xl font-semibold tabular ${toneClass}`}>
          {value}
        </span>
      </span>
    </Card>
  );

  return href ? (
    <Link href={href} className="block transition-transform hover:-translate-y-0.5">
      {body}
    </Link>
  ) : (
    body
  );
}
