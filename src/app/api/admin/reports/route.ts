import { requireAdmin } from '@/lib/admin/auth';
import { batchGet } from '@/lib/sheets/client';
import { TABS, fullRange, toObjects, num } from '@/lib/sheets/schema';
import { getCatalog } from '@/lib/menu-cache';
import { handler } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Sales reporting reads the spreadsheet rather than Redis.
 *
 * Redis holds three days of operational state; the Sheet holds everything, and
 * it is the thing the owner already knows how to open. This endpoint is used a
 * handful of times a day by one or two people, so the two-range read costs
 * nothing worth optimising.
 */
export const GET = handler(async (req: Request) => {
  const auth = await requireAdmin(req, 'MANAGER');
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get('from') || today;
  const to = url.searchParams.get('to') || today;
  const format = url.searchParams.get('format');

  const ranges = [fullRange(TABS.Orders), fullRange(TABS.OrderItems)];
  const [res, catalog] = await Promise.all([batchGet(ranges), getCatalog()]);

  const orders = toObjects(res[ranges[0]] ?? []).rows.filter((r) => {
    if (r.status === 'CANCELLED') return false;
    const day = (r.created_at ?? '').slice(0, 10);
    return day >= from && day <= to;
  });

  const orderIds = new Set(orders.map((o) => o.order_id));
  const items = toObjects(res[ranges[1]] ?? []).rows.filter((r) =>
    orderIds.has(r.order_id),
  );

  // ── By day ────────────────────────────────────────────────
  const byDay = new Map<string, { revenue: number; orders: number }>();
  for (const o of orders) {
    const day = (o.created_at ?? '').slice(0, 10);
    const entry = byDay.get(day) ?? { revenue: 0, orders: 0 };
    entry.revenue += num(o.total);
    entry.orders += 1;
    byDay.set(day, entry);
  }

  // ── By item ───────────────────────────────────────────────
  const itemsById = new Map(catalog.items.map((i) => [i.id, i]));
  const categoriesById = new Map(catalog.categories.map((c) => [c.id, c]));

  const byItem = new Map<
    string,
    { name: string; categoryId: string; qty: number; revenue: number }
  >();
  for (const line of items) {
    const menuId = line.menu_id || line.name_snapshot;
    const known = itemsById.get(line.menu_id);
    const entry = byItem.get(menuId) ?? {
      // Fall back to the name snapshot so dishes deleted from the menu still
      // appear in historical reports instead of vanishing.
      name: known?.name.th || line.name_snapshot || menuId,
      categoryId: known?.categoryId ?? '',
      qty: 0,
      revenue: 0,
    };
    entry.qty += num(line.qty);
    entry.revenue += num(line.line_total);
    byItem.set(menuId, entry);
  }

  const byCategory = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const entry of byItem.values()) {
    const cat = categoriesById.get(entry.categoryId);
    const key = entry.categoryId || 'uncategorised';
    const bucket = byCategory.get(key) ?? {
      name: cat?.name.th || 'ไม่ระบุหมวด',
      qty: 0,
      revenue: 0,
    };
    bucket.qty += entry.qty;
    bucket.revenue += entry.revenue;
    byCategory.set(key, bucket);
  }

  const summary = {
    from,
    to,
    orders: orders.length,
    revenue: round(orders.reduce((n, o) => n + num(o.total), 0)),
    serviceCharge: round(orders.reduce((n, o) => n + num(o.service_charge), 0)),
    vat: round(orders.reduce((n, o) => n + num(o.vat), 0)),
    itemsSold: items.reduce((n, i) => n + num(i.qty), 0),
    averageOrder: orders.length
      ? round(orders.reduce((n, o) => n + num(o.total), 0) / orders.length)
      : 0,
  };

  if (format === 'csv') {
    const rows = [
      ['date', 'orders', 'revenue'],
      ...[...byDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, v]) => [day, String(v.orders), String(round(v.revenue))]),
      [],
      ['item', 'category', 'qty', 'revenue'],
      ...[...byItem.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .map((v) => [
          v.name,
          categoriesById.get(v.categoryId)?.name.th ?? '',
          String(v.qty),
          String(round(v.revenue)),
        ]),
    ];

    return new Response(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="sales-${from}-to-${to}.csv"`,
      },
    });
  }

  return Response.json(
    {
      ok: true,
      summary,
      byDay: [...byDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, v]) => ({ day, ...v, revenue: round(v.revenue) })),
      byItem: [...byItem.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .map((v) => ({ ...v, revenue: round(v.revenue) })),
      byCategory: [...byCategory.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .map((v) => ({ ...v, revenue: round(v.revenue) })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Excel on a Thai Windows install opens UTF-8 CSV as mojibake unless the file
 * starts with a BOM. The owner opens these in Excel, so the BOM stays.
 */
function toCsv(rows: string[][]): string {
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\r\n');
  return `\uFEFF${body}`;
}
