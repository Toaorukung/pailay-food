'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, TriangleAlert, MapPinOff, XCircle } from 'lucide-react';
import { adminFetch } from '@/components/admin/adminApi';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { formatMoney } from '@/lib/money';

interface SessionRow {
  id: string;
  tableLabel: string;
  villa: string;
  status: string;
  openedAt: string;
  guestName: string;
  allergyProfile: string[];
  geoStatus: string;
  distanceM: number | null;
  orderCount: number;
  paidTotal: number;
  outstandingTotal: number;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<SessionRow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await adminFetch<{ sessions: SessionRow[] }>('/api/admin/sessions');
    if (res.ok) {
      setSessions(res.data.sessions);
      setError(null);
    } else setError(res.error);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  async function forceClose() {
    if (!closing) return;
    setBusy(true);
    const res = await adminFetch('/api/admin/sessions', {
      method: 'POST',
      body: JSON.stringify({ sessionId: closing.id, reason: reason.trim() }),
    });
    setBusy(false);
    setClosing(null);
    setReason('');
    if (!res.ok) setError(res.error);
    await load();
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">เซสชันที่เปิดอยู่</h1>
        <p className="text-sm muted">
          จบการเข้าพักเมื่อแขกเช็คเอาต์แล้วหรือชำระเงินสดที่เคาน์เตอร์ —
          หลังปิด ลิงก์เดิมจะสั่งอาหารไม่ได้และการสแกนครั้งถัดไปจะเริ่มบิลใหม่
        </p>
      </header>

      {error && (
        <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {sessions === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Users className="size-10" />}
          title="ยังไม่มีเซสชันที่เปิดอยู่"
          body="เซสชันจะเกิดขึ้นเมื่อแขกสแกน QR ในวิลล่า"
        />
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.villa || s.tableLabel}</p>
                  <p className="text-xs muted">
                    เปิด{' '}
                    {new Date(s.openedAt).toLocaleString('th-TH', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {s.guestName ? ` · ${s.guestName}` : ''}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    
                    {s.allergyProfile.length > 0 && (
                      <Badge tone="danger">
                        <TriangleAlert className="size-3" />
                        แพ้ {s.allergyProfile.length} รายการ
                      </Badge>
                    )}
                    {s.geoStatus === 'OUTSIDE' && (
                      <Badge tone="warning">
                        <MapPinOff className="size-3" />
                        นอกพื้นที่ {s.distanceM ?? '—'} ม.
                      </Badge>
                    )}
                    {s.geoStatus === 'DENIED' && (
                      <Badge tone="neutral">ไม่เปิด GPS</Badge>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs muted">ยอดสะสม</p>
                  <p className="text-lg font-bold tabular">
                    {formatMoney(s.paidTotal)}
                  </p>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setClosing(s);
                    setReason('');
                  }}
                >
                  <XCircle className="size-4" />
                  จบการเข้าพัก
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={Boolean(closing)}
        onOpenChange={(open) => !open && setClosing(null)}
        title="จบการเข้าพัก"
        description={
          closing
            ? `${closing.villa || closing.tableLabel} · ยอดสะสม ${formatMoney(closing.paidTotal)}`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" full onClick={() => setClosing(null)}>
              ยกเลิก
            </Button>
            <Button variant="danger" full loading={busy} onClick={forceClose}>
              จบการเข้าพัก
            </Button>
          </>
        }
      >
        <p className="text-sm muted">
          หลังปิดแล้ว แขกจะยังเปิดลิงก์เดิมเพื่อดูใบเสร็จได้ แต่สั่งอาหารเพิ่มไม่ได้
        </p>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="เหตุผล (บันทึกในประวัติการแก้ไข) เช่น ชำระเงินสดที่เคาน์เตอร์"
        />
      </Dialog>
    </div>
  );
}
