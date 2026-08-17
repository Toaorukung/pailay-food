import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await currentAdmin();

  // Middleware already bounced unauthenticated browsers; this is the check
  // that actually decides, and it runs with the full Node crypto verification
  // rather than the edge one.
  if (!admin) redirect('/admin/login');

  return <AdminShell admin={admin}>{children}</AdminShell>;
}
