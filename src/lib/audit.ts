import { randomId } from './ids';
import { persist } from './sheets/queue';
import { TABS } from './sheets/schema';
import type { AdminSession } from './admin/auth';

/**
 * Every admin mutation gets a row. Menu prices, table geofences, payment
 * approvals and role changes all pass through here, so "who marked this slip
 * as paid" always has an answer.
 */
export async function audit(
  admin: AdminSession,
  action: string,
  target: string,
  detail: unknown,
  ip: string,
): Promise<void> {
  const id = randomId(8);
  await persist(TABS.AuditLog, id, {
    id,
    at: new Date().toISOString(),
    actor: `${admin.name} <${admin.email}>`,
    action,
    target,
    // Cap the payload: a bulk menu import should not write a novel into a cell.
    detail: JSON.stringify(detail ?? {}).slice(0, 20_000),
    ip,
  });
}
