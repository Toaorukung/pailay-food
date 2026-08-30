'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ChefHat,
  ClipboardCheck,
  Wallet,
  UtensilsCrossed,
  Tags,
  TriangleAlert,
  Home,
  Users,
  Settings,
  BarChart3,
  ScrollText,
  LogOut,
  Menu as MenuIcon,
  X,
} from 'lucide-react';
import { cn } from '@/components/ui';
import { ThemeToggle } from '@/components/theme';
import { hasRole, type AdminRole } from '@/lib/types';
import type { AdminSession } from '@/lib/admin/auth';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  minRole: AdminRole;
}

/**
 * Grouped so the sidebar reads as a workflow rather than a list of eleven
 * equal things: the top group is what staff touch during service, the middle
 * is what a manager changes between services, the bottom is owner-only.
 */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'ระหว่างให้บริการ',
    items: [
      { href: '/admin', label: 'ภาพรวม', icon: LayoutDashboard, minRole: 'STAFF' },
      // Sits before the kitchen deliberately: nothing reaches the kitchen
      // until somebody has been through this screen with the guest.
      { href: '/admin/pending', label: 'รอคอนเฟิร์ม', icon: ClipboardCheck, minRole: 'STAFF' },
      { href: '/admin/orders', label: 'ครัว / ออเดอร์', icon: ChefHat, minRole: 'STAFF' },
      { href: '/admin/payments', label: 'อัปโหลดสลิป', icon: Wallet, minRole: 'STAFF' },
      { href: '/admin/sessions', label: 'เซสชัน', icon: Users, minRole: 'STAFF' },
    ],
  },
  {
    label: 'จัดการร้าน',
    items: [
      { href: '/admin/menu', label: 'เมนู', icon: UtensilsCrossed, minRole: 'MANAGER' },
      { href: '/admin/categories', label: 'หมวดหมู่', icon: Tags, minRole: 'MANAGER' },
      { href: '/admin/allergens', label: 'สารก่อภูมิแพ้', icon: TriangleAlert, minRole: 'MANAGER' },
      { href: '/admin/tables', label: 'วิลล่า', icon: Home, minRole: 'MANAGER' },
      { href: '/admin/reports', label: 'รายงาน', icon: BarChart3, minRole: 'MANAGER' },
    ],
  },
  {
    label: 'เจ้าของร้าน',
    items: [
      { href: '/admin/settings', label: 'ตั้งค่า', icon: Settings, minRole: 'OWNER' },
      { href: '/admin/audit', label: 'ประวัติการแก้ไข', icon: ScrollText, minRole: 'OWNER' },
    ],
  },
];

const ROLE_LABEL: Record<AdminRole, string> = {
  OWNER: 'เจ้าของร้าน',
  MANAGER: 'ผู้จัดการ',
  STAFF: 'พนักงาน',
};

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function isActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === href : pathname.startsWith(href);
}

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
  const [busy, setBusy] = useState(false);

  // Close the drawer on navigation, otherwise it stays over the page the user
  // just asked for.
  useEffect(() => setOpen(false), [pathname]);

  // The nav only shows what this role can reach. The API enforces the same
  // boundary independently — hiding a link is presentation, not security.
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasRole(admin.role, item.minRole)),
  })).filter((group) => group.items.length > 0);

  const current = ALL_ITEMS.find((item) => isActive(pathname, item.href));

  async function logout() {
    setBusy(true);
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-svh bg-[var(--canvas)]">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col',
          'sidebar-surface border-r border-[var(--sidebar-line)]',
          'transition-transform duration-200 ease-out',
          'lg:static lg:translate-x-0',
          open ? 'translate-x-0 shadow-[var(--shadow-lg)]' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="brand-gradient flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-[var(--shadow-brand)]">
            <ChefHat className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold leading-tight">ไปเล วิลล่า</p>
            <p className="text-xs text-[var(--sidebar-muted)]">จัดการร้านอาหาร</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-[var(--sidebar-muted)] hover:bg-white/10 lg:hidden"
            aria-label="ปิดเมนู"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-3">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="eyebrow px-3 pb-0.5 text-[var(--sidebar-muted)]">
                {group.label}
              </p>
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    // Warms the route's RSC payload on hover, so the click
                    // itself renders from cache instead of a round trip.
                    prefetch
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-3 rounded-xl px-3 py-2.5',
                      'text-sm font-medium transition-colors',
                      active
                        ? 'bg-[var(--brand)] font-semibold text-white shadow-[var(--shadow-brand)]'
                        : 'text-[var(--sidebar-muted)] hover:bg-white/10 hover:text-[var(--sidebar-text)]',
                    )}
                  >
                    <Icon className="size-[1.15rem] shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--sidebar-line)] p-3">
          <div className="flex items-center gap-2.5 px-1 pb-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-xs font-bold">
              {(admin.name || admin.email).slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{admin.name}</p>
              <p className="truncate text-xs text-[var(--sidebar-muted)]">
                {ROLE_LABEL[admin.role]}
              </p>
            </div>
          </div>

          <div className="px-1 pb-2">
            <ThemeToggle className="w-full justify-between" tone="onBrand" />
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className={cn(
              'flex w-full items-center gap-2 rounded-xl px-3 py-2',
              'text-sm font-medium text-[var(--sidebar-muted)] transition-colors',
              'hover:bg-white/10 hover:text-white disabled:opacity-50',
            )}
          >
            <LogOut className="size-4" />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 animate-fade lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="ปิดเมนู"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--line)] glass px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="-ml-1 rounded-lg p-1.5 hover:bg-[var(--surface-sunken)]"
            aria-label="เปิดเมนู"
          >
            <MenuIcon className="size-5" />
          </button>
          <p className="font-semibold">{current?.label ?? 'ไปเล วิลล่า'}</p>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 p-4 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
