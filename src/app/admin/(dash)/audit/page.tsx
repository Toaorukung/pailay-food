'use client';

import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { adminFetch } from '@/components/admin/adminApi';
import { Card, EmptyState, Skeleton } from '@/components/ui';

interface Entry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
  ip: string;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ entries: Entry[] }>('/api/admin/audit?limit=300').then((res) => {
      if (res.ok) setEntries(res.data.entries);
      else setError(res.error);
    });
  }, []);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">ประวัติการแก้ไข</h1>
        <p className="text-sm muted">
          ทุกการเปลี่ยนแปลงของฝั่งแอดมินถูกบันทึกไว้ รวมถึงการยืนยันรับเงินและการปิดเซสชัน
        </p>
      </header>

      {error && (
        <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {entries === null ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon={<ScrollText className="size-10" />} title="ยังไม่มีประวัติ" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left muted">
                <th className="p-3 font-medium">เวลา</th>
                <th className="p-3 font-medium">ผู้ใช้</th>
                <th className="p-3 font-medium">การกระทำ</th>
                <th className="p-3 font-medium">เป้าหมาย</th>
                <th className="p-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="whitespace-nowrap p-3 tabular muted">
                    {new Date(e.at).toLocaleString('th-TH', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="p-3">{e.actor}</td>
                  <td className="p-3 font-medium">{e.action}</td>
                  <td className="p-3 tabular muted">{e.target}</td>
                  <td className="p-3 tabular muted">{e.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
