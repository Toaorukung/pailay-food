'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  ChefHat,
  Wallet,
  UtensilsCrossed,
  Tags,
  TriangleAlert,
  QrCode,
  Users,
  Settings,
  BarChart3,
  ScrollText,
  LogOut,
  Menu as MenuIcon,
  X,
} from 'lucide-react';
import { cn } from '@/components/ui';
import { hasRole, type AdminRole } from '@/lib/types';
import type { AdminSession } from '@/lib/admin/auth';

const NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  minRole: AdminRole;
}[] = [
  { href: '/admin', label: 'ภาพรวม', icon: LayoutDashboard, minRole: 'STAFF' },
  { href: '/admin/orders', label: 'ครัว / ออเดอร์', icon: ChefHat, minRole: 'STAFF' },
  { href: '/admin/payments', label: 'ตรวจสลิป', icon: Wallet, minRole: 'STAFF' },
  { href: '/admin/sessions', label: 'เซสชัน', icon: Users, minRole: 'STAFF' },
  { href: '/admin/menu', label: 'เมนู', icon: UtensilsCrossed, minRole: 'MANAGER' },
  { href: '/admin/categories', label: 'หมวดหมู่', icon: Tags, minRole: 'MANAGER' },
  { href: '/admin/allergens', label: 'สารก่อภูมิแพ้', icon: TriangleAlert, minRole: 'MANAGER' },
  { href: '/admin/tables', label: 'วิลล่า & QR', icon: QrCode, minRole: 'MANAGER' },
  { href: '/admin/reports', label: 'รายงาน', icon: BarChart3, minRole: 'MANAGER' },
  { href: '/admin/settings', label: 'ตั้งค่า', icon: Settings, minRole: 'OWNER' },
  { href: '/admin/audit', label: 'ประวัติการแก้ไข', icon: ScrollText, minRole: 'OWNER' },
];

const ROLE_LABEL: Record<AdminRole, string> = {
  OWNER: 'เจ้าของ',
  MANAGER: 'ผู้จัดการ',
  STAFF: 'พนักงาน',
};

export function AdminShell({
  admin,
  children,
}: {
  admin: AdminSession;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // The nav only shows what this role can reach. The API enforces the same
  // boundary independently — hiding a link is presentation, not security.
  const visible = NAV.filter((item) => hasRole(admin.role, item.minRole));

  async function logout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-svh bg-[var(--surface-sunken)]">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--surface-raised)] transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
          <div>
            <p className="font-semibold leading-tight">Pailay Admin</p>
            <p className="text-xs muted">{ROLE_LABEL[admin.role]}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 muted hover:bg-[var(--surface-sunken)] lg:hidden"
            aria-label="ปิดเมนู"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {visible.map(({ href, label, icon: Icon }) => {
            const active =
              href === '/admin' ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-600 text-white'
                    : 'hover:bg-[var(--surface-sunken)]',
                )}
              >
                <Icon className="size-4.5 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <p className="truncate px-1 pb-2 text-xs muted">{admin.email}</p>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]"
          >
            <LogOut className="size-4" />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg p-1.5 hover:bg-[var(--surface-sunken)]"
            aria-label="เปิดเมนู"
          >
            <MenuIcon className="size-5" />
          </button>
          <p className="font-semibold">Pailay Admin</p>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
