import { getCatalog } from '@/lib/menu-cache';
import { PendingConfirm } from '@/components/admin/PendingConfirm';

export const dynamic = 'force-dynamic';

export default async function AdminPendingPage() {
  const catalog = await getCatalog();
  return <PendingConfirm catalog={catalog} />;
}
